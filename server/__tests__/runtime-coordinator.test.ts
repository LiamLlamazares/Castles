import { describe, expect, it } from "vitest";
import { createConfiguredRuntimeCoordinator } from "../runtimeCoordinator";

describe("createConfiguredRuntimeCoordinator", () => {
  it("uses the parsed runtime node id for the server runtime coordinator", () => {
    const coordinator = createConfiguredRuntimeCoordinator({ runtimeNodeId: "prod-node-a" });

    expect(coordinator.nodeId).toBe("prod-node-a");
    expect(coordinator.capabilities).toMatchObject({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
    });
  });
});
