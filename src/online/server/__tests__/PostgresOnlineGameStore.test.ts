import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../../ConstantImports";
import { SanctuaryGenerator } from "../../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../../Constants";
import { serializeOnlineGameSetup } from "../../serialization";
import { PostgresOnlineGameStore } from "../PostgresOnlineGameStore";
import { ONLINE_EVENT_SCHEMA_VERSION, ONLINE_RULESET_VERSION, type OnlineGameEvent } from "../../events";
import { ONLINE_GAME_SUMMARY_SCHEMA_VERSION } from "../../readModel";
import { hashOnlineToken } from "../onlineTokenCredentials";

class FakePostgresClient {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  eventRows: Array<{ payload: OnlineGameEvent }> = [];
  credentialRows: Array<{ gameId: string; seat: "w" | "b"; tokenHash: string }> = [];
  summaryRows: Array<{ payload: unknown }> = [];
  failNextCreateTable = false;
  failNextSummaryInsert = false;
  failRollback = false;
  private transactionSnapshot: {
    eventRows: Array<{ payload: OnlineGameEvent }>;
    credentialRows: Array<{ gameId: string; seat: "w" | "b"; tokenHash: string }>;
    summaryRows: Array<{ payload: unknown }>;
  } | null = null;

  async query(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    if (/^\s*begin\s*$/i.test(text)) {
      this.transactionSnapshot = {
        eventRows: this.eventRows.map((row) => ({ payload: row.payload })),
        credentialRows: this.credentialRows.map((row) => ({ ...row })),
        summaryRows: this.summaryRows.map((row) => ({ payload: row.payload })),
      };
      return { rows: [] };
    }
    if (/^\s*commit\s*$/i.test(text)) {
      this.transactionSnapshot = null;
      return { rows: [] };
    }
    if (/^\s*rollback\s*$/i.test(text)) {
      if (this.failRollback) {
        throw new Error("rollback unavailable");
      }
      if (this.transactionSnapshot) {
        this.eventRows = this.transactionSnapshot.eventRows.map((row) => ({ payload: row.payload }));
        this.credentialRows = this.transactionSnapshot.credentialRows.map((row) => ({ ...row }));
        this.summaryRows = this.transactionSnapshot.summaryRows.map((row) => ({ payload: row.payload }));
        this.transactionSnapshot = null;
      }
      return { rows: [] };
    }
    if (/pg_advisory_xact_lock/i.test(text)) {
      return { rows: [] };
    }
    if (this.failNextCreateTable && /create table if not exists online_game_events/i.test(text)) {
      this.failNextCreateTable = false;
      throw new Error("temporary schema failure");
    }
    if (/insert into online_game_events/i.test(text) && values?.[5]) {
      this.eventRows.push({ payload: values[5] as OnlineGameEvent });
    }
    if (/insert into online_game_credentials/i.test(text) && values) {
      const gameId = values[0] as string;
      const rows = [
        { gameId, seat: values[1] as "w" | "b", tokenHash: values[2] as string },
        { gameId, seat: values[3] as "w" | "b", tokenHash: values[4] as string },
      ];
      for (const credential of rows) {
        this.credentialRows = this.credentialRows.filter(
          (row) => !(row.gameId === credential.gameId && row.seat === credential.seat)
        );
        this.credentialRows.push(credential);
      }
    }
    if (/delete\s+from\s+online_game_summaries/i.test(text)) {
      if (/where\s+game_id/i.test(text)) {
        this.summaryRows = this.summaryRows.filter((row) => {
          const payload = row.payload as { gameId?: string };
          return payload.gameId !== values?.[0];
        });
      } else {
        this.summaryRows = [];
      }
      return { rows: [] };
    }
    if (/insert into online_game_summaries/i.test(text) && values?.[6]) {
      if (this.failNextSummaryInsert) {
        this.failNextSummaryInsert = false;
        throw new Error("summary insert unavailable");
      }
      const gameId = values[0];
      this.summaryRows = this.summaryRows.filter((row) => {
        const payload = row.payload as { gameId?: string };
        return payload.gameId !== gameId;
      });
      this.summaryRows.push({ payload: values[6] });
    }
    if (/select\s+payload\s+from\s+online_game_summaries/i.test(text)) {
      return { rows: this.summaryRows };
    }
    if (/select\s+payload\s+from\s+online_game_events\s+where\s+game_id/i.test(text)) {
      return {
        rows: this.eventRows.filter((row) => row.payload.gameId === values?.[0]),
      };
    }
    if (/select\s+payload\s+from\s+online_game_events/i.test(text)) {
      return { rows: this.eventRows };
    }
    if (/select\s+game_id,\s*seat,\s*token_hash\s+from\s+online_game_credentials\s+where\s+game_id/i.test(text)) {
      return {
        rows: this.credentialRows
          .filter((row) => row.gameId === values?.[0])
          .map((row) => ({ game_id: row.gameId, seat: row.seat, token_hash: row.tokenHash })),
      };
    }
    if (/select\s+game_id,\s*seat,\s*token_hash\s+from\s+online_game_credentials/i.test(text)) {
      return {
        rows: this.credentialRows.map((row) => ({
          game_id: row.gameId,
          seat: row.seat,
          token_hash: row.tokenHash,
        })),
      };
    }
    return { rows: [] };
  }
}

