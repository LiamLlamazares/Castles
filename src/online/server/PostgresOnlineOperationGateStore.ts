import { Pool } from "pg";
import { stringContainsDurableSecret } from "../secretSafety";
import type {
  OnlineRuntimeOperationGateScope,
  OnlineRuntimeOperationGateStore,
} from "./onlineRuntimeCoordinator";
import { resolvePostgresPoolMaxPerStore } from "./postgresPoolConfig";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
}

interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

export interface PostgresOnlineOperationGateStoreOptions {
  connectionString?: string;
  poolMaxPerStore?: number;
  queryable?: PostgresQueryable;
  transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  close?: () => Promise<void>;
}

const DEFAULT_POSTGRES_TIMEOUT_MS = 5_000;
const OPERATION_GATE_SCOPES = new Set<OnlineRuntimeOperationGateScope>([
  "account_challenge_pair",
  "challenge_lifecycle",
  "open_seek_lifecycle",
  "quick_match_session",
]);
const ACCOUNT_CHALLENGE_PAIR_GATE_KEY_PATTERN = /^account_challenge_pair:[A-Za-z0-9_-]{43}$/;
const OPEN_SEEK_LIFECYCLE_GATE_KEY_PATTERN = /^open_seek_lifecycle:seek_[A-Za-z0-9_-]{1,128}$/;
const CHALLENGE_LIFECYCLE_GATE_KEY_PATTERN = /^challenge_lifecycle:challenge_[A-Za-z0-9_-]{1,128}$/;

function normalizeOperationGateScope(scope: OnlineRuntimeOperationGateScope): OnlineRuntimeOperationGateScope {
  if (!OPERATION_GATE_SCOPES.has(scope)) {
    throw new Error("Invalid PostgreSQL operation gate scope.");
  }
  return scope;
}

function normalizeOperationGateKey(
  scope: OnlineRuntimeOperationGateScope,
  key: string
): string {
  const value = key.trim();
  if (!value) {
    throw new Error("PostgreSQL operation gate key must be non-empty.");
  }
  if (value.length > 256) {
    throw new Error("PostgreSQL operation gate key must be at most 256 characters.");
  }
  if (stringContainsDurableSecret(value)) {
    throw new Error("PostgreSQL operation gate key must not contain secrets.");
  }
  if (scope === "account_challenge_pair" && !ACCOUNT_CHALLENGE_PAIR_GATE_KEY_PATTERN.test(value)) {
    throw new Error(
      "PostgreSQL account challenge pair key must be a hashed operation key."
    );
  }
  if (scope === "open_seek_lifecycle" && !OPEN_SEEK_LIFECYCLE_GATE_KEY_PATTERN.test(value)) {
    throw new Error(
      "PostgreSQL open seek lifecycle key must be scoped to an open seek id."
    );
  }
  if (scope === "challenge_lifecycle" && !CHALLENGE_LIFECYCLE_GATE_KEY_PATTERN.test(value)) {
    throw new Error(
      "PostgreSQL challenge lifecycle key must be scoped to a challenge id."
    );
  }
  return value;
}

function normalizeOperationLockRetentionMs(retentionMs: number): number {
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 1) {
    throw new Error("PostgreSQL operation lock retention must be a positive integer of milliseconds.");
  }
  return retentionMs;
}

export class PostgresOnlineOperationGateStore implements OnlineRuntimeOperationGateStore {
  private readonly queryable: PostgresQueryable;
  private readonly transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineOperationGateStoreOptions) {
    if (options.queryable) {
      this.queryable = options.queryable;
      this.transactionClientFactory = options.transactionClientFactory;
      this.closeConnection = options.close;
      return;
    }

    if (!options.connectionString) {
      throw new Error("PostgresOnlineOperationGateStore requires a connectionString or queryable.");
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

  async withOperationGate<T>(
    input: { scope: OnlineRuntimeOperationGateScope; key: string },
    operation: () => Promise<T>
  ): Promise<T> {
    const scope = normalizeOperationGateScope(input.scope);
    const key = normalizeOperationGateKey(scope, input.key);
    await this.ensureSchema();

    const client = await this.transactionClientFactory?.();
    const queryable = client ?? this.queryable;
    try {
      await queryable.query("BEGIN");
      await queryable.query(
        `
          INSERT INTO online_operation_locks (scope, lock_key, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (scope, lock_key) DO UPDATE
          SET updated_at = now()
        `,
        [scope, key]
      );
      await queryable.query(
        `
          SELECT scope, lock_key
          FROM online_operation_locks
          WHERE scope = $1 AND lock_key = $2
          FOR UPDATE
        `,
        [scope, key]
      );
      const result = await operation();
      await queryable.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await queryable.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "PostgreSQL operation gate transaction failed and rollback also failed."
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

  async cleanupOperationLocksBefore(cutoffIso: string): Promise<number> {
    const cutoff = new Date(cutoffIso);
    if (Number.isNaN(cutoff.getTime())) {
      throw new Error("PostgreSQL operation lock cleanup cutoff must be an ISO timestamp.");
    }
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        DELETE FROM online_operation_locks
        WHERE updated_at < $1::timestamptz
      `,
      [cutoff.toISOString()]
    );
    return result.rowCount ?? 0;
  }

  async cleanupOperationLocksOlderThan(retentionMs: number): Promise<number> {
    const retention = normalizeOperationLockRetentionMs(retentionMs);
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        DELETE FROM online_operation_locks
        WHERE updated_at < now() - ($1::bigint * interval '1 millisecond')
      `,
      [retention]
    );
    return result.rowCount ?? 0;
  }

  private async createSchema(): Promise<void> {
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_operation_locks (
        scope TEXT NOT NULL,
        lock_key TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, lock_key)
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_operation_locks_updated_at_idx
        ON online_operation_locks (updated_at)
    `);
  }
}
