import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readScript() {
  return readFileSync(resolve(process.cwd(), "scripts/deploy/check-local-online-browser-smoke.mjs"), "utf8");
}

describe("local online browser smoke script", () => {
  it("waits long enough for the server drain shutdown path", () => {
    const script = readScript();

    expect(script).toContain("const shutdownTimeoutMs = 40_000");
    expect(script).toContain("const forcedKillTimeoutMs = 7_000");
    expect(script).toContain("sleep(shutdownTimeoutMs)");
    expect(script).toContain("sleep(forcedKillTimeoutMs)");
  });
});
