import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRuntimeNodeServerEnv,
  formatLocalPostgresRuntimeNodesSmokeMetrics,
  parseLocalPostgresRuntimeNodesSmokeOptions,
  selectRuntimeNodesSmokeFailure,
  summarizeLocalPostgresRuntimeNodesSmoke,
} from "../local-postgres-runtime-nodes-smoke-lib.mjs";

describe("local PostgreSQL runtime-nodes smoke helpers", () => {
  it("defaults to two stable local runtime node ids and bounded timeouts", () => {
    expect(parseLocalPostgresRuntimeNodesSmokeOptions({})).toEqual({
      adminBearerToken: "local-runtime-nodes-admin-token",
      nodeIds: [
        "local-runtime-smoke-a",
        "local-runtime-smoke-b",
      ],
      requestTimeoutMs: 15_000,
      startupTimeoutMs: 20_000,
    });
  });

  it("accepts a safe explicit runtime node prefix", () => {
    expect(
      parseLocalPostgresRuntimeNodesSmokeOptions({
        SMOKE_RUNTIME_NODE_PREFIX: "rehearsal_2026",
      }).nodeIds
    ).toEqual(["rehearsal_2026-a", "rehearsal_2026-b"]);
  });

  it("rejects unsafe runtime node prefixes", () => {
    for (const value of ["", "node a", "https://node-a", "x".repeat(49)]) {
      expect(() =>
        parseLocalPostgresRuntimeNodesSmokeOptions({
          SMOKE_RUNTIME_NODE_PREFIX: value,
        })
      ).toThrow(/SMOKE_RUNTIME_NODE_PREFIX/);
    }
  });

  it("builds per-node server env without enabling multi-instance deployment mode", () => {
    const repoRoot = path.resolve("test-repo");
    const env = buildRuntimeNodeServerEnv({
      adminBearerToken: "local-runtime-nodes-admin-token",
      baseEnv: {
        CASTLES_DEPLOYMENT_MODE: "multi-instance",
        DATABASE_URL: "postgresql://castles_local:secret@localhost:5432/castles_local",
      },
      baseUrl: "http://127.0.0.1:4100",
      localShutdownToken: "local-shutdown-token",
      nodeId: "local-runtime-smoke-a",
      port: 4100,
      repoRoot,
    });

    expect(env).toMatchObject({
      CASTLES_ADMIN_BEARER_TOKEN: "local-runtime-nodes-admin-token",
      CASTLES_ENABLE_LOCAL_SHUTDOWN: "1",
      CASTLES_LOCAL_SHUTDOWN_TOKEN: "local-shutdown-token",
      CASTLES_NODE_ID: "local-runtime-smoke-a",
      CASTLES_STATIC_DIR: path.join(repoRoot, "build"),
      DATABASE_URL: "postgresql://castles_local:secret@localhost:5432/castles_local",
      NODE_ENV: "test",
      ONLINE_STORE_BACKEND: "postgres",
      PORT: "4100",
      PUBLIC_BASE_URL: "http://127.0.0.1:4100",
    });
    expect(env.CASTLES_DEPLOYMENT_MODE).toBeUndefined();
  });

  it("summarizes and formats runtime-node metrics without secrets", () => {
    const summary = summarizeLocalPostgresRuntimeNodesSmoke({
      databaseRows: [
        { nodeId: "local-runtime-smoke-a", draining: true },
        { nodeId: "local-runtime-smoke-b", draining: false },
      ],
      drainedNodeId: "local-runtime-smoke-a",
      healthyNodeIds: ["local-runtime-smoke-b"],
      nodeStatuses: [
        {
          nodeId: "local-runtime-smoke-a",
          heartbeatReady: true,
          persistedNodePresent: true,
        },
        {
          nodeId: "local-runtime-smoke-b",
          heartbeatReady: true,
          persistedNodePresent: true,
        },
      ],
    });

    expect(summary).toEqual({
      schemaVersion: 1,
      nodeCount: 2,
      databaseNodeCount: 2,
      drainingNodeCount: 1,
      heartbeatReadyCount: 2,
      persistedNodeCount: 2,
      drainedNodeId: "local-runtime-smoke-a",
      healthyNodeIds: ["local-runtime-smoke-b"],
    });

    const formatted = formatLocalPostgresRuntimeNodesSmokeMetrics(summary);
    expect(formatted).toContain("nodes=2");
    expect(formatted).toContain("dbRows=2");
    expect(formatted).toContain("draining=1");
    expect(formatted).toContain("heartbeatReady=2");
    expect(formatted).not.toMatch(/postgresql:\/\/|DATABASE_URL|Bearer|token|secret/i);
  });

  it("preserves the operation error when shutdown also fails", () => {
    const operationError = new Error("runtime status did not become ready");
    const shutdownError = new Error("local shutdown connection refused");

    expect(
      selectRuntimeNodesSmokeFailure(operationError, [
        { status: "fulfilled", value: undefined },
        { status: "rejected", reason: shutdownError },
      ])
    ).toBe(operationError);
    expect(selectRuntimeNodesSmokeFailure(undefined, [
      { status: "rejected", reason: shutdownError },
    ])).toBe(shutdownError);
    expect(selectRuntimeNodesSmokeFailure(undefined, [
      { status: "fulfilled", value: undefined },
    ])).toBeUndefined();
  });
});

describe("local PostgreSQL runtime-nodes smoke script", () => {
  it("is exposed as a dedicated npm script", async () => {
    const packageJson = JSON.parse(
      await readFile(path.resolve(process.cwd(), "package.json"), "utf8")
    );

    expect(packageJson.scripts["online:smoke:local:runtime-nodes"]).toBe(
      "node scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs"
    );
  });

  it("exercises built-server runtime-node status, drain, and PostgreSQL rows", async () => {
    const script = await readFile(
      path.resolve(process.cwd(), "scripts/deploy/check-local-postgres-runtime-nodes-smoke.mjs"),
      "utf8"
    );

    expect(script).toContain("CASTLES_NODE_ID");
    expect(script).toContain("/api/online/admin/runtime/status");
    expect(script).toContain("/api/online/admin/runtime/drain");
    expect(script).toContain("online_runtime_nodes");
    expect(script).toContain("/__local/shutdown");
    expect(script).toContain("checkLocalPostgresPrereqs");
    expect(script).not.toMatch(/CASTLES_DEPLOYMENT_MODE\s*[:=]\s*["']multi-instance["']/);
  });
});
