import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseDeployMetadataArgs,
  updateDeployMetadataEnvFile,
} from "../deploy-metadata-env.mjs";

async function withTempEnv(contents, callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "castles-deploy-env-"));
  const envFile = path.join(dir, "castles.env");
  await writeFile(envFile, contents, { encoding: "utf8", mode: 0o640 });
  try {
    return await callback(envFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("deploy metadata env updater", () => {
  it("updates existing BUILD_ID and GIT_COMMIT while preserving unrelated secrets", async () => {
    await withTempEnv(
      [
        "# Castles production env",
        "DATABASE_URL=postgresql://user:secret@localhost/castles",
        "BUILD_ID=old-build",
        "GIT_COMMIT=0123456789abcdef0123456789abcdef01234567",
        "GOOGLE_OAUTH_CLIENT_SECRET=do-not-print",
        "",
      ].join("\n"),
      async (envFile) => {
        const result = await updateDeployMetadataEnvFile({
          envFile,
          buildId: "20260606-013000",
          commit: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        });

        expect(result).toEqual({
          envFile,
          buildId: "20260606-013000",
          commit: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
          changedKeys: ["BUILD_ID", "GIT_COMMIT"],
        });
        expect(await readFile(envFile, "utf8")).toBe(
          [
            "# Castles production env",
            "DATABASE_URL=postgresql://user:secret@localhost/castles",
            "BUILD_ID=20260606-013000",
            "GIT_COMMIT=abcdefabcdefabcdefabcdefabcdefabcdefabcd",
            "GOOGLE_OAUTH_CLIENT_SECRET=do-not-print",
            "",
          ].join("\n")
        );
      }
    );
  });

  it("adds missing metadata keys and normalizes duplicates so stale values cannot win", async () => {
    await withTempEnv(
      [
        "NODE_ENV=production",
        "GIT_COMMIT=0123456789abcdef0123456789abcdef01234567",
        "GIT_COMMIT=9999999999999999999999999999999999999999",
      ].join("\n"),
      async (envFile) => {
        await updateDeployMetadataEnvFile({
          envFile,
          buildId: "20260606-013500",
          commit: "1111111111111111111111111111111111111111",
        });

        expect(await readFile(envFile, "utf8")).toBe(
          [
            "NODE_ENV=production",
            "GIT_COMMIT=1111111111111111111111111111111111111111",
            "BUILD_ID=20260606-013500",
            "",
          ].join("\n")
        );
      }
    );
  });

  it("preserves the env file mode when rewriting", async () => {
    await withTempEnv("BUILD_ID=old\nGIT_COMMIT=0123456789abcdef0123456789abcdef01234567\n", async (envFile) => {
      const originalMode = (await stat(envFile)).mode & 0o777;
      await updateDeployMetadataEnvFile({
        envFile,
        buildId: "20260606-013600",
        commit: "2222222222222222222222222222222222222222",
      });

      expect((await stat(envFile)).mode & 0o777).toBe(originalMode);
    });
  });

  it("validates CLI arguments before touching an env file", () => {
    expect(() => parseDeployMetadataArgs(["--env-file"])).toThrow(/--env-file requires/);
    expect(() => parseDeployMetadataArgs(["--build-id"])).toThrow(/--build-id requires/);
    expect(() => parseDeployMetadataArgs(["--commit"])).toThrow(/--commit requires/);
    expect(() =>
      parseDeployMetadataArgs([
        "--env-file",
        "castles.env",
        "--build-id",
        "20260606-013000",
        "--commit",
        "not-a-sha",
      ])
    ).toThrow(/40-character/);
    expect(
      parseDeployMetadataArgs([
        "--env-file",
        "castles.env",
        "--build-id",
        "20260606-013000",
        "--commit",
        "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      ])
    ).toEqual({
      envFile: "castles.env",
      buildId: "20260606-013000",
      commit: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });
    expect(
      parseDeployMetadataArgs([
        "castles.env",
        "20260606-013000",
        "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      ])
    ).toEqual({
      envFile: "castles.env",
      buildId: "20260606-013000",
      commit: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });
  });
});
