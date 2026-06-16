import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readServerIndex(): string {
  return readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
}

describe("server runtime coordinator wiring", () => {
  it("passes the configured runtime coordinator into the production server entrypoint", () => {
    const source = readServerIndex();

    expect(source).toContain("startRuntimeEventPolling");
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
    const runtimeCleanupIndex = source.indexOf("runOnlineRuntimeTableCleanup({");
    const serviceIndex = source.indexOf("OnlineGameService.fromRecords(records");
    const directSummaryRebuildIndex = source.indexOf("await store.rebuildSummaries({");

    expect(source).toContain("runOnlineRuntimeTableCleanup");
    expect(coordinatorIndex).toBeGreaterThan(-1);
    expect(spectatorStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(runtimeEventStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(operationGateStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(rateLimitStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(startupStoreIndex).toBeGreaterThan(coordinatorIndex);
    expect(maintenanceIndex).toBeGreaterThan(coordinatorIndex);
    expect(maintenanceIndex).toBeLessThan(serviceIndex);
    expect(runtimeCleanupIndex).toBeGreaterThan(maintenanceIndex);
    expect(runtimeCleanupIndex).toBeLessThan(serviceIndex);
    expect(source).toMatch(
      /runOnlineRuntimeTableCleanup\(\{[\s\S]*spectatorPresenceStore,[\s\S]*runtimeEventStore,[\s\S]*operationGateStore,[\s\S]*rateLimitStore,[\s\S]*\}\)/
    );
    expect(directSummaryRebuildIndex).toBe(-1);
  });

  it("marks the runtime coordinator draining before closing network listeners", () => {
    const source = readServerIndex();
    const drainIndex = source.indexOf("runtimeCoordinator?.startDrain({ reason })");
    const stopPollingIndex = source.indexOf("runtimeEventPoller?.stop()");
    const closeWebSocketIndex = source.indexOf("closeWebSocketServer(wss)");
    const closeHttpIndex = source.indexOf("closeHttpServer(server)");

    expect(drainIndex).toBeGreaterThan(-1);
    expect(stopPollingIndex).toBeGreaterThan(drainIndex);
    expect(stopPollingIndex).toBeLessThan(closeWebSocketIndex);
    expect(drainIndex).toBeLessThan(closeWebSocketIndex);
    expect(drainIndex).toBeLessThan(closeHttpIndex);
  });

  it("starts runtime event polling after the HTTP server subscribes to runtime hints", () => {
    const source = readServerIndex();
    const httpServerIndex = source.indexOf("const { app, server, wss } = createOnlineHttpServer({");
    const startPollingIndex = source.indexOf("runtimeEventPoller = startRuntimeEventPolling({");
    const listenIndex = source.indexOf("server.listen(config.port");

    expect(httpServerIndex).toBeGreaterThan(-1);
    expect(startPollingIndex).toBeGreaterThan(httpServerIndex);
    expect(startPollingIndex).toBeLessThan(listenIndex);
  });

  it("closes the runtime coordinator before backing stores after startup failure", () => {
    const source = readServerIndex();
    const startupFailureIndex = source.indexOf("if (!startupComplete)");
    const stopPollingIndex = source.indexOf("runtimeEventPoller?.stop()", startupFailureIndex);
    const closeRuntimeIndex = source.indexOf("await runtimeCoordinator?.close();", startupFailureIndex);
    const closeGameStoreIndex = source.indexOf("await store.close();", startupFailureIndex);

    expect(startupFailureIndex).toBeGreaterThan(-1);
    expect(stopPollingIndex).toBeGreaterThan(startupFailureIndex);
    expect(stopPollingIndex).toBeLessThan(closeRuntimeIndex);
    expect(closeRuntimeIndex).toBeGreaterThan(startupFailureIndex);
    expect(closeRuntimeIndex).toBeLessThan(closeGameStoreIndex);
  });
});
