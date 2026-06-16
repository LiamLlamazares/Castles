import { describe, expect, it } from "vitest";
import { createConfiguredRuntimeCoordinator } from "../runtimeCoordinator";

class FakeStartupMaintenanceStore {
  readonly calls: Array<{ taskKey: string; runKey: string; nodeId: string }> = [];

  async runStartupMaintenance<T>(
    input: { taskKey: string; runKey: string; nodeId: string },
    operation: () => Promise<T>
  ) {
    this.calls.push(input);
    return { status: "completed" as const, value: await operation() };
  }
}

describe("createConfiguredRuntimeCoordinator", () => {
  it("uses the parsed runtime node id for the server runtime coordinator", () => {
    const coordinator = createConfiguredRuntimeCoordinator({ runtimeNodeId: "prod-node-a" });

    expect(coordinator.nodeId).toBe("prod-node-a");
    expect(coordinator.capabilities).toMatchObject({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
      startupMaintenance: "process-local",
    });
  });

  it("uses PostgreSQL startup maintenance ownership when a store is supplied", async () => {
    const startupMaintenanceStore = new FakeStartupMaintenanceStore();
    const coordinator = createConfiguredRuntimeCoordinator(
      { runtimeNodeId: "prod-node-a" },
      { startupMaintenanceStore }
    );

    await expect(
      coordinator.runStartupMaintenance(
        {
          taskKey: "startup_summary_rebuilds",
          runKey: "commit:0123456789abcdef0123456789abcdef01234567",
        },
        async () => "rebuilt"
      )
    ).resolves.toEqual({ status: "completed", value: "rebuilt" });

    expect(coordinator.nodeId).toBe("prod-node-a");
    expect(coordinator.capabilities).toMatchObject({
      mode: "single-node",
      websocketFanout: "process-local",
      startupMaintenance: "postgres-once-per-run",
    });
    expect(startupMaintenanceStore.calls).toEqual([
      {
        taskKey: "startup_summary_rebuilds",
        runKey: "commit:0123456789abcdef0123456789abcdef01234567",
        nodeId: "prod-node-a",
      },
    ]);
  });
});
