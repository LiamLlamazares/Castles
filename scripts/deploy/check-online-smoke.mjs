#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const baseUrl = (process.argv[2] ?? process.env.BASE_URL ?? "https://castles.ls314.com").replace(
  /\/$/,
  ""
);
const expectedCommit = process.argv[3] ?? process.env.EXPECTED_COMMIT;
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 15_000);
const socketTimeoutMs = Number(process.env.SMOKE_SOCKET_TIMEOUT_MS ?? 10_000);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${response.url}, got: ${text.slice(0, 200)}`);
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Timed out fetching ${url} after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function waitForSocketOpen(socket) {
  if (socket.readyState === 1) return Promise.resolve();

  return new Promise((resolveMessage, rejectMessage) => {
    const timeout = setTimeout(() => {
      cleanup();
      rejectMessage(new Error(`Timed out opening WebSocket after ${socketTimeoutMs}ms`));
    }, socketTimeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("open", onOpen);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const onOpen = () => {
      cleanup();
      resolveMessage();
    };
    const onError = (error) => {
      cleanup();
      rejectMessage(error);
    };
    const onClose = () => {
      cleanup();
      rejectMessage(new Error("WebSocket closed before opening"));
    };

    socket.once("open", onOpen);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function nextSocketMessage(socket, description = "WebSocket message") {
  return new Promise((resolveMessage, rejectMessage) => {
    const timeout = setTimeout(() => {
      cleanup();
      rejectMessage(new Error(`Timed out waiting for ${description} after ${socketTimeoutMs}ms`));
    }, socketTimeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const onMessage = (data) => {
      cleanup();
      try {
        resolveMessage(JSON.parse(data.toString("utf8")));
      } catch (error) {
        rejectMessage(error);
      }
    };
    const onError = (error) => {
      cleanup();
      rejectMessage(error);
    };
    const onClose = () => {
      cleanup();
      rejectMessage(new Error(`WebSocket closed before ${description}`));
    };

    socket.once("message", onMessage);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function makeSmokeSetup() {
  const whiteCastle = {
    hex: { q: 0, r: 3, s: -3, colorIndex: 0 },
    color: "w",
    turnsControlled: 0,
    usedThisTurn: false,
    owner: "w",
  };
  const blackCastle = {
    hex: { q: 0, r: -3, s: 3, colorIndex: 0 },
    color: "b",
    turnsControlled: 0,
    usedThisTurn: false,
    owner: "b",
  };
  const piece = (color, q, r, s) => ({
    hex: { q, r, s, colorIndex: 0 },
    color,
    type: "Monarch",
    canMove: true,
    canAttack: true,
    damage: 0,
    abilityUsed: false,
    souls: 0,
    isRevived: false,
  });

  return {
    board: {
      config: { nSquares: 3, hasHighGround: false },
      castles: [whiteCastle, blackCastle],
    },
    pieces: [piece("w", 0, 1, -1), piece("b", 0, -1, 1)],
    sanctuaries: [],
    sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
    gameRules: { vpModeEnabled: false },
    initialPoolTypes: [],
    pieceTheme: "Castles",
  };
}

async function main() {
  const { WebSocket } = require("ws");
  const health = await fetchWithTimeout(`${baseUrl}/api/health`);
  const healthBody = await readJson(health);
  assert(health.ok, `Health check failed with ${health.status}`);
  assert(healthBody.ok === true, "Health body did not report ok=true");
  assert(healthBody.online?.eventSchemaVersion === 1, "Health did not report event schema v1");
  if (expectedCommit) {
    assert(
      healthBody.build?.commit === expectedCommit,
      `Expected commit ${expectedCommit}, health reported ${healthBody.build?.commit}`
    );
  }

  const createResponse = await fetchWithTimeout(`${baseUrl}/api/online/games`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup: makeSmokeSetup() }),
  });
  const created = await readJson(createResponse);
  assert(createResponse.status === 201, `Create game failed with ${createResponse.status}`);
  assert(
    createResponse.headers.get("cache-control")?.includes("no-store"),
    "Create response was not no-store"
  );

  const socketUrl = baseUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:") + "/ws";
  const socket = new WebSocket(socketUrl);
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
  socket.close();

  const readResponse = await fetchWithTimeout(`${baseUrl}/api/online/games/${created.gameId}`, {
    headers: { authorization: `Bearer ${created.white.token}` },
  });
  const readBody = await readJson(readResponse);
  assert(readResponse.status === 200, `Snapshot fetch failed with ${readResponse.status}`);
  assert(readBody.snapshot?.version === 1, "Snapshot fetch did not return persisted version 1");

  console.log(`Smoke check passed for ${baseUrl} using game ${created.gameId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
