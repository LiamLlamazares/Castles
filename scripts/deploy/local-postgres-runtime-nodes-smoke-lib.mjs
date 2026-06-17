import path from "node:path";

const DEFAULT_RUNTIME_NODE_PREFIX = "local-runtime-smoke";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 20_000;
const DEFAULT_ADMIN_BEARER_TOKEN = "local-runtime-nodes-admin-token";

function parseBoundedInteger(value, label, { defaultValue, min, max }) {
  const raw = String(value ?? "").trim();
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

function parseNodePrefix(env) {
  if (!Object.prototype.hasOwnProperty.call(env, "SMOKE_RUNTIME_NODE_PREFIX")) {
    return DEFAULT_RUNTIME_NODE_PREFIX;
  }
  const prefix = String(env.SMOKE_RUNTIME_NODE_PREFIX ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(prefix)) {
    throw new Error(
      "SMOKE_RUNTIME_NODE_PREFIX must be 1-48 characters using only letters, numbers, underscores, or hyphens."
    );
  }
  return prefix;
}

export function parseLocalPostgresRuntimeNodesSmokeOptions(env = process.env) {
  const prefix = parseNodePrefix(env);
  const adminBearerToken =
    String(env.CASTLES_ADMIN_BEARER_TOKEN ?? "").trim() || DEFAULT_ADMIN_BEARER_TOKEN;
  return {
    adminBearerToken,
    nodeIds: [`${prefix}-a`, `${prefix}-b`],
    requestTimeoutMs: parseBoundedInteger(
      env.SMOKE_REQUEST_TIMEOUT_MS,
      "SMOKE_REQUEST_TIMEOUT_MS",
      {
        defaultValue: DEFAULT_REQUEST_TIMEOUT_MS,
        min: 1_000,
        max: 60_000,
      }
    ),
    startupTimeoutMs: parseBoundedInteger(
      env.SMOKE_STARTUP_TIMEOUT_MS,
      "SMOKE_STARTUP_TIMEOUT_MS",
      {
        defaultValue: DEFAULT_STARTUP_TIMEOUT_MS,
        min: 1_000,
        max: 120_000,
      }
    ),
  };
}

export function buildRuntimeNodeServerEnv({
  adminBearerToken,
  baseEnv = process.env,
  baseUrl,
  localShutdownToken,
  nodeId,
  port,
  repoRoot,
}) {
  const { CASTLES_DEPLOYMENT_MODE: _deploymentMode, ...inheritedEnv } = baseEnv;
  return {
    ...inheritedEnv,
    NODE_ENV: "test",
    PORT: String(port),
    PUBLIC_BASE_URL: baseUrl,
    ONLINE_STORE_BACKEND: "postgres",
    CASTLES_STATIC_DIR: path.join(repoRoot, "build"),
    CASTLES_ENABLE_LOCAL_SHUTDOWN: "1",
    CASTLES_LOCAL_SHUTDOWN_TOKEN: localShutdownToken,
    CASTLES_ADMIN_BEARER_TOKEN: adminBearerToken,
    CASTLES_NODE_ID: nodeId,
    BUILD_ID: "local-runtime-nodes-smoke",
    GIT_COMMIT: "local-runtime-nodes-smoke",
  };
}

export function summarizeLocalPostgresRuntimeNodesSmoke({
  accountRejoin,
  databaseRows,
  drainedNodeId,
  healthyNodeIds,
  nodeStatuses,
  rollingContinuation,
  spectatorFanout,
  timeoutFanout,
  visibilityPropagation,
}) {
  const summary = {
    schemaVersion: 1,
    nodeCount: nodeStatuses.length,
    databaseNodeCount: databaseRows.length,
    drainingNodeCount: databaseRows.filter((row) => row.draining).length,
    heartbeatReadyCount: nodeStatuses.filter((status) => status.heartbeatReady).length,
    persistedNodeCount: nodeStatuses.filter((status) => status.persistedNodePresent).length,
    drainedNodeId,
    healthyNodeIds,
  };
  if (accountRejoin) {
    summary.accountRejoin = accountRejoin;
  }
  if (rollingContinuation) {
    summary.rollingContinuation = rollingContinuation;
  }
  if (spectatorFanout) {
    summary.spectatorFanout = spectatorFanout;
  }
  if (visibilityPropagation) {
    summary.visibilityPropagation = visibilityPropagation;
  }
  if (timeoutFanout) {
    summary.timeoutFanout = timeoutFanout;
  }
  return summary;
}

export function formatLocalPostgresRuntimeNodesSmokeMetrics(summary) {
  const metrics = [
    "Local PostgreSQL runtime nodes smoke passed:",
    `nodes=${summary.nodeCount}`,
    `dbRows=${summary.databaseNodeCount}`,
    `draining=${summary.drainingNodeCount}`,
    `heartbeatReady=${summary.heartbeatReadyCount}`,
    `persistedNodes=${summary.persistedNodeCount}`,
    `drainedNode=${summary.drainedNodeId}`,
    `healthyNodes=${summary.healthyNodeIds.join(",")}`,
  ];
  if (summary.rollingContinuation) {
    metrics.push(
      `rollingContinuation=${summary.rollingContinuation.createdNodeId}->${summary.rollingContinuation.continuedNodeId}@v${summary.rollingContinuation.version}`
    );
  }
  if (summary.accountRejoin) {
    metrics.push(
      `accountRejoin=${summary.accountRejoin.createdNodeId}->${summary.accountRejoin.rejoinNodeId}@v${summary.accountRejoin.version}`
    );
  }
  if (summary.spectatorFanout) {
    metrics.push(
      `spectatorFanout=${summary.spectatorFanout.playerNodeId}->${summary.spectatorFanout.spectatorNodeId}@v${summary.spectatorFanout.version}`
    );
  }
  if (summary.visibilityPropagation) {
    metrics.push(
      `visibilityPropagation=${summary.visibilityPropagation.playerNodeId}->${summary.visibilityPropagation.peerNodeId}@${summary.visibilityPropagation.visibility}`
    );
  }
  if (summary.timeoutFanout) {
    metrics.push(
      `timeoutFanout=${summary.timeoutFanout.adjudicatingNodeId}->${summary.timeoutFanout.spectatorNodeId}@${summary.timeoutFanout.result}`
    );
  }
  return metrics.join(" ");
}

export function selectRuntimeNodesSmokeFailure(operationError, shutdownResults) {
  if (operationError) return operationError;
  const failedShutdown = shutdownResults.find((result) => result.status === "rejected");
  return failedShutdown?.status === "rejected" ? failedShutdown.reason : undefined;
}
