#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  assert,
  assertProtocolVersionedBody,
  readJson,
} from "./online-smoke-lib.mjs";

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
      "Refusing to run local challenge smoke against a non-local DATABASE_URL host. Use a localhost database, or set CASTLES_ALLOW_NONLOCAL_SMOKE_DB=1 only for a disposable non-production database."
    );
  }
  if (
    !existsSync(storeModulePath) ||
    !existsSync(httpModulePath) ||
    !existsSync(serviceModulePath) ||
    !existsSync(credentialsModulePath)
  ) {
    throw new Error("Built server modules were not found. Run npm run server:build first.");
  }
}

function createSmokeSetup() {
  return {
    board: { config: { nSquares: 6 }, castles: [] },
    pieces: [],
    sanctuaries: [],
    sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
    gameRules: { vpModeEnabled: false },
    initialPoolTypes: [],
    pieceTheme: "Castles",
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
  assert(!url.searchParams.has("token"), `Challenge URL leaked a query token: ${urlText}`);
  const token = new URLSearchParams(url.hash.slice(1)).get("challengeToken");
  assert(token, `Challenge URL did not include a fragment challenge token: ${urlText}`);
  return token;
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

async function main() {
  requireLocalInputs();
  const { PostgresOnlineGameStore } = require(storeModulePath);
  const { createOnlineHttpServer } = require(httpModulePath);
  const { OnlineGameService } = require(serviceModulePath);
  const { hashOnlineToken, verifyOnlineToken } = require(credentialsModulePath);

  const store = new PostgresOnlineGameStore({ connectionString: process.env.DATABASE_URL });
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

    console.log(`Local PostgreSQL challenge HTTP smoke passed using challenge ${created.challengeId} and game ${gameId}`);
  } finally {
    if (server) {
      await closeServer(server);
    }
    await store.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
