# Challenge Lifecycle Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable direct-challenge lifecycle event and projection primitives before challenge endpoints or UI.

**Architecture:** Keep this as a pure contract slice: `src/online/challenges.ts` owns direct-challenge event schemas, validation, lifecycle projection, identity binding helpers, actor authorization helpers, seat resolution, and expiry rules. No HTTP endpoint, database table, or UI is added in this slice. Later server/store work will persist these events and create games from accepted challenges.

**Tech Stack:** TypeScript, Vitest, existing online identity/read-model types, existing validation style.

---

## Files

- Create: `src/online/challenges.ts`
- Create: `src/online/secretSafety.ts`
- Create: `src/online/__tests__/challenges.test.ts`
- Modify: `src/online/readModel.ts`
- Modify: `docs/online-data-contract.md`
- Modify: `docs/online-multiplayer-plan.md`

## Contract Shape

- Challenge event schema version: `1`.
- Challenge v1 is direct-only. Public/open seeks are deferred to a later contract with a separate accept policy.
- Challenge statuses: `pending`, `accepted`, `declined`, `cancelled`, `expired`.
- Challenge visibility: `private` or `unlisted`. `public` is reserved for future open seek/lobby work.
- Challenge identities use the existing public `OnlineIdentity` shape. Identity ids are public non-secret surrogates, never bearer tokens.
- A created challenge must include `challengerSeat: "w" | "b" | "random"`.
- A challenge must include `expiresAt` as an ISO timestamp later than `createdAt`.
- Every event has an envelope: `schemaVersion`, `eventId`, `createdAt`.
- `eventId` is unique across the projected stream.
- Terminal actor fields are durable: `acceptedBy`, `declinedBy`, and `cancelledBy` are identities; `challenge_expired` uses `expiredBy: "system"`.
- Accepting a challenge binds it to a `gameId` and resolved seats. `whiteIdentity` and `blackIdentity` are persisted on `challenge_accepted`.
- Accepted seat binding must match the created challenge: if `challengerSeat === "w"`, `whiteIdentity` is the challenger and `blackIdentity` is the challenged identity; if `challengerSeat === "b"`, `blackIdentity` is the challenger and `whiteIdentity` is the challenged identity; if `challengerSeat === "random"`, the accepted event is the durable source of the resolved seat assignment and both seats must be exactly the challenger/challenged identities.
- Projection applies events in stream order, not timestamp sort order, while validating timestamp invariants.
- Acceptance and decline must be performed by the challenged identity. Cancellation must be performed by the challenger identity. Expiry is system-only.
- Terminal domain timestamps must equal the event envelope `createdAt`. `acceptedAt`, `declinedAt`, and `cancelledAt` must be at or after the challenge creation time and before `expiresAt`; `expiredAt` must be at or after `expiresAt`.
- After any terminal event, further lifecycle events for that challenge are invalid in projection.
- Self-challenges are invalid in v1.

## Task 1: Challenge Event Validation

- [x] Write failing tests in `src/online/__tests__/challenges.test.ts` for:
  - `createChallengeCreatedEvent` produces schema version 1, a bounded `challengeId`, `createdAt`, `expiresAt`, identities, visibility, and challenger seat.
  - `validateOnlineChallengeEvent` accepts valid `challenge_created`, `challenge_accepted`, `challenge_declined`, `challenge_cancelled`, and `challenge_expired` events.
  - Validation requires `eventId` and `createdAt` on every event.
  - Validation recursively rejects case-insensitive token/credential/session/auth/cookie-like keys anywhere on challenge events, including `token`, `whiteToken`, `blackToken`, `bearerToken`, `accessToken`, `refreshToken`, `authorization`, `headers.authorization`, `cookie`, `credential`, `sessionId`, `session_id`, and `inviteUrl`.
  - Validation rejects URL strings containing token-bearing query params or fragments, including relative URLs.
  - Validation rejects obvious bearer, auth, cookie, session, and token material in string values and public identity ids.
  - Validation rejects unsupported schema versions, invalid challenge ids, invalid identity ids, invalid visibility, public visibility, self-challenges, and `expiresAt <= createdAt`.
  - Validation rejects `challenge_accepted` without a bounded `gameId`, `acceptedBy`, `acceptedAt`, `whiteIdentity`, and `blackIdentity`.
  - Validation rejects `challenge_declined` without `declinedBy` and `declinedAt`.
  - Validation rejects `challenge_cancelled` without `cancelledBy` and `cancelledAt`.
  - Validation rejects `challenge_expired` unless `expiredBy === "system"` and `expiredAt` is present.
- [x] Run `npm test -- src/online/__tests__/challenges.test.ts` and verify it fails because the module does not exist.
- [x] Export `validateOnlineIdentity` from `src/online/readModel.ts` so challenge validation and summary validation use the same identity rules.
- [x] Create `src/online/challenges.ts` with:
  - `ONLINE_CHALLENGE_EVENT_SCHEMA_VERSION`
  - `OnlineChallengeStatus`
  - `OnlineChallengeVisibility`
  - `OnlineChallengeEvent`
  - `OnlineChallengeSummary`
  - `createChallengeCreatedEvent`
  - `createChallengeAcceptedEvent`
  - `createChallengeDeclinedEvent`
  - `createChallengeCancelledEvent`
  - `createChallengeExpiredEvent`
  - `validateOnlineChallengeEvent`
