import { describe, expect, it } from "vitest";
import {
  checkProductionFreshness,
  normalizeProductionBaseUrl,
} from "../production-freshness.mjs";

function okHealth(commit = "expected-sha") {
  return {
    ok: true,
    build: {
      buildId: "20260605-120000",
      commit,
    },
    online: {
      eventSchemaVersion: 2,
      store: { ok: true, backend: "postgres" },
    },
  };
}

describe("production freshness diagnostics", () => {
  it("normalizes production base URLs without trailing slashes", () => {
    expect(normalizeProductionBaseUrl("https://castles.ls314.xyz/")).toBe("https://castles.ls314.xyz");
  });

  it("reports matching health and reachable SSH when both deploy channels are fresh", async () => {
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz/",
      expectedCommit: "expected-sha",
      sshHost: "ls314.xyz",
      fetchHealth: async () => okHealth("expected-sha"),
      checkTcpPort: async () => ({ ok: true }),
    });

    expect(result).toEqual({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      health: {
        ok: true,
        buildId: "20260605-120000",
        commit: "expected-sha",
        eventSchemaVersion: 2,
        storeBackend: "postgres",
      },
      commit: { status: "match" },
      ssh: { status: "reachable", host: "ls314.xyz", port: 22 },
      ok: true,
    });
  });

  it("keeps stale health and SSH reachability as separate diagnostics", async () => {
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      sshHost: "ls314.xyz",
      fetchHealth: async () => okHealth("old-sha"),
      checkTcpPort: async () => ({ ok: false, error: "connect timed out" }),
    });

    expect(result.ok).toBe(false);
    expect(result.commit).toEqual({
      status: "mismatch",
      expected: "expected-sha",
      actual: "old-sha",
    });
    expect(result.ssh).toEqual({
      status: "unreachable",
      host: "ls314.xyz",
      port: 22,
      error: "connect timed out",
    });
  });
});
