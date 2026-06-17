#!/usr/bin/env node
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { checkLocalPostgresPrereqs } from "./local-postgres-prereqs.mjs";
import {
  assert,
  assertProtocolVersionedBody,
  createFetchWithTimeout,
  readJson,
} from "./online-smoke-lib.mjs";
import {
  buildRuntimeNodeServerEnv,
  formatLocalPostgresRuntimeNodesSmokeMetrics,
  parseLocalPostgresRuntimeNodesSmokeOptions,
  selectRuntimeNodesSmokeFailure,
  summarizeLocalPostgresRuntimeNodesSmoke,
} from "./local-postgres-runtime-nodes-smoke-lib.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const serverEntry = path.join(repoRoot, "server-build", "server", "index.js");
const localShutdownToken = `local-runtime-nodes-${randomBytes(12).toString("base64url")}`;

async function requireLocalInputs() {
  await checkLocalPostgresPrereqs({
    repoRoot,
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a local port."));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function findFreePorts(count) {
  const ports = [];
  for (let index = 0; index < count; index += 1) {
    ports.push(await findFreePort());
  }
  return ports;
}

function startServer({ adminBearerToken, nodeId, port }) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = buildRuntimeNodeServerEnv({
    adminBearerToken,
    baseEnv: process.env,
    baseUrl,
    localShutdownToken,
    nodeId,
    port,
    repoRoot,
  });
  assert(env.CASTLES_NODE_ID === nodeId, `CASTLES_NODE_ID was not set for ${nodeId}.`);
  assert(
    env.CASTLES_DEPLOYMENT_MODE === undefined,
    "Local runtime-node smoke must not enable CASTLES_DEPLOYMENT_MODE=multi-instance."
  );

  const child = spawn(process.execPath, [serverEntry], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const appendLog = (data) => {
    logs = (logs + data.toString("utf8")).slice(-8_000);
  };
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);

  return {
    baseUrl,
    child,
    nodeId,
    getLogs: () => logs,
  };
}

async function stopServer(serverProcess, fetchWithTimeout) {
  const { baseUrl, child, getLogs } = serverProcess;
  if (child.exitCode !== null || child.signalCode !== null) return;

  const exitPromise = new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal }))
  );
  try {
    const response = await fetchWithTimeout(`${baseUrl}/__local/shutdown`, {
      method: "POST",
      headers: {
        "x-castles-local-shutdown-token": localShutdownToken,
      },
    });
    assert(
      response.status === 202,
      `Local shutdown endpoint failed with ${response.status}: ${await response.text()}`
    );
  } catch (error) {
    child.kill("SIGKILL");
    await exitPromise;
    throw error;
  }

  const exited = await Promise.race([
    exitPromise,
    sleep(40_000).then(() => false),
  ]);
  if (exited === false && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exitPromise;
    throw new Error(`Server did not exit after local shutdown request.\n${getLogs()}`);
  }

  if (child.exitCode !== 0) {
    throw new Error(
      `Server exited with code ${child.exitCode} during graceful shutdown.\n${getLogs()}`
    );
  }
  if (child.signalCode) {
    throw new Error(
      `Server exited from signal ${child.signalCode} during graceful shutdown.\n${getLogs()}`
    );
  }
}

async function waitForHealth(serverProcess, { expectOk = true, fetchWithTimeout, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (serverProcess.child.exitCode !== null) {
      throw new Error(
        `Server ${serverProcess.nodeId} exited before health matched with code ${serverProcess.child.exitCode}.\n${serverProcess.getLogs()}`
      );
    }

    try {
      const response = await fetchWithTimeout(`${serverProcess.baseUrl}/api/health`);
      const body = await readJson(response);
      const matches =
        expectOk
          ? response.status === 200 && body.ok === true
          : response.status === 503 && body.ok === false;
      if (matches) {
        assert(body.online?.eventSchemaVersion === 2, "Health did not report event schema v2.");
        assert(
          body.online?.store?.backend === "postgres",
          `Expected postgres health backend, got ${body.online?.store?.backend}.`
        );
        assert(
          body.online?.runtime?.nodeHeartbeat?.ready === true,
          "Runtime node heartbeat was not ready."
        );
        return body;
      }
      lastError = new Error(`Health returned ${response.status} ok=${body.ok}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `Server ${serverProcess.nodeId} health did not match expected ok=${expectOk} after ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${serverProcess.getLogs()}`
  );
}

async function readRuntimeStatus(serverProcess, { adminBearerToken, fetchWithTimeout }) {
  const response = await fetchWithTimeout(
    `${serverProcess.baseUrl}/api/online/admin/runtime/status`,
    {
      headers: { authorization: `Bearer ${adminBearerToken}` },
    }
  );
  const body = await readJson(response);
  assert(response.status === 200, `Runtime status failed with ${response.status}.`);
  assertProtocolVersionedBody(body, "Runtime status response");
  return body.runtime;
}

async function waitForRuntimeStatus(serverProcess, options) {
  const deadline = Date.now() + options.timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const runtime = await readRuntimeStatus(serverProcess, options);
      if (
        runtime?.nodeId === serverProcess.nodeId &&
        runtime.node?.nodeId === serverProcess.nodeId &&
        runtime.nodeHeartbeat?.ready === true &&
        runtime.nodeHeartbeat?.lastSuccessAt
      ) {
        return runtime;
      }
      lastError = new Error(`Runtime status for ${serverProcess.nodeId} was not ready.`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `Runtime status did not become ready for ${serverProcess.nodeId}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${serverProcess.getLogs()}`
  );
}

async function startDrain(serverProcess, { adminBearerToken, fetchWithTimeout }) {
  const response = await fetchWithTimeout(
    `${serverProcess.baseUrl}/api/online/admin/runtime/drain`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${adminBearerToken}` },
    }
  );
  const body = await readJson(response);
  assert(response.status === 200, `Runtime drain failed with ${response.status}.`);
  assertProtocolVersionedBody(body, "Runtime drain response");
  assert(body.runtime?.draining === true, "Runtime drain response did not report draining=true.");
  return body.runtime;
}

