import { describe, expect, it } from "vitest";
import {
  buildProductionDeploySteps,
  buildRemoteProductionDeployScript,
  parseProductionDeployArgs,
  waitForProductionHealth,
} from "../deploy-production.mjs";

const COMMIT = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

describe("production deploy workflow", () => {
  it("parses production deploy args with safe defaults and explicit target metadata", () => {
    const args = parseProductionDeployArgs(
      ["--commit", COMMIT, "--build-id", "20260606-021000", "--ssh-target", "lukasz@contabo.ls314.xyz"],
      {}
    );

    expect(args).toMatchObject({
      baseUrl: "https://castles.ls314.xyz",
      branch: "online-action-log",
      commit: COMMIT,
      buildId: "20260606-021000",
      envFile: "/etc/castles/castles.env",
      localHealthUrl: "http://127.0.0.1:3000/api/health",
      repoDir: "/home/lukasz/Castles",
      service: "castles-node.service",
      sshHealthHost: "contabo.ls314.xyz",
      sshTarget: "lukasz@contabo.ls314.xyz",
      upstreamRemote: "origin",
    });
  });

  it("does not inherit generic smoke env vars as deploy targets", () => {
    const args = parseProductionDeployArgs(
      [],
      {
        BASE_URL: "http://127.0.0.1:3000",
        EXPECTED_COMMIT: COMMIT,
      },
      { now: new Date("2026-06-06T02:30:00Z") }
    );

    expect(args.baseUrl).toBe("https://castles.ls314.xyz");
    expect(args.commit).toBeUndefined();
    expect(args.buildId).toBe("20260606-023000");
  });

  it("builds a remote deploy script that backs up state, updates metadata, restarts, and waits for fresh health", () => {
    const script = buildRemoteProductionDeployScript({
      branch: "online-action-log",
      buildId: "20260606-021500",
      commit: COMMIT,
      envFile: "/etc/castles/castles.env",
      localHealthUrl: "http://127.0.0.1:3000/api/health",
      repoDir: "/home/lukasz/Castles",
      service: "castles-node.service",
      upstreamRemote: "origin",
      backupRoot: "/home/lukasz/deploy-backups",
      healthTimeoutSeconds: 45,
    });

    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("git status --porcelain");
    expect(script).toContain("git fetch --prune");
    expect(script).toContain("git checkout --detach");
    expect(script).toContain("scripts/deploy/postgres-online-backup.mjs");
    expect(script).toContain('scripts/deploy/postgres-online-backup.mjs --validate "$backup_dir/online-postgres.json"');
    expect(script).toContain("scripts/deploy/deploy-metadata-env.mjs");
    expect(script).toContain("npm run build");
    expect(script).toContain("npm run server:build");
    expect(script).toContain("systemctl restart");
    expect(script).toContain("http://127.0.0.1:3000/api/health");
    expect(script).toContain(COMMIT);
    expect(script).not.toContain("DATABASE_URL=");
    expect(script).not.toContain("GOOGLE_OAUTH_CLIENT_SECRET");
    expect(script.indexOf('sudo chown -R "$(id -u):$(id -g)" "$backup_dir"')).toBeLessThan(
      script.indexOf('scripts/deploy/postgres-online-backup.mjs --validate "$backup_dir/online-postgres.json"')
    );
    expect(script.indexOf('scripts/deploy/postgres-online-backup.mjs --validate "$backup_dir/online-postgres.json"')).toBeLessThan(
      script.indexOf("sha256sum > SHA256SUMS")
    );
    expect(script.indexOf('scripts/deploy/postgres-online-backup.mjs --validate "$backup_dir/online-postgres.json"')).toBeLessThan(
      script.indexOf('git checkout --detach "$expected_commit"')
    );
  });

  it("plans remote deploy, freshness, API smoke, and browser smoke in order", () => {
    const steps = buildProductionDeploySteps({
      baseUrl: "https://castles.ls314.xyz",
      branch: "online-action-log",
      buildId: "20260606-022000",
      commit: COMMIT,
      envFile: "/etc/castles/castles.env",
      localHealthUrl: "http://127.0.0.1:3000/api/health",
      repoDir: "/home/lukasz/Castles",
      service: "castles-node.service",
      sshHealthHost: "contabo.ls314.xyz",
      sshTarget: "lukasz@contabo.ls314.xyz",
      upstreamRemote: "origin",
      backupRoot: "/home/lukasz/deploy-backups",
      healthTimeoutSeconds: 45,
      skipBrowserSmoke: false,
      skipApiSmoke: false,
      skipFreshness: false,
    });

    expect(steps.map((step) => step.label)).toEqual([
      "remote deploy",
      "production freshness",
      "production API smoke",
      "production browser smoke",
    ]);
    expect(steps[0]).toMatchObject({
      command: "ssh",
      args: ["lukasz@contabo.ls314.xyz", "bash -s"],
    });
    expect(steps[1]).toMatchObject({
      command: "node",
      args: ["scripts/deploy/check-production-freshness.mjs", "https://castles.ls314.xyz", COMMIT, "contabo.ls314.xyz"],
    });
    expect(steps[2]).toMatchObject({
      command: "node",
      args: ["scripts/deploy/check-online-smoke.mjs", "https://castles.ls314.xyz", COMMIT],
    });
    expect(steps[3]).toMatchObject({
      command: "node",
      args: ["scripts/deploy/check-online-browser-smoke.mjs", "https://castles.ls314.xyz", COMMIT],
    });
  });

  it("waits for health to report the expected commit instead of trusting service active state", async () => {
    const attempts = [];
    const result = await waitForProductionHealth({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: COMMIT,
      intervalMs: 0,
      maxAttempts: 4,
      sleep: async () => {},
      fetchHealth: async () => {
        attempts.push(Date.now());
        return {
          ok: true,
          build: {
            commit: attempts.length < 3 ? "old-commit" : COMMIT,
          },
        };
      },
    });

    expect(result).toEqual({
      ok: true,
      attempts: 3,
      commit: COMMIT,
    });
  });

  it("fails health wait with the last observed commit when production stays stale", async () => {
    await expect(
      waitForProductionHealth({
        baseUrl: "https://castles.ls314.xyz",
        expectedCommit: COMMIT,
        intervalMs: 0,
        maxAttempts: 2,
        sleep: async () => {},
        fetchHealth: async () => ({
          ok: true,
          build: { commit: "old-commit" },
        }),
      })
    ).rejects.toThrow(/old-commit/);
  });
});
