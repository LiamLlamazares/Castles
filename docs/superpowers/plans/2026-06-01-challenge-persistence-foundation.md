# Challenge Persistence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and rebuild direct-challenge lifecycle events and summaries in PostgreSQL before adding public challenge HTTP endpoints or UI.

**Architecture:** Extend the existing online store boundary with challenge-specific append, load, and rebuild methods. Store raw challenge events in an append-only `online_challenge_events` table, maintain rebuildable `online_challenge_summaries`, and reuse the pure challenge contract from `src/online/challenges.ts` for validation/projection. This slice deliberately does not create public routes or accept browser-supplied identities yet.

**Tech Stack:** TypeScript, Vitest, PostgreSQL via `pg`, existing `PostgresOnlineGameStore` transaction helpers, existing fake PostgreSQL unit harness.

---

## Files

- Modify: `src/online/server/OnlineGameStore.ts`
- Modify: `src/online/server/PostgresOnlineGameStore.ts`
- Modify: `src/online/server/__tests__/PostgresOnlineGameStore.test.ts`
- Modify: `src/online/challenges.ts`
- Modify: `src/online/__tests__/challenges.test.ts`
- Modify: `package.json`
- Create: `scripts/deploy/check-local-postgres-challenge-smoke.mjs`
- Modify: `docs/online-data-contract.md`
- Modify: `docs/online-multiplayer-plan.md`

## Persistence Contract

- `OnlineChallengeEvent` remains the only durable write payload for challenges.
- `OnlineChallengeSummary` is a materialized read model and can be deleted/rebuilt from challenge events.
- Non-accepted challenge event insertion must validate and canonicalize with `validateOnlineChallengeEvent`.
- Challenge summary writes must be inside the same transaction as the event insert.
- If summary refresh fails, the challenge event insert must roll back.
- Challenge rows must remain token-free. Raw challenge bearer credentials are not introduced in this slice.
- Challenge append order is database insertion order, not timestamp order.
- Duplicate create events, duplicate event ids, lifecycle-before-create, and terminal-after-terminal failures are enforced by projection and database constraints where applicable.
- This slice has no HTTP routes, no challenge bearer tokens, and no game creation from accepted challenges. Those require a separate endpoint/authentication plan.
- Challenge summaries get their own `ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION = 1` instead of reusing the event schema constant.
- Challenge summary rebuilds use a distinct `challengeSummaryLockKey`; they must not reuse the game-summary advisory lock and block ordinary game action summary refreshes.
- Future accept endpoints must create the online game, persist credentials, append `challenge_accepted`, and refresh both game and challenge summaries in one transaction. The generic append API must reject `challenge_accepted` so endpoint code cannot call `appendChallengeEvent` and game creation separately for accepted challenges.

## Task 1: Challenge Summary Validation

- [ ] In `src/online/__tests__/challenges.test.ts`, add failing tests for `validateOnlineChallengeSummary`:
  - exports and uses `ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION`.
  - accepts a projected pending summary.
  - accepts accepted, declined, cancelled, and expired summaries with their required terminal fields.
  - rejects missing/wrong schema version.
  - rejects invalid `challengeId`, `createdAt`, `updatedAt`, `expiresAt`, `lastEventId`, `visibility`, `challengerSeat`, and identity fields.
  - rejects status/field contradictions such as `pending` with `acceptedAt`, `accepted` without `gameId`, `declined` without `declinedBy`, `cancelled` without `cancelledBy`, and `expired` without `expiredBy: "system"`.
  - rejects timestamp ordering contradictions such as `updatedAt < createdAt`, `expiresAt <= createdAt`, accepted/declined/cancelled timestamps at or after expiry, expired timestamps before expiry, terminal timestamps that do not match `updatedAt`, and pending summaries already marked terminal.
  - rejects terminal fields from the wrong status, including `acceptedAt` on declined/cancelled/expired summaries, `declinedAt` on accepted/cancelled/expired summaries, `cancelledAt` on accepted/declined/expired summaries, and `expiredAt` on accepted/declined/cancelled summaries.
  - rejects token/credential/session/auth/cookie-like keys or string values anywhere in the summary.
