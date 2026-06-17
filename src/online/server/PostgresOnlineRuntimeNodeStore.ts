import { Pool } from "pg";
import {
  normalizeRuntimeNodeId,
  type OnlineRuntimeDrainState,
  type OnlineRuntimeNodeState,
  type OnlineRuntimeStartDrainInput,
} from "./onlineRuntimeCoordinator";
import { resolvePostgresPoolMaxPerStore } from "./postgresPoolConfig";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
}

export interface PostgresOnlineRuntimeNodeStoreOptions {
  nodeId: string;
  connectionString?: string;
  poolMaxPerStore?: number;
  queryable?: PostgresQueryable;
  close?: () => Promise<void>;
}

export interface PostgresOnlineRuntimeNodeState extends OnlineRuntimeNodeState {}

const DEFAULT_POSTGRES_TIMEOUT_MS = 5_000;

function parseTimestamp(value: unknown, label: string): string {
  const date =
    typeof value === "string"
      ? new Date(value)
      : value instanceof Date
        ? value
        : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid PostgreSQL runtime node ${label}.`);
  }
  return date.toISOString();
}

function rowToNodeState(row: any): PostgresOnlineRuntimeNodeState {
  if (typeof row?.node_id !== "string" || typeof row.draining !== "boolean") {
    throw new Error("Invalid PostgreSQL runtime node row.");
  }
  return {
    nodeId: normalizeRuntimeNodeId(row.node_id),
    firstSeenAt: parseTimestamp(row.first_seen_at, "first_seen_at"),
    lastSeenAt: parseTimestamp(row.last_seen_at, "last_seen_at"),
    draining: row.draining,
    ...(row.drain_started_at
      ? { drainStartedAt: parseTimestamp(row.drain_started_at, "drain_started_at") }
      : {}),
    updatedAt: parseTimestamp(row.updated_at, "updated_at"),
  };
}

function drainStateFromNode(state: PostgresOnlineRuntimeNodeState | null): OnlineRuntimeDrainState {
  if (!state) return { draining: false };
  return state.draining
    ? { draining: true, startedAt: state.drainStartedAt }
    : { draining: false };
}

export class PostgresOnlineRuntimeNodeStore {
  private readonly nodeId: string;
  private readonly queryable: PostgresQueryable;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineRuntimeNodeStoreOptions) {
    this.nodeId = normalizeRuntimeNodeId(options.nodeId);
    if (options.queryable) {
      this.queryable = options.queryable;
      this.closeConnection = options.close;
      return;
    }
    if (!options.connectionString) {
      throw new Error("PostgresOnlineRuntimeNodeStore requires a connectionString or queryable.");
    }
    const pool = new Pool({
      connectionString: options.connectionString,
      max: resolvePostgresPoolMaxPerStore(options.poolMaxPerStore),
      connectionTimeoutMillis: DEFAULT_POSTGRES_TIMEOUT_MS,
      query_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
      statement_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
    });
    this.queryable = pool;
    this.closeConnection = () => pool.end();
  }

  async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.createSchema().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });
    return this.schemaReady;
  }

  async recordNodeStarted(): Promise<PostgresOnlineRuntimeNodeState> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        INSERT INTO online_runtime_nodes (
          node_id,
          first_seen_at,
          last_seen_at,
          draining,
          drain_started_at,
          updated_at
        )
        VALUES ($1, now(), now(), false, NULL, now())
        ON CONFLICT (node_id) DO UPDATE
        SET
          last_seen_at = now(),
          draining = false,
          drain_started_at = NULL,
          updated_at = now()
        RETURNING node_id, first_seen_at, last_seen_at, draining, drain_started_at, updated_at
      `,
      [this.nodeId]
    );
    return rowToNodeState(result.rows[0]);
  }

  async recordNodeHeartbeat(): Promise<PostgresOnlineRuntimeNodeState> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        INSERT INTO online_runtime_nodes (
          node_id,
          first_seen_at,
          last_seen_at,
          draining,
          drain_started_at,
          updated_at
        )
        VALUES ($1, now(), now(), false, NULL, now())
        ON CONFLICT (node_id) DO UPDATE
        SET
          last_seen_at = now(),
          updated_at = now()
        RETURNING node_id, first_seen_at, last_seen_at, draining, drain_started_at, updated_at
      `,
      [this.nodeId]
    );
    return rowToNodeState(result.rows[0]);
  }

  async getNodeState(): Promise<PostgresOnlineRuntimeNodeState | null> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        SELECT node_id, first_seen_at, last_seen_at, draining, drain_started_at, updated_at
        FROM online_runtime_nodes
        WHERE node_id = $1
      `,
      [this.nodeId]
    );
    return result.rows[0] ? rowToNodeState(result.rows[0]) : null;
  }

  async getDrainState(): Promise<OnlineRuntimeDrainState> {
    return drainStateFromNode(await this.getNodeState());
  }

  async startDrain(_input: OnlineRuntimeStartDrainInput = {}): Promise<OnlineRuntimeDrainState> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        INSERT INTO online_runtime_nodes (
          node_id,
          first_seen_at,
          last_seen_at,
          draining,
          drain_started_at,
          updated_at
        )
        VALUES ($1, now(), now(), true, now(), now())
        ON CONFLICT (node_id) DO UPDATE
        SET
          last_seen_at = now(),
          draining = true,
          drain_started_at = CASE
            WHEN online_runtime_nodes.draining THEN COALESCE(online_runtime_nodes.drain_started_at, now())
            ELSE now()
          END,
          updated_at = now()
        RETURNING node_id, first_seen_at, last_seen_at, draining, drain_started_at, updated_at
      `,
      [this.nodeId]
    );
    return drainStateFromNode(rowToNodeState(result.rows[0]));
  }

  async close(): Promise<void> {
    await this.closeConnection?.();
  }

  private async createSchema(): Promise<void> {
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_runtime_nodes (
        node_id TEXT NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        draining BOOLEAN NOT NULL DEFAULT false,
        drain_started_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (node_id)
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_runtime_nodes_last_seen_at_idx
        ON online_runtime_nodes (last_seen_at)
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_runtime_nodes_draining_idx
        ON online_runtime_nodes (draining, drain_started_at)
    `);
  }
}
