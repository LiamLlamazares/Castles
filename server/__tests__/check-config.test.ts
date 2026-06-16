import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkServerConfiguration } from "../check-config";

const scriptPath = "server/check-config.ts";
const tempDir = path.join(process.cwd(), ".tmp-check-config-tests");
const spawnTestTimeoutMs = 60_000;

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function runCheckConfig(extraEnv: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
      ONLINE_STORE_BACKEND: extraEnv.ONLINE_STORE_BACKEND ?? "postgres",
      DATABASE_URL:
        extraEnv.DATABASE_URL ??
        "postgresql://castles:secret@localhost:5432/castles",
      PUBLIC_BASE_URL: extraEnv.PUBLIC_BASE_URL ?? "http://127.0.0.1:3000",
    },
    encoding: "utf8",
  });
}

describe("server/check-config", () => {
  it("passes the runtime node id and closes every configured store after successful checks", async () => {
    const closed: string[] = [];
    let runtimeNodeId: string | undefined;
    const report = await checkServerConfiguration(
      {
        ONLINE_STORE_BACKEND: "postgres",
        DATABASE_URL: "postgresql://castles:secret@localhost:5432/castles",
        PUBLIC_BASE_URL: "http://127.0.0.1:3000",
        CASTLES_STATIC_DIR: process.cwd(),
        CASTLES_REQUIRE_STATIC_DIR: "0",
        CASTLES_NODE_ID: "node-a",
      },
      process.cwd(),
      {
        createStore: (_env, options) => {
          runtimeNodeId = options?.runtimeNodeId;
          return {
            backend: "postgres",
            healthStorePath: "postgres",
            postgresPoolMaxPerStore: 5,
            store: {
              checkReady: async () => true,
              load: async () => [{ gameId: "game_1" }],
              close: async () => {
                closed.push("game");
              },
            },
            accountStore: {
              checkReady: async () => true,
              close: async () => {
                closed.push("account");
              },
            },
            spectatorPresenceStore: {
              close: async () => {
                closed.push("spectator-presence");
              },
            },
            runtimeEventStore: {
              close: async () => {
                closed.push("runtime-event");
              },
            },
            operationGateStore: {
              close: async () => {
                closed.push("operation-gate");
              },
            },
            rateLimitStore: {
              close: async () => {
                closed.push("rate-limit");
              },
            },
            startupMaintenanceStore: {
              close: async () => {
                closed.push("startup");
              },
            },
          };
        },
      }
    );

    expect(report.onlineStore.replayedRooms).toBe(1);
    expect(report.onlineDeployment).toMatchObject({
      mode: "single-node",
      multiInstanceReady: false,
      websocketFanout: "process-local",
      spectatorPresence: "postgres-live-presence",
      roomState: "process-local",
      routing: "single-node",
    });
    expect(runtimeNodeId).toBe("node-a");
    expect(closed).toEqual([
      "game",
      "account",
      "spectator-presence",
      "runtime-event",
      "operation-gate",
      "rate-limit",
      "startup",
    ]);
  });

  it("fails when the store readiness check fails", () => {
    const result = runCheckConfig({
      DATABASE_URL: "postgresql://castles:secret@127.0.0.1:1/castles",
      CASTLES_STATIC_DIR: process.cwd(),
      CASTLES_REQUIRE_STATIC_DIR: "0",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Castles server configuration check failed");
    expect(result.stdout).not.toContain("\"ok\": true");
  }, spawnTestTimeoutMs);

  it("can load an env file without sourcing it through a shell", () => {
    mkdirSync(tempDir, { recursive: true });
    const envFile = path.join(tempDir, "castles.env");
    writeFileSync(
      envFile,
      [
        "ONLINE_STORE_BACKEND=postgres",
        "DATABASE_URL=postgresql://castles:p%40%24%26%3B%23@127.0.0.1:1/castles",
        "PUBLIC_BASE_URL=https://castles.example/path",
      ].join("\n"),
      "utf8"
    );

    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", scriptPath, "--env-file", envFile],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("PUBLIC_BASE_URL");
    expect(result.stderr).not.toContain("p%40%24%26%3B%23");
  });

  it("rejects partial Google OAuth credentials without printing secrets", () => {
    const result = runCheckConfig({
      GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "",
      CASTLES_STATIC_DIR: process.cwd(),
      CASTLES_REQUIRE_STATIC_DIR: "0",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set together");
    expect(result.stderr).not.toContain("google-client-id");
  }, spawnTestTimeoutMs);

  it("rejects malformed admin bearer tokens without printing the token", () => {
    const result = runCheckConfig({
      CASTLES_ADMIN_BEARER_TOKEN: "short-secret",
      CASTLES_STATIC_DIR: process.cwd(),
      CASTLES_REQUIRE_STATIC_DIR: "0",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("CASTLES_ADMIN_BEARER_TOKEN");
    expect(result.stderr).not.toContain("short-secret");
  }, spawnTestTimeoutMs);

  it("rejects multi-instance deployment mode before store readiness checks", () => {
    const result = runCheckConfig({
      CASTLES_DEPLOYMENT_MODE: "multi-instance",
      DATABASE_URL: "postgresql://castles:secret@127.0.0.1:1/castles",
      CASTLES_STATIC_DIR: process.cwd(),
      CASTLES_REQUIRE_STATIC_DIR: "0",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("CASTLES_DEPLOYMENT_MODE=multi-instance is not supported");
    expect(result.stderr).not.toContain("ECONNREFUSED");
    expect(result.stdout).not.toContain("\"ok\": true");
  }, spawnTestTimeoutMs);
});
