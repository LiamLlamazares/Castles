import { describe, expect, it } from "vitest";
import { PostgresOnlineRuntimeNodeStore } from "../PostgresOnlineRuntimeNodeStore";

interface RuntimeNodeRow {
  node_id: string;
  first_seen_at: string;
  last_seen_at: string;
  draining: boolean;
  drain_started_at: string | null;
  updated_at: string;
}

class FakePostgresRuntimeNodeQueryable {
  readonly queries: Array<{ text: string; values: unknown[] }> = [];
  readonly nodes = new Map<string, RuntimeNodeRow>();
  databaseNowMs = Date.parse("2026-06-17T10:00:00.000Z");
  failNextSchema = false;

  seed(row: RuntimeNodeRow): void {
    this.nodes.set(row.node_id, { ...row });
  }

  async query(text: string, values: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
    this.queries.push({ text, values });
    const compact = compactSql(text);

    if (/^CREATE TABLE IF NOT EXISTS online_runtime_nodes/i.test(compact)) {
      if (this.failNextSchema) {
        this.failNextSchema = false;
        throw new Error("schema unavailable");
      }
      return { rows: [], rowCount: 0 };
    }
    if (/^CREATE INDEX IF NOT EXISTS online_runtime_nodes_/i.test(compact)) {
      return { rows: [], rowCount: 0 };
    }
    if (
      /^INSERT INTO online_runtime_nodes/i.test(compact) &&
      /VALUES \(\$1, now\(\), now\(\), false, NULL, now\(\)\)/i.test(compact) &&
      /drain_started_at = NULL/i.test(compact)
    ) {
      const [nodeId] = values as [string];
      const now = new Date(this.databaseNowMs).toISOString();
      const existing = this.nodes.get(nodeId);
      const row: RuntimeNodeRow = existing
        ? {
            ...existing,
            last_seen_at: now,
            draining: false,
            drain_started_at: null,
            updated_at: now,
          }
        : {
            node_id: nodeId,
            first_seen_at: now,
            last_seen_at: now,
            draining: false,
            drain_started_at: null,
            updated_at: now,
          };
      this.nodes.set(nodeId, row);
      return { rows: [row], rowCount: 1 };
    }
    if (
      /^INSERT INTO online_runtime_nodes/i.test(compact) &&
      /VALUES \(\$1, now\(\), now\(\), false, NULL, now\(\)\)/i.test(compact) &&
      !/drain_started_at = NULL/i.test(compact)
    ) {
      const [nodeId] = values as [string];
      const now = new Date(this.databaseNowMs).toISOString();
      const existing = this.nodes.get(nodeId);
      const row: RuntimeNodeRow = existing
        ? {
            ...existing,
            last_seen_at: now,
            updated_at: now,
          }
        : {
            node_id: nodeId,
            first_seen_at: now,
            last_seen_at: now,
            draining: false,
            drain_started_at: null,
            updated_at: now,
          };
      this.nodes.set(nodeId, row);
      return { rows: [row], rowCount: 1 };
    }
    if (
      /^INSERT INTO online_runtime_nodes/i.test(compact) &&
      /VALUES \(\$1, now\(\), now\(\), true, now\(\), now\(\)\)/i.test(compact)
    ) {
      const [nodeId] = values as [string];
      const now = new Date(this.databaseNowMs).toISOString();
      const existing = this.nodes.get(nodeId);
      const row: RuntimeNodeRow = existing
        ? {
            ...existing,
            last_seen_at: now,
            draining: true,
            drain_started_at: existing.draining ? existing.drain_started_at ?? now : now,
            updated_at: now,
          }
        : {
            node_id: nodeId,
            first_seen_at: now,
            last_seen_at: now,
            draining: true,
            drain_started_at: now,
            updated_at: now,
          };
      this.nodes.set(nodeId, row);
      return { rows: [row], rowCount: 1 };
    }
    if (/^SELECT node_id, first_seen_at, last_seen_at, draining, drain_started_at, updated_at FROM online_runtime_nodes/i.test(compact)) {
      const [nodeId] = values as [string];
      const row = this.nodes.get(nodeId);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    throw new Error(`Unexpected query: ${compact}`);
  }
}

function compactSql(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

describe("PostgresOnlineRuntimeNodeStore", () => {
  it("creates the runtime node table and indexes", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    await store.ensureSchema();
    await store.ensureSchema();

    expect(queryable.queries.filter((query) =>
      /CREATE TABLE IF NOT EXISTS online_runtime_nodes/i.test(query.text)
    )).toHaveLength(1);
    expect(queryable.queries.some((query) =>
      /PRIMARY KEY \(node_id\)/i.test(compactSql(query.text))
    )).toBe(true);
    expect(queryable.queries.some((query) =>
      /online_runtime_nodes_last_seen_at_idx/i.test(query.text)
    )).toBe(true);
    expect(queryable.queries.some((query) =>
      /online_runtime_nodes_draining_idx/i.test(query.text)
    )).toBe(true);
  });

  it("records node startup with database time and clears stale drain state", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    queryable.seed({
      node_id: "node-a",
      first_seen_at: "2026-06-16T00:00:00.000Z",
      last_seen_at: "2026-06-16T00:05:00.000Z",
      draining: true,
      drain_started_at: "2026-06-16T00:04:00.000Z",
      updated_at: "2026-06-16T00:05:00.000Z",
    });
    queryable.databaseNowMs = Date.parse("2026-06-17T10:00:00.000Z");
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    const state = await store.recordNodeStarted();

    expect(state).toEqual({
      nodeId: "node-a",
      firstSeenAt: "2026-06-16T00:00:00.000Z",
      lastSeenAt: "2026-06-17T10:00:00.000Z",
      draining: false,
      updatedAt: "2026-06-17T10:00:00.000Z",
    });
    expect(JSON.stringify(queryable.nodes.get("node-a"))).not.toContain("token");
  });

  it("records heartbeats with database time without clearing drain state", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    queryable.seed({
      node_id: "node-a",
      first_seen_at: "2026-06-17T09:00:00.000Z",
      last_seen_at: "2026-06-17T09:05:00.000Z",
      draining: true,
      drain_started_at: "2026-06-17T09:10:00.000Z",
      updated_at: "2026-06-17T09:05:00.000Z",
    });
    queryable.databaseNowMs = Date.parse("2026-06-17T10:15:00.000Z");
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    const state = await store.recordNodeHeartbeat();

    expect(state).toEqual({
      nodeId: "node-a",
      firstSeenAt: "2026-06-17T09:00:00.000Z",
      lastSeenAt: "2026-06-17T10:15:00.000Z",
      draining: true,
      drainStartedAt: "2026-06-17T09:10:00.000Z",
      updatedAt: "2026-06-17T10:15:00.000Z",
    });
  });