function createGameCreatedEvent(
  gameId = "game_pg"
): Extract<OnlineGameEvent, { type: "game_created" }> {
  const board = getStartingBoard(6);
  const pieces = getStartingPieces(6);
  const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, [
    SanctuaryType.WolfCovenant,
    SanctuaryType.SacredSpring,
  ]);

  return {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId: `evt-${gameId}-create`,
    createdAt: "2026-05-31T12:00:00.000Z",
    rulesetVersion: ONLINE_RULESET_VERSION,
    type: "game_created",
    gameId,
    setup: serializeOnlineGameSetup({
      board,
      pieces,
      sanctuaries,
      sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
      gameRules: { vpModeEnabled: false },
      initialPoolTypes: [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring],
      pieceTheme: "Castles",
    }),
  };
}

function createClockedGameCreatedEvent(
  gameId = "game_pg_clocked"
): Extract<OnlineGameEvent, { type: "game_created" }> {
  const created = createGameCreatedEvent(gameId);
  return {
    ...created,
    setup: {
      ...created.setup,
      timeControl: { initial: 1, increment: 0 },
    },
    clock: {
      remainingMs: { w: 60_000, b: 60_000 },
      activeColor: "w",
      runningSince: 0,
    },
  };
}

function createGameCredentials() {
  return {
    whiteCredential: hashOnlineToken("w-token"),
    blackCredential: hashOnlineToken("b-token"),
  };
}

function createCredentialRows(gameId: string) {
  const credentials = createGameCredentials();
  return [
    { gameId, seat: "w" as const, tokenHash: credentials.whiteCredential },
    { gameId, seat: "b" as const, tokenHash: credentials.blackCredential },
  ];
}

function seedCreatedGame(
  client: FakePostgresClient,
  event: Extract<OnlineGameEvent, { type: "game_created" }>
) {
  client.eventRows = [{ payload: event }];
  client.credentialRows = createCredentialRows(event.gameId);
}

