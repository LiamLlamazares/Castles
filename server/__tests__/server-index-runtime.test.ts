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
    expect(source).toContain("startRuntimeNodeHeartbeat");
    expect(source).toContain("createConfiguredRuntimeCoordinator");
    expect(source).toMatch(
      /runtimeCoordinator\s*=\s*createConfiguredRuntimeCoordinator\(config,\s*\{\s*runtimeNodeStore,\s*spectatorPresenceStore,\s*runtimeEventStore,\s*operationGateStore,\s*rateLimitStore,\s*startupMaintenanceStore,\s*\}\)/
    );
    expect(source).toMatch(/createOnlineHttpServer\(\{[\s\S]*runtimeCoordinator,/);
  });

  it("records runtime node startup before configuring the runtime coordinator and service", () => {
    const source = readServerIndex();
    const recordNodeIndex = source.indexOf("await runtimeNodeStore.recordNodeStarted()");
    const coordinatorIndex = source.indexOf(
      "runtimeCoordinator = createConfiguredRuntimeCoordinator(config, {"
    );
    const serviceIndex = source.indexOf("OnlineGameService.fromRecords(records");

    expect(recordNodeIndex).toBeGreaterThan(-1);
    expect(recordNodeIndex).toBeLessThan(coordinatorIndex);
    expect(recordNodeIndex).toBeLessThan(serviceIndex);
  });

  it("runs startup maintenance through the configured runtime coordinator before service creation", () => {
    const source = readServerIndex();
    const coordinatorIndex = source.indexOf(
      "runtimeCoordinator = createConfiguredRuntimeCoordinator(config, {"
    );
    const runtimeNodeStoreIndex = source.indexOf("runtimeNodeStore,", coordinatorIndex);
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
    expect(runtimeNodeStoreIndex).toBeGreaterThan(coordinatorIndex);
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
    const closeWebSocketIndex = source.indexOf("closeWebSocketServerAfterDrain(wss, {");
    const closeHttpIndex = source.indexOf("closeHttpServer(server, {");

    expect(drainIndex).toBeGreaterThan(-1);
    expect(drainIndex).toBeLessThan(closeWebSocketIndex);
    expect(drainIndex).toBeLessThan(closeHttpIndex);
    expect(stopPollingIndex).toBeGreaterThan(closeWebSocketIndex);
    expect(stopPollingIndex).toBeGreaterThan(closeHttpIndex);
  });

  it("uses bounded rolling-drain socket close helpers during shutdown", () => {
    const source = readServerIndex();

    expect(source).toContain(
      'import { closeHttpServer, closeWebSocketServerAfterDrain } from "./socketDrain";'
    );
    expect(source).toContain("const HTTP_SHUTDOWN_TIMEOUT_MS = 5_000;");
    expect(source).toContain("const WEBSOCKET_DRAIN_GRACE_MS = 30_000;");
    expect(source).toContain("const WEBSOCKET_CLOSE_TIMEOUT_MS = 5_000;");
    expect(source).toMatch(
      /closeWebSocketServerAfterDrain\(wss,\s*\{\s*drainGraceMs:\s*WEBSOCKET_DRAIN_GRACE_MS,\s*closeTimeoutMs:\s*WEBSOCKET_CLOSE_TIMEOUT_MS,\s*\}\)/
    );
    expect(source).toMatch(
      /closeHttpServer\(server,\s*\{\s*timeoutMs:\s*HTTP_SHUTDOWN_TIMEOUT_MS,\s*\}\)/
    );
    expect(source).not.toContain("function closeWebSocketServer");
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

  it("starts runtime node heartbeat after startup is recorded and before listening", () => {
    const source = readServerIndex();
    const recordNodeIndex = source.indexOf("await runtimeNodeStore.recordNodeStarted()");
    const httpServerIndex = source.indexOf("const { app, server, wss } = createOnlineHttpServer({");
    const startHeartbeatIndex = source.indexOf("runtimeNodeHeartbeat = startRuntimeNodeHeartbeat({");
    const listenIndex = source.indexOf("server.listen(config.port");

    expect(source).toContain("const RUNTIME_NODE_HEARTBEAT_INTERVAL_MS = 5_000;");
    expect(source).toContain("const RUNTIME_NODE_HEARTBEAT_MAX_BACKOFF_MS = 30_000;");
    expect(source).toContain("const RUNTIME_NODE_HEARTBEAT_FAILURE_READINESS_THRESHOLD = 3;");
    expect(recordNodeIndex).toBeGreaterThan(-1);
    expect(httpServerIndex).toBeGreaterThan(recordNodeIndex);
    expect(startHeartbeatIndex).toBeGreaterThan(httpServerIndex);
    expect(startHeartbeatIndex).toBeLessThan(listenIndex);
  });

  it("combines runtime event polling and node heartbeat readiness in health", () => {
    const source = readServerIndex();

    expect(source).toMatch(
      /checkRuntimeReady:\s*async \(\) => \{\s*const eventPollingReady = runtimeEventPoller\?\.getStatus\(\)\.ready \?\? true;\s*const nodeHeartbeatReady = runtimeNodeHeartbeat\?\.getStatus\(\)\.ready \?\? true;\s*return eventPollingReady && nodeHeartbeatReady;\s*\}/
    );
    expect(source).toContain(
      "getRuntimeNodeHeartbeatStatus: () => runtimeNodeHeartbeat?.getStatus(),"
    );
  });

  it("closes the runtime coordinator before backing stores after startup failure", () => {
    const source = readServerIndex();
    const startupFailureIndex = source.indexOf("if (!startupComplete)");
    const stopPollingIndex = source.indexOf("runtimeEventPoller?.stop()", startupFailureIndex);
    const stopHeartbeatIndex = source.indexOf("runtimeNodeHeartbeat?.stop()", startupFailureIndex);
    const closeRuntimeIndex = source.indexOf("await runtimeCoordinator?.close();", startupFailureIndex);
    const closeGameStoreIndex = source.indexOf("await store.close();", startupFailureIndex);
    const closeRuntimeNodeStoreIndex = source.indexOf("await runtimeNodeStore.close();", startupFailureIndex);

    expect(startupFailureIndex).toBeGreaterThan(-1);
    expect(stopPollingIndex).toBeGreaterThan(startupFailureIndex);
    expect(stopPollingIndex).toBeLessThan(closeRuntimeIndex);
    expect(stopHeartbeatIndex).toBeGreaterThan(startupFailureIndex);
    expect(stopHeartbeatIndex).toBeLessThan(closeRuntimeIndex);
    expect(closeRuntimeIndex).toBeGreaterThan(startupFailureIndex);
    expect(closeRuntimeIndex).toBeLessThan(closeGameStoreIndex);
    expect(closeRuntimeNodeStoreIndex).toBeGreaterThan(closeRuntimeIndex);
  });

  it("closes the runtime node store during normal shutdown", () => {
    const source = readServerIndex();
    const shutdownIndex = source.indexOf("const shutdown = async (reason: string) => {");
    const stopHeartbeatIndex = source.indexOf("runtimeNodeHeartbeat?.stop()", shutdownIndex);
    const closeRuntimeIndex = source.indexOf("await runtimeCoordinator?.close();", shutdownIndex);
    const closeRuntimeNodeStoreIndex = source.indexOf("await runtimeNodeStore.close();", shutdownIndex);
    const closeGameStoreIndex = source.indexOf("await store.close();", shutdownIndex);

    expect(shutdownIndex).toBeGreaterThan(-1);
    expect(stopHeartbeatIndex).toBeGreaterThan(shutdownIndex);
    expect(stopHeartbeatIndex).toBeLessThan(closeRuntimeIndex);
    expect(closeRuntimeNodeStoreIndex).toBeGreaterThan(closeRuntimeIndex);
    expect(closeRuntimeNodeStoreIndex).toBeLessThan(closeGameStoreIndex);
  });
});