- [ ] Run `npm test -- src/online/__tests__/challenges.test.ts` and verify it fails because `validateOnlineChallengeSummary` is missing.
- [ ] In `src/online/challenges.ts`, add `ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION = 1` and update `OnlineChallengeSummary.schemaVersion` to use it.
- [ ] In `src/online/challenges.ts`, add `validateOnlineChallengeSummary(value: unknown): ValidationResult<OnlineChallengeSummary>`.
- [ ] Reuse existing challenge validation helpers for identities, timestamps, status sets, visibility, seat, id bounds, and secret scanning.
- [ ] Run `npm test -- src/online/__tests__/challenges.test.ts` and verify the challenge tests pass.

## Task 2: Store Interface And Fake Database Tests

- [ ] Add imports for `OnlineChallengeEvent` and `OnlineChallengeSummary` to `src/online/server/OnlineGameStore.ts`.
- [ ] Add these methods to `OnlineGameStore`:
  - `loadChallengeSummaries(): Promise<OnlineChallengeSummary[]>`
  - `rebuildChallengeSummaries(options?: OnlineGameStoreLoadOptions): Promise<OnlineChallengeSummary[]>`
  - `appendChallengeEvent(event: Exclude<OnlineChallengeEvent, { type: "challenge_accepted" }>): Promise<OnlineChallengeSummary>`
- [ ] In `src/online/server/__tests__/PostgresOnlineGameStore.test.ts`, update `FakePostgresClient` with:
  - `challengeEventRows: Array<{ payload: OnlineChallengeEvent }>`
  - `challengeSummaryRows: Array<{ payload: unknown }>`
  - `failNextChallengeSummaryInsert = false`
  - duplicate event id detection for `online_challenge_events`.
  - duplicate `challenge_created` detection for the same `challengeId`.
  - transaction snapshots for challenge rows.
- [ ] Add query handling in `FakePostgresClient.query` for:
  - `INSERT INTO online_challenge_events` pushes `values[4]` as payload.
  - `SELECT payload FROM online_challenge_events ORDER BY id ASC` returns all challenge event rows.
  - `SELECT payload FROM online_challenge_events WHERE challenge_id = $1 ORDER BY id ASC` filters by `payload.challengeId`.
  - `DELETE FROM online_challenge_summaries` clears all summaries.
  - `DELETE FROM online_challenge_summaries WHERE challenge_id = $1` removes one summary.
  - `INSERT INTO online_challenge_summaries` upserts `values[5]` as payload and throws when `failNextChallengeSummaryInsert` is true.
  - `SELECT payload FROM online_challenge_summaries ORDER BY updated_at DESC, challenge_id ASC` returns challenge summary rows.
- [ ] Write failing tests for:
  - readiness/schema creates challenge event, challenge summary, and challenge lock tables/indexes.
  - `appendChallengeEvent` persists a created challenge, upserts a pending summary, returns that pending summary, and does it in one transaction.
  - `appendChallengeEvent` uses the expected lock order: `BEGIN`, `INSERT INTO online_challenge_locks ... ON CONFLICT`, `SELECT ... FROM online_challenge_locks ... FOR UPDATE`, challenge summary advisory lock, event insert, summary upsert, `COMMIT`.
  - `appendChallengeEvent` rejects `challenge_accepted` with an error pointing to future `acceptChallengeAndCreateGame` atomic persistence.
  - invalid or secret-bearing challenge events are rejected before insert.
  - summary refresh failure rolls back the challenge event insert.
  - lifecycle-before-create projection failure rolls back the challenge event insert.
  - duplicate event ids roll back and do not change challenge summaries.
  - duplicate challenge creation rolls back and does not change challenge summaries.
  - terminal-after-terminal events roll back and do not change challenge summaries.
  - `loadChallengeSummaries` validates stored summaries without reading challenge events.
  - `rebuildChallengeSummaries` rebuilds summaries from ordered challenge events inside a locked transaction.
  - `rebuildChallengeSummaries` rolls back to existing challenge summaries when a challenge summary upsert fails.
- [ ] Run `npm test -- src/online/server/__tests__/PostgresOnlineGameStore.test.ts` and verify the new tests fail because the store methods/schema do not exist.

## Task 3: PostgreSQL Challenge Persistence

- [ ] In `src/online/server/PostgresOnlineGameStore.ts`, import:
  - `OnlineChallengeEvent`
  - `OnlineChallengeSummary`
  - `projectOnlineChallengeSummaries`
  - `validateOnlineChallengeEvent`
  - `validateOnlineChallengeSummary`
