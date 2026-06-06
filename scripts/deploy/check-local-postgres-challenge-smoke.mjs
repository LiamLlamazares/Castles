#!/usr/bin/env node
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  assert,
  assertProtocolVersionedBody,
  makeSmokeSetup,
  readJson,
} from "./online-smoke-lib.mjs";
import { checkLocalPostgresPrereqs } from "./local-postgres-prereqs.mjs";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const storeModulePath = path.join(
  repoRoot,
  "server-build",
  "src",
  "online",
  "server",
  "PostgresOnlineGameStore.js"
);
const accountStoreModulePath = path.join(
  repoRoot,
  "server-build",
  "src",
  "online",
  "server",
  "PostgresOnlineAccountStore.js"
);
const httpModulePath = path.join(
  repoRoot,
  "server-build",
  "src",
  "online",
  "server",
  "createOnlineHttpServer.js"
);
const serviceModulePath = path.join(repoRoot, "server-build", "src", "online", "OnlineGameService.js");
const credentialsModulePath = path.join(
  repoRoot,
  "server-build",
  "src",
  "online",
  "server",
  "onlineTokenCredentials.js"
);

async function requireLocalInputs() {
  await checkLocalPostgresPrereqs({
    repoRoot,
  });
}

function createSmokeSetup() {
  return {
    ...makeSmokeSetup(),
    timeControl: { initial: 20, increment: 20 },
  };
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function fragmentChallengeToken(urlText) {
  const url = new URL(urlText);
  assert(!url.searchParams.has("token"), "Challenge URL leaked a query token");
  const token = new URLSearchParams(url.hash.slice(1)).get("challengeToken");
  assert(token, "Challenge URL did not include a fragment challenge token");
  return token;
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function jsonHeaders(token) {
  return { "content-type": "application/json", ...bearer(token) };
}

function uniqueDisplayName(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

async function createAccount(baseUrl, displayName) {
  const response = await fetch(`${baseUrl}/api/online/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName,
      password: `smoke-password-${displayName}`,
    }),
  });
  const body = await readJson(response);
  assert(response.status === 201, `Account create for ${displayName} failed with ${response.status}`);
  assertProtocolVersionedBody(body, `Account create for ${displayName}`);
  assert(body.account?.displayName === displayName, `Account create returned wrong display name for ${displayName}`);
  assert(body.session?.token, `Account create did not return a session token for ${displayName}`);
  assert(JSON.stringify(body.account).includes(body.session.token) === false, "Account payload leaked its session token");
  return body;
}

async function deleteAccount(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/online/account`, {
    method: "DELETE",
    headers: bearer(token),
  });
  if (response.status === 401 || response.status === 404) return;
  const body = await readJson(response);
  assert(response.status === 200, `Account cleanup failed with ${response.status}`);
  assertProtocolVersionedBody(body, "Account cleanup");
}

function challengeEntry(directory, challengeId, role) {
  return directory.challenges?.find(
    (entry) => entry.role === role && entry.summary?.challengeId === challengeId
  );
}

async function loadAccountChallenges(baseUrl, token, label) {
  const response = await fetch(`${baseUrl}/api/online/account/challenges?state=all`, {
    headers: bearer(token),
  });
  const body = await readJson(response);
  assert(response.status === 200, `${label} account challenge directory failed with ${response.status}`);
  assertProtocolVersionedBody(body, `${label} account challenge directory`);
  assert(Array.isArray(body.challenges), `${label} account challenge directory did not return challenges`);
  assert(JSON.stringify(body).includes(token) === false, `${label} account challenge directory leaked its bearer token`);
  return body;
}

async function loadAccountGames(baseUrl, token, query, label) {
  const response = await fetch(
    `${baseUrl}/api/online/account/games?state=all&q=${encodeURIComponent(query)}`,
    { headers: bearer(token) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `${label} account game history failed with ${response.status}`);
  assert(Number.isInteger(body.schemaVersion), `${label} account game history did not report a schema version`);
  assert(Array.isArray(body.games), `${label} account game history did not return games`);
  assert(JSON.stringify(body).includes(token) === false, `${label} account game history leaked its bearer token`);
  return body;
}

async function rejoinAccountGame(baseUrl, token, gameId, expectedSeat, label) {
  const response = await fetch(
    `${baseUrl}/api/online/account/games/${encodeURIComponent(gameId)}/rejoin`,
    { method: "POST", headers: bearer(token) }
  );
  const body = await readJson(response);
  assert(response.status === 200, `${label} account rejoin failed with ${response.status}`);
  assertProtocolVersionedBody(body, `${label} Account rejoin`);
  assert(body.gameInvite?.gameId === gameId, `${label} account rejoin returned the wrong game`);
  assert(body.gameInvite?.seat === expectedSeat, `${label} account rejoin returned the wrong seat`);
  assert(body.gameInvite?.token, `${label} account rejoin did not return a fresh player token`);
  assert(typeof body.gameInvite?.url === "string", `${label} account rejoin did not return a game URL`);
  assert(!body.gameInvite.url.includes("token="), `${label} account rejoin URL leaked a query token`);
  assert(JSON.stringify(body).includes(token) === false, `${label} account rejoin leaked its bearer token`);

  const joinResponse = await fetch(`${baseUrl}/api/online/games/${encodeURIComponent(gameId)}`, {
    headers: bearer(body.gameInvite.token),
  });
  const joined = await readJson(joinResponse);
  assert(joinResponse.status === 200, `${label} rejoined token game fetch failed with ${joinResponse.status}`);
  assertProtocolVersionedBody(joined, `${label} rejoined token game fetch`);
  assert(joined.color === expectedSeat, `${label} rejoined token returned the wrong color`);
  return body;
}

async function cleanupChallengeGame(store, { gameId, token, clientActionId, baseVersion }) {
  const result = await store.applyGameAction({
    gameId,
    token,
    clientActionId,
    action: { type: "RESIGN", baseVersion },
    now: () => Date.now(),
  });
  assert(result.ok, `Challenge smoke cleanup ${clientActionId} failed: ${result.error?.message}`);
  assert(
    result.snapshot.version === baseVersion + 1,
    `Challenge smoke cleanup ${clientActionId} produced version ${result.snapshot.version}, expected ${baseVersion + 1}`
  );
  assert(
    result.snapshot.result?.reason === "resignation",
    `Challenge smoke cleanup ${clientActionId} result reason was ${result.snapshot.result?.reason}, expected resignation`
  );

  const summaries = await store.loadSummaries();
  const summary = summaries.find((candidate) => candidate.gameId === gameId);
  assert(summary, `Challenge smoke cleanup ${clientActionId} did not write a summary`);
  assert(summary.status === "complete", `Challenge smoke cleanup ${clientActionId} left summary ${summary.status}`);
  assert(
    summary.archiveState === "archived",
    `Challenge smoke cleanup ${clientActionId} left archive state ${summary.archiveState}`
  );
}

async function smokeTargetedAccountChallenge(baseUrl, store) {
  const cleanupTokens = [];
  const challenger = await createAccount(baseUrl, uniqueDisplayName("SmkA"));
  cleanupTokens.push(challenger.session.token);
  const challenged = await createAccount(baseUrl, uniqueDisplayName("SmkB"));
  cleanupTokens.push(challenged.session.token);

  try {
    const followResponse = await fetch(
      `${baseUrl}/api/online/account/follows/${encodeURIComponent(challenger.account.displayName)}`,
      { method: "PUT", headers: bearer(challenged.session.token) }
    );
    const follow = await readJson(followResponse);
    assert(followResponse.status === 200, `Account follow failed with ${followResponse.status}`);
    assertProtocolVersionedBody(follow, "Account follow");
    assert(follow.profile?.displayName === challenger.account.displayName, "Follow returned the wrong profile");

    const createResponse = await fetch(`${baseUrl}/api/online/challenges`, {
      method: "POST",
      headers: jsonHeaders(challenger.session.token),
      body: JSON.stringify({
        setup: createSmokeSetup(),
        challengerSeat: "w",
        visibility: "unlisted",
        challengedDisplayName: challenged.account.displayName,
      }),
    });
    const created = await readJson(createResponse);
    assert(createResponse.status === 201, `Targeted account challenge create failed with ${createResponse.status}`);
    assert(created.summary?.status === "pending", "Targeted account challenge was not pending");
    assert(
      created.summary?.challengerIdentity?.displayName === challenger.account.displayName,
      "Targeted challenge returned the wrong challenger identity"
    );
    assert(
      created.summary?.challengedIdentity?.displayName === challenged.account.displayName,
      "Targeted challenge returned the wrong challenged identity"
    );
    assert(JSON.stringify(created).includes(challenger.session.token) === false, "Challenge create leaked challenger account token");
    assert(JSON.stringify(created).includes(challenged.session.token) === false, "Challenge create leaked challenged account token");

    const challengerDirectory = await loadAccountChallenges(baseUrl, challenger.session.token, "Challenger");
    const challengedDirectory = await loadAccountChallenges(baseUrl, challenged.session.token, "Challenged");
    assert(
      challengeEntry(challengerDirectory, created.challengeId, "challenger")?.summary?.status === "pending",
      "Challenger account directory did not include the pending targeted challenge"
    );
    assert(
      challengeEntry(challengedDirectory, created.challengeId, "challenged")?.summary?.status === "pending",
      "Challenged account directory did not include the pending targeted challenge"
    );

    const accountAcceptResponse = await fetch(
      `${baseUrl}/api/online/account/challenges/${encodeURIComponent(created.challengeId)}/accept`,
      { method: "POST", headers: bearer(challenged.session.token) }
    );
    const accountAccepted = await readJson(accountAcceptResponse);
    assert(accountAcceptResponse.status === 200, `Account challenge accept failed with ${accountAcceptResponse.status}`);
    assertProtocolVersionedBody(accountAccepted, "Account challenge accept");
    assert(accountAccepted.summary?.status === "accepted", "Account challenge accept did not return accepted");
    assert(accountAccepted.gameInvite?.seat === "b", "Account challenge accept did not return black invite");
    assert(accountAccepted.gameInvite?.token, "Account challenge accept did not return a game invite token");
    assert(JSON.stringify(accountAccepted).includes(challenged.session.token) === false, "Account accept leaked challenged account token");

    const gameId = accountAccepted.gameInvite.gameId;
    const postAcceptChallengerDirectory = await loadAccountChallenges(baseUrl, challenger.session.token, "Challenger accepted");
    const postAcceptChallengedDirectory = await loadAccountChallenges(baseUrl, challenged.session.token, "Challenged accepted");
    assert(
      challengeEntry(postAcceptChallengerDirectory, created.challengeId, "challenger")?.summary?.status === "accepted",
      "Challenger account directory did not show the accepted targeted challenge"
    );
    assert(
      challengeEntry(postAcceptChallengedDirectory, created.challengeId, "challenged")?.summary?.status === "accepted",
      "Challenged account directory did not show the accepted targeted challenge"
    );

    const challengerHistory = await loadAccountGames(
      baseUrl,
      challenger.session.token,
      challenged.account.displayName,
      "Challenger"
    );
    const challengedHistory = await loadAccountGames(
      baseUrl,
      challenged.session.token,
      challenger.account.displayName,
      "Challenged"
    );
    assert(
      challengerHistory.games.some((game) => game.gameId === gameId),
      "Challenger account history did not include the targeted challenge game"
    );
    assert(
      challengedHistory.games.some((game) => game.gameId === gameId),
      "Challenged account history did not include the targeted challenge game"
    );

    const challengerRejoin = await rejoinAccountGame(
      baseUrl,
      challenger.session.token,
      gameId,
      "w",
      "Challenger"
    );
    const challengedRejoin = await rejoinAccountGame(
      baseUrl,
      challenged.session.token,
      gameId,
      "b",
      "Challenged"
    );
    assert(
      challengedRejoin.gameInvite.token !== accountAccepted.gameInvite.token,
      "Challenged account rejoin did not mint a fresh player token"
    );
    assert(
      challengerRejoin.gameInvite.token !== challengedRejoin.gameInvite.token,
      "Account rejoin returned the same token for both seats"
    );
    await cleanupChallengeGame(store, {
      gameId,
      token: accountAccepted.gameInvite.token,
      clientActionId: "local-account-challenge-smoke-cleanup",
      baseVersion: 0,
    });
    return {
      challengeId: created.challengeId,
      gameId,
    };
  } finally {
    for (const token of cleanupTokens.reverse()) {
      await deleteAccount(baseUrl, token).catch((error) => {
        console.error("Account cleanup failed after smoke", error);
      });
    }
  }
}

async function main() {
  await requireLocalInputs();
  const { PostgresOnlineGameStore } = require(storeModulePath);
  const { PostgresOnlineAccountStore } = require(accountStoreModulePath);
  const { createOnlineHttpServer } = require(httpModulePath);
  const { OnlineGameService } = require(serviceModulePath);
  const { hashOnlineToken, verifyOnlineToken } = require(credentialsModulePath);

  const store = new PostgresOnlineGameStore({ connectionString: process.env.DATABASE_URL });
  const accountStore = new PostgresOnlineAccountStore({ connectionString: process.env.DATABASE_URL });
  let server;

  try {
    const records = await store.load();
    await store.rebuildSummaries();
    await store.rebuildChallengeSummaries();
    const service = OnlineGameService.fromRecords(records, {
      credentialFactory: hashOnlineToken,
      verifyToken: verifyOnlineToken,
    });
    const createdServer = createOnlineHttpServer({
      publicBaseUrl: "http://127.0.0.1",
      service,
      onGameCreated: (event, credentials) => store.appendGameCreated(event, credentials),
      onGameEvent: (event) => store.appendEvent(event),
      appendChallengeCreated: (event, credentials) =>
        store.appendChallengeCreated(event, credentials),
      appendChallengeEvent: (event) => store.appendChallengeEvent(event),
      loadChallengeSummaries: () => store.loadChallengeSummaries(),
      resolveChallengeCredential: (challengeId, token) =>
        store.resolveChallengeCredential(challengeId, token),
      acceptChallengeAndCreateGame: (input) => store.acceptChallengeAndCreateGame(input),
      applyGameAction: (input) => store.applyGameAction(input),
      adjudicateGameTimeout: (input) => store.adjudicateGameTimeout(input),
      loadGameSummaries: () => store.loadSummaries(),
      appendGameSeatCredential: (gameId, seat, credential) =>
        store.appendGameSeatCredential(gameId, seat, credential),
      accountStore,
    });
    server = createdServer.server;
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    const createResponse = await fetch(`${baseUrl}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSmokeSetup(),
        challengerSeat: "w",
        visibility: "unlisted",
      }),
    });
    const created = await readJson(createResponse);
    assert(createResponse.status === 201, `Challenge create failed with ${createResponse.status}`);
    assert(createResponse.headers.get("cache-control")?.includes("no-store"), "Challenge create was not no-store");
    assert(created.summary?.status === "pending", "Challenge create did not return a pending summary");

    const challengerToken = fragmentChallengeToken(created.challenger.url);
    const challengedToken = fragmentChallengeToken(created.challenged.url);
    const queryTokenResponse = await fetch(
      `${baseUrl}/api/online/challenges/${encodeURIComponent(created.challengeId)}?token=${encodeURIComponent(challengedToken)}`
    );
    assert(queryTokenResponse.status === 404, "Challenge view accepted a query token");

    const challengedViewResponse = await fetch(
      `${baseUrl}/api/online/challenges/${encodeURIComponent(created.challengeId)}`,
      { headers: bearer(challengedToken) }
    );
    const challengedView = await readJson(challengedViewResponse);
    assert(challengedViewResponse.status === 200, `Challenged view failed with ${challengedViewResponse.status}`);
    assertProtocolVersionedBody(challengedView, "Challenged challenge view");
    assert(challengedView.role === "challenged", "Challenged view returned the wrong role");
    assert(challengedView.summary?.status === "pending", "Challenged view was not pending");

    const acceptResponse = await fetch(
      `${baseUrl}/api/online/challenges/${encodeURIComponent(created.challengeId)}/accept`,
      { method: "POST", headers: bearer(challengedToken) }
    );
    const accepted = await readJson(acceptResponse);
    assert(acceptResponse.status === 200, `Challenge accept failed with ${acceptResponse.status}`);
    assertProtocolVersionedBody(accepted, "Challenge accept");
    assert(accepted.summary?.status === "accepted", "Challenge accept did not return accepted");
    assert(accepted.gameInvite?.seat === "b", "Challenged game invite did not return black");
    assert(accepted.gameInvite?.token === challengedToken, "Challenged game invite did not reuse the challenge token");

    const challengerViewResponse = await fetch(
      `${baseUrl}/api/online/challenges/${encodeURIComponent(created.challengeId)}`,
      { headers: bearer(challengerToken) }
    );
    const challengerView = await readJson(challengerViewResponse);
    assert(challengerViewResponse.status === 200, `Challenger view failed with ${challengerViewResponse.status}`);
    assertProtocolVersionedBody(challengerView, "Challenger accepted challenge view");
    assert(challengerView.role === "challenger", "Challenger view returned the wrong role");
    assert(challengerView.gameInvite?.seat === "w", "Challenger game invite did not return white");
    assert(challengerView.gameInvite?.token === challengerToken, "Challenger game invite did not reuse the challenge token");

    const gameId = accepted.gameInvite.gameId;
    const whiteJoinResponse = await fetch(`${baseUrl}/api/online/games/${encodeURIComponent(gameId)}`, {
      headers: bearer(challengerToken),
    });
    const blackJoinResponse = await fetch(`${baseUrl}/api/online/games/${encodeURIComponent(gameId)}`, {
      headers: bearer(challengedToken),
    });
    const whiteJoin = await readJson(whiteJoinResponse);
    const blackJoin = await readJson(blackJoinResponse);
    assert(whiteJoinResponse.status === 200, `White join failed with ${whiteJoinResponse.status}`);
    assert(blackJoinResponse.status === 200, `Black join failed with ${blackJoinResponse.status}`);
    assertProtocolVersionedBody(whiteJoin, "White challenge game join");
    assertProtocolVersionedBody(blackJoin, "Black challenge game join");
    assert(whiteJoin.color === "w", "White join returned the wrong color");
    assert(blackJoin.color === "b", "Black join returned the wrong color");
    await cleanupChallengeGame(store, {
      gameId,
      token: challengedToken,
      clientActionId: "local-challenge-smoke-cleanup",
      baseVersion: 0,
    });

    const accountChallenge = await smokeTargetedAccountChallenge(baseUrl, store);

    console.log(
      `Local PostgreSQL challenge HTTP smoke passed using anonymous challenge ${created.challengeId} / game ${gameId}; account challenge ${accountChallenge.challengeId} / game ${accountChallenge.gameId}`
    );
  } finally {
    if (server) {
      await closeServer(server);
    }
    await accountStore.close();
    await store.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
