import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readScript() {
  return readFileSync(resolve(process.cwd(), "scripts/deploy/check-local-online-restart-smoke.mjs"), "utf8");
}

describe("local restart smoke script", () => {
  it("ends the restarted smoke game after verifying persisted reload", () => {
    const script = readScript();

    expect(script).toContain("cleanupRestartSmokeGame");
    expect(script).toContain("restart-smoke-cleanup-resign");
    expect(script).toContain("created.black.token");
    expect(script).toContain("assertPersistedArchivedSummary");
    expect(script).toContain("online_game_summaries");
    expect(script).toContain("archive_state");
    expect(script).toContain("RESIGN");
    expect(script).toContain("White wins by resignation");
    expect(script).toMatch(/RESIGN[\s\S]*baseVersion:\s*1/);
    expect(script).toMatch(/fetchPersistedSnapshot[\s\S]*cleanupRestartSmokeGame/);
  });
});
