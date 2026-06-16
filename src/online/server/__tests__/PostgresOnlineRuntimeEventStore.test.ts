import { describe, expect, it } from "vitest";
import { PostgresOnlineRuntimeEventStore } from "../PostgresOnlineRuntimeEventStore";

interface RuntimeEventRow {
  id: number | string;
  event_type: string;
  game_id: string;
  room_version: number;
  last_event_id: string | null;
  reason: string;
  node_id: string;
  created_at: string;
}

class FakePostgresRuntimeEventQueryable {
  readonly queries: Array<{ text: string; values: unknown[] }> = [];
  readonly events: RuntimeEventRow[] = [];
  databaseNowMs = Date.parse("2026-06-16T00:00:00.000Z");
  private nextId = 1;

  seed(row: RuntimeEventRow): void {
    this.events.push(row);
    this.nextId = Math.max(this.nextId, Number(row.id) + 1);
  }

  async query(text: string, values: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
    this.queries.push({ text, values });
    const normalized = text.replace(/\s+/g, " ").trim();

    if (/^CREATE TABLE/i.test(normalized) || /^CREATE INDEX/i.test(normalized)) {
      return { rows: [], rowCount: 0 };
    }

    if (/^INSERT INTO online_runtime_events/i.test(normalized)) {
      const [eventType, gameId, roomVersion, lastEventId, reason, nodeId] = values as [
        string,
        string,
        number,
        string | null,
        string,
        string,
      ];
      const row: RuntimeEventRow = {
        id: String(this.nextId++),
        event_type: eventType,
        game_id: gameId,
        room_version: roomVersion,
        last_event_id: lastEventId,
        reason,
        node_id: nodeId,
        created_at: new Date(this.databaseNowMs).toISOString(),
      };
      this.events.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/^SELECT id, event_type, game_id, room_version, last_event_id, reason, node_id, created_at FROM online_runtime_events/i.test(normalized)) {
      const [afterId, eventType, maybeLimit] = values as [
        number,
        string,
        number,
      ];
      const rows = this.events
        .filter((row) => Number(row.id) > afterId)
        .filter((row) => row.event_type === eventType)
        .sort((a, b) => Number(a.id) - Number(b.id))
        .slice(0, maybeLimit);
      return { rows, rowCount: rows.length };
    }

    if (/^DELETE FROM online_runtime_events/i.test(normalized)) {
      const [cutoffIso] = values as [string];
      const before = this.events.length;
      for (const row of [...this.events]) {
        if (Date.parse(row.created_at) < Date.parse(cutoffIso)) {
          this.events.splice(this.events.indexOf(row), 1);
        }
      }
      return { rows: [], rowCount: before - this.events.length };
    }

    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

describe("PostgresOnlineRuntimeEventStore", () => {
  it("creates the operational runtime events table and indexes", async () => {
    const queryable = new FakePostgresRuntimeEventQueryable();
    const store = new PostgresOnlineRuntimeEventStore({ nodeId: "node-a", queryable });

    await store.ensureSchema();
    await store.ensureSchema();

    expect(queryable.queries.filter((query) => /CREATE TABLE IF NOT EXISTS online_runtime_events/i.test(query.text))).toHaveLength(1);
    expect(queryable.queries.some((query) => /id BIGSERIAL PRIMARY KEY/i.test(query.text))).toBe(true);
    expect(queryable.queries.some((query) => /online_runtime_events_type_id_idx/i.test(query.text))).toBe(true);
    expect(queryable.queries.some((query) => /online_runtime_events_game_id_idx/i.test(query.text))).toBe(true);
    expect(queryable.queries.some((query) => /online_runtime_events_created_at_idx/i.test(query.text))).toBe(true);
  });

  it("records snapshot-change metadata using database time only", async () => {
    const queryable = new FakePostgresRuntimeEventQueryable();
    queryable.databaseNowMs = Date.parse("2026-06-16T00:15:00.000Z");
    const store = new PostgresOnlineRuntimeEventStore({ nodeId: "node-a", queryable });

    const event = await store.recordGameSnapshotChanged({
      gameId: "game_123",
      roomVersion: 7,
      lastEventId: "evt_7",
      reason: "action",
    });

    expect(event).toEqual({
      id: 1,
      type: "game_snapshot_changed",
      gameId: "game_123",
      roomVersion: 7,
      lastEventId: "evt_7",
      reason: "action",
      nodeId: "node-a",
      createdAt: "2026-06-16T00:15:00.000Z",
    });
    expect(JSON.stringify(queryable.events[0])).not.toContain("token");
    expect(Object.keys(queryable.events[0])).not.toContain("snapshot");
    expect(queryable.queries.at(-1)?.values).toEqual([
      "game_snapshot_changed",
      "game_123",
      7,
      "evt_7",
      "action",
      "node-a",
    ]);
  });

  it("lists snapshot-change events after a cursor while excluding the current node", async () => {
    const queryable = new FakePostgresRuntimeEventQueryable();
    queryable.seed({
      id: 1,
      event_type: "game_snapshot_changed",
      game_id: "game_old",
      room_version: 1,
      last_event_id: "evt_old",
      reason: "action",
      node_id: "node-b",
      created_at: "2026-06-16T00:00:00.000Z",
    });
    queryable.seed({
      id: 2,
      event_type: "game_snapshot_changed",
      game_id: "game_own",
      room_version: 2,
      last_event_id: "evt_own",
      reason: "timeout",
      node_id: "node-a",
      created_at: "2026-06-16T00:01:00.000Z",
    });
    queryable.seed({
      id: 3,
      event_type: "game_snapshot_changed",
      game_id: "game_remote",
      room_version: 3,
      last_event_id: null,
      reason: "visibility",
      node_id: "node-b",
      created_at: "2026-06-16T00:02:00.000Z",
    });
    const store = new PostgresOnlineRuntimeEventStore({ nodeId: "node-a", queryable });

    const result = await store.listGameSnapshotChangedEventsAfter({
      afterId: 1,
      excludeNodeId: "node-a",
      limit: 10,
    });

    expect(result.nextAfterId).toBe(3);
    expect(result.events).toEqual([
      {
        id: 3,
        type: "game_snapshot_changed",
        gameId: "game_remote",
        roomVersion: 3,
        reason: "visibility",
        nodeId: "node-b",
        createdAt: "2026-06-16T00:02:00.000Z",
      },
    ]);
  });

  it("advances the cursor past own-node rows even when no remote events remain", async () => {
    const queryable = new FakePostgresRuntimeEventQueryable();
    queryable.seed({
      id: "2",
      event_type: "game_snapshot_changed",
      game_id: "game_own",
      room_version: 2,
      last_event_id: "evt_own",
      reason: "action",
      node_id: "node-a",
      created_at: "2026-06-16T00:01:00.000Z",
    });
    const store = new PostgresOnlineRuntimeEventStore({ nodeId: "node-a", queryable });

    const result = await store.listGameSnapshotChangedEventsAfter({
      afterId: 1,
      excludeNodeId: "node-a",
      limit: 10,
    });

    expect(result).toEqual({ events: [], nextAfterId: 2 });
  });

  it("cleans old runtime events by timestamp", async () => {
    const queryable = new FakePostgresRuntimeEventQueryable();
    queryable.seed({
      id: 1,
      event_type: "game_snapshot_changed",
      game_id: "game_old",
      room_version: 1,
      last_event_id: null,
      reason: "action",
      node_id: "node-a",
      created_at: "2026-06-15T23:59:59.000Z",
    });
    queryable.seed({
      id: 2,
      event_type: "game_snapshot_changed",
      game_id: "game_new",
      room_version: 2,
      last_event_id: null,
      reason: "action",
      node_id: "node-a",
      created_at: "2026-06-16T00:00:01.000Z",
    });
    const store = new PostgresOnlineRuntimeEventStore({ nodeId: "node-a", queryable });

    expect(await store.cleanupRuntimeEventsBefore("2026-06-16T00:00:00.000Z")).toBe(1);
    expect(queryable.events.map((row) => row.game_id)).toEqual(["game_new"]);
  });

  it("rejects unsafe node ids, unsupported reasons, invalid cursor limits, and malformed rows", async () => {
    const queryable = new FakePostgresRuntimeEventQueryable();

    expect(() => new PostgresOnlineRuntimeEventStore({ nodeId: "https://node-a", queryable })).toThrow(
      /CASTLES_NODE_ID/
    );

    const store = new PostgresOnlineRuntimeEventStore({ nodeId: "node-a", queryable });
    await expect(
      store.recordGameSnapshotChanged({
        gameId: "game_123",
        roomVersion: 1,
        reason: "bad_reason" as any,
      })
    ).rejects.toThrow(/runtime snapshot reason/);
    await expect(
      store.recordGameSnapshotChanged({
        gameId: "https://castles.example/?onlineGame=game_123&token=secret",
        roomVersion: 1,
        reason: "action",
      })
    ).rejects.toThrow(/must not contain secrets/);
    await expect(
      store.recordGameSnapshotChanged({
        gameId: "game_123",
        roomVersion: 1,
        lastEventId: "Authorization: Bearer secret",
        reason: "action",
      })
    ).rejects.toThrow(/must not contain secrets/);
    await expect(
      store.listGameSnapshotChangedEventsAfter({ afterId: 0, limit: 0 })
    ).rejects.toThrow(/runtime event limit/);
    await expect(
      store.listGameSnapshotChangedEventsAfter({ afterId: -1, limit: 10 })
    ).rejects.toThrow(/runtime event cursor/);

    queryable.seed({
      id: 1,
      event_type: "game_snapshot_changed",
      game_id: "game_bad",
      room_version: Number.NaN,
      last_event_id: null,
      reason: "action",
      node_id: "node-b",
      created_at: "2026-06-16T00:00:00.000Z",
    });
    await expect(
      store.listGameSnapshotChangedEventsAfter({ afterId: 0, limit: 10 })
    ).rejects.toThrow(/Invalid PostgreSQL runtime event row/);
  });
});
