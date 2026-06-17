import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readScript() {
  return readFileSync(resolve(process.cwd(), "scripts/deploy/check-online-smoke.mjs"), "utf8");
}

describe("production online API smoke script", () => {
  it("exercises account challenge recovery before reporting production healthy", () => {
    const script = readScript();

    expect(script).toContain("/api/online/accounts");
    expect(script).toContain("/api/online/account/follows/");
    expect(script).toContain("challengedDisplayName");
    expect(script).toContain("/api/online/account/challenges/");
    expect(script).toContain("/accept");
    expect(script).toContain("/api/online/account/games/");
    expect(script).toContain("/rejoin");
    expect(script).toContain("Account challenge recovery");
    expect(script).toContain("cleanupErrors");
    expect(script).toContain("RESIGN");
    expect(script).toContain("/api/online/account");
  });

  it("ends the direct-created smoke game before reporting production healthy", () => {
    const script = readScript();

    expect(script).toContain("direct-smoke-cleanup-resign");
    expect(script).toContain("created.black.token");
    expect(script).toContain("Direct smoke cleanup");
    expect(script).toMatch(/RESIGN[\s\S]*baseVersion:\s*1/);
  });

  it("checks production runtime health before mutable smoke operations", () => {
    const script = readScript();
    const runtimeHealthIndex = script.indexOf("assertProductionRuntimeHealthReady(healthBody)");
    const createGameIndex = script.indexOf(
      "const createResponse = await fetchWithTimeout(`${baseUrl}/api/online/games`"
    );

    expect(script).toContain("assertProductionRuntimeHealthReady");
    expect(createGameIndex).toBeGreaterThan(0);
    expect(runtimeHealthIndex).toBeGreaterThan(script.indexOf("Health did not report event schema v2"));
    expect(runtimeHealthIndex).toBeLessThan(script.indexOf("await assertGoogleOAuthSmoke"));
    expect(runtimeHealthIndex).toBeLessThan(createGameIndex);
  });
});
