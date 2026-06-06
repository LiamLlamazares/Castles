import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readScript() {
  return readFileSync(resolve(process.cwd(), "scripts/deploy/check-online-browser-smoke.mjs"), "utf8");
}

describe("production online browser smoke script", () => {
  it("ends the accepted challenge-flow game before reporting production healthy", () => {
    const script = readScript();

    expect(script).toContain("browser challenge flow cleanup resignation result");
    expect(script).toContain('challenged.clickButton("Resign")');
    expect(script).toContain("White wins by resignation");
    expect(script).toMatch(/fetchSpectatorSnapshot\(gameId\)[\s\S]*result\?\.winner === "w"/);
  });

  it("ends the stale-action helper game before reporting production healthy", () => {
    const script = readScript();

    expect(script).toContain("browser-smoke-stale-cleanup-resign");
    expect(script).toContain("created.black.token");
    expect(script).toContain("Stale-action cleanup");
    expect(script).toMatch(/RESIGN[\s\S]*baseVersion:\s*1/);
  });
});
