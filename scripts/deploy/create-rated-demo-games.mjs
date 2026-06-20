#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assert,
  assertProtocolVersionedBody,
  buildWebSocketUrl,
  createFetchWithTimeout,
  createWebSocketWaiters,
  makeSmokeSetup,
  readJson,
  resolveOnlineSmokeCliOptions,
  versionedSocketMessage,
} from "./online-smoke-lib.mjs";

const require = createRequire(import.meta.url);
const { baseUrl } = resolveOnlineSmokeCliOptions(process.argv.slice(2));
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 15_000);
const socketTimeoutMs = Number(process.env.SMOKE_SOCKET_TIMEOUT_MS ?? 10_000);
const fetchWithTimeout = createFetchWithTimeout(requestTimeoutMs);
const { waitForSocketOpen, nextSocketMessage } = createWebSocketWaiters(socketTimeoutMs);
const cleanup = process.env.CASTLES_RATED_DEMO_CLEANUP === "1";

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function jsonHeaders(token) {
  return { "content-type": "application/json", ...bearer(token) };
}

function uniqueDisplayName(prefix) {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}${stamp}${random}`.slice(0, 32);
}

function ratedDemoSetup() {
  return {
    ...makeSmokeSetup(),
    ratingMode: "rated",
    timeControl: { initial: 20, increment: 20 },
  };
}

function profileUrl(displayName) {
  const url = new URL(baseUrl);
  url.searchParams.set("profile", displayName);
  return url.toString();
}

async function createAccount(displayName) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName,
      password: `rated-demo-password-${displayName}`,
    }),
  });
  const body = await readJson(response);
  assert(response.status === 201, `Rated demo account create failed for ${displayName}: ${response.status}`);
  assertProtocolVersionedBody(body, `Rated demo account create ${displayName}`);
  assert(body.account?.displayName === displayName, `Rated demo created wrong account for ${displayName}`);
  assert(body.session?.token, `Rated demo did not return a session for ${displayName}`);
  return body;
}

async function deleteAccount(token) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/account`, {
    method: "DELETE",
    headers: bearer(token),
  });
  if (response.status === 401 || response.status === 404) return;
  const body = await readJson(response);
  assert(response.status === 200, `Rated demo account cleanup failed with ${response.status}`);
  assertProtocolVersionedBody(body, "Rated demo account cleanup");
}

async function follow(followerToken, targetDisplayName) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/account/follows/${encodeURIComponent(targetDisplayName)}`,
    { method: "PUT", headers: bearer(followerToken) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `Rated demo follow failed for ${targetDisplayName}: ${response.status}`);
  assertProtocolVersionedBody(body, `Rated demo follow ${targetDisplayName}`);
}

async function createChallenge(challengerToken, challengedDisplayName, challengerSeat) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/challenges`, {
    method: "POST",
    headers: jsonHeaders(challengerToken),
    body: JSON.stringify({
      setup: ratedDemoSetup(),
      challengerSeat,
      visibility: "public",
      challengedDisplayName,
    }),
  });
  const body = await readJson(response);
  assert(response.status === 201, `Rated demo challenge create failed with ${response.status}`);
  assert(body.summary?.status === "pending", "Rated demo challenge was not pending");
  assert(body.summary?.setup?.ratingMode === "rated", "Rated demo challenge was not rated");
  assert(body.summary?.visibility === "public", "Rated demo challenge was not public");
  return body;
}

async function acceptChallenge(challengedToken, challengeId) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/account/challenges/${encodeURIComponent(challengeId)}/accept`,
    { method: "POST", headers: bearer(challengedToken) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `Rated demo challenge accept failed with ${response.status}`);
  assertProtocolVersionedBody(body, "Rated demo challenge accept");
  assert(body.summary?.status === "accepted", "Rated demo challenge accept did not accept");
  assert(body.gameInvite?.gameId, "Rated demo challenge accept did not return a game id");
  assert(body.gameInvite?.token, "Rated demo challenge accept did not return a player token");
  return body;
}

async function rejoinAccountGame(token, gameId, seat) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/account/games/${encodeURIComponent(gameId)}/rejoin`,
    { method: "POST", headers: bearer(token) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `Rated demo account rejoin failed with ${response.status}`);
  assertProtocolVersionedBody(body, "Rated demo account rejoin");
  assert(body.gameInvite?.seat === seat, `Rated demo rejoin expected ${seat}, got ${body.gameInvite?.seat}`);
  assert(body.gameInvite?.token, "Rated demo rejoin did not return a token");
  return body.gameInvite;
}

async function submitOnlineAction(WebSocket, gameId, token, clientActionId, action) {
  const socket = new WebSocket(buildWebSocketUrl(baseUrl));
  try {
    const joined = nextSocketMessage(socket, `${clientActionId} join response`);
    await waitForSocketOpen(socket);
    socket.send(JSON.stringify(versionedSocketMessage({ type: "join", gameId, token })));
    const joinedMessage = await joined;
    assertProtocolVersionedBody(joinedMessage, `${clientActionId} join response`);
    assert(joinedMessage.type === "joined", `${clientActionId} did not join`);

    const actionResponse = nextSocketMessage(socket, `${clientActionId} action response`);
    socket.send(JSON.stringify(versionedSocketMessage({ type: "action", clientActionId, action })));
    const actionMessage = await actionResponse;
    assertProtocolVersionedBody(actionMessage, `${clientActionId} action response`);
    assert(actionMessage.type === "snapshot", `${clientActionId} did not produce a snapshot`);
    return actionMessage.snapshot;
  } finally {
    socket.close();
  }
}

