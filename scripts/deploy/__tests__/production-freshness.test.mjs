import { describe, expect, it } from "vitest";
import {
  checkProductionFreshness,
  formatProductionFreshnessResult,
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

  it("reports whether the expected commit is already on the upstream branch", async () => {
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      fetchHealth: async () => okHealth("old-sha"),
      getGitDeployStatus: async () => ({
        status: "upstream_contains_expected",
        branch: "online-action-log",
        headCommit: "expected-sha",
        upstream: "origin/online-action-log",
        upstreamCommit: "expected-sha",
      }),
    });

    expect(result.git).toEqual({
      status: "upstream_contains_expected",
      branch: "online-action-log",
      headCommit: "expected-sha",
      upstream: "origin/online-action-log",
      upstreamCommit: "expected-sha",
    });
    expect(formatProductionFreshnessResult(result)).toContain(
      "Git: expected commit is present on upstream origin/online-action-log (branch=online-action-log head=expected-sha upstreamCommit=expected-sha)",
    );
    expect(formatProductionFreshnessResult(result)).toContain(
      "Diagnosis: expected commit is pushed to the tracked upstream, but production health is still serving old-sha.",
    );
  });
});
