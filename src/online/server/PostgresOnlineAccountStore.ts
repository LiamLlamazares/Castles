import { Pool } from "pg";
import {
  createOnlineAccountRecord,
  normalizeOnlineAccountDisplayName,
  normalizeOnlineAccountDisplayNameKey,
  type OnlineAccount,
} from "../accounts";
import {
  CreateOnlineAccountStoreInput,
  DuplicateOnlineAccountDisplayNameError,
  DuplicateOnlineAccountIdError,
  DuplicateOnlineAccountSessionCredentialError,
  type OnlineAccountStore,
  type ResolvedOnlineAccountSession,
} from "./OnlineAccountStore";
import { hashOnlineToken, isOnlineTokenCredentialHash } from "./onlineTokenCredentials";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

export interface PostgresOnlineAccountStoreOptions {
  connectionString?: string;
  queryable?: PostgresQueryable;
  transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  close?: () => Promise<void>;
}

const DEFAULT_POSTGRES_TIMEOUT_MS = 5_000;

function timestampToIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  throw new Error("PostgreSQL account timestamp is invalid.");
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "23505";
}

function accountFromRow(row: Record<string, unknown>): OnlineAccount {
  return createOnlineAccountRecord({
    accountId: String(row.account_id),
    displayName: String(row.display_name),
    createdAt: timestampToIso(row.created_at),
    updatedAt: timestampToIso(row.updated_at),
  });
}

export class PostgresOnlineAccountStore implements OnlineAccountStore {
  private readonly queryable: PostgresQueryable;
  private readonly transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineAccountStoreOptions) {
    if (options.queryable) {
      this.queryable = options.queryable;
      this.transactionClientFactory = options.transactionClientFactory;
      this.closeConnection = options.close;
      return;
    }

    if (!options.connectionString) {
      throw new Error("PostgresOnlineAccountStore requires a connectionString or queryable.");
    }

    const pool = new Pool({
      connectionString: options.connectionString,
      connectionTimeoutMillis: DEFAULT_POSTGRES_TIMEOUT_MS,
      query_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
      statement_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
    });
    this.queryable = pool;
    this.transactionClientFactory = () => pool.connect();
    this.closeConnection = () => pool.end();
  }

  async createAccount(input: CreateOnlineAccountStoreInput): Promise<ResolvedOnlineAccountSession> {
    await this.ensureSchema();
    const displayName = normalizeOnlineAccountDisplayName(input.displayName);
    if (!displayName.ok) {
      throw new Error(displayName.error.message);
    }
    if (!isOnlineTokenCredentialHash(input.tokenHash)) {
      throw new Error("Account session token hash is invalid.");
    }

    try {
      return await this.withTransaction(async (queryable) => {
        const accountResult = await queryable.query(
          `
            INSERT INTO online_accounts (
              account_id,
              display_name,
              display_name_normalized,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $4)
            RETURNING account_id, display_name, created_at, updated_at
          `,
          [
            input.accountId,
            displayName.value,
            normalizeOnlineAccountDisplayNameKey(displayName.value),
            input.createdAt,
          ]
        );
        await queryable.query(
          `
            INSERT INTO online_account_sessions (
              session_id,
              account_id,
              token_hash,
              created_at,
              last_used_at
            )
            VALUES ($1, $2, $3, $4, $4)
          `,
          [input.sessionId, input.accountId, input.tokenHash, input.createdAt]
        );
        const account = accountFromRow(accountResult.rows[0]);
        return {
          account,
          sessionId: input.sessionId,
          lastUsedAt: input.createdAt,
        };
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        const constraint = String((error as { constraint?: unknown }).constraint ?? "");
        if (constraint.includes("display_name")) {
          throw new DuplicateOnlineAccountDisplayNameError(displayName.value);
        }
        if (constraint.includes("session") || constraint.includes("token_hash")) {
          throw new DuplicateOnlineAccountSessionCredentialError();
        }
        throw new DuplicateOnlineAccountIdError(input.accountId);
      }
      throw error;
    }
  }

  async resolveSessionToken(token: string, usedAt: string): Promise<ResolvedOnlineAccountSession | null> {
    await this.ensureSchema();
    if (typeof token !== "string" || token.length === 0) return null;
    const tokenHash = hashOnlineToken(token);
    const result = await this.queryable.query(
      `
        SELECT
          a.account_id,
          a.display_name,
          a.created_at,
          a.updated_at,
          s.session_id
        FROM online_account_sessions s
        INNER JOIN online_accounts a ON a.account_id = s.account_id
        WHERE s.token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    await this.queryable.query(
      "UPDATE online_account_sessions SET last_used_at = $2 WHERE session_id = $1",
      [row.session_id, usedAt]
    );
    return {
      account: accountFromRow(row),
      sessionId: String(row.session_id),
      lastUsedAt: usedAt,
    };
  }

  async checkReady(): Promise<boolean> {
    await this.ensureSchema();
    await this.queryable.query("SELECT 1");
    return true;
  }

  async close(): Promise<void> {
    await this.closeConnection?.();
  }

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.createSchema().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });
    return this.schemaReady;
  }

  private async createSchema(): Promise<void> {
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_accounts (
        account_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        display_name_normalized TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_account_sessions (
        session_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES online_accounts(account_id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL CONSTRAINT online_account_sessions_token_hash_shape CHECK (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
        created_at TIMESTAMPTZ NOT NULL,
        last_used_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.queryable.query(`
      DO $$
      BEGIN
        ALTER TABLE online_account_sessions
          ADD CONSTRAINT online_account_sessions_token_hash_shape
          CHECK (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_account_sessions_account_idx
        ON online_account_sessions (account_id)
    `);
    await this.queryable.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS online_account_sessions_token_hash_unique_idx
        ON online_account_sessions (token_hash)
    `);
  }

  private async withTransaction<T>(operation: (queryable: PostgresQueryable) => Promise<T>): Promise<T> {
    const client = await this.transactionClientFactory?.();
    const queryable = client ?? this.queryable;
    try {
      await queryable.query("BEGIN");
      const result = await operation(queryable);
      await queryable.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await queryable.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Postgres account transaction failed and rollback also failed."
        );
      }
      throw error;
    } finally {
      client?.release();
    }
  }
}
