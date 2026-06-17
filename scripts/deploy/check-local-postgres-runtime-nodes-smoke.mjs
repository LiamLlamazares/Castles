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
  assertDefaultOnlineClock,
  assertProtocolVersionedBody,
  buildWebSocketUrl,
  createFetchWithTimeout,
  createWebSocketWaiters,
  makeSmokeSetup,
  readJson,
  versionedSocketMessage,
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

async function submitActionThroughNode(
  serverProcess,
  { action, clientActionId, gameId, nextSocketMessage, token, waitForSocketOpen, WebSocket }
) {
  const socket = new WebSocket(buildWebSocketUrl(serverProcess.baseUrl));
  try {
    const joined = nextSocketMessage(socket, `${serverProcess.nodeId} ${clientActionId} join response`);
    await waitForSocketOpen(socket);
    socket.send(
      JSON.stringify(versionedSocketMessage({
        type: "join",
        gameId,
        token,
      }))
    );
    const joinedMessage = await joined;
    assertProtocolVersionedBody(joinedMessage, `${serverProcess.nodeId} join response`);
    assert(joinedMessage.type === "joined", `${serverProcess.nodeId} did not join game ${gameId}.`);

    const actionResponse = nextSocketMessage(
      socket,
      `${serverProcess.nodeId} ${clientActionId} action response`
    );
    socket.send(
      JSON.stringify(versionedSocketMessage({
        type: "action",
        clientActionId,
        action,
      }))
    );
    const actionMessage = await actionResponse;
    assertProtocolVersionedBody(actionMessage, `${serverProcess.nodeId} action response`);
    assert(
      actionMessage.type === "snapshot",
      `${serverProcess.nodeId} action was not accepted: ${JSON.stringify(actionMessage.error ?? actionMessage)}`
    );
    return actionMessage.snapshot;
  } finally {
    socket.close();
  }
}

function closeSmokeSocket(socket) {
  if (!socket || socket.readyState === 3) return Promise.resolve();
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      if (socket.readyState !== 3 && typeof socket.terminate === "function") {
        socket.terminate();
      }
      resolve();
    }, 1_000);
    socket.once("close", () => {
      clearTimeout(timeoutId);
      resolve();
    });
    socket.close();
  });
}

async function createSmokeGameOnNode(serverProcess, helpers, description) {
  const createResponse = await helpers.fetchWithTimeout(`${serverProcess.baseUrl}/api/online/games`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup: makeSmokeSetup() }),
  });
  const created = await readJson(createResponse);
  assert(
    createResponse.status === 201,
    `${description} game create failed with ${createResponse.status}.`
  );
  assert(
    createResponse.headers.get("cache-control")?.includes("no-store"),
    `${description} create response was not no-store.`
  );
  assert(created.gameId, `${description} create did not return a game id.`);
  assert(created.white?.token, `${description} create did not return a white token.`);
  assert(created.black?.token, `${description} create did not return a black token.`);
  return created;
}

async function setGameVisibility(serverProcess, { fetchWithTimeout, gameId, token, visibility }) {
  const visibilityResponse = await fetchWithTimeout(
    `${serverProcess.baseUrl}/api/online/games/${encodeURIComponent(gameId)}/visibility`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ visibility }),
    }
  );
  const visibilityBody = await readJson(visibilityResponse);
  assert(
    visibilityResponse.status === 200,
    `Setting game visibility to ${visibility} failed with ${visibilityResponse.status}.`
  );
  assertProtocolVersionedBody(visibilityBody, "Game visibility response");
  assert(
    visibilityBody.summary?.visibility === visibility,
    `Visibility response returned ${visibilityBody.summary?.visibility}, expected ${visibility}.`
  );
  return visibilityBody.summary;
}

async function makeGamePublic(serverProcess, { fetchWithTimeout, gameId, token }) {
  return setGameVisibility(serverProcess, {
    fetchWithTimeout,
    gameId,
    token,
    visibility: "public",
  });
}

