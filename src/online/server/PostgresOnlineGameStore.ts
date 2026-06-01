import { Pool } from "pg";
import { OnlineGameRoom, type OnlineGameRoomRecord } from "../OnlineGameRoom";
import { isValidClientActionId, sameOnlineAction } from "../actionIdempotency";
import {
  type OnlineChallengeEvent,
  type OnlineChallengeSummary,
  canIdentityAcceptChallenge,
  createChallengeAcceptedEvent,
  isSameOnlineIdentity,
  projectOnlineChallengeSummaries,
  validateOnlineChallengeEvent,
  validateOnlineChallengeSummary,
} from "../challenges";
import {
  createOnlineActionAcceptedEvent,
  createOnlineTimeoutAdjudicatedEvent,
  type OnlineGameCredentials,
  OnlineGameEvent,
  onlineGameEventsToRecords,
  validateOnlineGameEvent,
} from "../events";
import {
  type OnlineIdentity,
  OnlineGameSummary,
  projectOnlineGameSummaries,
  validateOnlineIdentity,
  validateOnlineGameSummary,
} from "../readModel";
import type {
  OnlineChallengeAcceptInput,
  OnlineChallengeAcceptResult,
  OnlineChallengeCredentials,
  OnlineGameStore,
  OnlineGameStoreActionInput,
  OnlineGameStoreActionResult,
  OnlineGameStoreLoadOptions,
  OnlineGameStoreTimeoutInput,
  OnlineGameStoreTimeoutResult,
  ResolvedOnlineChallengeCredential,
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
  private static readonly challengeSummaryLockKey = 1_431_903_352;
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

  async loadChallengeSummaries(): Promise<OnlineChallengeSummary[]> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      "SELECT payload FROM online_challenge_summaries ORDER BY updated_at DESC, challenge_id ASC"
    );
    return result.rows.map((row, index) => {
      const validation = validateOnlineChallengeSummary(row.payload);
      if (!validation.ok) {
        throw new Error(`Invalid online challenge summary ${index + 1}: ${validation.error.message}`);
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

  async rebuildChallengeSummaries(
    options: OnlineGameStoreLoadOptions = {}
  ): Promise<OnlineChallengeSummary[]> {
    await this.ensureSchema();
    return this.withTransaction(
      async (client) => {
        const events = await this.loadChallengeEvents(options, client);
        const summaries = projectOnlineChallengeSummaries(events);
        await client.query("DELETE FROM online_challenge_summaries");
        for (const summary of summaries) {
          await this.upsertChallengeSummary(summary, client);
        }
        return summaries;
      },
      (queryable) => this.acquireChallengeSummaryLock(queryable)
    );
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

  async appendChallengeCreated(
    event: Extract<OnlineChallengeEvent, { type: "challenge_created" }>,
    credentials: OnlineChallengeCredentials
  ): Promise<OnlineChallengeSummary> {
    const validated = this.validateChallenge(event);
    if (validated.type !== "challenge_created") {
      throw new Error("appendChallengeCreated only accepts challenge_created events.");
    }
    const normalizedCredentials = this.validateChallengeCredentials(
      validated.challengeId,
      validated,
      credentials
    );
    await this.ensureSchema();
    return this.withChallengeTransaction(validated.challengeId, async (client) => {
      await this.insertChallengeEvent(validated, client);
      await this.insertChallengeCredentials(validated.challengeId, normalizedCredentials, client);
      const summary = await this.refreshChallengeSummaryForChallenge(validated.challengeId, client);
      if (!summary) {
        throw new Error(`Online challenge summary was not refreshed for ${validated.challengeId}.`);
      }
      return summary;
    });
  }

  async resolveChallengeCredential(
    challengeId: string,
    token: string
  ): Promise<ResolvedOnlineChallengeCredential | null> {
    if (typeof challengeId !== "string" || !challengeId || typeof token !== "string" || !token) {
      return null;
    }
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        SELECT role, token_hash, identity
        FROM online_challenge_credentials
        WHERE challenge_id = $1
      `,
      [challengeId]
    );

    for (const row of result.rows) {
      const role = row.role;
      if (role !== "challenger" && role !== "challenged") {
        throw new Error(`Invalid online challenge credential role for ${challengeId}.`);
      }
      const tokenHash = row.token_hash;
      if (typeof tokenHash !== "string" || !isOnlineTokenCredentialHash(tokenHash)) {
        throw new Error(`Invalid online challenge credential hash for ${challengeId}.`);
      }
      const identity = validateOnlineIdentity(row.identity, "challenge credential identity");
      if (!identity.ok) {
        throw new Error(identity.error.message);
      }
      if (!verifyOnlineToken(token, tokenHash)) continue;
      return {
        challengeId,
        role,
        identity: identity.value as ResolvedOnlineChallengeCredential["identity"],
      };
    }
    return null;
  }

  async acceptChallengeAndCreateGame(
    input: OnlineChallengeAcceptInput
  ): Promise<OnlineChallengeAcceptResult> {
    const gameCreatedEvent = this.validate(input.gameCreatedEvent);
    if (gameCreatedEvent.type !== "game_created") {
      throw new Error("acceptChallengeAndCreateGame requires a game_created event.");
    }
    if (gameCreatedEvent.createdAt !== input.acceptedAt) {
      throw new Error("Accepted game event createdAt must equal challenge acceptedAt.");
    }
    this.validateAcceptInput(input, gameCreatedEvent);

    await this.ensureSchema();
    return this.withChallengeAcceptTransaction(
      input.challengeId,
      gameCreatedEvent.gameId,
      async (client) => {
        const challengeEvents = await this.loadChallengeEventsForChallenge(input.challengeId, client);
        const [summary] = projectOnlineChallengeSummaries(challengeEvents);
        if (!summary || summary.challengeId !== input.challengeId) {
          throw new Error(`Online challenge ${input.challengeId} was not found.`);
        }
        if (summary.status !== "pending") {
          throw new Error(`Online challenge ${input.challengeId} is already terminal.`);
        }
        if (!canIdentityAcceptChallenge(summary, input.acceptedBy.identity, input.acceptedAt)) {
          throw new Error(`Resolved challenged role cannot accept online challenge ${input.challengeId}.`);
        }
        if (!this.sameJson(summary.setup, gameCreatedEvent.setup)) {
          throw new Error(`Accepted online game setup must match challenge ${input.challengeId}.`);
        }
        const challengeCredentials = await this.loadChallengeCredentialsForChallenge(
          input.challengeId,
          client
        );
        if (!isSameOnlineIdentity(challengeCredentials.challengerIdentity, summary.challengerIdentity)) {
          throw new Error(`Challenge credentials for ${input.challengeId} do not match challenger identity.`);
        }
        if (!isSameOnlineIdentity(challengeCredentials.challengedIdentity, summary.challengedIdentity)) {
          throw new Error(`Challenge credentials for ${input.challengeId} do not match challenged identity.`);
        }
        const gameSeats = this.resolveAcceptedGameSeats(summary, input);
        const gameCredentials: OnlineGameCredentials =
          gameSeats.challenger === "w"
            ? {
                whiteCredential: challengeCredentials.challengerCredential,
                blackCredential: challengeCredentials.challengedCredential,
              }
            : {
                whiteCredential: challengeCredentials.challengedCredential,
                blackCredential: challengeCredentials.challengerCredential,
              };
        const gameRecord: OnlineGameRoomRecord = {
          gameId: gameCreatedEvent.gameId,
          setup: gameCreatedEvent.setup,
          whiteCredential: gameCredentials.whiteCredential,
          blackCredential: gameCredentials.blackCredential,
          clock: gameCreatedEvent.clock,
          acceptedActions: [],
        };

        const challengeEvent = createChallengeAcceptedEvent(
          {
            type: "challenge_accepted",
            challengeId: input.challengeId,
            acceptedBy: input.acceptedBy.identity,
            acceptedAt: input.acceptedAt,
            gameId: gameCreatedEvent.gameId,
            whiteIdentity: input.whiteIdentity,
            blackIdentity: input.blackIdentity,
          },
          { createdAt: input.acceptedAt }
        );

        await this.insertEvent(gameCreatedEvent, client);
        await this.insertCredentials(gameCreatedEvent.gameId, gameCredentials, client);
        await this.insertChallengeEvent(challengeEvent, client);
        const gameSummary = await this.refreshSummaryForGame(gameCreatedEvent.gameId, client);
        if (!gameSummary) {
          throw new Error(`Online game summary was not refreshed for ${gameCreatedEvent.gameId}.`);
        }
        const challengeSummary = await this.refreshChallengeSummaryForChallenge(input.challengeId, client);
        if (!challengeSummary) {
          throw new Error(`Online challenge summary was not refreshed for ${input.challengeId}.`);
        }

        return {
          challengeEvent,
          challengeSummary,
          gameSummary,
          gameCredentials,
          gameRecord,
          gameSeats,
        };
      }
    );
  }

  async appendChallengeEvent(
    event: Exclude<
      OnlineChallengeEvent,
      { type: "challenge_created" } | { type: "challenge_accepted" }
    >
  ): Promise<OnlineChallengeSummary> {
    const validated = this.validateChallenge(event);
    if (validated.type === "challenge_created") {
      throw new Error(
        "challenge_created must be persisted through appendChallengeCreated so credentials are stored atomically."
      );
    }
    if (validated.type === "challenge_accepted") {
      throw new Error(
        "challenge_accepted must be persisted through acceptChallengeAndCreateGame so game creation and challenge acceptance are atomic."
      );
    }
    await this.ensureSchema();
    return this.withChallengeTransaction(validated.challengeId, async (client) => {
      await this.insertChallengeEvent(validated, client);
      const summary = await this.refreshChallengeSummaryForChallenge(validated.challengeId, client);
      if (!summary) {
        throw new Error(`Online challenge summary was not refreshed for ${validated.challengeId}.`);
      }
      return summary;
    });
  }

  async applyGameAction(
    input: OnlineGameStoreActionInput
  ): Promise<OnlineGameStoreActionResult> {
    await this.ensureSchema();
    return this.withGameTransaction(input.gameId, async (client) => {
      const loaded = await this.loadRecordWithEventsForGame(input.gameId, client);
      const record = loaded?.record ?? null;
      if (!record) {
        return {
          ok: false,
          error: {
            code: "not_found",
            message: "No online game was found for that id.",
          },
        };
      }
      const events = loaded!.events;

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
        };
      }
      if (!isValidClientActionId(input.clientActionId)) {
        return {
          ok: false,
          error: {
            code: "bad_request",
            message: "A valid client action id is required.",
          },
          room: room.toRecord(),
          snapshot: room.getSnapshot(),
        };
      }

      const existingEvent = events.find(
        (
          event
        ): event is Extract<OnlineGameEvent, { type: "action_accepted" }> =>
          event.type === "action_accepted" &&
          event.playerColor === playerColor &&
          event.clientActionId === input.clientActionId
      );
      const duplicateConflict =
        !!existingEvent && !sameOnlineAction(existingEvent.action, input.action);

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
        if (existingEvent && !duplicateConflict) {
          return {
            ok: true,
            event: existingEvent,
            playerColor,
            room: room.toRecord(),
            snapshot: room.getSnapshot(),
          };
        }
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

      const snapshotAfterTimeoutCheck = room.getSnapshot();
      if (duplicateConflict && snapshotAfterTimeoutCheck.result?.reason === "timeout") {
        return {
          ok: false,
          error: {
            code: "game_over",
            message: "This game is already over on time.",
          },
          room: room.toRecord(),
          snapshot: snapshotAfterTimeoutCheck,
        };
      }

      if (duplicateConflict) {
        return {
          ok: false,
          error: {
            code: "duplicate_action",
            message: "This client action id has already been used for a different action.",
          },
          room: room.toRecord(),
          snapshot: room.getSnapshot(),
        };
      }

      if (existingEvent) {
        return {
          ok: true,
          event: existingEvent,
          playerColor,
          room: room.toRecord(),
          snapshot: room.getSnapshot(),
        };
      }

      const result = room.submitAction(input.token, input.action, input.clientActionId);
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
        clientActionId: acceptedAction.clientActionId,
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

  private validateChallenge(event: OnlineChallengeEvent): OnlineChallengeEvent {
    const validation = validateOnlineChallengeEvent(event);
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
      CREATE UNIQUE INDEX IF NOT EXISTS online_game_events_one_client_action_per_player
        ON online_game_events (
          game_id,
          (payload->>'playerColor'),
          (payload->>'clientActionId')
        )
        WHERE event_type = 'action_accepted'
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
      CREATE TABLE IF NOT EXISTS online_challenge_events (
        id BIGSERIAL PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        challenge_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.queryable.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS online_challenge_events_one_create_per_challenge
        ON online_challenge_events (challenge_id)
        WHERE event_type = 'challenge_created'
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_challenge_events_order_idx
        ON online_challenge_events (id)
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_challenge_credentials (
        challenge_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('challenger', 'challenged')),
        token_hash TEXT NOT NULL CONSTRAINT online_challenge_credentials_token_hash_shape CHECK (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
        identity JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (challenge_id, role)
      )
    `);
    await this.queryable.query(`
      DO $$
      BEGIN
        ALTER TABLE online_challenge_credentials
          ADD CONSTRAINT online_challenge_credentials_token_hash_shape
          CHECK (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);
    await this.queryable.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS online_challenge_credentials_one_role_per_hash
        ON online_challenge_credentials (challenge_id, token_hash)
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_challenge_summaries (
        challenge_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        visibility TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        rebuilt_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_challenge_summaries_status_updated_idx
        ON online_challenge_summaries (status, updated_at DESC)
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_challenge_summaries_visibility_updated_idx
        ON online_challenge_summaries (visibility, updated_at DESC)
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_game_locks (
        game_id TEXT PRIMARY KEY
      )
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_challenge_locks (
        challenge_id TEXT PRIMARY KEY
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

  private async insertChallengeEvent(
    event: OnlineChallengeEvent,
    queryable: PostgresQueryable = this.queryable
  ): Promise<void> {
    await queryable.query(
      `
        INSERT INTO online_challenge_events (
          event_id,
          challenge_id,
          event_type,
          created_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        event.eventId,
        event.challengeId,
        event.type,
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

  private async insertChallengeCredentials(
    challengeId: string,
    credentials: OnlineChallengeCredentials,
    queryable: PostgresQueryable = this.queryable
  ): Promise<void> {
    await queryable.query(
      `
        INSERT INTO online_challenge_credentials (
          challenge_id,
          role,
          token_hash,
          identity
        )
        VALUES ($1, $2, $3, $4), ($1, $5, $6, $7)
      `,
      [
        challengeId,
        "challenger",
        credentials.challengerCredential,
        credentials.challengerIdentity,
        "challenged",
        credentials.challengedCredential,
        credentials.challengedIdentity,
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

  private async loadChallengeEvents(
    options: OnlineGameStoreLoadOptions = {},
    queryable: PostgresQueryable = this.queryable
  ): Promise<OnlineChallengeEvent[]> {
    const result = await queryable.query(
      "SELECT payload FROM online_challenge_events ORDER BY id ASC"
    );
    const events: OnlineChallengeEvent[] = [];

    for (let index = 0; index < result.rows.length; index++) {
      const validation = validateOnlineChallengeEvent(result.rows[index].payload);
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

  private validateChallengeCredentials(
    challengeId: string,
    event: Extract<OnlineChallengeEvent, { type: "challenge_created" }>,
    credentials: OnlineChallengeCredentials
  ): OnlineChallengeCredentials {
    if (
      typeof credentials.challengerCredential !== "string" ||
      !isOnlineTokenCredentialHash(credentials.challengerCredential) ||
      typeof credentials.challengedCredential !== "string" ||
      !isOnlineTokenCredentialHash(credentials.challengedCredential)
    ) {
      throw new Error(`Invalid online challenge credential hash for ${challengeId}.`);
    }
    if (credentials.challengerCredential === credentials.challengedCredential) {
      throw new Error(`Online challenge credentials for ${challengeId} must be distinct by role.`);
    }
    const challengerIdentity = validateOnlineIdentity(
      credentials.challengerIdentity,
      "challenge credentials.challengerIdentity"
    );
    if (!challengerIdentity.ok) {
      throw new Error(challengerIdentity.error.message);
    }
    const challengedIdentity = validateOnlineIdentity(
      credentials.challengedIdentity,
      "challenge credentials.challengedIdentity"
    );
    if (!challengedIdentity.ok) {
      throw new Error(challengedIdentity.error.message);
    }
    if (!isSameOnlineIdentity(challengerIdentity.value, event.challengerIdentity)) {
      throw new Error(`Challenge credentials for ${challengeId} do not match the challenger identity.`);
    }
    if (!isSameOnlineIdentity(challengedIdentity.value, event.challengedIdentity)) {
      throw new Error(`Challenge credentials for ${challengeId} do not match the challenged identity.`);
    }
    return {
      challengerCredential: credentials.challengerCredential,
      challengedCredential: credentials.challengedCredential,
      challengerIdentity: challengerIdentity.value,
      challengedIdentity: challengedIdentity.value,
    };
  }

  private async loadChallengeCredentialsForChallenge(
    challengeId: string,
    queryable: PostgresQueryable
  ): Promise<OnlineChallengeCredentials> {
    const result = await queryable.query(
      `
        SELECT role, token_hash, identity
        FROM online_challenge_credentials
        WHERE challenge_id = $1
      `,
      [challengeId]
    );

    const credentials: Partial<OnlineChallengeCredentials> = {};
    for (const row of result.rows) {
      const role = row.role;
      if (role !== "challenger" && role !== "challenged") {
        throw new Error(`Invalid online challenge credential role for ${challengeId}.`);
      }
      const tokenHash = row.token_hash;
      if (typeof tokenHash !== "string" || !isOnlineTokenCredentialHash(tokenHash)) {
        throw new Error(`Invalid online challenge credential hash for ${challengeId}.`);
      }
      const identity = validateOnlineIdentity(row.identity, "challenge credential identity");
      if (!identity.ok) {
        throw new Error(identity.error.message);
      }
      if (role === "challenger") {
        credentials.challengerCredential = tokenHash;
        credentials.challengerIdentity = identity.value;
      } else {
        credentials.challengedCredential = tokenHash;
        credentials.challengedIdentity = identity.value;
      }
    }

    if (
      !credentials.challengerCredential ||
      !credentials.challengedCredential ||
      !credentials.challengerIdentity ||
      !credentials.challengedIdentity
    ) {
      throw new Error(`Missing online challenge credentials for ${challengeId}.`);
    }
    return credentials as OnlineChallengeCredentials;
  }

  private validateAcceptInput(
    input: OnlineChallengeAcceptInput,
    gameCreatedEvent: Extract<OnlineGameEvent, { type: "game_created" }>
  ): void {
    if (input.acceptedBy.challengeId !== input.challengeId) {
      throw new Error(`Resolved challenge credential does not match challenge ${input.challengeId}.`);
    }
    if (input.acceptedBy.role !== "challenged") {
      throw new Error(`Only the challenged role can accept online challenge ${input.challengeId}.`);
    }
    const whiteIdentity = validateOnlineIdentity(input.whiteIdentity, "accept.whiteIdentity");
    if (!whiteIdentity.ok) {
      throw new Error(whiteIdentity.error.message);
    }
    const blackIdentity = validateOnlineIdentity(input.blackIdentity, "accept.blackIdentity");
    if (!blackIdentity.ok) {
      throw new Error(blackIdentity.error.message);
    }
    if (isSameOnlineIdentity(whiteIdentity.value, blackIdentity.value)) {
      throw new Error(`Accepted challenge ${input.challengeId} must bind two distinct seats.`);
    }
  }

  private resolveAcceptedGameSeats(
    summary: OnlineChallengeSummary,
    input: OnlineChallengeAcceptInput
  ): { challenger: "w" | "b"; challenged: "w" | "b" } {
    const challengerSeat = isSameOnlineIdentity(input.whiteIdentity, summary.challengerIdentity)
      ? "w"
      : isSameOnlineIdentity(input.blackIdentity, summary.challengerIdentity)
        ? "b"
        : null;
    const challengedSeat = isSameOnlineIdentity(input.whiteIdentity, summary.challengedIdentity)
      ? "w"
      : isSameOnlineIdentity(input.blackIdentity, summary.challengedIdentity)
        ? "b"
        : null;
    if (!challengerSeat || !challengedSeat || challengerSeat === challengedSeat) {
      throw new Error(`Accepted challenge ${summary.challengeId} must bind challenger and challenged seats.`);
    }
    return { challenger: challengerSeat, challenged: challengedSeat };
  }

  private sameJson(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
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

  private async loadChallengeEventsForChallenge(
    challengeId: string,
    queryable: PostgresQueryable
  ): Promise<OnlineChallengeEvent[]> {
    const result = await queryable.query(
      "SELECT payload FROM online_challenge_events WHERE challenge_id = $1 ORDER BY id ASC",
      [challengeId]
    );
    const events: OnlineChallengeEvent[] = [];

    for (let index = 0; index < result.rows.length; index++) {
      const validation = validateOnlineChallengeEvent(result.rows[index].payload);
      if (!validation.ok) {
        throw new Error(`Invalid online challenge event for ${challengeId} at row ${index + 1}: ${validation.error.message}`);
      }
      events.push(validation.value);
    }

    return events;
  }

  private async loadRecordForGame(
    gameId: string,
    queryable: PostgresQueryable
  ): Promise<OnlineGameRoomRecord | null> {
    return (await this.loadRecordWithEventsForGame(gameId, queryable))?.record ?? null;
  }

  private async loadRecordWithEventsForGame(
    gameId: string,
    queryable: PostgresQueryable
  ): Promise<{ events: OnlineGameEvent[]; record: OnlineGameRoomRecord } | null> {
    const events = await this.loadEventsForGame(gameId, queryable);
    const credentials = await this.loadCredentialsForGame(gameId, queryable);
    const records = onlineGameEventsToRecords(events, {
      credentials,
    });
    if (records.length === 0) return null;
    if (records.length > 1) {
      throw new Error(`Expected one online game record for ${gameId}, found ${records.length}.`);
    }
    return { events, record: records[0] };
  }

  private async refreshSummaryForGame(
    gameId: string,
    queryable: PostgresQueryable
  ): Promise<OnlineGameSummary | null> {
    const summaries = projectOnlineGameSummaries(await this.loadEventsForGame(gameId, queryable));
    const summary = summaries.find((candidate) => candidate.gameId === gameId);
    if (!summary) {
      await queryable.query("DELETE FROM online_game_summaries WHERE game_id = $1", [gameId]);
      return null;
    }
    await this.upsertSummary(summary, queryable);
    return summary;
  }

  private async refreshChallengeSummaryForChallenge(
    challengeId: string,
    queryable: PostgresQueryable
  ): Promise<OnlineChallengeSummary | null> {
    const summaries = projectOnlineChallengeSummaries(
      await this.loadChallengeEventsForChallenge(challengeId, queryable)
    );
    const summary = summaries.find((candidate) => candidate.challengeId === challengeId);
    if (!summary) {
      await queryable.query("DELETE FROM online_challenge_summaries WHERE challenge_id = $1", [challengeId]);
      return null;
    }
    await this.upsertChallengeSummary(summary, queryable);
    return summary;
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

  private async upsertChallengeSummary(
    summary: OnlineChallengeSummary,
    queryable: PostgresQueryable = this.queryable
  ): Promise<void> {
    const validation = validateOnlineChallengeSummary(summary);
    if (!validation.ok) {
      throw new Error(validation.error.message);
    }

    await queryable.query(
      `
        INSERT INTO online_challenge_summaries (
          challenge_id,
          status,
          visibility,
          expires_at,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (challenge_id) DO UPDATE
        SET
          status = EXCLUDED.status,
          visibility = EXCLUDED.visibility,
          expires_at = EXCLUDED.expires_at,
          updated_at = EXCLUDED.updated_at,
          payload = EXCLUDED.payload,
          rebuilt_at = now()
      `,
      [
        validation.value.challengeId,
        validation.value.status,
        validation.value.visibility,
        validation.value.expiresAt,
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

  private async withChallengeTransaction<T>(
    challengeId: string,
    operation: (queryable: PostgresQueryable) => Promise<T>
  ): Promise<T> {
    return this.withTransaction(operation, async (queryable) => {
      await queryable.query(
        "INSERT INTO online_challenge_locks (challenge_id) VALUES ($1) ON CONFLICT (challenge_id) DO NOTHING",
        [challengeId]
      );
      await queryable.query(
        "SELECT challenge_id FROM online_challenge_locks WHERE challenge_id = $1 FOR UPDATE",
        [challengeId]
      );
      await this.acquireChallengeSummaryLock(queryable);
    });
  }

  private async withChallengeAcceptTransaction<T>(
    challengeId: string,
    gameId: string,
    operation: (queryable: PostgresQueryable) => Promise<T>
  ): Promise<T> {
    return this.withTransaction(operation, async (queryable) => {
      await queryable.query(
        "INSERT INTO online_challenge_locks (challenge_id) VALUES ($1) ON CONFLICT (challenge_id) DO NOTHING",
        [challengeId]
      );
      await queryable.query(
        "SELECT challenge_id FROM online_challenge_locks WHERE challenge_id = $1 FOR UPDATE",
        [challengeId]
      );
      await queryable.query(
        "INSERT INTO online_game_locks (game_id) VALUES ($1) ON CONFLICT (game_id) DO NOTHING",
        [gameId]
      );
      await queryable.query(
        "SELECT game_id FROM online_game_locks WHERE game_id = $1 FOR UPDATE",
        [gameId]
      );
      await this.acquireSummaryLock(queryable);
      await this.acquireChallengeSummaryLock(queryable);
    });
  }

  private async acquireSummaryLock(queryable: PostgresQueryable): Promise<void> {
    await queryable.query("SELECT pg_advisory_xact_lock($1)", [
      PostgresOnlineGameStore.summaryLockKey,
    ]);
  }

  private async acquireChallengeSummaryLock(queryable: PostgresQueryable): Promise<void> {
    await queryable.query("SELECT pg_advisory_xact_lock($1)", [
      PostgresOnlineGameStore.challengeSummaryLockKey,
    ]);
  }
}
