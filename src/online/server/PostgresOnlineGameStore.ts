import { Pool } from "pg";
import type { OnlineGameRoomRecord } from "../OnlineGameRoom";
import {
  OnlineGameEvent,
  onlineGameEventsToRecords,
  validateOnlineGameEvent,
} from "../events";
import {
  OnlineGameSummary,
  projectOnlineGameSummaries,
  validateOnlineGameSummary,
} from "../readModel";
import type { OnlineGameStore, OnlineGameStoreLoadOptions } from "./OnlineGameStore";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

export interface PostgresOnlineGameStoreOptions {
  connectionString?: string;
  queryable?: PostgresQueryable;
  transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  close?: () => Promise<void>;
}

export class PostgresOnlineGameStore implements OnlineGameStore {
  private static readonly summaryLockKey = 1_431_903_351;
  private readonly queryable: PostgresQueryable;
  private readonly transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineGameStoreOptions) {
    if (options.queryable) {
      this.queryable = options.queryable;
      this.transactionClientFactory = options.transactionClientFactory;
      this.closeConnection = options.close;
      return;
    }

    if (!options.connectionString) {
      throw new Error("PostgresOnlineGameStore requires a connectionString or queryable.");
    }

    const pool = new Pool({ connectionString: options.connectionString });
    this.queryable = pool;
    this.transactionClientFactory = () => pool.connect();
    this.closeConnection = () => pool.end();
  }

  async load(options: OnlineGameStoreLoadOptions = {}): Promise<OnlineGameRoomRecord[]> {
    await this.ensureSchema();
    const events = await this.loadEvents(options);

    return onlineGameEventsToRecords(events, {
      onEventError: (eventIndex, error) => {
        options.onEventError?.(eventIndex + 1, error);
      },
    });
  }

  async loadSummaries(): Promise<OnlineGameSummary[]> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      "SELECT payload FROM online_game_summaries ORDER BY updated_at DESC, game_id ASC"
    );
    return result.rows.map((row, index) => {
      const validation = validateOnlineGameSummary(row.payload);
      if (!validation.ok) {
        throw new Error(`Invalid online game summary ${index + 1}: ${validation.error.message}`);
      }
      return validation.value;
    });
  }

  async rebuildSummaries(
    options: OnlineGameStoreLoadOptions = {}
  ): Promise<OnlineGameSummary[]> {
    await this.ensureSchema();
    return this.withTransaction(async (client) => {
      const events = await this.loadEvents(options, client);
      const summaries = projectOnlineGameSummaries(events);
      await client.query("DELETE FROM online_game_summaries");
      for (const summary of summaries) {
        await this.upsertSummary(summary, client);
      }
      return summaries;
    });
  }

  async appendEvent(event: OnlineGameEvent): Promise<void> {
    const validated = this.validate(event);
    await this.ensureSchema();
    await this.withTransaction(async (client) => {
      await this.insertEvent(validated, client);
      await this.refreshSummaryForGame(validated.gameId, client);
    });
  }

  async checkReady(): Promise<boolean> {
    await this.ensureSchema();
    await this.queryable.query("SELECT 1");
    return true;
  }

  async close(): Promise<void> {
    await this.closeConnection?.();
  }

  private validate(event: OnlineGameEvent): OnlineGameEvent {
    const validation = validateOnlineGameEvent(event);
    if (!validation.ok) {
      throw new Error(validation.error.message);
    }
    return validation.value;
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
      CREATE TABLE IF NOT EXISTS online_game_events (
        id BIGSERIAL PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        game_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        game_version INTEGER,
        created_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.queryable.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS online_game_events_one_create_per_game
        ON online_game_events (game_id)
        WHERE event_type = 'game_created'
    `);
    await this.queryable.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS online_game_events_one_version_per_game
        ON online_game_events (game_id, game_version)
        WHERE game_version IS NOT NULL
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_game_events_order_idx
        ON online_game_events (id)
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_game_summaries (
        game_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        visibility TEXT NOT NULL,
        archive_state TEXT NOT NULL,
        game_version INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        rebuilt_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_game_summaries_visibility_updated_idx
        ON online_game_summaries (visibility, updated_at DESC)
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_game_summaries_status_updated_idx
        ON online_game_summaries (status, updated_at DESC)
    `);
  }

  private async insertEvent(
    event: OnlineGameEvent,
    queryable: PostgresQueryable = this.queryable
  ): Promise<void> {
    await queryable.query(
      `
        INSERT INTO online_game_events (
          event_id,
          game_id,
          event_type,
          game_version,
          created_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        event.eventId,
        event.gameId,
        event.type,
        this.gameVersion(event),
        event.createdAt,
        event,
      ]
    );
  }

  private gameVersion(event: OnlineGameEvent): number | null {
    if (event.type === "action_accepted" || event.type === "timeout_adjudicated") {
      return event.version;
    }
    return null;
  }

  private async loadEvents(
    options: OnlineGameStoreLoadOptions = {},
    queryable: PostgresQueryable = this.queryable
  ): Promise<OnlineGameEvent[]> {
    const result = await queryable.query(
      "SELECT payload FROM online_game_events ORDER BY id ASC"
    );
    const events: OnlineGameEvent[] = [];

    for (let index = 0; index < result.rows.length; index++) {
      const validation = validateOnlineGameEvent(result.rows[index].payload);
      if (!validation.ok) {
        const error = new Error(validation.error.message);
        options.onEventError?.(index + 1, error);
        throw error;
      }
      events.push(validation.value);
    }

    return events;
  }

  private async loadEventsForGame(
    gameId: string,
    queryable: PostgresQueryable
  ): Promise<OnlineGameEvent[]> {
    const result = await queryable.query(
      "SELECT payload FROM online_game_events WHERE game_id = $1 ORDER BY id ASC",
      [gameId]
    );
    const events: OnlineGameEvent[] = [];

    for (let index = 0; index < result.rows.length; index++) {
      const validation = validateOnlineGameEvent(result.rows[index].payload);
      if (!validation.ok) {
        throw new Error(`Invalid online event for ${gameId} at row ${index + 1}: ${validation.error.message}`);
      }
      events.push(validation.value);
    }

    return events;
  }

  private async refreshSummaryForGame(
    gameId: string,
    queryable: PostgresQueryable
  ): Promise<void> {
    const summaries = projectOnlineGameSummaries(await this.loadEventsForGame(gameId, queryable));
    const summary = summaries.find((candidate) => candidate.gameId === gameId);
    if (!summary) {
      await queryable.query("DELETE FROM online_game_summaries WHERE game_id = $1", [gameId]);
      return;
    }
    await this.upsertSummary(summary, queryable);
  }

  private async upsertSummary(
    summary: OnlineGameSummary,
    queryable: PostgresQueryable = this.queryable
  ): Promise<void> {
    const validation = validateOnlineGameSummary(summary);
    if (!validation.ok) {
      throw new Error(validation.error.message);
    }

    await queryable.query(
      `
        INSERT INTO online_game_summaries (
          game_id,
          status,
          visibility,
          archive_state,
          game_version,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (game_id) DO UPDATE
        SET
          status = EXCLUDED.status,
          visibility = EXCLUDED.visibility,
          archive_state = EXCLUDED.archive_state,
          game_version = EXCLUDED.game_version,
          updated_at = EXCLUDED.updated_at,
          payload = EXCLUDED.payload,
          rebuilt_at = now()
      `,
      [
        validation.value.gameId,
        validation.value.status,
        validation.value.visibility,
        validation.value.archiveState,
        validation.value.version,
        validation.value.updatedAt,
        validation.value,
      ]
    );
  }

  private async withTransaction<T>(
    operation: (queryable: PostgresQueryable) => Promise<T>
  ): Promise<T> {
    const client = await this.transactionClientFactory?.();
    const queryable = client ?? this.queryable;
    try {
      await queryable.query("BEGIN");
      await queryable.query("SELECT pg_advisory_xact_lock($1)", [
        PostgresOnlineGameStore.summaryLockKey,
      ]);
      const result = await operation(queryable);
      await queryable.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await queryable.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Postgres transaction failed and rollback also failed."
        );
      }
      throw error;
    } finally {
      client?.release();
    }
  }
}
