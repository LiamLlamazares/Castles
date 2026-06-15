import { describe, expect, it } from "vitest";
import {
  checkProductionFreshness,
  createProductionMonitoringFailureSnapshot,
  classifyProductionFreshnessAlerts,
  createProductionMonitoringSnapshot,
  formatProductionFreshnessResult,
  normalizeProductionBaseUrl,
  productionMonitoringExitCode,
  resolveProductionFreshnessCliOptions,
} from "../production-freshness.mjs";

const SINGLE_NODE_DEPLOYMENT = {
  mode: "single-node",
  multiInstanceReady: false,
  websocketFanout: "process-local",
  spectatorPresence: "process-local",
  accountPresence: "session-store",
  roomState: "process-local",
  queueGuards: "process-local",
  routing: "single-node",
};

function okHealth(commit = "expected-sha") {
  return {
    ok: true,
    build: {
      buildId: "20260605-120000",
      commit,
    },
    online: {
      eventSchemaVersion: 2,
      deployment: SINGLE_NODE_DEPLOYMENT,
      store: { ok: true, backend: "postgres" },
    },
  };
}

describe("production freshness diagnostics", () => {
  it("normalizes production base URLs without trailing slashes", () => {
    expect(normalizeProductionBaseUrl("https://castles.ls314.xyz/")).toBe("https://castles.ls314.xyz");
  });

  it("defaults the CLI diagnostic to local HEAD and the production deploy SSH host", async () => {
    expect(resolveProductionFreshnessCliOptions).toEqual(expect.any(Function));

    const options = await resolveProductionFreshnessCliOptions(
      [],
      {},
      {
        getCurrentGitCommit: async () => "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      },
    );

    expect(options).toMatchObject({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      sshHost: "contabo.ls314.xyz",
      sshPort: 22,
      sshTimeoutMs: 10_000,
      includeGitStatus: true,
    });
  });

  it("ignores empty freshness environment overrides instead of silently unpinning the check", async () => {
    const options = await resolveProductionFreshnessCliOptions(
      [],
      {
        BASE_URL: "",
        EXPECTED_COMMIT: "",
        DEPLOY_SSH_HOST: "",
        DEPLOY_SSH_PORT: "",
        DEPLOY_SSH_TIMEOUT_MS: "",
        DEPLOY_SSH_TARGET: "",
      },
      {
        getCurrentGitCommit: async () => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    );

    expect(options).toMatchObject({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sshHost: "contabo.ls314.xyz",
      sshPort: 22,
      sshTimeoutMs: 10_000,
    });
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
        deployment: SINGLE_NODE_DEPLOYMENT,
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

  it("reports when the production health commit is behind the tracked upstream", async () => {
    let gitOptions;
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      fetchHealth: async () => okHealth("old-sha"),
      getGitDeployStatus: async (_expectedCommit, options) => {
        gitOptions = options;
        return {
          status: "upstream_contains_expected",
          branch: "online-action-log",
          headCommit: "expected-sha",
          upstream: "origin/online-action-log",
          upstreamCommit: "expected-sha",
          productionCommit: {
            status: "upstream_ancestor",
            commit: "old-sha",
            commitsBehindUpstream: 34,
          },
        };
      },
    });

    expect(gitOptions.deployedCommit).toBe("old-sha");
    expect(formatProductionFreshnessResult(result)).toContain(
      "Git: production health commit old-sha is 34 commits behind upstream origin/online-action-log.",
    );
    expect(formatProductionFreshnessResult(result)).toContain(
      "Diagnosis: expected commit is pushed to the tracked upstream, but production health is still serving old-sha (34 commits behind upstream).",
    );
  });

  it("classifies a healthy fresh deployment with no operator alerts", async () => {
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      sshHost: "ls314.xyz",
      fetchHealth: async () => okHealth("expected-sha"),
      checkTcpPort: async () => ({ ok: true }),
    });

    expect(classifyProductionFreshnessAlerts(result)).toEqual([]);
    expect(formatProductionFreshnessResult(result)).toContain("Alerts: none");
  });

  it("classifies missing or unsafe deployment metadata as a production readiness alert", async () => {
    const missingMetadata = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      fetchHealth: async () => ({
        ...okHealth("expected-sha"),
        online: {
          eventSchemaVersion: 2,
          store: { ok: true, backend: "postgres" },
        },
      }),
    });
    const unsafeMode = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      fetchHealth: async () => ({
        ...okHealth("expected-sha"),
        online: {
          eventSchemaVersion: 2,
          deployment: {
            ...SINGLE_NODE_DEPLOYMENT,
            mode: "multi-instance",
            multiInstanceReady: true,
          },
          store: { ok: true, backend: "postgres" },
        },
      }),
    });

    expect(missingMetadata.ok).toBe(false);
    expect(unsafeMode.ok).toBe(false);
    expect(classifyProductionFreshnessAlerts(missingMetadata)).toEqual([
      expect.objectContaining({ code: "deployment_not_single_node", severity: "critical" }),
    ]);
    expect(classifyProductionFreshnessAlerts(unsafeMode)).toEqual([
      expect.objectContaining({ code: "deployment_not_single_node", severity: "critical" }),
    ]);
    expect(formatProductionFreshnessResult(missingMetadata)).toContain(
      "Alert: deployment_not_single_node severity=critical"
    );
  });

  it("classifies stale deploys, unhealthy health, and SSH reachability as separate operator alerts", async () => {
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      sshHost: "ls314.xyz",
      fetchHealth: async () => ({
        ...okHealth("old-sha"),
        ok: false,
      }),
      checkTcpPort: async () => ({ ok: false, error: "connect timed out" }),
    });

    expect(classifyProductionFreshnessAlerts(result)).toEqual([
      expect.objectContaining({ code: "health_not_ok", severity: "critical" }),
      expect.objectContaining({ code: "stale_deploy", severity: "critical" }),
      expect.objectContaining({ code: "ssh_unreachable", severity: "warning" }),
    ]);
    expect(formatProductionFreshnessResult(result)).toContain("Alert: health_not_ok severity=critical");
    expect(formatProductionFreshnessResult(result)).toContain("Alert: stale_deploy severity=critical");
    expect(formatProductionFreshnessResult(result)).toContain("Alert: ssh_unreachable severity=warning");
  });

  it("classifies a non-PostgreSQL health store as a production readiness alert", async () => {
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      fetchHealth: async () => ({
        ...okHealth("expected-sha"),
        online: {
          eventSchemaVersion: 2,
          deployment: SINGLE_NODE_DEPLOYMENT,
          store: { ok: true, backend: "memory" },
        },
      }),
    });

    expect(result.ok).toBe(false);
    expect(classifyProductionFreshnessAlerts(result)).toEqual([
      expect.objectContaining({ code: "store_not_postgres", severity: "critical" }),
    ]);
    expect(formatProductionFreshnessResult(result)).toContain("Alert: store_not_postgres severity=critical");
  });

  it("creates a machine-readable monitoring snapshot for pager routing", async () => {
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      sshHost: "contabo.ls314.xyz",
      fetchHealth: async () => okHealth("old-sha"),
      checkTcpPort: async () => ({ ok: false, error: "connect timed out" }),
      getGitDeployStatus: async () => ({
        status: "upstream_contains_expected",
        branch: "online-action-log",
        headCommit: "expected-sha",
        upstream: "origin/online-action-log",
        upstreamCommit: "expected-sha",
      }),
    });

    const snapshot = createProductionMonitoringSnapshot(result, {
      generatedAt: "2026-06-15T18:00:00.000Z",
      service: "castles-online-test",
    });

    expect(snapshot).toEqual({
      schemaVersion: 1,
      service: "castles-online-test",
      generatedAt: "2026-06-15T18:00:00.000Z",
      baseUrl: "https://castles.ls314.xyz",
      ok: false,
      severity: "critical",
      pager: {
        shouldPage: true,
        shouldWarn: true,
        route: "page",
        summary: "Castles production has 2 alerts: stale_deploy, ssh_unreachable.",
      },
      alerts: [
        expect.objectContaining({ code: "stale_deploy", severity: "critical" }),
        expect.objectContaining({ code: "ssh_unreachable", severity: "warning" }),
      ],
      checks: {
        health: {
          ok: true,
          buildId: "20260605-120000",
          commit: "old-sha",
          eventSchemaVersion: 2,
          deployment: SINGLE_NODE_DEPLOYMENT,
          storeBackend: "postgres",
        },
        commit: { status: "mismatch", expected: "expected-sha", actual: "old-sha" },
        ssh: {
          status: "unreachable",
          host: "contabo.ls314.xyz",
          port: 22,
          error: "connect timed out",
        },
        git: {
          status: "upstream_contains_expected",
          branch: "online-action-log",
          headCommit: "expected-sha",
          upstream: "origin/online-action-log",
          upstreamCommit: "expected-sha",
        },
      },
    });
    expect(productionMonitoringExitCode(snapshot)).toBe(2);
  });

  it("keeps warning-only monitoring snapshots below the pager threshold", async () => {
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      sshHost: "contabo.ls314.xyz",
      fetchHealth: async () => okHealth("expected-sha"),
      checkTcpPort: async () => ({ ok: false, error: "connect timed out" }),
    });

    const snapshot = createProductionMonitoringSnapshot(result, {
      generatedAt: "2026-06-15T18:05:00.000Z",
    });

    expect(snapshot.severity).toBe("warning");
    expect(snapshot.pager).toMatchObject({
      shouldPage: false,
      shouldWarn: true,
      route: "warn",
    });
    expect(productionMonitoringExitCode(snapshot)).toBe(1);
  });

  it("keeps healthy monitoring snapshots quiet", async () => {
    const result = await checkProductionFreshness({
      baseUrl: "https://castles.ls314.xyz",
      expectedCommit: "expected-sha",
      sshHost: "contabo.ls314.xyz",
      fetchHealth: async () => okHealth("expected-sha"),
      checkTcpPort: async () => ({ ok: true }),
    });

    const snapshot = createProductionMonitoringSnapshot(result, {
      generatedAt: "2026-06-15T18:10:00.000Z",
    });

    expect(snapshot).toMatchObject({
      ok: true,
      severity: "none",
      pager: {
        shouldPage: false,
        shouldWarn: false,
        route: "none",
        summary: "Castles production checks are healthy.",
      },
      alerts: [],
    });
    expect(productionMonitoringExitCode(snapshot)).toBe(0);
  });

  it("creates a critical monitoring snapshot for pre-result health failures", () => {
    const snapshot = createProductionMonitoringFailureSnapshot({
      baseUrl: "https://castles.ls314.xyz/",
      generatedAt: "2026-06-15T18:15:00.000Z",
      message: "Health returned HTTP 502.",
    });

    expect(snapshot).toEqual({
      schemaVersion: 1,
      service: "castles-online",
      generatedAt: "2026-06-15T18:15:00.000Z",
      baseUrl: "https://castles.ls314.xyz",
      ok: false,
      severity: "critical",
      pager: {
        shouldPage: true,
        shouldWarn: true,
        route: "page",
        summary: "Castles production monitoring could not complete health checks.",
      },
      alerts: [
        {
          code: "health_not_ok",
          severity: "critical",
          message: "Production monitoring could not complete health checks: Health returned HTTP 502..",
          action: "Check DNS/connectivity, production /api/health, systemd status, and service logs before rerunning smoke.",
        },
      ],
      checks: {
        health: {
          ok: false,
          error: "Health returned HTTP 502.",
        },
        commit: { status: "not_checked" },
        ssh: { status: "not_checked" },
      },
    });
    expect(productionMonitoringExitCode(snapshot)).toBe(2);
  });
});
