import { describe, expect, it } from "vitest";
import { PostgresOnlineSpectatorPresenceStore } from "../PostgresOnlineSpectatorPresenceStore";

interface PresenceRow {
  node_id: string;
  connection_id: string;
  game_id: string;
  expires_at: string;
  updated_at: string;
}

class FakePostgresSpectatorPresenceQueryable {
  readonly queries: Array<{ text: string; values: unknown[] }> = [];
  readonly presence = new Map<string, PresenceRow>();
  failNextSchemaQuery = false;

  seed(row: PresenceRow): void {
    this.presence.set(`${row.node_id}\u0000${row.connection_id}`, row);
  }

  async query(text: string, values: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
    this.queries.push({ text, values });
    const normalized = text.replace(/\s+/g, " ").trim();

    if (/^CREATE TABLE/i.test(normalized) || /^CREATE INDEX/i.test(normalized)) {
      if (this.failNextSchemaQuery) {
        this.failNextSchemaQuery = false;
        throw new Error("transient schema failure");
      }
      return { rows: [], rowCount: 0 };
    }

    if (/^INSERT INTO online_spectator_presence/i.test(normalized)) {
      const [nodeId, connectionId, gameId, expiresAt] = values as string[];
      const updatedAt = new Date("2026-06-16T00:00:00.000Z").toISOString();
      const row: PresenceRow = {
        node_id: nodeId,
        connection_id: connectionId,
        game_id: gameId,
        expires_at: expiresAt,
        updated_at: updatedAt,
      };
      this.seed(row);
      return { rows: [row], rowCount: 1 };
    }

    if (/^UPDATE online_spectator_presence/i.test(normalized)) {
      const [expiresAt, nodeId, connectionId, gameId] = values as string[];
      const key = `${nodeId}\u0000${connectionId}`;
      const row = this.presence.get(key);
      if (!row || row.game_id !== gameId) return { rows: [], rowCount: 0 };
      const updated: PresenceRow = {
        ...row,
        expires_at: expiresAt,
        updated_at: new Date("2026-06-16T00:00:00.000Z").toISOString(),
      };
      this.seed(updated);
      return { rows: [updated], rowCount: 1 };
    }

    if (/^DELETE FROM online_spectator_presence/i.test(normalized) && normalized.includes("connection_id")) {
      const [nodeId, connectionId, gameId] = values as string[];
      const key = `${nodeId}\u0000${connectionId}`;
      const row = this.presence.get(key);
      if (!row || row.game_id !== gameId) return { rows: [], rowCount: 0 };
      this.presence.delete(key);
      return { rows: [], rowCount: 1 };
    }

    if (/^DELETE FROM online_spectator_presence/i.test(normalized)) {
      const [now] = values as string[];
      let removed = 0;
      for (const [key, row] of Array.from(this.presence.entries())) {
        if (Date.parse(row.expires_at) <= Date.parse(now)) {
          this.presence.delete(key);
          removed += 1;
        }
      }
      return { rows: [], rowCount: removed };
    }

    if (/^SELECT COUNT\(\*\)::int AS count FROM online_spectator_presence/i.test(normalized)) {
      const [gameId, now] = values as string[];
      const count = Array.from(this.presence.values()).filter(
        (row) => row.game_id === gameId && Date.parse(row.expires_at) > Date.parse(now)
      ).length;
      return { rows: [{ count }], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

describe("PostgresOnlineSpectatorPresenceStore", () => {
  it("creates the operational spectator presence table and indexes", async () => {
    const queryable = new FakePostgresSpectatorPresenceQueryable();
    const store = new PostgresOnlineSpectatorPresenceStore({
      nodeId: "node-a",
      queryable,
    });

    await store.ensureSchema();
    await store.ensureSchema();

    expect(queryable.queries.filter((query) => /CREATE TABLE IF NOT EXISTS online_spectator_presence/i.test(query.text))).toHaveLength(1);
    expect(queryable.queries.some((query) => /PRIMARY KEY \(node_id, connection_id\)/i.test(query.text))).toBe(true);
    expect(queryable.queries.some((query) => /online_spectator_presence_game_expires_idx/i.test(query.text))).toBe(true);
    expect(queryable.queries.some((query) => /online_spectator_presence_expires_idx/i.test(query.text))).toBe(true);
  });

  it("retries schema creation after a transient schema failure", async () => {
    const queryable = new FakePostgresSpectatorPresenceQueryable();
    const store = new PostgresOnlineSpectatorPresenceStore({
      nodeId: "node-a",
      queryable,
    });
    queryable.failNextSchemaQuery = true;

    await expect(store.ensureSchema()).rejects.toThrow(/transient schema failure/);
    await expect(store.ensureSchema()).resolves.toBeUndefined();

    expect(
      queryable.queries.filter((query) =>
        /CREATE TABLE IF NOT EXISTS online_spectator_presence/i.test(query.text)
      )
    ).toHaveLength(2);
    expect(queryable.queries.some((query) => /online_spectator_presence_game_expires_idx/i.test(query.text))).toBe(true);
    expect(queryable.queries.some((query) => /online_spectator_presence_expires_idx/i.test(query.text))).toBe(true);
  });

  it("registers opaque spectator rows and counts only non-expired rows for a game", async () => {
    const queryable = new FakePostgresSpectatorPresenceQueryable();
    const store = new PostgresOnlineSpectatorPresenceStore({
      nodeId: "node-a",
      queryable,
      now: () => Date.parse("2026-06-16T00:00:00.000Z"),
      presenceTtlMs: 45_000,
      connectionIdFactory: () => "spectator_abcdefghijkl",
    });
    queryable.seed({
      node_id: "node-b",
      connection_id: "spectator_expired000",
      game_id: "game_123",
      expires_at: "2026-06-15T23:59:59.000Z",
      updated_at: "2026-06-15T23:59:00.000Z",
    });

    const registration = await store.registerSpectator({ gameId: "game_123" });

    expect(registration).toEqual({
      gameId: "game_123",
      nodeId: "node-a",
      connectionId: "spectator_abcdefghijkl",
      expiresAt: "2026-06-16T00:00:45.000Z",
    });
    expect(await store.countSpectators("game_123")).toBe(1);
    expect(await store.countSpectators("game_456")).toBe(0);
  });

  it("refreshes only this node connection and extends expiry", async () => {
    const queryable = new FakePostgresSpectatorPresenceQueryable();
    const store = new PostgresOnlineSpectatorPresenceStore({
      nodeId: "node-a",
      queryable,
      now: () => Date.parse("2026-06-16T00:01:00.000Z"),
      presenceTtlMs: 30_000,
    });
    queryable.seed({
      node_id: "node-a",
      connection_id: "spectator_refresh123456",
      game_id: "game_123",
      expires_at: "2026-06-16T00:01:05.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });
    queryable.seed({
      node_id: "node-b",
      connection_id: "spectator_refresh123456",
      game_id: "game_123",
      expires_at: "2026-06-16T00:01:05.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });

    const refreshed = await store.refreshSpectator({
      gameId: "game_123",
      connectionId: "spectator_refresh123456",
    });

    expect(refreshed).toMatchObject({
      gameId: "game_123",
      nodeId: "node-a",
      connectionId: "spectator_refresh123456",
      expiresAt: "2026-06-16T00:01:30.000Z",
    });
    expect(queryable.presence.get("node-b\u0000spectator_refresh123456")?.expires_at).toBe(
      "2026-06-16T00:01:05.000Z"
    );
  });

  it("removes only this node connection", async () => {
    const queryable = new FakePostgresSpectatorPresenceQueryable();
    const store = new PostgresOnlineSpectatorPresenceStore({
      nodeId: "node-a",
      queryable,
    });
    queryable.seed({
      node_id: "node-a",
      connection_id: "spectator_remove123456",
      game_id: "game_123",
      expires_at: "2026-06-16T00:05:00.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });
    queryable.seed({
      node_id: "node-b",
      connection_id: "spectator_remove123456",
      game_id: "game_123",
      expires_at: "2026-06-16T00:05:00.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });

    await store.removeSpectator({
      gameId: "game_123",
      connectionId: "spectator_remove123456",
    });

    expect(queryable.presence.has("node-a\u0000spectator_remove123456")).toBe(false);
    expect(queryable.presence.has("node-b\u0000spectator_remove123456")).toBe(true);
  });

  it("cleans expired spectator rows", async () => {
    const queryable = new FakePostgresSpectatorPresenceQueryable();
    const store = new PostgresOnlineSpectatorPresenceStore({
      nodeId: "node-a",
      queryable,
      now: () => Date.parse("2026-06-16T00:02:00.000Z"),
    });
    queryable.seed({
      node_id: "node-a",
      connection_id: "spectator_expired123",
      game_id: "game_123",
      expires_at: "2026-06-16T00:01:59.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });
    queryable.seed({
      node_id: "node-a",
      connection_id: "spectator_live123456",
      game_id: "game_123",
      expires_at: "2026-06-16T00:02:01.000Z",
      updated_at: "2026-06-16T00:00:00.000Z",
    });

    expect(await store.cleanupExpiredSpectators()).toBe(1);
    expect(queryable.presence.has("node-a\u0000spectator_expired123")).toBe(false);
    expect(queryable.presence.has("node-a\u0000spectator_live123456")).toBe(true);
  });

  it("rejects unsafe node ids and refuses secret-shaped connection ids", async () => {
    const queryable = new FakePostgresSpectatorPresenceQueryable();

    expect(
      () =>
        new PostgresOnlineSpectatorPresenceStore({
          nodeId: "https://node-a",
          queryable,
        })
    ).toThrow(/CASTLES_NODE_ID/);

    const store = new PostgresOnlineSpectatorPresenceStore({
      nodeId: "node-a",
      queryable,
      connectionIdFactory: () => "spectator_session_token",
    });

    await expect(store.registerSpectator({ gameId: "game_123" })).rejects.toThrow(
      /spectator connection id/
    );
  });
});