async function expectPublicSummaryStatus(
  serverProcess,
  { description, expectedStatus, fetchWithTimeout, gameId }
) {
  const response = await fetchWithTimeout(
    `${serverProcess.baseUrl}/api/online/games/${encodeURIComponent(gameId)}/summary`
  );
  const body = await readJson(response);
  assert(
    response.status === expectedStatus,
    `${description} returned ${response.status}, expected ${expectedStatus}.`
  );
  if (expectedStatus !== 200) return null;
  assert(
    body.summary?.gameId === gameId,
    `${description} returned summary for ${body.summary?.gameId ?? "<missing>"}.`
  );
  return body.summary;
}

async function fetchPublicSummary(serverProcess, { fetchWithTimeout, gameId }) {
  return expectPublicSummaryStatus(serverProcess, {
    description: "Public game summary",
    expectedStatus: 200,
    fetchWithTimeout,
    gameId,
  });
}

async function fetchSpectatorSnapshot(serverProcess, { expectedVersion, fetchWithTimeout, gameId }) {
  const response = await fetchWithTimeout(
    `${serverProcess.baseUrl}/api/online/games/${encodeURIComponent(gameId)}/spectator`
  );
  const body = await readJson(response);
  assert(response.status === 200, `Spectator snapshot fetch failed with ${response.status}.`);
  assertProtocolVersionedBody(body, "Spectator snapshot response");
  assert(body.role === "spectator", "Spectator snapshot response did not report spectator role.");
  assert(
    body.snapshot?.version === expectedVersion,
    `Spectator snapshot returned version ${body.snapshot?.version}, expected ${expectedVersion}.`
  );
  assertDefaultOnlineClock(body.snapshot, "Spectator snapshot");
  return body.snapshot;
}

async function fetchPlayerSnapshot(serverProcess, { expectedVersion, fetchWithTimeout, gameId, token }) {
  const response = await fetchWithTimeout(
    `${serverProcess.baseUrl}/api/online/games/${encodeURIComponent(gameId)}`,
    {
      headers: { authorization: `Bearer ${token}` },
    }
  );
  const body = await readJson(response);
  assert(response.status === 200, `Player snapshot fetch failed with ${response.status}.`);
  assertProtocolVersionedBody(body, "Player snapshot response");
  assert(body.color === "w" || body.color === "b", "Player snapshot response did not include a player color.");
  assert(
    body.snapshot?.version === expectedVersion,
    `Player snapshot returned version ${body.snapshot?.version}, expected ${expectedVersion}.`
  );
  assertDefaultOnlineClock(body.snapshot, "Player snapshot");
  return body.snapshot;
}

async function agePersistedCreationClockForTimeout(gameId) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(
      `
        SELECT payload
        FROM online_game_events
        WHERE game_id = $1 AND event_type = 'game_created'
      `,
      [gameId]
    );
    assert(result.rows.length === 1, `Expected one creation event for timeout smoke game ${gameId}.`);
    const payload = result.rows[0].payload;
    const activeColor = payload?.clock?.activeColor;
    assert(activeColor === "w" || activeColor === "b", "Timeout smoke creation event has no active clock color.");
    const remainingMs = payload?.clock?.remainingMs?.[activeColor];
    assert(
      Number.isSafeInteger(remainingMs) && remainingMs > 0,
      `Timeout smoke creation event has invalid ${activeColor} remaining time.`
    );

    const agedPayload = {
      ...payload,
      clock: {
        ...payload.clock,
        runningSince: Date.now() - remainingMs - 1_000,
      },
    };
    const updated = await client.query(
      `
        UPDATE online_game_events
        SET payload = $2::jsonb
        WHERE game_id = $1 AND event_type = 'game_created'
      `,
      [gameId, agedPayload]
    );
    assert(updated.rowCount === 1, `Failed to age creation clock for timeout smoke game ${gameId}.`);
    return {
      activeColor,
      remainingMs,
    };
  } finally {
    await client.end();
  }
}

