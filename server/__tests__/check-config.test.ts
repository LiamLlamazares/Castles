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
  it("closes game, account, and startup-maintenance stores after successful checks", async () => {
    const closed: string[] = [];
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
        createStore: () => ({
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
          startupMaintenanceStore: {
            close: async () => {
              closed.push("startup");
            },
          },
        }),
      }
    );

    expect(report.onlineStore.replayedRooms).toBe(1);
    expect(closed).toEqual(["game", "account", "startup"]);
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
  });

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
  }, spawnTestTimeoutMs);

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
  }, spawnTestTimeoutMs);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("CASTLES_DEPLOYMENT_MODE=multi-instance is not supported");
    expect(result.stderr).not.toContain("ECONNREFUSED");
    expect(result.stdout).not.toContain("\"ok\": true");
  }, spawnTestTimeoutMs);
});
