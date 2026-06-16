import { Pool } from "pg";
import type { OnlineRuntimeSnapshotReason } from "./onlineRuntimeCoordinator";
import { normalizeRuntimeNodeId } from "./onlineRuntimeCoordinator";
import { stringContainsDurableSecret } from "../secretSafety";
import { resolvePostgresPoolMaxPerStore } from "./postgresPoolConfig";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
}

export interface PostgresOnlineRuntimeEventStoreOptions {
  nodeId: string;
  connectionString?: string;
  poolMaxPerStore?: number;
  queryable?: PostgresQueryable;
  close?: () => Promise<void>;
}

export interface PostgresRuntimeGameSnapshotEvent {
  id: number;
  type: "game_snapshot_changed";
  gameId: string;
  roomVersion: number;
  lastEventId?: string;
  reason: OnlineRuntimeSnapshotReason;
  nodeId: string;
  createdAt: string;
}

export interface PostgresRuntimeGameSnapshotEventList {
  events: PostgresRuntimeGameSnapshotEvent[];
  nextAfterId: number;
}

const RUNTIME_SNAPSHOT_REASONS = new Set<OnlineRuntimeSnapshotReason>([
  "action",
  "timeout",
  "visibility",
  "challenge",
  "open_seek",
  "snapshot",
]);
const DEFAULT_POSTGRES_TIMEOUT_MS = 5_000;

function normalizeRuntimeSnapshotReason(reason: OnlineRuntimeSnapshotReason): OnlineRuntimeSnapshotReason {
  if (!RUNTIME_SNAPSHOT_REASONS.has(reason)) {
    throw new Error("Invalid runtime snapshot reason.");
  }
  return reason;
}

function normalizeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function normalizeRowId(value: unknown): number {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) < 0) {
    throw new Error("Invalid PostgreSQL runtime event row.");
  }
  return parsed as number;
}

function normalizeRuntimeEventLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("PostgreSQL runtime event limit must be an integer from 1 through 500.");
  }
  return limit;
}

function normalizeRuntimeEventRetentionMs(retentionMs: number): number {
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 1) {
    throw new Error("PostgreSQL runtime event retention must be a positive integer of milliseconds.");
  }
  return retentionMs;
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("PostgreSQL runtime event lastEventId must not be empty.");
  }
  if (stringContainsDurableSecret(trimmed)) {
    throw new Error("PostgreSQL runtime event metadata must not contain secrets.");
  }
  return trimmed;
}

function normalizeRuntimeEventGameId(gameId: string): string {
  const trimmed = gameId.trim();
  if (!trimmed) {
    throw new Error("PostgreSQL runtime event gameId must not be empty.");
  }
  if (stringContainsDurableSecret(trimmed)) {
    throw new Error("PostgreSQL runtime event metadata must not contain secrets.");
  }
  return trimmed;
}

function rowToRuntimeGameSnapshotEvent(row: any): PostgresRuntimeGameSnapshotEvent {
  if (
    row?.id === undefined ||
    row.event_type !== "game_snapshot_changed" ||
    typeof row.game_id !== "string" ||
    !Number.isSafeInteger(row.room_version) ||
    row.room_version < 0 ||
    (row.last_event_id !== null && row.last_event_id !== undefined && typeof row.last_event_id !== "string") ||
    typeof row.reason !== "string" ||
    typeof row.node_id !== "string"
  ) {
    throw new Error("Invalid PostgreSQL runtime event row.");
  }
  const id = normalizeRowId(row.id);
  const createdAt =
    typeof row.created_at === "string"
      ? new Date(row.created_at)
      : row.created_at instanceof Date
        ? row.created_at
        : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    throw new Error("Invalid PostgreSQL runtime event row.");
  }

  const event: PostgresRuntimeGameSnapshotEvent = {
    id,
    type: "game_snapshot_changed",
    gameId: row.game_id,
    roomVersion: row.room_version,
    reason: normalizeRuntimeSnapshotReason(row.reason as OnlineRuntimeSnapshotReason),
    nodeId: normalizeRuntimeNodeId(row.node_id),
    createdAt: createdAt.toISOString(),
  };
  if (row.last_event_id) {
    event.lastEventId = row.last_event_id;
  }
  return event;
}

