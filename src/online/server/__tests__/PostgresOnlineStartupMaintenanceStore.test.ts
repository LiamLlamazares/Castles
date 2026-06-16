import { describe, expect, it } from "vitest";
import { PostgresOnlineStartupMaintenanceStore } from "../PostgresOnlineStartupMaintenanceStore";

const COMMIT_RUN_KEY = "commit:0123456789abcdef0123456789abcdef01234567";

interface MaintenanceRow {
  task_key: string;
  run_key: string;
  owner_node_id: string;
  started_at: string;
  completed_at: string | null;
}

class FakePostgresClient {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  readonly rows = new Map<string, MaintenanceRow>();
  releaseCount = 0;
  rollbackFails = false;

  seedCompleted(taskKey: string, runKey: string): void {
    this.rows.set(`${taskKey}\u0000${runKey}`, {
      task_key: taskKey,
      run_key: runKey,
      owner_node_id: "node-a",
      started_at: "2026-06-16T00:00:00.000Z",
      completed_at: "2026-06-16T00:00:05.000Z",
    });
  }

  async query(text: string, values: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
    this.queries.push({ text, values });
    const compact = compactSql(text);
    if (/^CREATE TABLE IF NOT EXISTS online_startup_maintenance/i.test(compact)) {
      return { rows: [], rowCount: 0 };
    }
    if (/^CREATE INDEX IF NOT EXISTS online_startup_maintenance_completed_at_idx/i.test(compact)) {
      return { rows: [], rowCount: 0 };
    }
    if (compact === "BEGIN" || compact === "COMMIT") {
      return { rows: [], rowCount: 0 };
    }
    if (compact === "ROLLBACK") {
      if (this.rollbackFails) throw new Error("rollback unavailable");
      return { rows: [], rowCount: 0 };
    }
    if (/^INSERT INTO online_startup_maintenance/i.test(compact)) {
      const [taskKey, runKey, nodeId] = values as [string, string, string];
      const key = `${taskKey}\u0000${runKey}`;
      if (!this.rows.has(key)) {
        this.rows.set(key, {
          task_key: taskKey,
          run_key: runKey,
          owner_node_id: nodeId,
          started_at: "2026-06-16T00:00:00.000Z",
          completed_at: null,
        });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (/^SELECT task_key, run_key, completed_at FROM online_startup_maintenance/i.test(compact)) {
      const [taskKey, runKey] = values as [string, string];
      const row = this.rows.get(`${taskKey}\u0000${runKey}`);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/^UPDATE online_startup_maintenance SET owner_node_id = \$3/i.test(compact)) {
      const [taskKey, runKey, nodeId] = values as [string, string, string];
      const row = this.rows.get(`${taskKey}\u0000${runKey}`);
      if (row) {
        row.owner_node_id = nodeId;
        row.completed_at = null;
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (/^UPDATE online_startup_maintenance SET completed_at = now\(\)/i.test(compact)) {
      const [taskKey, runKey] = values as [string, string];
      const row = this.rows.get(`${taskKey}\u0000${runKey}`);
      if (row) {
        row.completed_at = "2026-06-16T00:00:05.000Z";
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    throw new Error(`Unexpected query: ${compact}`);
  }

  release(): void {
    this.releaseCount += 1;
  }
}

function compactSql(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

describe("PostgresOnlineStartupMaintenanceStore", () => {
  it("creates the startup maintenance ownership table", async () => {
    const queryable = new FakePostgresClient();
    const store = new PostgresOnlineStartupMaintenanceStore({ queryable });

    await store.ensureSchema();

    expect(queryable.queries.some((query) =>
      /CREATE TABLE IF NOT EXISTS online_startup_maintenance/i.test(query.text) &&
      /PRIMARY KEY \(task_key, run_key\)/i.test(compactSql(query.text))
    )).toBe(true);
    expect(queryable.queries.some((query) =>
      /online_startup_maintenance_completed_at_idx/i.test(query.text)
    )).toBe(true);
  });

  it("runs a startup maintenance task once and marks it complete", async () => {
    const schemaQueryable = new FakePostgresClient();
    const transactionClient = new FakePostgresClient();
    const store = new PostgresOnlineStartupMaintenanceStore({
      queryable: schemaQueryable,
      transactionClientFactory: async () => transactionClient,
    });
    const operations: string[] = [];

    const result = await store.runStartupMaintenance(
      {
        taskKey: "startup_summary_rebuilds",
        runKey: COMMIT_RUN_KEY,
        nodeId: "node-a",
      },
      async () => {
        operations.push("rebuild");
        return "rebuilt";
      }
    );

    expect(result).toEqual({ status: "completed", value: "rebuilt" });
    expect(operations).toEqual(["rebuild"]);
    expect(transactionClient.rows.get(`startup_summary_rebuilds\u0000${COMMIT_RUN_KEY}`)?.completed_at)
      .toBe("2026-06-16T00:00:05.000Z");
    expect(transactionClient.releaseCount).toBe(1);
    expect(transactionClient.queries.map((query) => compactSql(query.text))).toContain("COMMIT");
  });

  it("skips an already-completed startup maintenance task for the same run key", async () => {
    const schemaQueryable = new FakePostgresClient();
    const transactionClient = new FakePostgresClient();
    transactionClient.seedCompleted("startup_summary_rebuilds", COMMIT_RUN_KEY);
    const store = new PostgresOnlineStartupMaintenanceStore({
      queryable: schemaQueryable,
      transactionClientFactory: async () => transactionClient,
    });
    const operations: string[] = [];

    const result = await store.runStartupMaintenance(
      {
        taskKey: "startup_summary_rebuilds",
        runKey: COMMIT_RUN_KEY,
        nodeId: "node-b",
      },
      async () => {
        operations.push("should-not-run");
        return "rebuilt";
      }
    );

    expect(result).toEqual({ status: "already_completed" });
    expect(operations).toEqual([]);
    expect(transactionClient.releaseCount).toBe(1);
    expect(transactionClient.queries.map((query) => compactSql(query.text))).toContain("COMMIT");
  });

  it("rolls back and leaves the task retryable when maintenance fails", async () => {
    const transactionClient = new FakePostgresClient();
    const store = new PostgresOnlineStartupMaintenanceStore({
      queryable: new FakePostgresClient(),
      transactionClientFactory: async () => transactionClient,
    });

    await expect(
      store.runStartupMaintenance(
        {
          taskKey: "startup_summary_rebuilds",
          runKey: COMMIT_RUN_KEY,
          nodeId: "node-a",
        },
        async () => {
          throw new Error("rebuild failed");
        }
      )
    ).rejects.toThrow(/rebuild failed/);

    expect(transactionClient.releaseCount).toBe(1);
    expect(transactionClient.queries.map((query) => compactSql(query.text))).toContain("ROLLBACK");
    expect(transactionClient.queries.map((query) => compactSql(query.text))).not.toContain("COMMIT");
    expect(transactionClient.rows.get(`startup_summary_rebuilds\u0000${COMMIT_RUN_KEY}`)?.completed_at)
      .toBeNull();

    const retried = await store.runStartupMaintenance(
      {
        taskKey: "startup_summary_rebuilds",
        runKey: COMMIT_RUN_KEY,
        nodeId: "node-a",
      },
      async () => "retried"
    );

    expect(retried).toEqual({ status: "completed", value: "retried" });
    expect(transactionClient.releaseCount).toBe(2);
    expect(transactionClient.rows.get(`startup_summary_rebuilds\u0000${COMMIT_RUN_KEY}`)?.completed_at)
      .toBe("2026-06-16T00:00:05.000Z");
  });

  it("rejects invalid maintenance identifiers before persistence", async () => {
    const queryable = new FakePostgresClient();
    const store = new PostgresOnlineStartupMaintenanceStore({ queryable });

    await expect(
      store.runStartupMaintenance(
        { taskKey: " ", runKey: COMMIT_RUN_KEY, nodeId: "node-a" },
        async () => undefined
      )
    ).rejects.toThrow(/task key/);
    await expect(
      store.runStartupMaintenance(
        {
          taskKey: "startup_summary_rebuilds",
          runKey: "https://castles.example/?token=secret",
          nodeId: "node-a",
        },
        async () => undefined
      )
    ).rejects.toThrow(/run key/);
    await expect(
      store.runStartupMaintenance(
        {
          taskKey: "startup_summary_rebuilds",
          runKey: COMMIT_RUN_KEY,
          nodeId: "node id",
        },
        async () => undefined
      )
    ).rejects.toThrow(/node id/);
    await expect(
      store.runStartupMaintenance(
        {
          taskKey: "game_123",
          runKey: COMMIT_RUN_KEY,
          nodeId: "node-a",
        },
        async () => undefined
      )
    ).rejects.toThrow(/online entity ids/);

    expect(queryable.queries).toEqual([]);
  });
});