async function spectateThroughNode(serverProcess, { gameId, nextSocketMessage, waitForSocketOpen, WebSocket }) {
  const socket = new WebSocket(buildWebSocketUrl(serverProcess.baseUrl));
  const spectating = nextSocketMessage(socket, `${serverProcess.nodeId} spectator join response`);
  await waitForSocketOpen(socket);
  socket.send(
    JSON.stringify(versionedSocketMessage({
      type: "spectate",
      gameId,
    }))
  );
  const message = await spectating;
  assertProtocolVersionedBody(message, `${serverProcess.nodeId} spectator join response`);
  assert(message.type === "spectating", `${serverProcess.nodeId} did not enter spectator mode.`);
  assert(message.snapshot?.version === 0, `${serverProcess.nodeId} spectator joined at version ${message.snapshot?.version}.`);
  assertDefaultOnlineClock(message.snapshot, `${serverProcess.nodeId} spectator join snapshot`);
  return socket;
}

async function verifyCrossNodeSpectatorFanout(playerServer, spectatorServer, helpers) {
  const created = await createSmokeGameOnNode(
    playerServer,
    helpers,
    "Cross-node spectator fanout"
  );
  await makeGamePublic(playerServer, {
    fetchWithTimeout: helpers.fetchWithTimeout,
    gameId: created.gameId,
    token: created.white.token,
  });

  const spectatorSocket = await spectateThroughNode(spectatorServer, {
    ...helpers,
    gameId: created.gameId,
  });
  try {
    const publicSummary = await fetchPublicSummary(playerServer, {
      fetchWithTimeout: helpers.fetchWithTimeout,
      gameId: created.gameId,
    });
    assert(
      publicSummary?.livePreview?.spectatorCount === 1,
      `Node A summary did not see the node B spectator count; got ${publicSummary?.livePreview?.spectatorCount}.`
    );

    const spectatorBroadcast = helpers.nextSocketMessage(
      spectatorSocket,
      "cross-node spectator fanout snapshot"
    );
    const playerSnapshot = await submitActionThroughNode(playerServer, {
      ...helpers,
      action: { type: "PASS", baseVersion: 0 },
      clientActionId: `spectator-fanout-node-a-pass-${Date.now().toString(36)}`,
      gameId: created.gameId,
      token: created.white.token,
    });
    assert(
      playerSnapshot?.version === 1,
      `Node A spectator fanout action returned version ${playerSnapshot?.version}.`
    );
    const broadcast = await spectatorBroadcast;
    assertProtocolVersionedBody(broadcast, "Cross-node spectator fanout broadcast");
    assert(
      broadcast.type === "snapshot",
      `Cross-node spectator fanout delivered ${broadcast.type ?? "<missing>"}.`
    );
    assert(
      broadcast.snapshot?.gameId === created.gameId,
      "Cross-node spectator fanout broadcast used a different game id."
    );
    assert(
      broadcast.snapshot?.version === 1,
      `Cross-node spectator fanout broadcast returned version ${broadcast.snapshot?.version}.`
    );
    assertDefaultOnlineClock(broadcast.snapshot, "Cross-node spectator fanout broadcast");
    await submitActionThroughNode(playerServer, {
      ...helpers,
      action: { type: "RESIGN", baseVersion: 1 },
      clientActionId: `spectator-fanout-cleanup-resign-${Date.now().toString(36)}`,
      gameId: created.gameId,
      token: created.black.token,
    });
    return {
      gameId: created.gameId,
      playerNodeId: playerServer.nodeId,
      spectatorNodeId: spectatorServer.nodeId,
      version: broadcast.snapshot.version,
    };
  } finally {
    await closeSmokeSocket(spectatorSocket);
  }
}

