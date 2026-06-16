import { Pool } from "pg";
import { isSecretLikeKey, stringContainsDurableSecret } from "../secretSafety";
import type {
  OnlineRuntimeRateLimitInput,
  OnlineRuntimeRateLimitScope,
  OnlineRuntimeRateLimitStore,
} from "./onlineRuntimeCoordinator";
import { resolvePostgresPoolMaxPerStore } from "./postgresPoolConfig";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
}

interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

export interface PostgresOnlineRateLimitStoreOptions {
  connectionString?: string;
  poolMaxPerStore?: number;
  queryable?: PostgresQueryable;
  transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  close?: () => Promise<void>;
}

const DEFAULT_POSTGRES_TIMEOUT_MS = 5_000;
const MAX_RATE_LIMIT_KEY_LENGTH = 256;
const RAW_ONLINE_ENTITY_RATE_LIMIT_KEY_PATTERN =
  /^(account_session|account|challenge|game|seek|report_audit|report)[_-][A-Za-z0-9_-]+$/i;
const RATE_LIMIT_SCOPES = new Set<OnlineRuntimeRateLimitScope>([
  "account_auth",
  "account_create",
  "account_read",
  "admin_read",
  "challenge_action",
  "create_challenge",
  "create_game",
  "create_open_seek",
  "open_seek_action",
  "public_directory",
  "quick_match",
  "socket_message",
  "spectator_snapshot",
]);

function normalizeRateLimitScope(scope: OnlineRuntimeRateLimitScope): OnlineRuntimeRateLimitScope {
  if (!RATE_LIMIT_SCOPES.has(scope)) {
    throw new Error("Invalid PostgreSQL rate-limit scope.");
  }
  return scope;
}

function parsePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`PostgreSQL rate-limit ${label} must be a positive integer.`);
  }
  return value;
}

function normalizeRateLimitKey(key: string): string {
  const value = key.trim();
  if (!value) {
    throw new Error("PostgreSQL rate-limit key must be non-empty.");
  }
  if (value.length > MAX_RATE_LIMIT_KEY_LENGTH) {
    throw new Error("PostgreSQL rate-limit key must be at most 256 characters.");
  }
  if (
    isSecretLikeKey(value) ||
    stringContainsDurableSecret(value) ||
    RAW_ONLINE_ENTITY_RATE_LIMIT_KEY_PATTERN.test(value)
  ) {
    throw new Error("PostgreSQL rate-limit key must not contain secrets or online entity ids.");
  }
  return value;
}

function normalizeRateLimitInput(input: OnlineRuntimeRateLimitInput): OnlineRuntimeRateLimitInput {
  return {
    scope: normalizeRateLimitScope(input.scope),
    key: normalizeRateLimitKey(input.key),
    limit: parsePositiveInteger(input.limit, "limit"),
    windowMs: parsePositiveInteger(input.windowMs, "window"),
  };
}

function parseDbDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`PostgreSQL rate-limit ${label} was not a valid timestamp.`);
  }
  return date;
}

function parseDbCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("PostgreSQL rate-limit count was not a non-negative integer.");
  }
  return count;
}

export class PostgresOnlineRateLimitStore implements OnlineRuntimeRateLimitStore {
  private readonly queryable: PostgresQueryable;
  private readonly transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineRateLimitStoreOptions) {
    if (options.queryable) {
      this.queryable = options.queryable;
      this.transactionClientFactory = options.transactionClientFactory;
      this.closeConnection = options.close;
      return;
    }

    if (!options.connectionString) {
      throw new Error("PostgresOnlineRateLimitStore requires a connectionString or queryable.");
    }

    const pool = new Pool({
      connectionString: options.connectionString,
      max: resolvePostgresPoolMaxPerStore(options.poolMaxPerStore),
      connectionTimeoutMillis: DEFAULT_POSTGRES_TIMEOUT_MS,
      query_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
      statement_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
    });
    this.queryable = pool;
    this.transactionClientFactory = () => pool.connect();
    this.closeConnection = () => pool.end();
  }

  async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.createSchema().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });
    return this.schemaReady;
  }

  async consumeRateLimit(input: OnlineRuntimeRateLimitInput): Promise<boolean> {
    const normalized = normalizeRateLimitInput(input);
    if (!this.transactionClientFactory) {
      throw new Error("PostgreSQL rate-limit consume requires a transaction client factory.");
    }
    await this.ensureSchema();

    const client = await this.transactionClientFactory();
    const queryable = client;
    try {
      await queryable.query("BEGIN");
      const nowResult = await queryable.query("SELECT now() AS now");
      const now = parseDbDate(nowResult.rows[0]?.now, "current time");
      await queryable.query(
        `
          INSERT INTO online_rate_limits
            (scope, rate_key, window_ms, window_started_at, count, updated_at)
          VALUES ($1, $2, $3, $4, 0, $4)
          ON CONFLICT (scope, rate_key, window_ms) DO NOTHING
        `,
        [normalized.scope, normalized.key, normalized.windowMs, now]
      );
      const rowResult = await queryable.query(
        `
          SELECT count, window_started_at
          FROM online_rate_limits
          WHERE scope = $1 AND rate_key = $2 AND window_ms = $3
          FOR UPDATE
        `,
        [normalized.scope, normalized.key, normalized.windowMs]
      );
      const row = rowResult.rows[0];
      const count = row ? parseDbCount(row.count) : 0;
      const windowStartedAt = row
        ? parseDbDate(row.window_started_at, "window start")
        : now;
      const expired = windowStartedAt.getTime() + normalized.windowMs <= now.getTime();
      if (!expired && count >= normalized.limit) {
        await queryable.query("COMMIT");
        return false;
      }
      const nextCount = expired ? 1 : count + 1;
      const nextWindowStartedAt = expired ? now : windowStartedAt;
      await queryable.query(
        `
          UPDATE online_rate_limits
          SET count = $4, window_started_at = $5, updated_at = $5
          WHERE scope = $1 AND rate_key = $2 AND window_ms = $3
        `,
        [
          normalized.scope,
          normalized.key,
          normalized.windowMs,
          nextCount,
          nextWindowStartedAt,
        ]
      );
      await queryable.query("COMMIT");
      return true;
    } catch (error) {
      try {
        await queryable.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "PostgreSQL rate-limit transaction failed and rollback also failed."
        );
      }
      throw error;
    } finally {
      client?.release();
    }
  }

  async close(): Promise<void> {
    await this.closeConnection?.();
  }

  async cleanupExpiredRateLimits(): Promise<number> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        DELETE FROM online_rate_limits
        WHERE window_started_at + (window_ms * interval '1 millisecond') <= now()
      `,
      []
    );
    return result.rowCount ?? 0;
  }

  private async createSchema(): Promise<void> {
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_rate_limits (
        scope TEXT NOT NULL,
        rate_key TEXT NOT NULL,
        window_ms INTEGER NOT NULL,
        window_started_at TIMESTAMPTZ NOT NULL,
        count INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, rate_key, window_ms)
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_rate_limits_updated_at_idx
        ON online_rate_limits (updated_at)
    `);
  }
}
