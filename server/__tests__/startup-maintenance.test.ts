import { describe, expect, it } from "vitest";
import {
  createStartupMaintenanceRunKey,
  ONLINE_STARTUP_SUMMARY_REBUILD_TASK_KEY,
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
});