- [x] Run `npm test -- src/online/__tests__/challenges.test.ts` and verify validation tests pass.

## Task 2: Challenge Projection And Identity Binding

- [x] Add failing tests in `src/online/__tests__/challenges.test.ts` for:
  - `projectOnlineChallengeSummaries` projects a pending challenge from a created event.
  - Accepted challenges become `accepted`, store `acceptedAt`, `acceptedBy`, `gameId`, `whiteIdentity`, and `blackIdentity`.
  - Declined, cancelled, and expired challenges become terminal with the correct timestamp field.
  - Projection rejects duplicate created events for the same challenge id.
  - Projection rejects duplicate `eventId` values across the stream.
  - Projection rejects lifecycle events before create.
  - Projection rejects accepting/declining/cancelling/expiring a terminal challenge.
  - Projection rejects accept/decline actors that are not the challenged identity.
  - Projection rejects cancel actors that are not the challenger identity.
  - Projection rejects accepted/declined/cancelled timestamps at or after expiry.
  - Projection rejects expired timestamps before expiry.
  - Projection rejects terminal event domain timestamps that differ from the event envelope `createdAt`.
  - Projection rejects accepted/declined/cancelled timestamps before the challenge creation time.
  - Projection enforces `challengerSeat: "w"` accepted events bind challenger to white and challenged to black.
  - Projection enforces `challengerSeat: "b"` accepted events bind challenger to black and challenged to white.
  - Projection resolves `challengerSeat: "random"` only through the persisted `whiteIdentity` and `blackIdentity` on the accepted event, and rejects unrelated or duplicate seat identities.
  - Projection rejects accepted events where `{ whiteIdentity, blackIdentity }` is not exactly `{ challengerIdentity, challengedIdentity }`.
  - `isSameOnlineIdentity` compares `kind` and `id`, ignores registered `displayName`, and treats the same id across different kinds as different identities.
  - `isIdentityBoundToChallenge(summary, identity)` is true for challenger and challenged identities and false for unrelated identities.
  - `canIdentityAcceptChallenge(summary, identity, now)` is true only for the challenged identity while status is pending and `now < expiresAt`.
  - `canIdentityAcceptChallenge` is false when `now === expiresAt`, when `now` is invalid, and for terminal summaries.
  - `canIdentityDeclineChallenge(summary, identity, now)` follows the same rules as accept without seat/game binding.
  - `canIdentityCancelChallenge(summary, identity, now)` is true only for the challenger identity while status is pending and `now < expiresAt`.
  - `canSystemExpireChallenge(summary, now)` is true only while status is pending and `now >= expiresAt`.
- [x] Run the challenge test and verify the new projection tests fail.
- [x] Implement projection and helpers:
  - `projectOnlineChallengeSummaries(events: OnlineChallengeEvent[]): OnlineChallengeSummary[]`
  - `isSameOnlineIdentity(a: OnlineIdentity, b: OnlineIdentity): boolean`
  - `isIdentityBoundToChallenge(summary: OnlineChallengeSummary, identity: OnlineIdentity): boolean`
  - `canIdentityAcceptChallenge(summary: OnlineChallengeSummary, identity: AuthenticatedOnlineIdentity, now: string | number | Date): boolean`
  - `canIdentityDeclineChallenge(summary: OnlineChallengeSummary, identity: AuthenticatedOnlineIdentity, now: string | number | Date): boolean`
  - `canIdentityCancelChallenge(summary: OnlineChallengeSummary, identity: AuthenticatedOnlineIdentity, now: string | number | Date): boolean`
  - `canSystemExpireChallenge(summary: OnlineChallengeSummary, now: string | number | Date): boolean`
- [x] Run `npm test -- src/online/__tests__/challenges.test.ts`.

## Task 3: Docs, Review, Verification, Commit

- [x] Update `docs/online-data-contract.md` with the challenge lifecycle contract, identity-binding requirement, and token-redaction rule.
- [x] Update `docs/online-multiplayer-plan.md` Phase 5 status so the next slice is challenge persistence/endpoints, and keep the Phase 6A UI polish pull-forward note.
- [x] Run reviewers for contract correctness, security/privacy, and future endpoint fit.
- [x] Fix Critical and Important review findings.
- [x] Run `npm test`, `npm run build`, `npm run server:build`, and `git diff --check`.
- [ ] Commit and push with message `Add online challenge lifecycle contract`.

## Stop Condition

This slice is complete when challenge lifecycle events validate, project to summaries, enforce terminal ordering, expose identity-binding helpers for later authorization, reject token-like event fields, docs identify the contract boundary, reviewers report no Critical/Important findings, tests/builds pass, and the branch is pushed.
