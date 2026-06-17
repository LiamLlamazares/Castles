import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_SSH_TIMEOUT_MS = 10_000;
const DEFAULT_BASE_URL = "https://castles.ls314.xyz";
const DEFAULT_SSH_TARGET = "lukasz@contabo.ls314.xyz";
const execFileAsync = promisify(execFile);

export function normalizeProductionBaseUrl(baseUrl) {
  const value = String(baseUrl ?? "").trim();
  if (!value) throw new Error("Production base URL is required.");
  return value.replace(/\/+$/, "");
}

export function extractSshHostname(sshTarget) {
  const withoutUser = String(sshTarget ?? "").split("@").pop() ?? "";
  const withoutPort = withoutUser.replace(/^\[/, "").replace(/\](:\d+)?$/, "").split(":")[0];
  return withoutPort || undefined;
}

export async function fetchProductionHealth(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizeProductionBaseUrl(baseUrl)}/api/health`, {
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`Health returned HTTP ${response.status}.`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export function checkTcpPort(host, port = 22, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SSH_TIMEOUT_MS;
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, error: `connect timed out after ${timeoutMs}ms` }));
    socket.once("error", (error) => finish({ ok: false, error: error.message }));
  });
}

async function gitOutput(args, options = {}) {
  const result = await execFileAsync("git", args, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? 5_000,
    windowsHide: true,
  });
  return result.stdout.trim();
}

export async function getCurrentGitCommit(options = {}) {
  return gitOutput(["rev-parse", "HEAD"], options);
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value ?? "").trim() !== "");
}

export async function resolveProductionFreshnessCliOptions(argv = [], env = process.env, dependencies = {}) {
  const baseUrl = firstNonEmpty(argv[0], env.BASE_URL, DEFAULT_BASE_URL);
  const expectedCommit =
    firstNonEmpty(argv[1], env.EXPECTED_COMMIT) ??
    (await (dependencies.getCurrentGitCommit ?? getCurrentGitCommit)({
      cwd: dependencies.gitCwd,
      timeoutMs: dependencies.gitTimeoutMs,
    }));
  const sshHost =
    firstNonEmpty(argv[2], env.DEPLOY_SSH_HOST) ??
    extractSshHostname(firstNonEmpty(env.DEPLOY_SSH_TARGET, DEFAULT_SSH_TARGET));
  return {
    baseUrl,
    expectedCommit,
    sshHost,
    sshPort: Number(firstNonEmpty(env.DEPLOY_SSH_PORT, 22)),
    sshTimeoutMs: Number(firstNonEmpty(env.DEPLOY_SSH_TIMEOUT_MS, DEFAULT_SSH_TIMEOUT_MS)),
    includeGitStatus: true,
  };
}

async function gitExitCode(args, options = {}) {
  try {
    await gitOutput(args, options);
    return 0;
  } catch (error) {
    if (typeof error.code === "number") return error.code;
    throw error;
  }
}

async function getProductionCommitStatus(productionCommit, upstreamRef, options = {}) {
  const commit = String(productionCommit ?? "").trim();
  if (!commit) return undefined;
  try {
    const ancestorExitCode = await gitExitCode(["merge-base", "--is-ancestor", commit, upstreamRef], options);
    if (ancestorExitCode === 0) {
      const commitsBehindText = await gitOutput(["rev-list", "--count", `${commit}..${upstreamRef}`], options);
      const commitsBehindUpstream = Number.parseInt(commitsBehindText, 10);
      return {
        status: "upstream_ancestor",
        commit,
        commitsBehindUpstream: Number.isFinite(commitsBehindUpstream) ? commitsBehindUpstream : undefined,
      };
    }
    if (ancestorExitCode === 1) {
      return {
        status: "not_upstream_ancestor",
        commit,
      };
    }
    return {
      status: "unavailable",
      commit,
      error: `git merge-base returned exit code ${ancestorExitCode}`,
    };
  } catch (error) {
    return {
      status: "unavailable",
      commit,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getGitDeployStatus(expectedCommit, options = {}) {
  if (!expectedCommit) return { status: "not_checked" };
  try {
    const branch = await gitOutput(["branch", "--show-current"], options);
    const headCommit = await gitOutput(["rev-parse", "HEAD"], options);
    let upstream;
    let upstreamCommit;
    try {
      upstream = await gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], options);
      upstreamCommit = await gitOutput(["rev-parse", "@{u}"], options);
    } catch {
      return {
        status: "no_upstream",
        branch: branch || "detached",
        headCommit,
      };
    }

    const containsExitCode = await gitExitCode(["merge-base", "--is-ancestor", expectedCommit, "@{u}"], options);
    if (containsExitCode !== 0 && containsExitCode !== 1) {
      return {
        status: "unavailable",
        error: `git merge-base returned exit code ${containsExitCode}`,
      };
    }
    const status = {
      status: containsExitCode === 0 ? "upstream_contains_expected" : "upstream_missing_expected",
      branch: branch || "detached",
      headCommit,
      upstream,
      upstreamCommit,
    };
    const productionCommit = await getProductionCommitStatus(options.deployedCommit, "@{u}", options);
    if (productionCommit) status.productionCommit = productionCommit;
    return status;
  } catch (error) {
    return {
      status: "unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function checkProductionFreshness(options) {
  const baseUrl = normalizeProductionBaseUrl(options.baseUrl);
  const expectedCommit = options.expectedCommit;
  const healthBody = await (options.fetchHealth ?? fetchProductionHealth)(baseUrl);
  const runtime = projectProductionRuntimeHealth(healthBody?.online?.runtime);
  const health = {
    ok: healthBody?.ok === true,
    buildId: healthBody?.build?.buildId,
    commit: healthBody?.build?.commit,
    eventSchemaVersion: healthBody?.online?.eventSchemaVersion,
    deployment: healthBody?.online?.deployment,
    storeBackend: healthBody?.online?.store?.backend,
    ...(runtime ? { runtime } : {}),
  };
  const commit = expectedCommit
    ? health.commit === expectedCommit
      ? { status: "match" }
      : { status: "mismatch", expected: expectedCommit, actual: health.commit }
    : { status: "not_checked" };

  let ssh = { status: "not_checked" };
  if (options.sshHost) {
    const port = options.sshPort ?? 22;
    const result = await (options.checkTcpPort ?? checkTcpPort)(options.sshHost, port, {
      timeoutMs: options.sshTimeoutMs,
    });
    ssh = result.ok
      ? { status: "reachable", host: options.sshHost, port }
      : { status: "unreachable", host: options.sshHost, port, error: result.error ?? "connection failed" };
  }

  const git =
    expectedCommit && (options.getGitDeployStatus || options.includeGitStatus)
      ? await (options.getGitDeployStatus ?? getGitDeployStatus)(expectedCommit, {
          cwd: options.gitCwd,
          timeoutMs: options.gitTimeoutMs,
          deployedCommit: health.commit,
        })
      : undefined;

  const result = {
    baseUrl,
    expectedCommit,
    health,
    commit,
    ssh,
    ok:
      health.ok === true &&
      isSupportedDeploymentHealth(health.deployment) &&
      health.storeBackend === "postgres" &&
      commit.status !== "mismatch" &&
      ssh.status !== "unreachable",
  };
  if (git) result.git = git;
  return result;
}

function isSingleNodeDeploymentHealth(deployment) {
  return (
    deployment?.mode === "single-node" &&
    deployment?.multiInstanceReady === false &&
    deployment?.websocketFanout === "process-local" &&
    deployment?.spectatorPresence === "postgres-live-presence" &&
    deployment?.accountPresence === "session-store" &&
    deployment?.roomState === "process-local" &&
    deployment?.queueGuards === "process-local" &&
    deployment?.routing === "single-node"
  );
}

function isMultiInstanceDeploymentHealth(deployment) {
  return (
    deployment?.mode === "multi-instance" &&
    deployment?.multiInstanceReady === true &&
    deployment?.websocketFanout === "postgres-runtime-events" &&
    deployment?.spectatorPresence === "postgres-live-presence" &&
    deployment?.accountPresence === "session-store" &&
    deployment?.roomState === "store-authoritative-warm-cache" &&
    deployment?.queueGuards === "postgres-locks-and-store-transactions" &&
    deployment?.routing === "multi-node"
  );
}

function isSupportedDeploymentHealth(deployment) {
  return isSingleNodeDeploymentHealth(deployment) || isMultiInstanceDeploymentHealth(deployment);
}

function projectBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function projectNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function projectString(value) {
  return typeof value === "string" ? value : undefined;
}

function projectRuntimeReadiness(value) {
  if (!value || typeof value !== "object") return undefined;
  const projected = {};
  const ok = projectBoolean(value.ok);
  const error = projectString(value.error);
  if (ok !== undefined) projected.ok = ok;
  if (error !== undefined) projected.error = error;
  return Object.keys(projected).length > 0 ? projected : undefined;
}

function projectRuntimeLastResult(value) {
  if (!value || typeof value !== "object") return undefined;
  const afterId = projectNonNegativeInteger(value.afterId);
  const published = projectNonNegativeInteger(value.published);
  const scanned = projectNonNegativeInteger(value.scanned);
  const applied = projectNonNegativeInteger(value.applied);
  const projected = {};
  if (afterId !== undefined) projected.afterId = afterId;
  if (published !== undefined) projected.published = published;
  if (scanned !== undefined) projected.scanned = scanned;
  if (applied !== undefined) projected.applied = applied;
  return Object.keys(projected).length > 0 ? projected : undefined;
}

function projectRuntimeSchedulerStatus(value, timestampFields) {
  if (!value || typeof value !== "object") return undefined;
  const projected = {};
  const running = projectBoolean(value.running);
  const ready = projectBoolean(value.ready);
  const consecutiveFailures = projectNonNegativeInteger(value.consecutiveFailures);
  if (running !== undefined) projected.running = running;
  if (ready !== undefined) projected.ready = ready;
  if (consecutiveFailures !== undefined) projected.consecutiveFailures = consecutiveFailures;
  for (const field of timestampFields) {
    const timestamp = projectString(value[field]);
    if (timestamp !== undefined) projected[field] = timestamp;
  }
  const lastResult = projectRuntimeLastResult(value.lastResult);
  if (lastResult) projected.lastResult = lastResult;
  return Object.keys(projected).length > 0 ? projected : undefined;
}

function projectProductionRuntimeHealth(runtime) {
  if (!runtime || typeof runtime !== "object") return undefined;
  const readiness = projectRuntimeReadiness(runtime.readiness);
  const eventPolling = projectRuntimeSchedulerStatus(runtime.eventPolling, [
    "lastPollAt",
    "lastSuccessAt",
    "lastFailureAt",
  ]);
  const nodeHeartbeat = projectRuntimeSchedulerStatus(runtime.nodeHeartbeat, [
    "lastHeartbeatAt",
    "lastSuccessAt",
    "lastFailureAt",
  ]);
  const projected = {};
  if (readiness) projected.readiness = readiness;
  if (eventPolling) projected.eventPolling = eventPolling;
  if (nodeHeartbeat) projected.nodeHeartbeat = nodeHeartbeat;
  return Object.keys(projected).length > 0 ? projected : undefined;
}

function runtimeConsecutiveFailures(status) {
  return Number.isSafeInteger(status?.consecutiveFailures) ? status.consecutiveFailures : 0;
}

export function classifyProductionFreshnessAlerts(result) {
  const alerts = [];
  if (result.health?.ok !== true) {
    alerts.push({
      code: "health_not_ok",
      severity: "critical",
      message: "/api/health did not report ok=true.",
      action: "Check systemd status, recent service logs, and server:check-config before rerunning smoke.",
    });
  }
  if (result.commit?.status === "mismatch") {
    alerts.push({
      code: "stale_deploy",
      severity: "critical",
      message: `Production health reported ${result.commit.actual ?? "unknown"} instead of ${result.commit.expected}.`,
      action: "Verify the reviewed commit is pushed, rerun the deploy freshness gate, and inspect restart metadata.",
    });
  }
  if (result.health?.storeBackend !== "postgres") {
    alerts.push({
      code: "store_not_postgres",
      severity: "critical",
      message: `Production health reported store=${result.health?.storeBackend ?? "unknown"} instead of postgres.`,
      action: "Fix ONLINE_STORE_BACKEND/DATABASE_URL and rerun server:check-config before accepting the deploy.",
    });
  }
  if (!isSupportedDeploymentHealth(result.health?.deployment)) {
    alerts.push({
      code: "deployment_not_supported",
      severity: "critical",
      message: "Production health did not report supported deployment metadata.",
      action:
        "Use single-node guardrails or CASTLES_DEPLOYMENT_MODE=multi-instance with the full PostgreSQL runtime stack before accepting the deploy.",
    });
  }
  if (result.ssh?.status === "unreachable") {
    alerts.push({
      code: "ssh_unreachable",
      severity: "warning",
      message: `SSH reachability failed for ${result.ssh.host}:${result.ssh.port}.`,
      action: "Confirm the deploy SSH host, DNS, firewall, and server availability before treating app health alone as sufficient.",
    });
  }
  const runtime = projectProductionRuntimeHealth(result.health?.runtime);
  if (runtime?.eventPolling?.ready === false) {
    alerts.push({
      code: "runtime_event_polling_not_ready",
      severity: "critical",
      message: "Production runtime event polling is not ready.",
      action: "Check runtime event polling logs, PostgreSQL connectivity, and runtime-event table health before accepting the deploy.",
    });
  } else if (
    runtime?.eventPolling?.ready === true &&
    runtimeConsecutiveFailures(runtime.eventPolling) > 0
  ) {
    alerts.push({
      code: "runtime_event_polling_degraded",
      severity: "warning",
      message: `Production runtime event polling has ${runtime.eventPolling.consecutiveFailures} consecutive failure(s).`,
      action: "Inspect recent runtime poll logs and rerun monitoring before public load increases.",
    });
  }
  if (runtime?.nodeHeartbeat?.ready === false) {
    alerts.push({
      code: "runtime_node_heartbeat_not_ready",
      severity: "critical",
      message: "Production runtime-node heartbeat is not ready.",
      action: "Check runtime-node heartbeat logs, PostgreSQL connectivity, and online_runtime_nodes writes before accepting the deploy.",
    });
  } else if (
    runtime?.nodeHeartbeat?.ready === true &&
    runtimeConsecutiveFailures(runtime.nodeHeartbeat) > 0
  ) {
    alerts.push({
      code: "runtime_node_heartbeat_degraded",
      severity: "warning",
      message: `Production runtime-node heartbeat has ${runtime.nodeHeartbeat.consecutiveFailures} consecutive failure(s).`,
      action: "Inspect heartbeat logs and verify the current node row is updating before public load increases.",
    });
  }
  return alerts;
}

const MONITORING_SEVERITY_RANK = {
  none: 0,
  warning: 1,
  critical: 2,
};

function highestAlertSeverity(alerts) {
  let severity = "none";
  for (const alert of alerts) {
    if ((MONITORING_SEVERITY_RANK[alert.severity] ?? 0) > MONITORING_SEVERITY_RANK[severity]) {
      severity = alert.severity;
    }
  }
  return severity;
}

function monitoringSummary(alerts) {
  if (alerts.length === 0) return "Castles production checks are healthy.";
  const codes = alerts.map((alert) => alert.code).join(", ");
  return `Castles production has ${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"}: ${codes}.`;
}

