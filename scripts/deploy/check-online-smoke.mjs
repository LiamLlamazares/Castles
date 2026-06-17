#!/usr/bin/env node
import { createRequire } from "node:module";
import {
  assert,
  assertDefaultOnlineClock,
  assertGoogleOAuthSmoke,
  assertProductionRuntimeHealthReady,
  assertProtocolVersionedBody,
  assertSpectatorSnapshot,
  buildWebSocketUrl,
  createFetchWithTimeout,
  createWebSocketWaiters,
  makeSmokeSetup,
  readJson,
  resolveOnlineSmokeCliOptions,
  versionedSocketMessage,
} from "./online-smoke-lib.mjs";

const require = createRequire(import.meta.url);
const { baseUrl, expectedCommit } = resolveOnlineSmokeCliOptions(process.argv.slice(2));
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 15_000);
const socketTimeoutMs = Number(process.env.SMOKE_SOCKET_TIMEOUT_MS ?? 10_000);
const fetchWithTimeout = createFetchWithTimeout(requestTimeoutMs);
const { waitForSocketOpen, nextSocketMessage } = createWebSocketWaiters(socketTimeoutMs);

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function jsonHeaders(token) {
  return { "content-type": "application/json", ...bearer(token) };
}

function uniqueDisplayName(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function accountChallengeSetup() {
  return {
    ...makeSmokeSetup(),
    timeControl: { initial: 20, increment: 20 },
  };
}

async function createSmokeAccount(displayName) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName,
      password: `production-smoke-password-${displayName}`,
    }),
  });
  const body = await readJson(response);
  assert(response.status === 201, `Account challenge recovery account create failed with ${response.status}`);
  assertProtocolVersionedBody(body, "Account challenge recovery account create");
  assert(body.account?.displayName === displayName, "Account challenge recovery account create returned wrong display name");
  assert(body.session?.token, "Account challenge recovery account create did not return a session token");
  assert(!JSON.stringify(body.account).includes(body.session.token), "Account challenge recovery leaked a session token");
  return body;
}

async function deleteSmokeAccount(token) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/account`, {
    method: "DELETE",
    headers: bearer(token),
  });
  if (response.status === 401 || response.status === 404) return;
  const body = await readJson(response);
  assert(response.status === 200, `Account challenge recovery account cleanup failed with ${response.status}`);
  assertProtocolVersionedBody(body, "Account challenge recovery account cleanup");
}

function challengeEntry(directory, challengeId, role) {
  return directory.challenges?.find(
    (entry) => entry.role === role && entry.summary?.challengeId === challengeId
  );
}

async function loadAccountChallenges(token, label) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/account/challenges?state=all`, {
    headers: bearer(token),
  });
  const body = await readJson(response);
  assert(response.status === 200, `${label} account challenge directory failed with ${response.status}`);
  assertProtocolVersionedBody(body, `${label} account challenge directory`);
  assert(Array.isArray(body.challenges), `${label} account challenge directory did not return challenges`);
  assert(!JSON.stringify(body).includes(token), `${label} account challenge directory leaked its bearer token`);
  return body;
}

async function loadAccountGames(token, query, label) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/account/games?state=all&q=${encodeURIComponent(query)}`,
    { headers: bearer(token) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `${label} account game history failed with ${response.status}`);
  assert(Number.isInteger(body.schemaVersion), `${label} account game history did not report a schema version`);
  assert(Array.isArray(body.games), `${label} account game history did not return games`);
  assert(!JSON.stringify(body).includes(token), `${label} account game history leaked its bearer token`);
  return body;
}

async function rejoinAccountGame(token, gameId, expectedSeat, label) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/account/games/${encodeURIComponent(gameId)}/rejoin`,
    { method: "POST", headers: bearer(token) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `${label} account rejoin failed with ${response.status}`);
  assertProtocolVersionedBody(body, `${label} account rejoin`);
  assert(body.gameInvite?.gameId === gameId, `${label} account rejoin returned the wrong game`);
  assert(body.gameInvite?.seat === expectedSeat, `${label} account rejoin returned the wrong seat`);
  assert(body.gameInvite?.token, `${label} account rejoin did not return a player token`);
  assert(typeof body.gameInvite?.url === "string", `${label} account rejoin did not return a game URL`);
  assert(!body.gameInvite.url.includes("token="), `${label} account rejoin URL leaked a query token`);
  assert(!JSON.stringify(body).includes(token), `${label} account rejoin leaked its bearer token`);

  const joinResponse = await fetchWithTimeout(`${baseUrl}/api/online/games/${encodeURIComponent(gameId)}`, {
    headers: bearer(body.gameInvite.token),
  });
  const joined = await readJson(joinResponse);
  assert(joinResponse.status === 200, `${label} rejoined token game fetch failed with ${joinResponse.status}`);
  assertProtocolVersionedBody(joined, `${label} rejoined token game fetch`);
  assert(joined.color === expectedSeat, `${label} rejoined token returned the wrong color`);
  return body;
}