  it("records heartbeats for missing node rows as non-draining", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    queryable.databaseNowMs = Date.parse("2026-06-17T10:20:00.000Z");
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    const state = await store.recordNodeHeartbeat();

    expect(state).toEqual({
      nodeId: "node-a",
      firstSeenAt: "2026-06-17T10:20:00.000Z",
      lastSeenAt: "2026-06-17T10:20:00.000Z",
      draining: false,
      updatedAt: "2026-06-17T10:20:00.000Z",
    });
  });

  it("loads the current runtime node state without changing heartbeat or drain fields", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    queryable.seed({
      node_id: "node-a",
      first_seen_at: "2026-06-17T09:00:00.000Z",
      last_seen_at: "2026-06-17T09:45:00.000Z",
      draining: true,
      drain_started_at: "2026-06-17T09:50:00.000Z",
      updated_at: "2026-06-17T09:45:00.000Z",
    });
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    await expect(store.getNodeState()).resolves.toEqual({
      nodeId: "node-a",
      firstSeenAt: "2026-06-17T09:00:00.000Z",
      lastSeenAt: "2026-06-17T09:45:00.000Z",
      draining: true,
      drainStartedAt: "2026-06-17T09:50:00.000Z",
      updatedAt: "2026-06-17T09:45:00.000Z",
    });
    expect(queryable.nodes.get("node-a")).toMatchObject({
      last_seen_at: "2026-06-17T09:45:00.000Z",
      draining: true,
    });
  });

  it("returns null node state for missing runtime node rows", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    await expect(store.getNodeState()).resolves.toBeNull();
  });

  it("starts drain idempotently with database time and does not persist the reason", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    queryable.databaseNowMs = Date.parse("2026-06-17T10:05:00.000Z");
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    const first = await store.startDrain({ reason: "operator" });
    queryable.databaseNowMs = Date.parse("2026-06-17T10:06:00.000Z");
    const second = await store.startDrain({ reason: "Authorization: Bearer secret" });

    expect(first).toEqual({ draining: true, startedAt: "2026-06-17T10:05:00.000Z" });
    expect(second).toEqual({ draining: true, startedAt: "2026-06-17T10:05:00.000Z" });
    expect(JSON.stringify(queryable.nodes.get("node-a"))).not.toContain("operator");
    expect(JSON.stringify(queryable.nodes.get("node-a"))).not.toContain("secret");
    expect(queryable.queries.at(-1)?.values).toEqual(["node-a"]);
  });

  it("replaces stale drain timestamps when a non-draining row starts a new drain", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    queryable.seed({
      node_id: "node-a",
      first_seen_at: "2026-06-16T00:00:00.000Z",
      last_seen_at: "2026-06-16T00:05:00.000Z",
      draining: false,
      drain_started_at: "2026-06-16T00:04:00.000Z",
      updated_at: "2026-06-16T00:05:00.000Z",
    });
    queryable.databaseNowMs = Date.parse("2026-06-17T10:05:00.000Z");
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    await expect(store.startDrain({ reason: "operator" })).resolves.toEqual({
      draining: true,
      startedAt: "2026-06-17T10:05:00.000Z",
    });
    expect(queryable.nodes.get("node-a")?.drain_started_at).toBe("2026-06-17T10:05:00.000Z");
  });

  it("returns false drain state for missing node rows", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    await expect(store.getDrainState()).resolves.toEqual({ draining: false });
  });

  it("retries schema creation after a transient failure", async () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();
    queryable.failNextSchema = true;
    const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

    await expect(store.ensureSchema()).rejects.toThrow(/schema unavailable/);
    await expect(store.ensureSchema()).resolves.toBeUndefined();
  });

  it("rejects unsafe node ids before querying", () => {
    const queryable = new FakePostgresRuntimeNodeQueryable();

    expect(() =>
      new PostgresOnlineRuntimeNodeStore({
        nodeId: "https://castles.example/?token=secret",
        queryable,
      })
    ).toThrow(/CASTLES_NODE_ID/);
    expect(queryable.queries).toEqual([]);
  });
});
