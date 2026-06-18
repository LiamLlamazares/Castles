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

  it("allows either raced stale-action id to be the rejected response", () => {
    const script = readScript();

    expect(script).toContain("expectedStaleActionIds");
    expect(script).toContain('"browser-smoke-stale-first"');
    expect(script).toContain('"browser-smoke-stale-second"');
    expect(script).toMatch(/expectedStaleActionIds\.has\(rejected\.clientActionId\)/);
  });

  it("stores direct-create response tokens before tokenless browser navigation", () => {
    const script = readScript();

    expect(script).toContain("rememberDirectCreateJoinToken");
    expect(script).toContain('created.white.url.includes("token=")');
    expect(script).toContain('created.black.url.includes("token=")');
    expect(script).toMatch(
      /await rememberDirectCreateJoinToken\(white,\s*created\.gameId,\s*"w",\s*created\.white\.token\)/
    );
    expect(script).toMatch(
      /await rememberDirectCreateJoinToken\(black,\s*gameId,\s*"b",\s*blackToken\)/
    );
  });

  it("checks both direct-created player screens for legacy opponent invites", () => {
    const script = readScript();

    expect(script).toMatch(
      /assert\(\s*!\(await white\.hasButton\("Copy Opponent Invite"\)\)[\s\S]*White player should not see/
    );
    expect(script).toMatch(
      /assert\(\s*!\(await black\.hasButton\("Copy Opponent Invite"\)\)[\s\S]*Black player should not see/
    );
  });
});
