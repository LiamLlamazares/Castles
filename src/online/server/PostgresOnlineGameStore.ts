import { Pool } from "pg";
import type { OnlineGameRoomRecord } from "../OnlineGameRoom";
import {
  OnlineGameEvent,
  onlineGameEventsToRecords,
  validateOnlineGameEvent,
} from "../events";
import type { OnlineGameStore, OnlineGameStoreLoadOptions } from "./OnlineGameStore";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

export interface PostgresOnlineGameStoreOptions {
  connectionString?: string;
  queryable?: PostgresQueryable;
  close?: () => Promise<void>;
}

export class PostgresOnlineGameStore implements OnlineGameStore {
  private readonly queryable: PostgresQueryable;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineGameStoreOptions) {
    if (options.queryable) {
      this.queryable = options.queryable;
      this.closeConnection = options.close;
      return;
    }

    if (!options.connectionString) {
      throw new Error("PostgresOnlineGameStore requires a connectionString or queryable.");
    }

    const pool = new Pool({ connectionString: options.connectionString });
    this.queryable = pool;
    this.closeConnection = () => pool.end();
  }

  async load(options: OnlineGameStoreLoadOptions = {}): Promise<OnlineGameRoomRecord[]> {
    await this.ensureSchema();
    const result = await this.queryable.query(
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

    return onlineGameEventsToRecords(events, {
      onEventError: (eventIndex, error) => {
        options.onEventError?.(eventIndex + 1, error);
      },
    });
  }

  async appendEvent(event: OnlineGameEvent): Promise<void> {
    const validated = this.validate(event);
    await this.ensureSchema();
    await this.insertEvent(validated);
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
  }

  private async insertEvent(event: OnlineGameEvent): Promise<void> {
    await this.queryable.query(
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
}
