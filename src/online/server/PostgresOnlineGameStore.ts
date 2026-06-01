import { Pool } from "pg";
import { OnlineGameRoom, type OnlineGameRoomRecord } from "../OnlineGameRoom";
import {
  createOnlineActionAcceptedEvent,
  createOnlineTimeoutAdjudicatedEvent,
  type OnlineGameCredentials,
  OnlineGameEvent,
  onlineGameEventsToRecords,
  validateOnlineGameEvent,
} from "../events";
import {
  OnlineGameSummary,
  projectOnlineGameSummaries,
  validateOnlineGameSummary,
} from "../readModel";
import type {
  OnlineGameStore,
  OnlineGameStoreActionInput,
  OnlineGameStoreActionResult,
  OnlineGameStoreLoadOptions,
  OnlineGameStoreTimeoutInput,
  OnlineGameStoreTimeoutResult,
} from "./OnlineGameStore";
import { isOnlineTokenCredentialHash, verifyOnlineToken } from "./onlineTokenCredentials";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

const DEFAULT_POSTGRES_TIMEOUT_MS = 5_000;

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

  async load(options: OnlineGameStoreLoadOptions = {}): Promise<OnlineGameRoomRecord[]> {
    await this.ensureSchema();
    const events = await this.loadEvents(options);
    const credentials = await this.loadCredentials();

    return onlineGameEventsToRecords(events, {
      credentials,
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

  async appendGameCreated(
    event: Extract<OnlineGameEvent, { type: "game_created" }>,
    credentials: OnlineGameCredentials
  ): Promise<void> {
    const validated = this.validate(event);
    if (validated.type !== "game_created") {
      throw new Error("appendGameCreated only accepts game_created events.");
    }
    this.validateCredentials(validated.gameId, credentials);
    await this.ensureSchema();
    await this.withTransaction(async (client) => {
      await this.insertEvent(validated, client);
      await this.insertCredentials(validated.gameId, credentials, client);
      await this.refreshSummaryForGame(validated.gameId, client);
    });
  }

  async appendEvent(event: OnlineGameEvent): Promise<void> {
    const validated = this.validate(event);
    if (validated.type === "game_created") {
      throw new Error("Use appendGameCreated to persist game credentials atomically.");
    }
    await this.ensureSchema();
    await this.withTransaction(async (client) => {
      await this.insertEvent(validated, client);
      await this.refreshSummaryForGame(validated.gameId, client);
    });
  }

  async applyGameAction(
    input: OnlineGameStoreActionInput
  ): Promise<OnlineGameStoreActionResult> {
    await this.ensureSchema();
    return this.withGameTransaction(input.gameId, async (client) => {
      const record = await this.loadRecordForGame(input.gameId, client);
      if (!record) {
        return {
          ok: false,
          error: {
            code: "not_found",
            message: "No online game was found for that id.",
          },
        };
      }

      const room = OnlineGameRoom.create({
        ...record,
        verifyToken: verifyOnlineToken,
        now: input.now,
      });
      const playerColor = room.authenticate(input.token);
      if (!playerColor) {
        return {
          ok: false,
          error: {
            code: "unauthorized",
            message: "This player token is not valid.",
          },
          room: room.toRecord(),
          snapshot: room.getSnapshot(),
        };
      }

      const timeout = room.adjudicateTimeout();
      if (timeout) {
        const event = createOnlineTimeoutAdjudicatedEvent({
          type: "timeout_adjudicated",
          gameId: input.gameId,
          playerColor: timeout.playerColor,
          version: timeout.version,
          adjudicatedAt: timeout.adjudicatedAt,
          result: timeout.result,
          clock: timeout.clock,
        });
        await this.insertEvent(event, client);
        await this.refreshSummaryForGame(input.gameId, client);
        return {
          ok: false,
          error: {
            code: "game_over",
            message: "This game is already over on time.",
          },
          event,
          room: room.toRecord(),
          snapshot: room.getSnapshot(),
        };
      }

      const result = room.submitAction(input.token, input.action);
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          room: room.toRecord(),
          snapshot: result.snapshot,
        };
      }

      const roomRecord = room.toRecord();
      const acceptedAction = roomRecord.acceptedActions.at(-1);
      if (!acceptedAction || acceptedAction.version !== result.snapshot.version) {
        throw new Error(`Accepted online action for ${input.gameId} was not recorded.`);
      }
      if (result.snapshot.clock && !acceptedAction.clock) {
        throw new Error(`Accepted online action for ${input.gameId} is missing clock.`);
      }

      const event = createOnlineActionAcceptedEvent({
        type: "action_accepted",
        gameId: input.gameId,
        playerColor,
        version: result.snapshot.version,
        action: acceptedAction.action,
        playedAt: acceptedAction.playedAt,
        clock: acceptedAction.clock,
      });
      await this.insertEvent(event, client);
      await this.refreshSummaryForGame(input.gameId, client);
      return {
        ok: true,
        event,
        playerColor,
        room: roomRecord,
        snapshot: result.snapshot,
      };
    });
  }

  async adjudicateGameTimeout(
    input: OnlineGameStoreTimeoutInput
  ): Promise<OnlineGameStoreTimeoutResult> {
    await this.ensureSchema();
    return this.withGameTransaction(input.gameId, async (client) => {
      const record = await this.loadRecordForGame(input.gameId, client);
      if (!record) {
        return {
          ok: false,
          error: {
            code: "not_found",
            message: "No online game was found for that id.",
          },
        };
      }

      const room = OnlineGameRoom.create({
        ...record,
        verifyToken: verifyOnlineToken,
        now: input.now,
      });
      const timeout = room.adjudicateTimeout();
      if (!timeout) {
        return {
          ok: true,
          room: room.toRecord(),
          snapshot: room.getSnapshot(),
        };
      }

      const event = createOnlineTimeoutAdjudicatedEvent({
        type: "timeout_adjudicated",
        gameId: input.gameId,
        playerColor: timeout.playerColor,
        version: timeout.version,
        adjudicatedAt: timeout.adjudicatedAt,
        result: timeout.result,
        clock: timeout.clock,
      });
      await this.insertEvent(event, client);
      await this.refreshSummaryForGame(input.gameId, client);
      return {
        ok: true,
        event,
        room: room.toRecord(),
        snapshot: room.getSnapshot(),
      };
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
      CREATE TABLE IF NOT EXISTS online_game_credentials (
        game_id TEXT NOT NULL,
        seat TEXT NOT NULL CHECK (seat IN ('w', 'b')),
        token_hash TEXT NOT NULL CONSTRAINT online_game_credentials_token_hash_shape CHECK (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (game_id, seat)
      )
    `);
    await this.queryable.query(`
      DO $$
      BEGIN
        ALTER TABLE online_game_credentials
          ADD CONSTRAINT online_game_credentials_token_hash_shape
          CHECK (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
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
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_game_locks (
        game_id TEXT PRIMARY KEY
      )
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

  private async insertCredentials(
    gameId: string,
    credentials: OnlineGameCredentials,
    queryable: PostgresQueryable = this.queryable
  ): Promise<void> {
    await queryable.query(
      `
        INSERT INTO online_game_credentials (game_id, seat, token_hash)
        VALUES ($1, $2, $3), ($1, $4, $5)
      `,
      [gameId, "w", credentials.whiteCredential, "b", credentials.blackCredential]
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

  private async loadCredentials(
    queryable: PostgresQueryable = this.queryable
  ): Promise<Map<string, OnlineGameCredentials>> {
    const result = await queryable.query(
      "SELECT game_id, seat, token_hash FROM online_game_credentials"
    );
    return this.credentialsFromRows(result.rows);
  }

  private async loadCredentialsForGame(
    gameId: string,
    queryable: PostgresQueryable
  ): Promise<Map<string, OnlineGameCredentials>> {
    const result = await queryable.query(
      "SELECT game_id, seat, token_hash FROM online_game_credentials WHERE game_id = $1",
      [gameId]
    );
    return this.credentialsFromRows(result.rows);
  }

  private credentialsFromRows(rows: any[]): Map<string, OnlineGameCredentials> {
    const entries = new Map<string, Partial<OnlineGameCredentials>>();
    for (const row of rows) {
      const gameId = row.game_id;
      const seat = row.seat;
      const tokenHash = row.token_hash;
      if (typeof gameId !== "string" || (seat !== "w" && seat !== "b")) {
        throw new Error("Invalid online game credential row.");
      }
      if (typeof tokenHash !== "string" || !isOnlineTokenCredentialHash(tokenHash)) {
        throw new Error(`Invalid online game credential for ${gameId}.`);
      }
      const entry = entries.get(gameId) ?? {};
      if (seat === "w") {
        entry.whiteCredential = tokenHash;
      } else {
        entry.blackCredential = tokenHash;
      }
      entries.set(gameId, entry);
    }

    const credentials = new Map<string, OnlineGameCredentials>();
    for (const [gameId, entry] of entries) {
      if (!entry.whiteCredential || !entry.blackCredential) {
        throw new Error(`Missing online game credentials for ${gameId}.`);
      }
      credentials.set(gameId, {
        whiteCredential: entry.whiteCredential,
        blackCredential: entry.blackCredential,
      });
    }
    return credentials;
  }

  private validateCredentials(gameId: string, credentials: OnlineGameCredentials): void {
    if (
      typeof credentials.whiteCredential !== "string" ||
      !isOnlineTokenCredentialHash(credentials.whiteCredential) ||
      typeof credentials.blackCredential !== "string" ||
      !isOnlineTokenCredentialHash(credentials.blackCredential)
    ) {
      throw new Error(`Invalid online game credential hash for ${gameId}.`);
    }
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

  private async loadRecordForGame(
    gameId: string,
    queryable: PostgresQueryable
  ): Promise<OnlineGameRoomRecord | null> {
    const events = await this.loadEventsForGame(gameId, queryable);
    const credentials = await this.loadCredentialsForGame(gameId, queryable);
    const records = onlineGameEventsToRecords(events, {
      credentials,
    });
    if (records.length === 0) return null;
    if (records.length > 1) {
      throw new Error(`Expected one online game record for ${gameId}, found ${records.length}.`);
    }
    return records[0];
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
    operation: (queryable: PostgresQueryable) => Promise<T>,
    acquireLock: (queryable: PostgresQueryable) => Promise<void> = (queryable) =>
      this.acquireSummaryLock(queryable)
  ): Promise<T> {
    const client = await this.transactionClientFactory?.();
    const queryable = client ?? this.queryable;
    try {
      await queryable.query("BEGIN");
      await acquireLock(queryable);
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

  private async withGameTransaction<T>(
    gameId: string,
    operation: (queryable: PostgresQueryable) => Promise<T>
  ): Promise<T> {
    return this.withTransaction(operation, async (queryable) => {
      await queryable.query(
        "INSERT INTO online_game_locks (game_id) VALUES ($1) ON CONFLICT (game_id) DO NOTHING",
        [gameId]
      );
      await queryable.query(
        "SELECT game_id FROM online_game_locks WHERE game_id = $1 FOR UPDATE",
        [gameId]
      );
      await this.acquireSummaryLock(queryable);
    });
  }

  private async acquireSummaryLock(queryable: PostgresQueryable): Promise<void> {
    await queryable.query("SELECT pg_advisory_xact_lock($1)", [
      PostgresOnlineGameStore.summaryLockKey,
    ]);
  }
}