export function createProductionMonitoringSnapshot(result, options = {}) {
  const alerts = classifyProductionFreshnessAlerts(result);
  const severity = highestAlertSeverity(alerts);
  const runtime = projectProductionRuntimeHealth(result.health?.runtime);
  const { runtime: _rawRuntime, ...healthWithoutRuntime } = result.health ?? {};
  const health = {
    ...healthWithoutRuntime,
    ...(runtime ? { runtime } : {}),
  };
  return {
    schemaVersion: 1,
    service: options.service ?? "castles-online",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    baseUrl: result.baseUrl,
    ok: alerts.length === 0 && result.ok === true,
    severity,
    pager: {
      shouldPage: severity === "critical",
      shouldWarn: severity !== "none",
      route: severity === "critical" ? "page" : severity === "warning" ? "warn" : "none",
      summary: monitoringSummary(alerts),
    },
    alerts,
    checks: {
      health,
      commit: result.commit,
      ssh: result.ssh,
      ...(result.git ? { git: result.git } : {}),
    },
  };
}

export function createProductionMonitoringFailureSnapshot({
  baseUrl,
  generatedAt = new Date().toISOString(),
  message,
  service = "castles-online",
} = {}) {
  const normalizedBaseUrl = (() => {
    try {
      return normalizeProductionBaseUrl(baseUrl);
    } catch {
      return String(baseUrl ?? "unknown");
    }
  })();
  const alert = {
    code: "health_not_ok",
    severity: "critical",
    message: `Production monitoring could not complete health checks: ${message ?? "unknown error"}.`,
    action: "Check DNS/connectivity, production /api/health, systemd status, and service logs before rerunning smoke.",
  };
  return {
    schemaVersion: 1,
    service,
    generatedAt,
    baseUrl: normalizedBaseUrl,
    ok: false,
    severity: "critical",
    pager: {
      shouldPage: true,
      shouldWarn: true,
      route: "page",
      summary: "Castles production monitoring could not complete health checks.",
    },
    alerts: [alert],
    checks: {
      health: {
        ok: false,
        error: message ?? "unknown error",
      },
      commit: { status: "not_checked" },
      ssh: { status: "not_checked" },
    },
  };
}

