import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readServerIndex(): string {
  return readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
}

describe("server runtime coordinator wiring", () => {
  it("passes the configured runtime coordinator into the production server entrypoint", () => {
    const source = readServerIndex();

    expect(source).toContain("createConfiguredRuntimeCoordinator");
    expect(source).toMatch(
      /runtimeCoordinator\s*=\s*createConfiguredRuntimeCoordinator\(config,\s*\{\s*spectatorPresenceStore,\s*runtimeEventStore,\s*operationGateStore,\s*rateLimitStore,\s*startupMaintenanceStore,\s*\}\)/
    );
    expect(source).toMatch(/createOnlineHttpServer\(\{[\s\S]*runtimeCoordinator,/);
  });

  it("runs startup maintenance through the configured runtime coordinator before service creation", () => {
    const source = readServerIndex();
    const coordinatorIndex = source.indexOf(
      "runtimeCoordinator = createConfiguredRuntimeCoordinator(config, {"
    );
    const spectatorStoreIndex = source.indexOf("spectatorPresenceStore,", coordinatorIndex);
    const runtimeEventStoreIndex = source.indexOf("runtimeEventStore,", coordinatorIndex);
    const operationGateStoreIndex = source.indexOf("operationGateStore,", coordinatorIndex);
    const rateLimitStoreIndex = source.indexOf("rateLimitStore,", coordinatorIndex);
    const startupStoreIndex = source.indexOf("startupMaintenanceStore,", coordinatorIndex);
    const maintenanceIndex = source.indexOf("runOnlineStartupMaintenance({");
    const serviceIndex = source.indexOf("OnlineGameService.fromRecords(records");
    const directSummaryRebuildIndex = source.indexOf("await store.rebuildSummaries({");

    expect(coordinatorIndex).toBeGreaterThan(-1);
    expect(spectatorStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(runtimeEventStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(operationGateStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(rateLimitStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(startupStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(maintenanceIndex).toBeGreaterThan(coordinatorIndex);
    expect(maintenanceIndex).toBeLessThan(serviceIndex);
    expect(directSummaryRebuildIndex).toBe(-1);
  });

  it("marks the runtime coordinator draining before closing network listeners", () => {
    const source = readServerIndex();
    const drainIndex = source.indexOf("runtimeCoordinator?.startDrain({ reason })");
    const closeWebSocketIndex = source.indexOf("closeWebSocketServer(wss)");
    const closeHttpIndex = source.indexOf("closeHttpServer(server)");

    expect(drainIndex).toBeGreaterThan(-1);
    expect(drainIndex).toBeLessThan(closeWebSocketIndex);
    expect(drainIndex).toBeLessThan(closeHttpIndex);
  });

  it("closes the runtime coordinator before backing stores after startup failure", () => {
    const source = readServerIndex();
    const startupFailureIndex = source.indexOf("if (!startupComplete)");
    const closeRuntimeIndex = source.indexOf("await runtimeCoordinator?.close();", startupFailureIndex);
    const closeGameStoreIndex = source.indexOf("await store.close();", startupFailureIndex);

    expect(startupFailureIndex).toBeGreaterThan(-1);
    expect(closeRuntimeIndex).toBeGreaterThan(startupFailureIndex);
    expect(closeRuntimeIndex).toBeLessThan(closeGameStoreIndex);
  });
});
