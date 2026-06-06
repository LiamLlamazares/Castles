import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readScript() {
  return readFileSync(resolve(process.cwd(), "scripts/deploy/check-local-postgres-challenge-smoke.mjs"), "utf8");
}

describe("local PostgreSQL challenge smoke script", () => {
  it("exercises registered account challenge creation, inbox, accept, and history through PostgreSQL", () => {
    const script = readScript();

    expect(script).toContain("PostgresOnlineAccountStore.js");
    expect(script).toContain("new PostgresOnlineAccountStore");
    expect(script).toMatch(/createOnlineHttpServer\(\{[\s\S]*accountStore,/);
    expect(script).toContain("/api/online/accounts");
    expect(script).toContain("/api/online/account/follows/");
    expect(script).toContain("challengedDisplayName");
    expect(script).toContain("/api/online/account/challenges?state=all");
    expect(script).toContain("/api/online/account/games?state=all");
  });
});