async function submitOnlineAction(WebSocket, gameId, token, clientActionId, action) {
  const socket = new WebSocket(buildWebSocketUrl(baseUrl));
  try {
    const joined = nextSocketMessage(socket, `action ${clientActionId} join response`);
    await waitForSocketOpen(socket);
    socket.send(
      JSON.stringify(versionedSocketMessage({
        type: "join",
        gameId,
        token,
      }))
    );
    const joinedMessage = await joined;
    assertProtocolVersionedBody(joinedMessage, `Action ${clientActionId} join response`);
    assert(joinedMessage.type === "joined", `Action ${clientActionId} did not join the game`);

    const actionResponse = nextSocketMessage(socket, `action ${clientActionId} response`);
    socket.send(
      JSON.stringify(versionedSocketMessage({
        type: "action",
        clientActionId,
        action,
      }))
    );
    const actionMessage = await actionResponse;
    assertProtocolVersionedBody(actionMessage, `Action ${clientActionId} response`);
    assert(
      actionMessage.type === "snapshot",
      `Action ${clientActionId} was not accepted: ${JSON.stringify(actionMessage.error ?? actionMessage)}`
    );
    return actionMessage.snapshot;
  } finally {
    socket.close();
  }
}

async function smokeAccountChallengeRecovery(WebSocket) {
  const cleanupTokens = [];
  let cleanupGame = null;
  let cleanupGameEnded = false;
  let completedMainPath = false;
  const challenger = await createSmokeAccount(uniqueDisplayName("SmkA"));
  cleanupTokens.push(challenger.session.token);
  const challenged = await createSmokeAccount(uniqueDisplayName("SmkB"));
  cleanupTokens.push(challenged.session.token);

  try {
    const followResponse = await fetchWithTimeout(
      `${baseUrl}/api/online/account/follows/${encodeURIComponent(challenger.account.displayName)}`,
      { method: "PUT", headers: bearer(challenged.session.token) }
    );
    const follow = await readJson(followResponse);
    assert(followResponse.status === 200, `Account challenge recovery follow failed with ${followResponse.status}`);
    assertProtocolVersionedBody(follow, "Account challenge recovery follow");
    assert(follow.profile?.displayName === challenger.account.displayName, "Account challenge recovery followed the wrong profile");

    const createResponse = await fetchWithTimeout(`${baseUrl}/api/online/challenges`, {
      method: "POST",
      headers: jsonHeaders(challenger.session.token),
      body: JSON.stringify({
        setup: accountChallengeSetup(),
        challengerSeat: "w",
        visibility: "unlisted",
        challengedDisplayName: challenged.account.displayName,
      }),
    });
    const created = await readJson(createResponse);
    assert(createResponse.status === 201, `Account challenge recovery create failed with ${createResponse.status}`);
    assert(created.summary?.status === "pending", "Account challenge recovery challenge was not pending");
    assert(
      created.summary?.challengerIdentity?.displayName === challenger.account.displayName,
      "Account challenge recovery returned the wrong challenger identity"
    );
    assert(
      created.summary?.challengedIdentity?.displayName === challenged.account.displayName,
      "Account challenge recovery returned the wrong challenged identity"
    );
    assert(!JSON.stringify(created).includes(challenger.session.token), "Account challenge recovery leaked challenger token");
    assert(!JSON.stringify(created).includes(challenged.session.token), "Account challenge recovery leaked challenged token");

    const challengerDirectory = await loadAccountChallenges(challenger.session.token, "Challenger");
    const challengedDirectory = await loadAccountChallenges(challenged.session.token, "Challenged");
    assert(
      challengeEntry(challengerDirectory, created.challengeId, "challenger")?.summary?.status === "pending",
      "Account challenge recovery challenger directory did not include the pending challenge"
    );
    assert(
      challengeEntry(challengedDirectory, created.challengeId, "challenged")?.summary?.status === "pending",
      "Account challenge recovery challenged directory did not include the pending challenge"
    );

    const acceptResponse = await fetchWithTimeout(
      `${baseUrl}/api/online/account/challenges/${encodeURIComponent(created.challengeId)}/accept`,
      { method: "POST", headers: bearer(challenged.session.token) }
    );
    const accepted = await readJson(acceptResponse);
    assert(acceptResponse.status === 200, `Account challenge recovery accept failed with ${acceptResponse.status}`);
    assertProtocolVersionedBody(accepted, "Account challenge recovery accept");
    assert(accepted.summary?.status === "accepted", "Account challenge recovery accept did not return accepted");
    assert(accepted.gameInvite?.gameId, "Account challenge recovery accept did not return a game id");
    assert(accepted.gameInvite?.seat === "b", "Account challenge recovery accept did not return black invite");
    assert(accepted.gameInvite?.token, "Account challenge recovery accept did not return a game token");
    assert(!JSON.stringify(accepted).includes(challenged.session.token), "Account challenge recovery accept leaked challenged token");
    cleanupGame = { gameId: accepted.gameInvite.gameId, token: accepted.gameInvite.token };

    const challengerHistory = await loadAccountGames(
      challenger.session.token,
      challenged.account.displayName,
      "Challenger"
    );
    const challengedHistory = await loadAccountGames(
      challenged.session.token,
      challenger.account.displayName,
      "Challenged"
    );
    assert(
      challengerHistory.games.some((game) => game.gameId === accepted.gameInvite.gameId),
      "Account challenge recovery challenger history did not include the created game"
    );
    assert(
      challengedHistory.games.some((game) => game.gameId === accepted.gameInvite.gameId),
      "Account challenge recovery challenged history did not include the created game"
    );

    const challengerRejoin = await rejoinAccountGame(
      challenger.session.token,
      accepted.gameInvite.gameId,
      "w",
      "Challenger"
    );
    const challengedRejoin = await rejoinAccountGame(
      challenged.session.token,
      accepted.gameInvite.gameId,
      "b",
      "Challenged"
    );
    assert(
      challengedRejoin.gameInvite.token !== accepted.gameInvite.token,
      "Account challenge recovery did not mint a fresh challenged token"
    );
    assert(
      challengerRejoin.gameInvite.token !== challengedRejoin.gameInvite.token,
      "Account challenge recovery returned the same token for both seats"
    );

    cleanupGame = { gameId: accepted.gameInvite.gameId, token: challengedRejoin.gameInvite.token };
    const resigned = await submitOnlineAction(
      WebSocket,
      accepted.gameInvite.gameId,
      challengedRejoin.gameInvite.token,
      `account-smoke-resign-${Date.now().toString(36)}`,
      { type: "RESIGN", baseVersion: 0 }
    );
    cleanupGameEnded = true;
    assert(
      resigned.result?.winner === "w" && resigned.result?.reason === "resignation",
      "Account challenge recovery cleanup resignation did not end the game"
    );

    completedMainPath = true;
    return {
      challengeId: created.challengeId,
      gameId: accepted.gameInvite.gameId,
    };
  } finally {
    const cleanupErrors = [];
    if (cleanupGame && !cleanupGameEnded) {
      await submitOnlineAction(
        WebSocket,
        cleanupGame.gameId,
        cleanupGame.token,
        `account-smoke-cleanup-${Date.now().toString(36)}`,
        { type: "RESIGN", baseVersion: 0 }
      ).catch((error) => {
        cleanupErrors.push(error);
      });
    }
    for (const token of cleanupTokens.reverse()) {
      await deleteSmokeAccount(token).catch((error) => {
        cleanupErrors.push(error);
      });
    }
    if (cleanupErrors.length > 0) {
      const message = cleanupErrors
        .map((error) => error?.stack ?? error?.message ?? String(error))
        .join("\n");
      if (completedMainPath) {
        throw new Error(`Account challenge recovery cleanup failed:\n${message}`);
      }
      console.error(`Account challenge recovery cleanup failed:\n${message}`);
    }
  }
}

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
  assertProductionRuntimeHealthReady(healthBody);
  await assertGoogleOAuthSmoke(fetchWithTimeout, baseUrl);

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
      JSON.stringify(versionedSocketMessage({
        type: "join",
        gameId: created.gameId,
        token: created.white.token,
      }))
    );

    const joinedMessage = await joined;
    assertProtocolVersionedBody(joinedMessage, "Join WebSocket response");
    assert(joinedMessage.type === "joined", "WebSocket did not join the created game");
    assert(joinedMessage.snapshot?.version === 0, "Created game did not start at version 0");
    assertDefaultOnlineClock(joinedMessage.snapshot, "Joined snapshot");

    const snapshot = nextSocketMessage(socket, "post-action snapshot");
    socket.send(
      JSON.stringify(versionedSocketMessage({
        type: "action",
        clientActionId: "smoke-pass-1",
        action: { type: "PASS", baseVersion: 0 },
      }))
    );
    const snapshotMessage = await snapshot;
    assertProtocolVersionedBody(snapshotMessage, "Post-action WebSocket response");
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
  assertProtocolVersionedBody(readBody, "Player snapshot response");
  assert(readBody.snapshot?.version === 1, "Snapshot fetch did not return persisted version 1");
  assertDefaultOnlineClock(readBody.snapshot, "Persisted snapshot");
  await assertSpectatorSnapshot(fetchWithTimeout, baseUrl, created.gameId, 1);
  const directCleanup = await submitOnlineAction(
    WebSocket,
    created.gameId,
    created.black.token,
    `direct-smoke-cleanup-resign-${Date.now().toString(36)}`,
    { type: "RESIGN", baseVersion: 1 }
  );
  assert(
    directCleanup.result?.winner === "w" && directCleanup.result?.reason === "resignation",
    "Direct smoke cleanup resignation did not end the game"
  );
  const accountChallenge = await smokeAccountChallengeRecovery(WebSocket);

  console.log(
    `Smoke check passed for ${baseUrl} using game ${created.gameId}; account challenge ${accountChallenge.challengeId} / game ${accountChallenge.gameId}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
