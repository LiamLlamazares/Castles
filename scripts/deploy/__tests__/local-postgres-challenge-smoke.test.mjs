import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readScript() {
  return readFileSync(resolve(process.cwd(), "scripts/deploy/check-local-postgres-challenge-smoke.mjs"), "utf8");
}

describe("local PostgreSQL challenge smoke script", () => {
  it("exercises registered account challenge creation, inbox, accept, history, and rejoin through PostgreSQL", () => {
    const script = readScript();

    expect(script).toContain("PostgresOnlineAccountStore.js");
    expect(script).toContain("new PostgresOnlineAccountStore");
    expect(script).toMatch(/createOnlineHttpServer\(\{[\s\S]*accountStore,/);
    expect(script).toContain("makeSmokeSetup");
    expect(script).toContain("appendGameSeatCredential");
    expect(script).toContain("/api/online/accounts");
    expect(script).toContain("/api/online/account/follows/");
    expect(script).toContain("challengedDisplayName");
    expect(script).toContain("/api/online/account/challenges?state=all");
    expect(script).toContain("/api/online/account/games?state=all");
    expect(script).toContain("/api/online/account/games/");
    expect(script).toContain("/rejoin");
    expect(script).toContain("Account rejoin");
  });

  it("cleans up accepted anonymous and account challenge games after verification", () => {
    const script = readScript();

    expect(script).toContain("cleanupChallengeGame");
    expect(script).toContain("local-challenge-smoke-cleanup");
    expect(script).toContain("local-account-challenge-smoke-cleanup");
    expect(script).toContain("RESIGN");
    expect(script).toContain("archiveState");
    expect(script).toMatch(/cleanupChallengeGame\([\s\S]*challengedToken[\s\S]*baseVersion:\s*0/);
    expect(script).toMatch(/cleanupChallengeGame\([\s\S]*accountAccepted\.gameInvite\.token[\s\S]*baseVersion:\s*0/);
  });
});