async function verifyCrossNodeVisibilityPropagation(playerServer, peerServer, helpers) {
  const created = await createSmokeGameOnNode(
    playerServer,
    helpers,
    "Cross-node visibility propagation"
  );
  await makeGamePublic(playerServer, {
    fetchWithTimeout: helpers.fetchWithTimeout,
    gameId: created.gameId,
    token: created.white.token,
  });
  await expectPublicSummaryStatus(peerServer, {
    description: "Peer public summary before unlisting",
    expectedStatus: 200,
    fetchWithTimeout: helpers.fetchWithTimeout,
    gameId: created.gameId,
  });

  await setGameVisibility(playerServer, {
    fetchWithTimeout: helpers.fetchWithTimeout,
    gameId: created.gameId,
    token: created.white.token,
    visibility: "unlisted",
  });
  await expectPublicSummaryStatus(peerServer, {
    description: "Peer public summary after unlisting",
    expectedStatus: 404,
    fetchWithTimeout: helpers.fetchWithTimeout,
    gameId: created.gameId,
  });
  await fetchSpectatorSnapshot(peerServer, {
    expectedVersion: 0,
    fetchWithTimeout: helpers.fetchWithTimeout,
    gameId: created.gameId,
  });
  await submitActionThroughNode(playerServer, {
    ...helpers,
    action: { type: "RESIGN", baseVersion: 0 },
    clientActionId: `visibility-propagation-cleanup-resign-${Date.now().toString(36)}`,
    gameId: created.gameId,
    token: created.black.token,
  });

  return {
    gameId: created.gameId,
    playerNodeId: playerServer.nodeId,
    peerNodeId: peerServer.nodeId,
    visibility: "unlisted",
  };
}

async function verifyCrossNodeTimeoutFanout(adjudicatingServer, spectatorServer, helpers) {
  const created = await createSmokeGameOnNode(
    adjudicatingServer,
    helpers,
    "Cross-node timeout fanout"
  );
  await makeGamePublic(adjudicatingServer, {
    fetchWithTimeout: helpers.fetchWithTimeout,
    gameId: created.gameId,
    token: created.white.token,
  });

  const spectatorSocket = await spectateThroughNode(spectatorServer, {
    ...helpers,
    gameId: created.gameId,
  });
  try {
    await agePersistedCreationClockForTimeout(created.gameId);
    const spectatorBroadcast = helpers.nextSocketMessage(
      spectatorSocket,
      "cross-node timeout fanout snapshot"
    );
    const playerSnapshot = await fetchPlayerSnapshot(adjudicatingServer, {
      expectedVersion: 1,
      fetchWithTimeout: helpers.fetchWithTimeout,
      gameId: created.gameId,
      token: created.white.token,
    });
    assert(
      playerSnapshot?.result?.reason === "timeout",
      `Timeout fanout player snapshot did not end by timeout: ${JSON.stringify(playerSnapshot?.result ?? null)}`
    );
    const broadcast = await spectatorBroadcast;
    assertProtocolVersionedBody(broadcast, "Cross-node timeout fanout broadcast");
    assert(
      broadcast.type === "snapshot",
      `Cross-node timeout fanout delivered ${broadcast.type ?? "<missing>"}.`
    );
    assert(
      broadcast.snapshot?.gameId === created.gameId,
      "Cross-node timeout fanout broadcast used a different game id."
    );
    assert(
      broadcast.snapshot?.version === 1,
      `Cross-node timeout fanout broadcast returned version ${broadcast.snapshot?.version}.`
    );
    assert(
      broadcast.snapshot?.result?.reason === "timeout",
      `Cross-node timeout fanout broadcast did not end by timeout: ${JSON.stringify(broadcast.snapshot?.result ?? null)}`
    );
    assertDefaultOnlineClock(broadcast.snapshot, "Cross-node timeout fanout broadcast");
    return {
      gameId: created.gameId,
      adjudicatingNodeId: adjudicatingServer.nodeId,
      spectatorNodeId: spectatorServer.nodeId,
      result: "timeout",
      version: broadcast.snapshot.version,
    };
  } finally {
    await closeSmokeSocket(spectatorSocket);
  }
}

