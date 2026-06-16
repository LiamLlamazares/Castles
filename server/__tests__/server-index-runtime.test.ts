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
      /runtimeCoordinator\s*=\s*createConfiguredRuntimeCoordinator\(config,\s*\{\s*startupMaintenanceStore\s*,?\s*\}\)/
    );
    expect(source).toMatch(/createOnlineHttpServer\(\{[\s\S]*runtimeCoordinator,/);
  });

  it("runs startup maintenance through the configured runtime coordinator before service creation", () => {
    const source = readServerIndex();
    const coordinatorIndex = source.indexOf(
      "runtimeCoordinator = createConfiguredRuntimeCoordinator(config, { startupMaintenanceStore })"
    );
    const maintenanceIndex = source.indexOf("runOnlineStartupMaintenance({");
    const serviceIndex = source.indexOf("OnlineGameService.fromRecords(records");
    const directSummaryRebuildIndex = source.indexOf("await store.rebuildSummaries({");

    expect(coordinatorIndex).toBeGreaterThan(-1);
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
});
