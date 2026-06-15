import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runProductionMonitoringCommand } from "../check-production-monitoring.mjs";

function okResult() {
  return {
    baseUrl: "https://castles.ls314.xyz",
    expectedCommit: "expected-sha",
    health: {
      ok: true,
      buildId: "20260615-180000",
      commit: "expected-sha",
      eventSchemaVersion: 2,
      storeBackend: "postgres",
    },
    commit: { status: "match" },
    ssh: { status: "reachable", host: "contabo.ls314.xyz", port: 22 },
    ok: true,
  };
}

describe("production monitoring script", () => {
  it("is exposed as a non-mutating npm command", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.scripts["online:monitor:production"]).toBe(
      "node scripts/deploy/check-production-monitoring.mjs"
    );
  });

  it("prints a JSON monitoring snapshot and exits healthy for fresh production", async () => {
    let stdout = "";
    let stderr = "";
    const exitCode = await runProductionMonitoringCommand({
      argv: ["https://castles.ls314.xyz", "expected-sha", "contabo.ls314.xyz"],
      now: () => new Date("2026-06-15T18:20:00.000Z"),
      resolveOptions: async () => ({ baseUrl: "https://castles.ls314.xyz", expectedCommit: "expected-sha" }),
      checkFreshness: async () => okResult(),
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: (text) => {
        stderr += text;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-06-15T18:20:00.000Z",
      ok: true,
      severity: "none",
      pager: { route: "none" },
      alerts: [],
    });
  });

  it("prints a JSON monitoring snapshot and exits critical for stale production", async () => {
    let stdout = "";
    const exitCode = await runProductionMonitoringCommand({
      argv: ["https://castles.ls314.xyz", "expected-sha", "contabo.ls314.xyz"],
      now: () => new Date("2026-06-15T18:21:00.000Z"),
      resolveOptions: async () => ({ baseUrl: "https://castles.ls314.xyz", expectedCommit: "expected-sha" }),
      checkFreshness: async () => ({
        ...okResult(),
        commit: { status: "mismatch", expected: "expected-sha", actual: "old-sha" },
        ok: false,
      }),
      writeStdout: (text) => {
        stdout += text;
      },
    });

    const snapshot = JSON.parse(stdout);
    expect(exitCode).toBe(2);
    expect(snapshot).toMatchObject({
      ok: false,
      severity: "critical",
      pager: { route: "page", shouldPage: true },
    });
    expect(snapshot.alerts.map((alert) => alert.code)).toEqual(["stale_deploy"]);
  });

  it("prints JSON and exits critical when checks fail before a freshness result exists", async () => {
    let stdout = "";
    let stderr = "";
    const exitCode = await runProductionMonitoringCommand({
      argv: ["https://castles.ls314.xyz", "expected-sha", "contabo.ls314.xyz"],
      now: () => new Date("2026-06-15T18:22:00.000Z"),
      resolveOptions: async () => ({ baseUrl: "https://castles.ls314.xyz", expectedCommit: "expected-sha" }),
      checkFreshness: async () => {
        throw new Error("Health returned HTTP 502.");
      },
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: (text) => {
        stderr += text;
      },
    });

    const snapshot = JSON.parse(stdout);
    expect(exitCode).toBe(2);
    expect(stderr).toBe("Production monitoring failed before completing checks: Health returned HTTP 502.\n");
    expect(snapshot).toMatchObject({
      ok: false,
      severity: "critical",
      pager: { route: "page", shouldPage: true },
      checks: {
        health: {
          ok: false,
          error: "Health returned HTTP 502.",
        },
        commit: { status: "not_checked" },
        ssh: { status: "not_checked" },
      },
    });
    expect(snapshot.alerts).toEqual([
      expect.objectContaining({
        code: "health_not_ok",
        severity: "critical",
      }),
    ]);
  });
});
