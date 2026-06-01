#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assert } from "./online-smoke-lib.mjs";

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
const challengesModulePath = path.join(repoRoot, "server-build", "src", "online", "challenges.js");

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
  if (!existsSync(storeModulePath) || !existsSync(challengesModulePath)) {
    throw new Error("Built server modules were not found. Run npm run server:build first.");
  }
}

function createChallengeId() {
  return `challenge_smoke_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

async function main() {
  requireLocalInputs();
  const { PostgresOnlineGameStore } = require(storeModulePath);
  const {
    createChallengeCreatedEvent,
  } = require(challengesModulePath);

  const challengeId = createChallengeId();
  const challengerIdentity = { kind: "session", id: `${challengeId}_challenger` };
  const challengedIdentity = { kind: "session", id: `${challengeId}_challenged` };
  const store = new PostgresOnlineGameStore({ connectionString: process.env.DATABASE_URL });

  try {
    const created = createChallengeCreatedEvent(
      {
        type: "challenge_created",
        challengeId,
        challengerIdentity,
        challengedIdentity,
        challengerSeat: "w",
        visibility: "unlisted",
        expiresAt: "2026-06-01T12:10:00.000Z",
      },
      {
        eventId: `${challengeId}_created`,
        createdAt: "2026-06-01T12:00:00.000Z",
      }
    );

    const pending = await store.appendChallengeEvent(created);
    assert(pending.status === "pending", `Created challenge status was ${pending.status}, expected pending`);

    const pendingSummaries = await store.loadChallengeSummaries();
    const pendingSummary = pendingSummaries.find((candidate) => candidate.challengeId === challengeId);
    assert(pendingSummary, "Challenge smoke did not write a pending challenge summary");
    assert(pendingSummary.status === "pending", `Loaded summary status was ${pendingSummary.status}, expected pending`);

    let duplicateRejected = false;
    try {
      await store.appendChallengeEvent(
        createChallengeCreatedEvent(
          {
            type: "challenge_created",
            challengeId,
            challengerIdentity,
            challengedIdentity,
            challengerSeat: "w",
            visibility: "unlisted",
            expiresAt: "2026-06-01T12:10:00.000Z",
          },
          {
            eventId: `${challengeId}_duplicate_create`,
            createdAt: "2026-06-01T12:01:00.000Z",
          }
        )
      );
    } catch (error) {
      const text = String(error?.message ?? error).toLowerCase();
      duplicateRejected = text.includes("duplicate") || text.includes("unique");
      if (!duplicateRejected) {
        throw error;
      }
    }
    assert(duplicateRejected, "Duplicate challenge creation was not rejected");

    const rebuilt = await store.rebuildChallengeSummaries();
    const rebuiltSummary = rebuilt.find((candidate) => candidate.challengeId === challengeId);
    assert(rebuiltSummary, "Challenge smoke rebuild did not include the challenge");
    assert(rebuiltSummary.status === "pending", `Rebuilt summary status was ${rebuiltSummary.status}, expected pending`);

    console.log(`Local PostgreSQL challenge smoke passed using challenge ${challengeId}`);
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
