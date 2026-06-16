import { describe, expect, it } from "vitest";
import {
  ONLINE_STARTUP_RUNTIME_CLEANUP_TASK_KEY,
  createStartupMaintenanceRunKey,
  ONLINE_STARTUP_SUMMARY_REBUILD_TASK_KEY,
  runOnlineRuntimeTableCleanup,
  runOnlineStartupMaintenance,
} from "../startupMaintenance";
import type {
  OnlineRuntimeCoordinator,
  OnlineRuntimeStartupMaintenanceResult,
} from "../../src/online/server/onlineRuntimeCoordinator";

class FakeRuntimeCoordinator implements Pick<OnlineRuntimeCoordinator, "runStartupMaintenance"> {
  readonly calls: Array<{ taskKey: string; runKey: string }> = [];
  nextResult: OnlineRuntimeStartupMaintenanceResult<unknown> | null = null;

  async runStartupMaintenance<T>(
    input: { taskKey: string; runKey: string },
    operation: () => Promise<T>
  ): Promise<OnlineRuntimeStartupMaintenanceResult<T>> {
    this.calls.push(input);
    if (this.nextResult) {
      return this.nextResult as OnlineRuntimeStartupMaintenanceResult<T>;
    }
    return { status: "completed", value: await operation() };
  }
}

class FakeOnlineGameStore {
  readonly calls: string[] = [];

  async rebuildSummaries(): Promise<unknown[]> {
    this.calls.push("games");
    return [];
  }

  async rebuildChallengeSummaries(): Promise<unknown[]> {
    this.calls.push("challenges");
    return [];
  }

  async rebuildOpenSeekSummaries(): Promise<unknown[]> {
    this.calls.push("seeks");
    return [];
  }
}

class FakeRuntimeCleanupStores {
  readonly calls: string[] = [];

  readonly spectatorPresenceStore = {
    cleanupExpiredSpectators: async (): Promise<number> => {
      this.calls.push("spectators");
      return 1;
    },
  };

  readonly runtimeEventStore = {
    cleanupRuntimeEventsOlderThan: async (retentionMs: number): Promise<number> => {
      this.calls.push(`events:${retentionMs}`);
      return 2;
    },
  };

  readonly operationGateStore = {
    cleanupOperationLocksOlderThan: async (retentionMs: number): Promise<number> => {
      this.calls.push(`locks:${retentionMs}`);
      return 3;
    },
  };

  readonly rateLimitStore = {
    cleanupExpiredRateLimits: async (): Promise<number> => {
      this.calls.push("rate-limits");
      return 4;
    },
  };
}

describe("startup maintenance helpers", () => {
  it("uses commit, build, then node id for startup maintenance run keys", () => {
    expect(
      createStartupMaintenanceRunKey({
        runtimeNodeId: "node-a",
        commit: "0123456789abcdef0123456789abcdef01234567",
        buildId: "20260616-120000",
      })
    ).toBe("commit:0123456789abcdef0123456789abcdef01234567");
    expect(
      createStartupMaintenanceRunKey({
        runtimeNodeId: "node-a",
        buildId: "20260616-120000",
      })
    ).toBe("build:20260616-120000");
    expect(createStartupMaintenanceRunKey({ runtimeNodeId: "node-a" })).toBe("node:node-a");
  });

  it("runs startup summary rebuilds under the runtime coordinator ownership task", async () => {
    const runtimeCoordinator = new FakeRuntimeCoordinator();
    const store = new FakeOnlineGameStore();

    await expect(
      runOnlineStartupMaintenance({
        config: {
          runtimeNodeId: "node-a",
          commit: "0123456789abcdef0123456789abcdef01234567",
        },
        runtimeCoordinator: runtimeCoordinator as unknown as OnlineRuntimeCoordinator,
        store: store as never,
      })
    ).resolves.toEqual({ status: "completed", value: undefined });

    expect(runtimeCoordinator.calls).toEqual([
      {
        taskKey: ONLINE_STARTUP_SUMMARY_REBUILD_TASK_KEY,
        runKey: "commit:0123456789abcdef0123456789abcdef01234567",
      },
    ]);
    expect(store.calls).toEqual(["games", "challenges", "seeks"]);
  });

  it("does not run rebuilds when another node already completed the startup task", async () => {
    const runtimeCoordinator = new FakeRuntimeCoordinator();
    runtimeCoordinator.nextResult = { status: "already_completed" };
    const store = new FakeOnlineGameStore();

    await expect(
      runOnlineStartupMaintenance({
        config: {
          runtimeNodeId: "node-b",
          commit: "0123456789abcdef0123456789abcdef01234567",
        },
        runtimeCoordinator: runtimeCoordinator as unknown as OnlineRuntimeCoordinator,
        store: store as never,
      })
    ).resolves.toEqual({ status: "already_completed" });

    expect(store.calls).toEqual([]);
  });

  it("runs runtime operational table cleanup under a once-per-run maintenance task", async () => {
    const runtimeCoordinator = new FakeRuntimeCoordinator();
    const stores = new FakeRuntimeCleanupStores();

    await expect(
      runOnlineRuntimeTableCleanup({
        config: {
          runtimeNodeId: "node-a",
          commit: "0123456789abcdef0123456789abcdef01234567",
        },
        runtimeCoordinator: runtimeCoordinator as unknown as OnlineRuntimeCoordinator,
        stores,
        now: new Date("2026-06-16T12:00:00.000Z"),
        runtimeEventRetentionMs: 86_400_000,
        operationLockRetentionMs: 86_400_000,
      })
    ).resolves.toEqual({
      status: "completed",
      value: {
        expiredSpectators: 1,
        runtimeEvents: 2,
        operationLocks: 3,
        rateLimits: 4,
        runtimeEventRetentionMs: 86_400_000,
        operationLockRetentionMs: 86_400_000,
      },
    });

    expect(runtimeCoordinator.calls).toEqual([
      {
        taskKey: ONLINE_STARTUP_RUNTIME_CLEANUP_TASK_KEY,
        runKey: "commit:0123456789abcdef0123456789abcdef01234567",
      },
    ]);
    expect(stores.calls).toEqual([
      "spectators",
      "events:86400000",
      "locks:86400000",
      "rate-limits",
    ]);
  });

  it("does not run runtime operational cleanup when another node already completed it", async () => {
    const runtimeCoordinator = new FakeRuntimeCoordinator();
    runtimeCoordinator.nextResult = { status: "already_completed" };
    const stores = new FakeRuntimeCleanupStores();

    await expect(
      runOnlineRuntimeTableCleanup({
        config: {
          runtimeNodeId: "node-b",
          commit: "0123456789abcdef0123456789abcdef01234567",
        },
        runtimeCoordinator: runtimeCoordinator as unknown as OnlineRuntimeCoordinator,
        stores,
        now: new Date("2026-06-16T12:00:00.000Z"),
      })
    ).resolves.toEqual({ status: "already_completed" });

    expect(stores.calls).toEqual([]);
  });
});
