import { Pool } from "pg";
import { stringContainsDurableSecret } from "../secretSafety";
import type {
  OnlineRuntimeStartupMaintenanceResult,
  OnlineRuntimeStartupMaintenanceStore,
} from "./onlineRuntimeCoordinator";
import { resolvePostgresPoolMaxPerStore } from "./postgresPoolConfig";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
}

interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

export interface PostgresOnlineStartupMaintenanceStoreOptions {
  connectionString?: string;
  poolMaxPerStore?: number;
  queryable?: PostgresQueryable;
  transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  close?: () => Promise<void>;
}

const DEFAULT_POSTGRES_TIMEOUT_MS = 5_000;
const MAINTENANCE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const ONLINE_ENTITY_ID_PATTERN =
  /(^|[:.])(?:account|account_session|challenge|game|seek|report|report_audit)_[A-Za-z0-9_-]+/i;

function normalizeMaintenanceIdentifier(
  value: string,
  label: "task key" | "run key" | "node id"
): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`PostgreSQL startup maintenance ${label} must be non-empty.`);
  }
  if (normalized.length > 256) {
    throw new Error(`PostgreSQL startup maintenance ${label} must be at most 256 characters.`);
  }
  if (!MAINTENANCE_IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(
      `PostgreSQL startup maintenance ${label} must use only letters, numbers, dots, colons, underscores, or hyphens.`
    );
  }
  if (stringContainsDurableSecret(normalized)) {
    throw new Error(`PostgreSQL startup maintenance ${label} must not contain secrets.`);
  }
  if (ONLINE_ENTITY_ID_PATTERN.test(normalized)) {
    throw new Error(
      `PostgreSQL startup maintenance ${label} must not contain online entity ids.`
    );
  }
  return normalized;
}

export class PostgresOnlineStartupMaintenanceStore implements OnlineRuntimeStartupMaintenanceStore {
  private readonly queryable: PostgresQueryable;
  private readonly transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineStartupMaintenanceStoreOptions) {
    if (options.queryable) {
      this.queryable = options.queryable;
      this.transactionClientFactory = options.transactionClientFactory;
      this.closeConnection = options.close;
      return;
    }

    if (!options.connectionString) {
      throw new Error(
        "PostgresOnlineStartupMaintenanceStore requires a connectionString or queryable."
      );
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

  async runStartupMaintenance<T>(
    input: { taskKey: string; runKey: string; nodeId: string },
    operation: () => Promise<T>
  ): Promise<OnlineRuntimeStartupMaintenanceResult<T>> {
    const taskKey = normalizeMaintenanceIdentifier(input.taskKey, "task key");
    const runKey = normalizeMaintenanceIdentifier(input.runKey, "run key");
    const nodeId = normalizeMaintenanceIdentifier(input.nodeId, "node id");
    await this.ensureSchema();

    const client = await this.transactionClientFactory?.();
    const queryable = client ?? this.queryable;
    try {
      await queryable.query("BEGIN");
      await queryable.query(
        `
          INSERT INTO online_startup_maintenance (task_key, run_key, owner_node_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (task_key, run_key) DO NOTHING
        `,
        [taskKey, runKey, nodeId]
      );
      const rowResult = await queryable.query(
        `
          SELECT task_key, run_key, completed_at
          FROM online_startup_maintenance
          WHERE task_key = $1 AND run_key = $2
          FOR UPDATE
        `,
        [taskKey, runKey]
      );
      const row = rowResult.rows[0];
      if (!row) {
        throw new Error("PostgreSQL startup maintenance row was not available after insert.");
      }
      if (row.completed_at) {
        await queryable.query("COMMIT");
        return { status: "already_completed" };
      }

      await queryable.query(
        `
          UPDATE online_startup_maintenance
          SET owner_node_id = $3,
              started_at = now(),
              completed_at = NULL
          WHERE task_key = $1 AND run_key = $2
        `,
        [taskKey, runKey, nodeId]
      );
      const value = await operation();
      await queryable.query(
        `
          UPDATE online_startup_maintenance
          SET completed_at = now()
          WHERE task_key = $1 AND run_key = $2
        `,
        [taskKey, runKey]
      );
      await queryable.query("COMMIT");
      return { status: "completed", value };
    } catch (error) {
      try {
        await queryable.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "PostgreSQL startup maintenance transaction failed and rollback also failed."
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

  private async createSchema(): Promise<void> {
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_startup_maintenance (
        task_key TEXT NOT NULL,
        run_key TEXT NOT NULL,
        owner_node_id TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ,
        PRIMARY KEY (task_key, run_key)
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_startup_maintenance_completed_at_idx
        ON online_startup_maintenance (completed_at)
    `);
  }
}