- [ ] Add public methods to `PostgresOnlineGameStore`:
  - `loadChallengeSummaries()`
  - `rebuildChallengeSummaries(options?: OnlineGameStoreLoadOptions)`
  - `appendChallengeEvent(event: Exclude<OnlineChallengeEvent, { type: "challenge_accepted" }>)`
- [ ] Add schema in `createSchema()`:
  - `online_challenge_events` with `id BIGSERIAL PRIMARY KEY`, unique `event_id`, `challenge_id`, `event_type`, `created_at`, `payload JSONB`, and `inserted_at`.
  - unique partial index `online_challenge_events_one_create_per_challenge` on `challenge_id` where `event_type = 'challenge_created'`.
  - index `online_challenge_events_order_idx` on `id`.
  - `online_challenge_summaries` with `challenge_id PRIMARY KEY`, `status`, `visibility`, `expires_at`, `updated_at`, `payload JSONB`, and `rebuilt_at`.
  - indexes on `(status, updated_at DESC)` and `(visibility, updated_at DESC)`.
  - `online_challenge_locks` with `challenge_id TEXT PRIMARY KEY`.
- [ ] Add private helpers:
  - `validateChallenge(event: OnlineChallengeEvent): OnlineChallengeEvent`
  - `insertChallengeEvent(event, queryable)`
  - `loadChallengeEvents(options?, queryable?)`
  - `loadChallengeEventsForChallenge(challengeId, queryable)`
  - `refreshChallengeSummaryForChallenge(challengeId, queryable)`
  - `upsertChallengeSummary(summary, queryable?)`
  - `withChallengeTransaction(challengeId, operation)`
  - `acquireChallengeSummaryLock(queryable)`
- [ ] Add `private static readonly challengeSummaryLockKey = <new integer>` and do not reuse `summaryLockKey`.
- [ ] Use the challenge transaction for `appendChallengeEvent`: insert event, refresh the single challenge summary, return the refreshed summary, and roll back on any failure.
- [ ] Use a summary-level advisory lock for `rebuildChallengeSummaries`: load all challenge events, project summaries, delete all challenge summaries, upsert each summary, and return them.
- [ ] Run `npm test -- src/online/__tests__/challenges.test.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts`.

## Task 4: Local PostgreSQL Challenge Smoke

- [ ] Create `scripts/deploy/check-local-postgres-challenge-smoke.mjs`.
- [ ] The script must:
  - require `DATABASE_URL`.
  - refuse non-local database hosts unless `CASTLES_ALLOW_NONLOCAL_SMOKE_DB=1`.
  - require built server modules under `server-build`.
  - create a unique challenge id.
  - append `challenge_created`.
  - load challenge summaries and assert the challenge is pending.
  - attempt a duplicate `challenge_created` event and assert it is rejected.
  - call `rebuildChallengeSummaries()` and assert the pending summary survives rebuild.
  - close the store in `finally`.
- [ ] Add package script `"online:smoke:local:challenges": "node scripts/deploy/check-local-postgres-challenge-smoke.mjs"`.
- [ ] Run `npm run server:build`.
- [ ] If `DATABASE_URL` is set for a local/disposable PostgreSQL database, run `npm run online:smoke:local:challenges`. If it is not set, record that the smoke was not runnable in this environment and rely on unit/build verification for this slice.

## Task 5: Docs, Review, Verification, Commit

- [ ] Update `docs/online-data-contract.md` to document challenge persistence tables, summary rebuild behavior, and the fact that challenge bearer credentials/endpoints are still not introduced.
- [ ] Update `docs/online-data-contract.md` to document that future accept endpoints must atomically create the game and append `challenge_accepted` in one transaction.
- [ ] Update `docs/online-multiplayer-plan.md` Phase 5 status so this slice is persistence-only and the following slice is challenge endpoint/auth flow.
- [ ] Run reviewers for persistence correctness, transaction/rebuild behavior, and endpoint-readiness/security.
- [ ] Fix Critical and Important findings.
- [ ] Run `npm test`, `npm run build`, `npm run server:build`, and `git diff --check`.
- [ ] Run `npm run online:smoke:local:challenges` when `DATABASE_URL` is available for a local/disposable PostgreSQL database.
- [ ] Commit and push with message `Add online challenge persistence foundation`.

## Stop Condition

This slice is complete when challenge events can be appended, summaries can be loaded and rebuilt, corrupt/secret/invalid challenge data fails loudly, event and summary writes are transactional, reviewers report no Critical/Important findings, all verification commands pass, and the branch is pushed.