describe("PostgresOnlineGameStore", () => {
  it("closes its database connection when a closer is provided", async () => {
    const client = new FakePostgresClient();
    const close = vi.fn().mockResolvedValue(undefined);
    const store = new PostgresOnlineGameStore({ queryable: client, close });

    await store.close();

    expect(close).toHaveBeenCalledOnce();
  });

  it("creates the online event schema during readiness checks", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.checkReady()).resolves.toBe(true);

    expect(client.queries.some((query) => /create table if not exists online_game_events/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_game_summaries/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create unique index if not exists/i.test(query.text))).toBe(true);
    expect(
      client.queries.some(
        (query) =>
          /online_game_events_one_client_action_per_player/i.test(query.text) &&
          /game_id/i.test(query.text) &&
          /playerColor/i.test(query.text) &&
          /clientActionId/i.test(query.text)
      )
    ).toBe(true);
    expect(client.queries.at(-1)?.text).toMatch(/select 1/i);
  });

  it("retries schema creation after a transient readiness failure", async () => {
    const client = new FakePostgresClient();
    client.failNextCreateTable = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.checkReady()).rejects.toThrow(/temporary schema failure/);
    await expect(store.checkReady()).resolves.toBe(true);

    expect(
      client.queries.filter((query) => /create table if not exists online_game_events/i.test(query.text))
    ).toHaveLength(2);
  });

  it("validates and inserts accepted events with replay metadata", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const event = createGameCreatedEvent();

    await store.appendGameCreated(event, createGameCredentials());

    const insert = client.queries.find((query) => /insert into online_game_events/i.test(query.text));
    expect(insert?.values).toEqual([
      event.eventId,
      event.gameId,
      "game_created",
      null,
      event.createdAt,
      event,
    ]);
  });

  it("stores creation events without raw bearer tokens and saves seat credential hashes separately", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const event = createGameCreatedEvent("game_credentials");
    const credentials = {
      whiteCredential: hashOnlineToken("white-token"),
      blackCredential: hashOnlineToken("black-token"),
    };

    await store.appendGameCreated(event, credentials);

    expect(JSON.stringify(client.eventRows)).not.toContain("white-token");
    expect(JSON.stringify(client.eventRows)).not.toContain("black-token");
    expect(client.credentialRows).toEqual([
      { gameId: "game_credentials", seat: "w", tokenHash: credentials.whiteCredential },
      { gameId: "game_credentials", seat: "b", tokenHash: credentials.blackCredential },
    ]);
  });

  it("rejects raw credential strings before inserting created games", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendGameCreated(createGameCreatedEvent("game_raw_credentials"), {
        whiteCredential: "w-token",
        blackCredential: "b-token",
      })
    ).rejects.toThrow(/credential hash/);

    expect(client.credentialRows).toHaveLength(0);
    expect(client.eventRows).toHaveLength(0);
  });

  it("rejects fake prefixed credential hashes before inserting created games", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendGameCreated(createGameCreatedEvent("game_fake_hash"), {
        whiteCredential: "sha256:white-token-hash",
        blackCredential: "sha256:black-token-hash",
      })
    ).rejects.toThrow(/credential hash/);

    expect(client.credentialRows).toHaveLength(0);
    expect(client.eventRows).toHaveLength(0);
  });

  it("refreshes the materialized summary after appending each event", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createGameCreatedEvent("game_append_summary");

    await store.appendGameCreated(created, createGameCredentials());
    await store.appendEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-append-resign",
      createdAt: "2026-05-31T12:00:01.000Z",
      rulesetVersion: ONLINE_RULESET_VERSION,
      type: "action_accepted",
      gameId: "game_append_summary",
      playerColor: "b",
      clientActionId: "client-action-append-resign",
      version: 1,
      playedAt: 2_000,
      action: { type: "RESIGN", baseVersion: 0 },
    });

    const summaryUpserts = client.queries.filter((query) =>
      /insert into online_game_summaries/i.test(query.text)
    );
    expect(summaryUpserts).toHaveLength(2);
    expect(summaryUpserts[0].values?.slice(0, 5)).toEqual([
      "game_append_summary",
      "active",
      "unlisted",
      "active",
      0,
    ]);
    expect(summaryUpserts[1].values?.slice(0, 5)).toEqual([
      "game_append_summary",
      "complete",
      "unlisted",
      "archived",
      1,
    ]);
  });

  it("applies accepted actions against the locked persisted game state", async () => {
    const client = new FakePostgresClient();
    const created = createGameCreatedEvent("game_apply_action");
    seedCreatedGame(client, created);
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.applyGameAction({
      gameId: "game_apply_action",
      token: "w-token",
      clientActionId: "client-action-apply",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 2_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.snapshot).toMatchObject({ gameId: "game_apply_action", version: 1 });
    expect(result.event).toMatchObject({
      type: "action_accepted",
      gameId: "game_apply_action",
      playerColor: "w",
      clientActionId: "client-action-apply",
      version: 1,
      playedAt: 2_000,
      action: { type: "PASS", baseVersion: 0 },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
    ]);

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const lockInsertIndex = queryTexts.findIndex((text) => /insert into online_game_locks/i.test(text));
    const rowLockIndex = queryTexts.findIndex((text) => /for update/i.test(text));
    const summaryLockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const selectGameEventsIndex = queryTexts.findIndex((text) =>
      /select\s+payload\s+from\s+online_game_events\s+where\s+game_id/i.test(text)
    );
    const eventInsertIndex = queryTexts.findIndex((text, index) =>
      index > selectGameEventsIndex && /insert into online_game_events/i.test(text)
    );
    const summaryInsertIndex = queryTexts.findIndex((text) => /insert into online_game_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockInsertIndex).toBeGreaterThan(beginIndex);
    expect(client.queries[lockInsertIndex].values).toEqual(["game_apply_action"]);
    expect(rowLockIndex).toBeGreaterThan(lockInsertIndex);
    expect(client.queries[rowLockIndex].values).toEqual(["game_apply_action"]);
    expect(summaryLockIndex).toBeGreaterThan(rowLockIndex);
    expect(selectGameEventsIndex).toBeGreaterThan(summaryLockIndex);
    expect(eventInsertIndex).toBeGreaterThan(selectGameEventsIndex);
    expect(summaryInsertIndex).toBeGreaterThan(eventInsertIndex);
    expect(commitIndex).toBeGreaterThan(summaryInsertIndex);
  });

  it("returns an existing accepted action for an exact client action id retry without appending", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_duplicate"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const first = await store.applyGameAction({
      gameId: "game_apply_duplicate",
      token: "w-token",
      clientActionId: "client-action-duplicate",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 2_000,
    });
    const retry = await store.applyGameAction({
      gameId: "game_apply_duplicate",
      token: "w-token",
      clientActionId: "client-action-duplicate",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 99_000,
    });

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (!first.ok || !retry.ok) throw new Error("expected duplicate retry to succeed");
    expect(retry.event).toEqual(first.event);
    expect(retry.snapshot.version).toBe(1);
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
    ]);
  });

  it("keeps exact accepted action retries idempotent while adjudicating expired clocks", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_apply_duplicate_before_timeout"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const first = await store.applyGameAction({
      gameId: "game_apply_duplicate_before_timeout",
      token: "w-token",
      clientActionId: "client-action-duplicate-before-timeout",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 1_000,
    });
    const retry = await store.applyGameAction({
      gameId: "game_apply_duplicate_before_timeout",
      token: "w-token",
      clientActionId: "client-action-duplicate-before-timeout",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 120_000,
    });

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (!first.ok || !retry.ok) throw new Error("expected duplicate retry to succeed");
    expect(retry.event).toEqual(first.event);
    expect(retry).toMatchObject({
      snapshot: {
        version: 2,
        result: { reason: "timeout" },
      },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
      "timeout_adjudicated",
    ]);
  });

  it("rejects reused client action ids with different payloads without appending", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_conflict"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    await store.applyGameAction({
      gameId: "game_apply_conflict",
      token: "w-token",
      clientActionId: "client-action-conflict",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 2_000,
    });
    const conflict = await store.applyGameAction({
      gameId: "game_apply_conflict",
      token: "w-token",
      clientActionId: "client-action-conflict",
      action: { type: "RESIGN", baseVersion: 0 },
      now: () => 3_000,
    });

    expect(conflict.ok).toBe(false);
    if (conflict.ok) throw new Error("expected idempotency conflict");
    expect(conflict.error.code).toBe("duplicate_action");
    expect(conflict.snapshot).toMatchObject({ version: 1 });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
    ]);
  });

  it("adjudicates timeout before rejecting a conflicting duplicate client action id", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_apply_conflict_timeout"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const first = await store.applyGameAction({
      gameId: "game_apply_conflict_timeout",
      token: "w-token",
      clientActionId: "client-action-conflict-timeout",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 1_000,
    });
    const conflict = await store.applyGameAction({
      gameId: "game_apply_conflict_timeout",
      token: "w-token",
      clientActionId: "client-action-conflict-timeout",
      action: { type: "RESIGN", baseVersion: 0 },
      now: () => 120_000,
    });
    const repeatedConflict = await store.applyGameAction({
      gameId: "game_apply_conflict_timeout",
      token: "w-token",
      clientActionId: "client-action-conflict-timeout",
      action: { type: "RESIGN", baseVersion: 0 },
      now: () => 130_000,
    });

    expect(first.ok).toBe(true);
    expect(conflict.ok).toBe(false);
    if (conflict.ok) throw new Error("expected timeout rejection");
    expect(conflict).toMatchObject({
      error: { code: "game_over" },
      event: {
        type: "timeout_adjudicated",
        gameId: "game_apply_conflict_timeout",
        version: 2,
      },
      snapshot: {
        version: 2,
        result: { reason: "timeout" },
      },
    });
    expect(repeatedConflict.ok).toBe(false);
    if (repeatedConflict.ok) throw new Error("expected repeated timeout rejection");
    expect(repeatedConflict).toMatchObject({
      error: { code: "game_over" },
      snapshot: {
        version: 2,
        result: { reason: "timeout" },
      },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
      "timeout_adjudicated",
    ]);
  });

  it("returns rejected action snapshots from the locked persisted game without appending", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_reject"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.applyGameAction({
      gameId: "game_apply_reject",
      token: "w-token",
      clientActionId: "client-action-reject",
      action: { type: "PASS", baseVersion: 99 },
      now: () => 2_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected stale action rejection.");
    }
    expect(result.error).toMatchObject({ code: "stale_action" });
    expect(result.snapshot).toMatchObject({ gameId: "game_apply_reject", version: 0 });
    expect(client.eventRows).toHaveLength(1);
    expect(
      client.queries.filter((query) => /insert into online_game_events/i.test(query.text))
    ).toHaveLength(0);
  });

  it("does not expose snapshots from unauthorized store action attempts", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_unauthorized"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.applyGameAction({
      gameId: "game_apply_unauthorized",
      token: "wrong-token",
      clientActionId: "client-action-unauthorized",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 2_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected unauthorized action rejection");
    expect(result.error).toMatchObject({ code: "unauthorized" });
    expect(result.snapshot).toBeUndefined();
    expect(result.room).toBeUndefined();
    expect(client.eventRows).toHaveLength(1);
  });

  it("rolls back accepted actions when the locked summary refresh fails", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_rollback"));
    client.failNextSummaryInsert = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.applyGameAction({
        gameId: "game_apply_rollback",
        token: "w-token",
        clientActionId: "client-action-rollback",
        action: { type: "PASS", baseVersion: 0 },
        now: () => 2_000,
      })
    ).rejects.toThrow(/summary insert unavailable/);

    expect(client.eventRows.map((row) => row.payload.type)).toEqual(["game_created"]);
    expect(client.summaryRows).toHaveLength(0);
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

  it("persists timeout adjudication in the locked action transaction before rejecting the action", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_apply_timeout"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.applyGameAction({
      gameId: "game_apply_timeout",
      token: "w-token",
      clientActionId: "client-action-timeout",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 61_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected timeout rejection.");
    }
    expect(result.error).toMatchObject({ code: "game_over" });
    expect(result.event).toMatchObject({
      type: "timeout_adjudicated",
      gameId: "game_apply_timeout",
      playerColor: "w",
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
    expect(result.snapshot).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
      clock: {
        remainingMs: { w: 0, b: 60_000 },
        activeColor: null,
      },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "timeout_adjudicated",
    ]);
  });

  it("adjudicates timeouts against the locked persisted game state", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_timeout_lock"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.adjudicateGameTimeout({
      gameId: "game_timeout_lock",
      now: () => 61_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.event).toMatchObject({
      type: "timeout_adjudicated",
      gameId: "game_timeout_lock",
      playerColor: "w",
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
    expect(result.snapshot).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "timeout_adjudicated",
    ]);

    const queryTexts = client.queries.map((query) => query.text);
    const rowLockIndex = queryTexts.findIndex((text) => /for update/i.test(text));
    const summaryLockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const eventInsertIndex = queryTexts.findIndex((text, index) =>
      index > summaryLockIndex && /insert into online_game_events/i.test(text)
    );
    expect(rowLockIndex).toBeGreaterThanOrEqual(0);
    expect(summaryLockIndex).toBeGreaterThan(rowLockIndex);
    expect(eventInsertIndex).toBeGreaterThan(summaryLockIndex);
  });

  it("returns the locked persisted snapshot without appending when no timeout has occurred", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_timeout_none"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.adjudicateGameTimeout({
      gameId: "game_timeout_none",
      now: () => 1_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.event).toBeUndefined();
    expect(result.snapshot).toMatchObject({
      version: 0,
      result: undefined,
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual(["game_created"]);
  });

  it("wraps appended events and summary refreshes in a locked transaction", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await store.appendGameCreated(createGameCreatedEvent("game_transaction"), createGameCredentials());

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const lockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const eventInsertIndex = queryTexts.findIndex((text) => /insert into online_game_events/i.test(text));
    const summaryInsertIndex = queryTexts.findIndex((text) => /insert into online_game_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(eventInsertIndex).toBeGreaterThan(lockIndex);
    expect(summaryInsertIndex).toBeGreaterThan(eventInsertIndex);
    expect(commitIndex).toBeGreaterThan(summaryInsertIndex);
  });

  it("rolls back an appended event when summary refresh fails", async () => {
    const client = new FakePostgresClient();
    client.failNextSummaryInsert = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendGameCreated(createGameCreatedEvent("game_append_rollback"), createGameCredentials())
    ).rejects.toThrow(
      /summary insert unavailable/
    );

    expect(client.eventRows).toHaveLength(0);
    expect(client.summaryRows).toHaveLength(0);
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

  it("preserves the original transaction error when rollback also fails", async () => {
    const client = new FakePostgresClient();
    client.failNextSummaryInsert = true;
    client.failRollback = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    let caught: unknown;
    try {
      await store.appendGameCreated(
        createGameCreatedEvent("game_rollback_failure"),
        createGameCredentials()
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors.map((error) => String(error))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("summary insert unavailable"),
        expect.stringContaining("rollback unavailable"),
      ])
    );
  });

  it("rejects invalid events before insert", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.appendEvent({ type: "game_created" } as any)).rejects.toThrow(/schemaVersion/);

    expect(client.queries.some((query) => /insert into online_game_events/i.test(query.text))).toBe(false);
  });

  it("loads validated events in database insertion order for replay", async () => {
    const client = new FakePostgresClient();
    const created = createGameCreatedEvent("game_replay");
    const setup = created.setup;
    client.eventRows = [
      { payload: created },
      {
        payload: {
          schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
          eventId: "evt-action",
          createdAt: "2026-05-31T12:00:01.000Z",
          rulesetVersion: ONLINE_RULESET_VERSION,
          type: "action_accepted",
          gameId: "game_replay",
          playerColor: "w",
          clientActionId: "client-action-replay",
          version: 1,
          playedAt: 2_000,
          action: { type: "PASS", baseVersion: 0 },
        },
      },
    ];
    client.credentialRows = createCredentialRows("game_replay");
    const store = new PostgresOnlineGameStore({ queryable: client });

    const records = await store.load();

    expect(client.queries.some((query) => /order by id asc/i.test(query.text))).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      gameId: "game_replay",
      setup,
      acceptedActions: [{ playerColor: "w", version: 1 }],
    });
  });

  it("rebuilds token-free game summaries from persisted events", async () => {
    const client = new FakePostgresClient();
    client.eventRows = [
      { payload: createGameCreatedEvent("game_summary_pg") },
      {
        payload: {
          schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
          eventId: "evt-resign",
          createdAt: "2026-05-31T12:00:01.000Z",
          rulesetVersion: ONLINE_RULESET_VERSION,
          type: "action_accepted",
          gameId: "game_summary_pg",
          playerColor: "b",
          clientActionId: "client-action-summary-pg",
          version: 1,
          playedAt: 2_000,
          action: { type: "RESIGN", baseVersion: 0 },
        },
      },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const summaries = await store.rebuildSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      gameId: "game_summary_pg",
      version: 1,
      status: "complete",
      archiveState: "archived",
      result: { winner: "w", reason: "resignation" },
    });
    const upsert = client.queries.find((query) => /insert into online_game_summaries/i.test(query.text));
    expect(upsert?.values).toEqual([
      "game_summary_pg",
      "complete",
      "unlisted",
      "archived",
      1,
      "2026-05-31T12:00:01.000Z",
      summaries[0],
    ]);
    expect(JSON.stringify(summaries)).not.toContain("token");
  });

  it("rebuilds summaries from inside the locked transaction", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_locked_rebuild"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    await store.rebuildSummaries();

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const lockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const selectIndex = queryTexts.findIndex((text) => /select\s+payload\s+from\s+online_game_events/i.test(text));
    const deleteIndex = queryTexts.findIndex((text) => /delete\s+from\s+online_game_summaries/i.test(text));
    const insertIndex = queryTexts.findIndex((text) => /insert into online_game_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(selectIndex).toBeGreaterThan(lockIndex);
    expect(deleteIndex).toBeGreaterThan(selectIndex);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
    expect(commitIndex).toBeGreaterThan(insertIndex);
  });

  it("rolls back summary rebuilds when an upsert fails", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_rebuild_rollback"));
    client.summaryRows = [
      {
        payload: {
          schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
          gameId: "game_existing_summary",
          rulesetVersion: ONLINE_RULESET_VERSION,
          createdAt: "2026-05-31T12:00:00.000Z",
          updatedAt: "2026-05-31T12:00:00.000Z",
          version: 0,
          status: "active",
          visibility: "unlisted",
          archiveState: "active",
          hasTimeControl: false,
          participants: [
            { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_existing_w" } },
            { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_existing_b" } },
          ],
          lastEventId: "evt-existing",
        },
      },
    ];
    client.failNextSummaryInsert = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.rebuildSummaries()).rejects.toThrow(/summary insert unavailable/);

    expect(client.summaryRows).toHaveLength(1);
    expect((client.summaryRows[0].payload as { gameId: string }).gameId).toBe("game_existing_summary");
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

  it("loads existing game summaries without reading private event tokens", async () => {
    const client = new FakePostgresClient();
    client.summaryRows = [
      {
        payload: {
          schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
          gameId: "game_summary_loaded",
          rulesetVersion: ONLINE_RULESET_VERSION,
          createdAt: "2026-05-31T12:00:00.000Z",
          updatedAt: "2026-05-31T12:00:00.000Z",
          version: 0,
          status: "active",
          visibility: "unlisted",
          archiveState: "active",
          hasTimeControl: false,
          participants: [
            { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_game_summary_loaded_w" } },
            { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_game_summary_loaded_b" } },
          ],
          lastEventId: "evt-create",
        },
      },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const summaries = await store.loadSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0].gameId).toBe("game_summary_loaded");
    expect(client.queries.some((query) => /from\s+online_game_events/i.test(query.text))).toBe(false);
  });

});
