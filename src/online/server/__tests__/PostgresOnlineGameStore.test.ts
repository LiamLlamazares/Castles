import { describe, expect, it } from "vitest";
import { PostgresOnlineGameStore } from "../PostgresOnlineGameStore";
import { ONLINE_EVENT_SCHEMA_VERSION, ONLINE_RULESET_VERSION, type OnlineGameEvent } from "../../events";

class FakePostgresClient {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  rows: Array<{ payload: OnlineGameEvent }> = [];
  failNextCreateTable = false;

  async query(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    if (this.failNextCreateTable && /create table if not exists online_game_events/i.test(text)) {
      this.failNextCreateTable = false;
      throw new Error("temporary schema failure");
    }
    if (/select\s+payload/i.test(text)) {
      return { rows: this.rows };
    }
    return { rows: [] };
  }
}

function createGameCreatedEvent(
  gameId = "game_pg"
): Extract<OnlineGameEvent, { type: "game_created" }> {
  return {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId: `evt-${gameId}-create`,
    createdAt: "2026-05-31T12:00:00.000Z",
    rulesetVersion: ONLINE_RULESET_VERSION,
    type: "game_created",
    gameId,
    whiteToken: "w-token",
    blackToken: "b-token",
    setup: {
      board: { config: { nSquares: 3 }, castles: [] },
      pieces: [],
      sanctuaries: [],
    },
  };
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
    expect(client.queries.some((query) => /create unique index if not exists/i.test(query.text))).toBe(true);
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

    await store.appendEvent(event);

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

  it("rejects invalid events before insert", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.appendEvent({ type: "game_created" } as any)).rejects.toThrow(/schemaVersion/);

    expect(client.queries.some((query) => /insert into online_game_events/i.test(query.text))).toBe(false);
  });

  it("loads validated events in database insertion order for replay", async () => {
    const client = new FakePostgresClient();
    const setup = createGameCreatedEvent("game_replay").setup;
    client.rows = [
      { payload: createGameCreatedEvent("game_replay") },
      {
        payload: {
          schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
          eventId: "evt-action",
          createdAt: "2026-05-31T12:00:01.000Z",
          rulesetVersion: ONLINE_RULESET_VERSION,
          type: "action_accepted",
          gameId: "game_replay",
          playerColor: "w",
          version: 1,
          playedAt: 2_000,
          action: { type: "PASS", baseVersion: 0 },
        },
      },
    ];
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

});
