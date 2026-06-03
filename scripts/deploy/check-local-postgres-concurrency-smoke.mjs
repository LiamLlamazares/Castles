#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assert, makeSmokeSetup } from "./online-smoke-lib.mjs";
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
const eventsModulePath = path.join(
  repoRoot,
  "server-build",
  "src",
  "online",
  "events.js"
);
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

function createGameId() {
  return `game_concurrency_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

async function main() {
  await requireLocalInputs();
  const { PostgresOnlineGameStore } = require(storeModulePath);
  const { createOnlineGameCreatedEvent } = require(eventsModulePath);
  const { hashOnlineToken } = require(credentialsModulePath);

  const gameId = createGameId();
  const whiteToken = randomBytes(18).toString("base64url");
  const blackToken = randomBytes(18).toString("base64url");
  const storeA = new PostgresOnlineGameStore({ connectionString: process.env.DATABASE_URL });
  const storeB = new PostgresOnlineGameStore({ connectionString: process.env.DATABASE_URL });

  try {
    await storeA.appendGameCreated(
      createOnlineGameCreatedEvent(
        {
          type: "game_created",
          gameId,
          setup: makeSmokeSetup(),
        },
        {
          eventId: `${gameId}_create`,
        }
      ),
      {
        whiteCredential: hashOnlineToken(whiteToken),
        blackCredential: hashOnlineToken(blackToken),
      }
    );

    const [first, second] = await Promise.all([
      storeA.applyGameAction({
        gameId,
        token: whiteToken,
        clientActionId: "concurrency-pass-a",
        action: { type: "PASS", baseVersion: 0 },
        now: () => 1_000,
      }),
      storeB.applyGameAction({
        gameId,
        token: whiteToken,
        clientActionId: "concurrency-pass-b",
        action: { type: "PASS", baseVersion: 0 },
        now: () => 1_000,
      }),
    ]);

    const accepted = [first, second].filter((result) => result.ok);
    const rejected = [first, second].filter((result) => !result.ok);
    assert(accepted.length === 1, `Expected one accepted action, got ${accepted.length}`);
    assert(rejected.length === 1, `Expected one stale rejection, got ${rejected.length}`);
    assert(
      accepted[0].snapshot.version === 1,
      `Accepted action produced version ${accepted[0].snapshot.version}, expected 1`
    );
    assert(
      rejected[0].error.code === "stale_action",
      `Rejected action code was ${rejected[0].error.code}, expected stale_action`
    );
    assert(
      rejected[0].snapshot?.version === 1,
      `Rejected action snapshot version was ${rejected[0].snapshot?.version}, expected 1`
    );

    const followUp = await storeB.applyGameAction({
      gameId,
      token: blackToken,
      clientActionId: "concurrency-resign-b",
      action: { type: "RESIGN", baseVersion: 1 },
      now: () => 2_000,
    });
    assert(followUp.ok, `Follow-up action failed: ${followUp.error?.message}`);
    assert(
      followUp.snapshot.version === 2,
      `Follow-up action produced version ${followUp.snapshot.version}, expected 2`
    );
    assert(
      followUp.snapshot.result?.reason === "resignation",
      `Follow-up result reason was ${followUp.snapshot.result?.reason}, expected resignation`
    );

    const summaries = await storeA.loadSummaries();
    const summary = summaries.find((candidate) => candidate.gameId === gameId);
    assert(summary, "Concurrency smoke did not write a summary for the game");
    assert(summary.version === 2, `Summary version was ${summary.version}, expected 2`);
    assert(summary.status === "complete", `Summary status was ${summary.status}, expected complete`);

    const records = await storeA.load();
    const record = records.find((candidate) => candidate.gameId === gameId);
    assert(record, "Concurrency smoke did not load the game record");
    assert(
      record.acceptedActions.length === 2,
      `Loaded record had ${record.acceptedActions.length} accepted actions, expected 2`
    );
    assert(record.result?.reason === "resignation", "Loaded record did not preserve resignation result");

    console.log(`Local PostgreSQL concurrency smoke passed using game ${gameId}`);
  } finally {
    await Promise.allSettled([storeA.close(), storeB.close()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
