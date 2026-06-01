import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = "server/check-config.ts";
const tempDir = path.join(process.cwd(), ".tmp-check-config-tests");

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
});
