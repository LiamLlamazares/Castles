#!/usr/bin/env node
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  assert,
  buildWebSocketUrl,
  createFetchWithTimeout,
  createWebSocketWaiters,
  makeSmokeSetup,
  readJson,
} from "./online-smoke-lib.mjs";

const require = createRequire(import.meta.url);
const { WebSocket } = require("ws");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const serverEntry = path.join(repoRoot, "server-build", "server", "index.js");
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 15_000);
const socketTimeoutMs = Number(process.env.SMOKE_SOCKET_TIMEOUT_MS ?? 10_000);
const startupTimeoutMs = Number(process.env.SMOKE_STARTUP_TIMEOUT_MS ?? 20_000);
const localShutdownToken = `local-smoke-${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;
const fetchWithTimeout = createFetchWithTimeout(requestTimeoutMs);
const { waitForSocketOpen, nextSocketMessage } = createWebSocketWaiters(socketTimeoutMs);

function isLocalDatabaseHost(databaseUrlText) {
  let databaseUrl;
  try {
    databaseUrl = new URL(databaseUrlText);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  const hostname = databaseUrl.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function requireLocalInputs() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required. Example: postgresql://castles_local:castles_local_dev@localhost:5432/castles_local"
    );
  }
  if (
    process.env.CASTLES_ALLOW_NONLOCAL_SMOKE_DB !== "1" &&
    !isLocalDatabaseHost(process.env.DATABASE_URL)
  ) {
    throw new Error(
      "Refusing to run local smoke against a non-local DATABASE_URL host. Use a localhost database, or set CASTLES_ALLOW_NONLOCAL_SMOKE_DB=1 only for a disposable non-production database."
    );
  }
  if (!existsSync(serverEntry)) {
    throw new Error("Built server entry was not found. Run npm run server:build first.");
  }
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

function startServer(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_BASE_URL: baseUrl,
      ONLINE_STORE_BACKEND: "postgres",
      CASTLES_STATIC_DIR: path.join(repoRoot, "build"),
      CASTLES_ENABLE_LOCAL_SHUTDOWN: "1",
      CASTLES_LOCAL_SHUTDOWN_TOKEN: localShutdownToken,
      BUILD_ID: "local-smoke",
      GIT_COMMIT: "local-smoke",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const appendLog = (data) => {
    logs = (logs + data.toString("utf8")).slice(-8_000);
  };
  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);

  return { baseUrl, child, getLogs: () => logs };
}

async function stopServer(serverProcess) {
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
    sleep(7_000).then(() => false),
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

async function waitForHealth(serverProcess) {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (serverProcess.child.exitCode !== null) {
      throw new Error(
        `Server exited before becoming healthy with code ${serverProcess.child.exitCode}.\n${serverProcess.getLogs()}`
      );
    }

    try {
      const response = await fetchWithTimeout(`${serverProcess.baseUrl}/api/health`);
      const body = await readJson(response);
      if (response.ok && body.ok === true) {
        assert(body.online?.eventSchemaVersion === 1, "Health did not report event schema v1");
        assert(
          body.online?.store?.backend === "postgres",
          `Expected postgres health backend, got ${body.online?.store?.backend}`
        );
        return body;
      }
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `Server did not become healthy after ${startupTimeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${serverProcess.getLogs()}`
  );
}

async function playOnePass(baseUrl) {
  const createResponse = await fetchWithTimeout(`${baseUrl}/api/online/games`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup: makeSmokeSetup() }),
  });
  const created = await readJson(createResponse);
  assert(createResponse.status === 201, `Create game failed with ${createResponse.status}`);

  const socket = new WebSocket(buildWebSocketUrl(baseUrl));
  try {
    const joined = nextSocketMessage(socket, "join response");
    await waitForSocketOpen(socket);
    socket.send(
      JSON.stringify({
        type: "join",
        gameId: created.gameId,
        token: created.white.token,
      })
    );

    const joinedMessage = await joined;
    assert(joinedMessage.type === "joined", "WebSocket did not join the created game");
    assert(joinedMessage.snapshot?.version === 0, "Created game did not start at version 0");

    const snapshot = nextSocketMessage(socket, "post-action snapshot");
    socket.send(JSON.stringify({ type: "action", action: { type: "PASS", baseVersion: 0 } }));
    const snapshotMessage = await snapshot;
    assert(snapshotMessage.type === "snapshot", "Pass action did not produce a snapshot");
    assert(snapshotMessage.snapshot?.version === 1, "Pass action did not advance to version 1");
  } finally {
    socket.close();
  }

  const readResponse = await fetchWithTimeout(`${baseUrl}/api/online/games/${created.gameId}`, {
    headers: { authorization: `Bearer ${created.white.token}` },
  });
  const readBody = await readJson(readResponse);
  assert(readResponse.status === 200, `Snapshot fetch failed with ${readResponse.status}`);
  assert(readBody.snapshot?.version === 1, "Snapshot fetch did not return persisted version 1");

  return {
    gameId: created.gameId,
    token: created.white.token,
  };
}

async function fetchPersistedSnapshot(baseUrl, gameId, token) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/games/${gameId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await readJson(response);
  assert(response.status === 200, `Restart snapshot fetch failed with ${response.status}`);
  assert(body.snapshot?.version === 1, "Restart did not preserve the accepted action");
}

async function withServer(port, callback) {
  const serverProcess = startServer(port);
  let operationError;
  try {
    await waitForHealth(serverProcess);
    return await callback(serverProcess.baseUrl);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await stopServer(serverProcess);
    } catch (shutdownError) {
      if (!operationError) {
        throw shutdownError;
      }
      console.error("Server shutdown also failed after smoke failure", shutdownError);
    }
  }
}

async function main() {
  requireLocalInputs();
  const port = await findFreePort();

  const played = await withServer(port, (baseUrl) => playOnePass(baseUrl));
  await withServer(port, (baseUrl) =>
    fetchPersistedSnapshot(baseUrl, played.gameId, played.token)
  );

  console.log(`Local restart smoke passed on http://127.0.0.1:${port} using game ${played.gameId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