export function productionMonitoringExitCode(snapshot) {
  if (snapshot.severity === "critical") return 2;
  if (snapshot.severity === "warning") return 1;
  return 0;
}

export function formatProductionFreshnessResult(result) {
  const lines = [
    `Production: ${result.baseUrl}`,
    `Health: ok=${result.health.ok} buildId=${result.health.buildId ?? "unknown"} commit=${
      result.health.commit ?? "unknown"
    } store=${result.health.storeBackend ?? "unknown"} deployment=${
      result.health.deployment?.mode ?? "unknown"
    } schema=${result.health.eventSchemaVersion ?? "unknown"}`,
  ];
  const runtime = projectProductionRuntimeHealth(result.health.runtime);
  if (runtime) {
    const eventPolling = runtime.eventPolling;
    const nodeHeartbeat = runtime.nodeHeartbeat;
    lines.push(
      `Runtime: readiness=${runtime.readiness?.ok ?? "unknown"} eventPollingReady=${
        eventPolling?.ready ?? "unknown"
      } eventPollingFailures=${eventPolling?.consecutiveFailures ?? "unknown"} nodeHeartbeatReady=${
        nodeHeartbeat?.ready ?? "unknown"
      } nodeHeartbeatFailures=${nodeHeartbeat?.consecutiveFailures ?? "unknown"}`,
    );
  }
  if (result.commit.status === "match") {
    lines.push(`Commit: match ${result.expectedCommit}`);
  } else if (result.commit.status === "mismatch") {
    lines.push(`Commit: mismatch expected=${result.commit.expected} actual=${result.commit.actual ?? "unknown"}`);
  } else {
    lines.push("Commit: not checked");
  }
  if (result.ssh.status === "reachable") {
    lines.push(`SSH: reachable ${result.ssh.host}:${result.ssh.port}`);
  } else if (result.ssh.status === "unreachable") {
    lines.push(`SSH: unreachable ${result.ssh.host}:${result.ssh.port} (${result.ssh.error})`);
  } else {
    lines.push("SSH: not checked");
  }
  if (result.git) {
    if (result.git.status === "upstream_contains_expected") {
      lines.push(
        `Git: expected commit is present on upstream ${result.git.upstream} (branch=${result.git.branch} head=${result.git.headCommit} upstreamCommit=${result.git.upstreamCommit})`,
      );
    } else if (result.git.status === "upstream_missing_expected") {
      lines.push(
        `Git: expected commit is not present on upstream ${result.git.upstream} (branch=${result.git.branch} head=${result.git.headCommit} upstreamCommit=${result.git.upstreamCommit})`,
      );
    } else if (result.git.status === "no_upstream") {
      lines.push(`Git: no tracked upstream for branch ${result.git.branch} (head=${result.git.headCommit})`);
    } else if (result.git.status === "unavailable") {
      lines.push(`Git: unavailable (${result.git.error})`);
    } else {
      lines.push("Git: not checked");
    }
    if (result.git.productionCommit?.status === "upstream_ancestor") {
      const count = result.git.productionCommit.commitsBehindUpstream;
      const behindText =
        typeof count === "number" ? `${count} ${count === 1 ? "commit" : "commits"}` : "an unknown number of commits";
      lines.push(
        `Git: production health commit ${result.git.productionCommit.commit} is ${behindText} behind upstream ${result.git.upstream}.`,
      );
    } else if (result.git.productionCommit?.status === "not_upstream_ancestor") {
      lines.push(
        `Git: production health commit ${result.git.productionCommit.commit} is not an ancestor of upstream ${result.git.upstream}.`,
      );
    } else if (result.git.productionCommit?.status === "unavailable") {
      lines.push(
        `Git: production health commit ${result.git.productionCommit.commit} could not be compared with upstream (${result.git.productionCommit.error}).`,
      );
    }
  }
  if (result.commit.status === "mismatch" && result.git?.status === "upstream_contains_expected") {
    const productionCommit = result.git.productionCommit;
    const behindText =
      productionCommit?.status === "upstream_ancestor" && typeof productionCommit.commitsBehindUpstream === "number"
        ? ` (${productionCommit.commitsBehindUpstream} ${
            productionCommit.commitsBehindUpstream === 1 ? "commit" : "commits"
          } behind upstream)`
        : "";
    lines.push(
      `Diagnosis: expected commit is pushed to the tracked upstream, but production health is still serving ${
        result.commit.actual ?? "unknown"
      }${behindText}.`,
    );
  } else if (result.commit.status === "mismatch" && result.git?.status === "upstream_missing_expected") {
    lines.push("Diagnosis: expected commit is not on the tracked upstream; check push target or branch selection.");
  }
  const alerts = classifyProductionFreshnessAlerts(result);
  if (alerts.length === 0) {
    lines.push("Alerts: none");
  } else {
    for (const alert of alerts) {
      lines.push(`Alert: ${alert.code} severity=${alert.severity} ${alert.message} Action: ${alert.action}`);
    }
  }
  lines.push(`Freshness: ${result.ok ? "ok" : "failed"}`);
  return lines.join("\n");
}