async function createRollingDrainSmokeGame(serverProcess, helpers) {
  const created = await createSmokeGameOnNode(serverProcess, helpers, "Rolling-drain");

  const snapshot = await submitActionThroughNode(serverProcess, {
    ...helpers,
    action: { type: "PASS", baseVersion: 0 },
    clientActionId: `rolling-drain-node-a-pass-${Date.now().toString(36)}`,
    gameId: created.gameId,
    token: created.white.token,
  });
  assert(snapshot?.version === 1, `Node A rolling-drain action returned version ${snapshot?.version}.`);
  assertDefaultOnlineClock(snapshot, "Node A rolling-drain snapshot");

  return {
    gameId: created.gameId,
    createdNodeId: serverProcess.nodeId,
    whiteToken: created.white.token,
    blackToken: created.black.token,
    version: snapshot.version,
  };
}

async function continueRollingDrainSmokeGame(serverProcess, rollingGame, helpers) {
  const readResponse = await helpers.fetchWithTimeout(
    `${serverProcess.baseUrl}/api/online/games/${encodeURIComponent(rollingGame.gameId)}`,
    {
      headers: { authorization: `Bearer ${rollingGame.blackToken}` },
    }
  );
  const readBody = await readJson(readResponse);
  assert(
    readResponse.status === 200,
    `Peer node rolling-drain game fetch failed with ${readResponse.status}.`
  );
  assertProtocolVersionedBody(readBody, "Peer node rolling-drain game fetch");
  assert(readBody.color === "b", "Peer node rolling-drain fetch did not return black seat.");
  assert(
    readBody.snapshot?.version === rollingGame.version,
    `Peer node rolling-drain fetch returned version ${readBody.snapshot?.version}, expected ${rollingGame.version}.`
  );
  assertDefaultOnlineClock(readBody.snapshot, "Peer node rolling-drain fetch snapshot");

  const snapshot = await submitActionThroughNode(serverProcess, {
    ...helpers,
    action: { type: "PASS", baseVersion: 1 },
    clientActionId: `rolling-drain-node-b-pass-${Date.now().toString(36)}`,
    gameId: rollingGame.gameId,
    token: rollingGame.blackToken,
  });
  assert(snapshot?.version === 2, `Node B rolling-drain action returned version ${snapshot?.version}.`);
  assertDefaultOnlineClock(snapshot, "Node B rolling-drain snapshot");

  await submitActionThroughNode(serverProcess, {
    ...helpers,
    action: { type: "RESIGN", baseVersion: 2 },
    clientActionId: `rolling-drain-cleanup-resign-${Date.now().toString(36)}`,
    gameId: rollingGame.gameId,
    token: rollingGame.whiteToken,
  });

  return {
    gameId: rollingGame.gameId,
    createdNodeId: rollingGame.createdNodeId,
    continuedNodeId: serverProcess.nodeId,
    version: snapshot.version,
  };
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
  const { waitForSocketOpen, nextSocketMessage } = createWebSocketWaiters(options.requestTimeoutMs);
  const { WebSocket } = require("ws");
  const smokeHelpers = {
    fetchWithTimeout,
    nextSocketMessage,
    waitForSocketOpen,
    WebSocket,
  };
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

    const spectatorFanout = await verifyCrossNodeSpectatorFanout(servers[0], servers[1], smokeHelpers);
    const visibilityPropagation = await verifyCrossNodeVisibilityPropagation(
      servers[0],
      servers[1],
      smokeHelpers
    );
    const timeoutFanout = await verifyCrossNodeTimeoutFanout(servers[0], servers[1], smokeHelpers);
    const rollingGame = await createRollingDrainSmokeGame(servers[0], smokeHelpers);

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

    const rollingContinuation = await continueRollingDrainSmokeGame(servers[1], rollingGame, smokeHelpers);

    console.log(
      formatLocalPostgresRuntimeNodesSmokeMetrics(
        summarizeLocalPostgresRuntimeNodesSmoke({
          nodeStatuses,
          databaseRows,
          drainedNodeId: options.nodeIds[0],
          healthyNodeIds: [options.nodeIds[1]],
          rollingContinuation,
          spectatorFanout,
          timeoutFanout,
          visibilityPropagation,
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
