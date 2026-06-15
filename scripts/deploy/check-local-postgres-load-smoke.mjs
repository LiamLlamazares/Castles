#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assert, makeSmokeSetup } from "./online-smoke-lib.mjs";
import { checkLocalPostgresPrereqs } from "./local-postgres-prereqs.mjs";
import {
  formatLocalPostgresLoadSmokeMetrics,
  parseLocalPostgresLoadSmokeOptions,
  summarizeLocalPostgresLoadSmoke,
} from "./local-postgres-load-smoke-lib.mjs";

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

function createLoadGameId(index) {
  return `game_load_${Date.now().toString(36)}_${index}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

async function runLoadGame({
  createOnlineGameCreatedEvent,
  gameId,
  hashOnlineToken,
  index,
  storeA,
  storeB,
}) {
  const startedAt = performance.now();
  const whiteToken = randomBytes(18).toString("base64url");
  const blackToken = randomBytes(18).toString("base64url");

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
      clientActionId: `${gameId}_pass_a`,
      action: { type: "PASS", baseVersion: 0 },
      now: () => 1_000 + index,
    }),
    storeB.applyGameAction({
      gameId,
      token: whiteToken,
      clientActionId: `${gameId}_pass_b`,
      action: { type: "PASS", baseVersion: 0 },
      now: () => 1_000 + index,
    }),
  ]);

  const accepted = [first, second].filter((result) => result.ok);
  const rejected = [first, second].filter((result) => !result.ok);
  assert(accepted.length === 1, `Load smoke ${gameId} accepted ${accepted.length} duplicate actions.`);
  assert(rejected.length === 1, `Load smoke ${gameId} rejected ${rejected.length} duplicate actions.`);
  assert(
    accepted[0].snapshot.version === 1,
    `Load smoke ${gameId} accepted version ${accepted[0].snapshot.version}, expected 1.`
  );
  assert(
    rejected[0].error.code === "stale_action",
    `Load smoke ${gameId} rejection code was ${rejected[0].error.code}, expected stale_action.`
  );
  assert(
    rejected[0].snapshot?.version === 1,
    `Load smoke ${gameId} stale snapshot version was ${rejected[0].snapshot?.version}, expected 1.`
  );

  const resigned = await storeB.applyGameAction({
    gameId,
    token: blackToken,
    clientActionId: `${gameId}_resign_b`,
    action: { type: "RESIGN", baseVersion: 1 },
    now: () => 2_000 + index,
  });
  assert(resigned.ok, `Load smoke ${gameId} resignation failed: ${resigned.error?.message}`);
  assert(
    resigned.snapshot.version === 2,
    `Load smoke ${gameId} resignation version was ${resigned.snapshot.version}, expected 2.`
  );
  assert(
    resigned.snapshot.result?.reason === "resignation",
    `Load smoke ${gameId} result reason was ${resigned.snapshot.result?.reason}, expected resignation.`
  );

  const summary = await storeA.loadGameSummary(gameId);
  assert(summary, `Load smoke ${gameId} did not write a summary.`);
  assert(summary.version === 2, `Load smoke ${gameId} summary version was ${summary.version}, expected 2.`);
  assert(summary.status === "complete", `Load smoke ${gameId} summary status was ${summary.status}.`);

  return {
    gameId,
    acceptedActions: 2,
    staleRejections: 1,
    completed: true,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
  };
}

async function main() {
  await requireLocalInputs();
  const options = parseLocalPostgresLoadSmokeOptions();
  const { PostgresOnlineGameStore } = require(storeModulePath);
  const { createOnlineGameCreatedEvent } = require(eventsModulePath);
  const { hashOnlineToken } = require(credentialsModulePath);
  const storeA = new PostgresOnlineGameStore({ connectionString: process.env.DATABASE_URL });
  const storeB = new PostgresOnlineGameStore({ connectionString: process.env.DATABASE_URL });

  try {
    const results = await Promise.all(
      Array.from({ length: options.gameCount }, (_unused, index) =>
        runLoadGame({
          createOnlineGameCreatedEvent,
          gameId: createLoadGameId(index + 1),
          hashOnlineToken,
          index,
          storeA,
          storeB,
        })
      )
    );
    console.log(formatLocalPostgresLoadSmokeMetrics(summarizeLocalPostgresLoadSmoke(results)));
  } finally {
    await Promise.allSettled([storeA.close(), storeB.close()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