async function resignGame(WebSocket, gameId, token, baseVersion, label) {
  const snapshot = await submitOnlineAction(
    WebSocket,
    gameId,
    token,
    `rated-demo-${label}-${Date.now().toString(36)}`,
    { type: "RESIGN", baseVersion }
  );
  assert(snapshot.result?.reason === "resignation", `Rated demo ${label} did not end by resignation`);
  return snapshot;
}

async function loadPublicProfile(displayName) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/profiles/${encodeURIComponent(displayName)}`);
  const body = await readJson(response);
  assert(response.status === 200, `Rated demo public profile failed for ${displayName}: ${response.status}`);
  assertProtocolVersionedBody(body, `Rated demo public profile ${displayName}`);
  return body.profile;
}

async function loadRatingHistory(token, label) {
  const response = await fetchWithTimeout(`${baseUrl}/api/online/account/ratings/history?limit=10`, {
    headers: bearer(token),
  });
  const body = await readJson(response);
  assert(response.status === 200, `Rated demo rating history failed for ${label}: ${response.status}`);
  assertProtocolVersionedBody(body, `Rated demo rating history ${label}`);
  assert(Array.isArray(body.entries), `Rated demo rating history did not return entries for ${label}`);
  return body.entries;
}

async function loadAccountGames(token, opponentDisplayName, label) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/account/games?state=all&q=${encodeURIComponent(opponentDisplayName)}`,
    { headers: bearer(token) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `Rated demo account games failed for ${label}: ${response.status}`);
  assert(Array.isArray(body.games), `Rated demo account games did not return games for ${label}`);
  return body.games;
}

async function loadPublicGames(displayName) {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/online/games?state=archived&rating=rated&q=${encodeURIComponent(displayName)}`
  );
  const body = await readJson(response);
  assert(response.status === 200, `Rated demo public games failed for ${displayName}: ${response.status}`);
  assert(Array.isArray(body.games), `Rated demo public games did not return games for ${displayName}`);
  return body.games;
}

async function writeArtifact(summary) {
  const dir = join("artifacts", "rated-demo");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `rated-demo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return path;
}

async function main() {
  const { WebSocket } = require("ws");
  const accounts = [
    await createAccount(uniqueDisplayName("DemoA")),
    await createAccount(uniqueDisplayName("DemoB")),
  ];
  const [alpha, beta] = accounts;
  const games = [];

  try {
    await follow(alpha.session.token, beta.account.displayName);
    await follow(beta.session.token, alpha.account.displayName);

    const firstChallenge = await createChallenge(alpha.session.token, beta.account.displayName, "w");
    const firstAccepted = await acceptChallenge(beta.session.token, firstChallenge.challengeId);
    const firstSnapshot = await resignGame(
      WebSocket,
      firstAccepted.gameInvite.gameId,
      firstAccepted.gameInvite.token,
      0,
      "beta-resigns"
    );
    games.push({
      challengeId: firstChallenge.challengeId,
      gameId: firstAccepted.gameInvite.gameId,
      result: firstSnapshot.result,
    });

    const secondChallenge = await createChallenge(beta.session.token, alpha.account.displayName, "w");
    const secondAccepted = await acceptChallenge(alpha.session.token, secondChallenge.challengeId);
    const betaWhiteInvite = await rejoinAccountGame(beta.session.token, secondAccepted.gameInvite.gameId, "w");
    const secondSnapshot = await resignGame(
      WebSocket,
      secondAccepted.gameInvite.gameId,
      betaWhiteInvite.token,
      0,
      "beta-resigns-as-white"
    );
    games.push({
      challengeId: secondChallenge.challengeId,
      gameId: secondAccepted.gameInvite.gameId,
      result: secondSnapshot.result,
    });

    const profiles = await Promise.all(accounts.map((entry) => loadPublicProfile(entry.account.displayName)));
    const histories = await Promise.all([
      loadRatingHistory(alpha.session.token, alpha.account.displayName),
      loadRatingHistory(beta.session.token, beta.account.displayName),
    ]);
    const accountGames = await Promise.all([
      loadAccountGames(alpha.session.token, beta.account.displayName, alpha.account.displayName),
      loadAccountGames(beta.session.token, alpha.account.displayName, beta.account.displayName),
    ]);
    const publicGames = await Promise.all(accounts.map((entry) => loadPublicGames(entry.account.displayName)));

    for (const [index, profile] of profiles.entries()) {
      assert(profile.rating?.games >= 1, `Rated demo profile ${profile.displayName} did not show rated games`);
      assert(histories[index].length >= 1, `Rated demo profile ${profile.displayName} did not show rating history`);
      assert(accountGames[index].some((game) => games.some((created) => created.gameId === game.gameId)), `Rated demo account games missing for ${profile.displayName}`);
      assert(publicGames[index].some((game) => games.some((created) => created.gameId === game.gameId)), `Rated demo public games missing for ${profile.displayName}`);
    }

    const summary = {
      baseUrl,
      generatedAt: new Date().toISOString(),
      cleanup,
      accounts: accounts.map((entry, index) => ({
        displayName: entry.account.displayName,
        profileUrl: profileUrl(entry.account.displayName),
        publicRating: profiles[index].rating,
        ratingHistoryCount: histories[index].length,
        accountGameCount: accountGames[index].length,
        publicGameCount: publicGames[index].length,
      })),
      games,
    };
    const artifactPath = await writeArtifact(summary);
    console.log(JSON.stringify({ ...summary, artifactPath }, null, 2));
  } finally {
    if (cleanup) {
      for (const account of accounts.slice().reverse()) {
        await deleteAccount(account.session.token);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