async function loadRuntimeNodeRows(nodeIds) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(
      `
        SELECT node_id, draining
        FROM online_runtime_nodes
        WHERE node_id = ANY($1::text[])
        ORDER BY node_id
      `,
      [nodeIds]
    );
    return result.rows.map((row) => ({
      nodeId: row.node_id,
      draining: row.draining,
    }));
  } finally {
    await client.end();
  }
}

async function main() {
  await requireLocalInputs();
  const options = parseLocalPostgresRuntimeNodesSmokeOptions();
  const fetchWithTimeout = createFetchWithTimeout(options.requestTimeoutMs);
  const ports = await findFreePorts(options.nodeIds.length);
  const servers = options.nodeIds.map((nodeId, index) =>
    startServer({
      adminBearerToken: options.adminBearerToken,
      nodeId,
      port: ports[index],
    })
  );
  let operationError;

  try {
    await Promise.all(
      servers.map((serverProcess) =>
        waitForHealth(serverProcess, {
          expectOk: true,
          fetchWithTimeout,
          timeoutMs: options.startupTimeoutMs,
        })
      )
    );
    const nodeStatuses = await Promise.all(
      servers.map(async (serverProcess) => {
        const runtime = await waitForRuntimeStatus(serverProcess, {
          adminBearerToken: options.adminBearerToken,
          fetchWithTimeout,
          timeoutMs: options.startupTimeoutMs,
        });
        assert(runtime.draining === false, `${serverProcess.nodeId} started in draining state.`);
        return {
          nodeId: serverProcess.nodeId,
          heartbeatReady: runtime.nodeHeartbeat?.ready === true,
          persistedNodePresent: runtime.node?.nodeId === serverProcess.nodeId,
        };
      })
    );

    const firstRows = await loadRuntimeNodeRows(options.nodeIds);
    assert(
      firstRows.length === options.nodeIds.length,
      `Expected ${options.nodeIds.length} online_runtime_nodes rows, got ${firstRows.length}.`
    );

    const drainedRuntime = await startDrain(servers[0], {
      adminBearerToken: options.adminBearerToken,
      fetchWithTimeout,
    });
    assert(
      drainedRuntime.nodeId === options.nodeIds[0],
      `Drain applied to ${drainedRuntime.nodeId}, expected ${options.nodeIds[0]}.`
    );

    const [drainedHealth, healthyHealth] = await Promise.all([
      waitForHealth(servers[0], {
        expectOk: false,
        fetchWithTimeout,
        timeoutMs: options.startupTimeoutMs,
      }),
      waitForHealth(servers[1], {
        expectOk: true,
        fetchWithTimeout,
        timeoutMs: options.startupTimeoutMs,
      }),
    ]);
    assert(
      drainedHealth.online?.runtime?.draining === true,
      "Drained node health did not report runtime.draining=true."
    );
    assert(
      healthyHealth.online?.runtime?.draining === false,
      "Peer node health incorrectly reported runtime.draining=true."
    );

    const databaseRows = await loadRuntimeNodeRows(options.nodeIds);
    assert(
      databaseRows.some((row) => row.nodeId === options.nodeIds[0] && row.draining === true),
      "Database runtime node row did not record the drained node."
    );
    assert(
      databaseRows.some((row) => row.nodeId === options.nodeIds[1] && row.draining === false),
      "Database runtime node row did not preserve the peer node as healthy."
    );

    console.log(
      formatLocalPostgresRuntimeNodesSmokeMetrics(
        summarizeLocalPostgresRuntimeNodesSmoke({
          nodeStatuses,
          databaseRows,
          drainedNodeId: options.nodeIds[0],
          healthyNodeIds: [options.nodeIds[1]],
        })
      )
    );
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    const shutdownResults = await Promise.allSettled(
      servers.map((serverProcess) => stopServer(serverProcess, fetchWithTimeout))
    );
    const finalFailure = selectRuntimeNodesSmokeFailure(operationError, shutdownResults);
    if (finalFailure && !operationError) {
      throw finalFailure;
    }
    if (operationError) {
      for (const result of shutdownResults) {
        if (result.status === "rejected") {
          console.error("Server shutdown also failed after runtime-nodes smoke failure", result.reason);
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