export class PostgresOnlineRuntimeEventStore {
  private readonly nodeId: string;
  private readonly queryable: PostgresQueryable;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineRuntimeEventStoreOptions) {
    this.nodeId = normalizeRuntimeNodeId(options.nodeId);
    if (options.queryable) {
      this.queryable = options.queryable;
      this.closeConnection = options.close;
    } else {
      if (!options.connectionString) {
        throw new Error("PostgresOnlineRuntimeEventStore requires a connectionString or queryable.");
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
  }

  async close(): Promise<void> {
    await this.closeConnection?.();
  }

  async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.createSchema().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });
    return this.schemaReady;
  }

  async recordGameSnapshotChanged(input: {
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: OnlineRuntimeSnapshotReason;
  }): Promise<PostgresRuntimeGameSnapshotEvent> {
    await this.ensureSchema();
    const reason = normalizeRuntimeSnapshotReason(input.reason);
    const gameId = normalizeRuntimeEventGameId(input.gameId);
    const roomVersion = normalizeSafeInteger(input.roomVersion, "PostgreSQL runtime event roomVersion");
    const lastEventId = normalizeOptionalText(input.lastEventId);
    const result = await this.queryable.query(
      `
        INSERT INTO online_runtime_events (
          event_type,
          game_id,
          room_version,
          last_event_id,
          reason,
          node_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
        RETURNING id, event_type, game_id, room_version, last_event_id, reason, node_id, created_at
      `,
      ["game_snapshot_changed", gameId, roomVersion, lastEventId, reason, this.nodeId]
    );
    return rowToRuntimeGameSnapshotEvent(result.rows[0]);
  }

  async listGameSnapshotChangedEventsAfter(input: {
    afterId: number;
    limit: number;
    excludeNodeId?: string;
  }): Promise<PostgresRuntimeGameSnapshotEventList> {
    await this.ensureSchema();
    const afterId = normalizeSafeInteger(input.afterId, "PostgreSQL runtime event cursor");
    const limit = normalizeRuntimeEventLimit(input.limit);
    const excludeNodeId = input.excludeNodeId ? normalizeRuntimeNodeId(input.excludeNodeId) : undefined;
    const result = await this.queryable.query(
      `
        SELECT id, event_type, game_id, room_version, last_event_id, reason, node_id, created_at
        FROM online_runtime_events
        WHERE id > $1
          AND event_type = $2
        ORDER BY id ASC
        LIMIT $3
      `,
      [afterId, "game_snapshot_changed", limit]
    );
    const allEvents = result.rows.map(rowToRuntimeGameSnapshotEvent);
    return {
      events: excludeNodeId
        ? allEvents.filter((event) => event.nodeId !== excludeNodeId)
        : allEvents,
      nextAfterId: allEvents.at(-1)?.id ?? afterId,
    };
  }

  async cleanupRuntimeEventsBefore(cutoffIso: string): Promise<number> {
    await this.ensureSchema();
    const cutoff = new Date(cutoffIso);
    if (Number.isNaN(cutoff.getTime())) {
      throw new Error("PostgreSQL runtime event cleanup cutoff must be an ISO timestamp.");
    }
    const result = await this.queryable.query(
      `
        DELETE FROM online_runtime_events
        WHERE created_at < $1::timestamptz
      `,
      [cutoff.toISOString()]
    );
    return result.rowCount ?? 0;
  }

  async cleanupRuntimeEventsOlderThan(retentionMs: number): Promise<number> {
    const retention = normalizeRuntimeEventRetentionMs(retentionMs);
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        DELETE FROM online_runtime_events
        WHERE created_at < now() - ($1::bigint * interval '1 millisecond')
      `,
      [retention]
    );
    return result.rowCount ?? 0;
  }

  private async createSchema(): Promise<void> {
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_runtime_events (
        id BIGSERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        game_id TEXT NOT NULL,
        room_version INTEGER NOT NULL,
        last_event_id TEXT,
        reason TEXT NOT NULL,
        node_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_runtime_events_type_id_idx
        ON online_runtime_events (event_type, id)
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_runtime_events_game_id_idx
        ON online_runtime_events (game_id, id)
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_runtime_events_created_at_idx
        ON online_runtime_events (created_at)
    `);
  }
}
