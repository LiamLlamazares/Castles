#!/usr/bin/env node
import { createRequire } from "node:module";
import {
  assert,
  assertDefaultOnlineClock,
  assertSpectatorSnapshot,
  buildWebSocketUrl,
  createFetchWithTimeout,
  createWebSocketWaiters,
  makeSmokeSetup,
  readJson,
} from "./online-smoke-lib.mjs";

const require = createRequire(import.meta.url);
const baseUrl = (process.argv[2] ?? process.env.BASE_URL ?? "https://castles.ls314.com").replace(
  /\/$/,
  ""
);
const expectedCommit = process.argv[3] ?? process.env.EXPECTED_COMMIT;
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 15_000);
const socketTimeoutMs = Number(process.env.SMOKE_SOCKET_TIMEOUT_MS ?? 10_000);
const fetchWithTimeout = createFetchWithTimeout(requestTimeoutMs);
const { waitForSocketOpen, nextSocketMessage } = createWebSocketWaiters(socketTimeoutMs);

async function main() {
  const { WebSocket } = require("ws");
  const health = await fetchWithTimeout(`${baseUrl}/api/health`);
  const healthBody = await readJson(health);
  assert(health.ok, `Health check failed with ${health.status}`);
  assert(healthBody.ok === true, "Health body did not report ok=true");
  assert(healthBody.online?.eventSchemaVersion === 2, "Health did not report event schema v2");
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

  const socketUrl = buildWebSocketUrl(baseUrl);
  const socket = new WebSocket(socketUrl);
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
    assertDefaultOnlineClock(joinedMessage.snapshot, "Joined snapshot");

    const snapshot = nextSocketMessage(socket, "post-action snapshot");
    socket.send(
      JSON.stringify({
        type: "action",
        clientActionId: "smoke-pass-1",
        action: { type: "PASS", baseVersion: 0 },
      })
    );
    const snapshotMessage = await snapshot;
    assert(snapshotMessage.type === "snapshot", "Pass action did not produce a snapshot");
    assert(snapshotMessage.snapshot?.version === 1, "Pass action did not advance to version 1");
    assertDefaultOnlineClock(snapshotMessage.snapshot, "Post-action snapshot");
  } finally {
    socket.close();
  }

  const readResponse = await fetchWithTimeout(`${baseUrl}/api/online/games/${created.gameId}`, {
    headers: { authorization: `Bearer ${created.white.token}` },
  });
  const readBody = await readJson(readResponse);
  assert(readResponse.status === 200, `Snapshot fetch failed with ${readResponse.status}`);
  assert(readBody.snapshot?.version === 1, "Snapshot fetch did not return persisted version 1");
  assertDefaultOnlineClock(readBody.snapshot, "Persisted snapshot");
  await assertSpectatorSnapshot(fetchWithTimeout, baseUrl, created.gameId, 1);

  console.log(`Smoke check passed for ${baseUrl} using game ${created.gameId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
