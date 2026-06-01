# Challenge Endpoint Auth Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add private direct-challenge routes where a pending challenge durably stores its game terms, private challenge links authenticate by bearer token, and accepting a challenge creates the online game atomically.

**Architecture:** Challenge creation stores immutable, normalized game setup terms in the durable challenge event/summary and stores challenge bearer credential hashes in a private table. Browser invite links carry the challenge token in the URL fragment only; API routes reject query-token auth and require `Authorization: Bearer`. Accepting a challenge uses one store transaction that locks the challenge and new game, verifies the challenged role, writes `game_created`, game credentials, and `challenge_accepted`, refreshes both summaries, returns role-specific game invites, and installs the returned room record into `OnlineGameService` before responding.

**Tech Stack:** TypeScript, Vitest, Express, PostgreSQL via `PostgresOnlineGameStore`, existing online setup/game event/challenge contracts.

---

## Files

- Modify: `src/online/challenges.ts`
- Modify: `src/online/__tests__/challenges.test.ts`
- Modify: `src/online/server/OnlineGameStore.ts`
- Modify: `src/online/server/PostgresOnlineGameStore.ts`
- Modify: `src/online/server/__tests__/PostgresOnlineGameStore.test.ts`
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`
- Modify: `src/online/client.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/GameSetup.tsx`
- Add/modify client tests only once backend route contracts are green.
- Modify: `scripts/deploy/check-online-smoke.mjs`
- Modify: `scripts/deploy/check-online-browser-smoke.mjs`
- Modify: `docs/online-data-contract.md`
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/ui/online-ui-benchmark-checklist.md`

## Endpoint And Link Contract

- Browser challenge links use query fields for non-secret routing and a fragment for bearer material:
  - `/?onlineChallenge=<challengeId>&challengeRole=challenger#challengeToken=<token>`
  - `/?onlineChallenge=<challengeId>&challengeRole=challenged#challengeToken=<token>`
- The browser captures the fragment token into `sessionStorage`, removes it from the visible URL, and calls API routes with `Authorization: Bearer <token>`.
- API routes never authenticate from `?token=`, `?challengeToken=`, fragments, request bodies, cookies, or browser-provided identity fields.
- `POST /api/online/challenges`
  - Body: `{ setup, challengerSeat?: "w" | "b" | "random", visibility?: "private" | "unlisted", expiresInMs?: number }`.
  - Server normalizes setup exactly like online game creation, including default time control.
  - Server caps `expiresInMs` to a bounded range: default 24 hours, minimum 5 minutes, maximum 7 days.
  - Server creates public non-secret challenger/challenged identities and private challenge credentials.
  - Durable `challenge_created` includes `setup` but no token, URL, cookie, session, or auth material.
  - Response is no-store and returns `{ challengeId, summary, challenger: { url }, challenged: { url } }`.
- `GET /api/online/challenges/:challengeId`
  - Requires the matching challenge bearer token.
  - Returns `{ protocolVersion, role, summary, gameInvite? }`.
  - While pending, no `gameInvite` is present.
  - After acceptance, the challenger token returns only the challenger seat's game invite and the challenged token returns only the challenged seat's game invite.
  - Terminal declined/cancelled/expired states return the summary and no game token.
- `POST /api/online/challenges/:challengeId/accept`
  - Requires the challenged bearer token.
  - Lazily expires first if `now >= expiresAt`.
  - Creates the game id and game event, resolves seats, and calls the store atomic accept method.
  - The original challenger/challenged challenge bearer tokens become the corresponding game bearer tokens after accept; the store derives white/black game credential hashes from private challenge credential hashes. This lets each side retrieve its own game link later without storing raw game tokens.
  - Calls `service.replaceRoom(result.gameRecord)` before responding.
  - Returns `{ protocolVersion, role: "challenged", summary, gameInvite }`, where `gameInvite` is only the challenged player's game invite.
- `POST /api/online/challenges/:challengeId/decline`
  - Requires the challenged bearer token and appends `challenge_declined`.
- `POST /api/online/challenges/:challengeId/cancel`
  - Requires the challenger bearer token and appends `challenge_cancelled`.
- No public `/expire` route in this slice. Expiry is lazy/internal from view and action routes, or later operator-only tooling.

## Security And Transaction Contract

- Challenge credentials are private server rows keyed by `challengeId + role`, with token hashes and public identity.
- `resolveChallengeCredential(challengeId, token)` returns `{ role, identity }` only when the bearer token verifies against the stored hash.
- `appendChallengeEvent` remains unavailable for `challenge_accepted`; accepted challenges can only be persisted through `acceptChallengeAndCreateGame`.
- `acceptChallengeAndCreateGame` must not call `appendGameCreated` or `appendChallengeEvent`; it writes all rows in one explicit transaction.
- The accept method must load challenge credential hashes inside the transaction and derive game credentials from them. It must not require caller-supplied raw game tokens or caller-supplied game credential hashes.
- Atomic accept lock order:
  1. challenge row lock
  2. new game row lock
  3. game summary advisory lock
  4. challenge summary advisory lock
  5. insert game event
  6. insert game credentials
  7. insert challenge accepted event
  8. refresh game summary
  9. refresh challenge summary
- Any failure before commit rolls back game event, game credentials, accepted event, and both summaries.
- Concurrent double accept creates exactly one game and one accepted event.
- Stale challenge actions return controlled public errors: invalid/missing token returns 404; wrong role returns 404; already terminal returns 409; persistence failure returns 503.
- Challenge create/view/action routes are rate-limited with small fixed windows, following the existing game create and spectator limiter pattern.
- Logs never include bearer tokens or full private URLs.

## Task 1: Durable Challenge Terms

- [x] Add failing tests in `src/online/__tests__/challenges.test.ts`:
  - `challenge_created` accepts and projects a validated `setup`.
  - `OnlineChallengeSummary` contains the same `setup`.
  - invalid setup is rejected by `validateOnlineChallengeEvent`.
  - summaries reject missing/invalid `setup`.
  - setup survives accepted, declined, cancelled, and expired projections unchanged.
- [x] Run `npm test -- src/online/__tests__/challenges.test.ts` and verify the new tests fail on missing setup contract.
- [x] In `src/online/challenges.ts`, add `setup: OnlineGameSetupDTO` to `challenge_created` and `OnlineChallengeSummary`.
- [x] Validate setup using `validateOnlineGameSetup`.
- [x] Project setup into summaries and return it from `validateOnlineChallengeSummary`.
- [x] Run `npm test -- src/online/__tests__/challenges.test.ts`.

## Task 2: Challenge Credentials And Created Persistence

- [x] Add `OnlineChallengeCredentials`, `ResolvedOnlineChallengeCredential`, and `OnlineChallengeRole` to `src/online/server/OnlineGameStore.ts`.
- [x] Add store methods:
  - `appendChallengeCreated(event, credentials): Promise<OnlineChallengeSummary>`
  - `resolveChallengeCredential(challengeId, token): Promise<ResolvedOnlineChallengeCredential | null>`
- [x] Add failing tests in `src/online/server/__tests__/PostgresOnlineGameStore.test.ts`:
  - schema creates `online_challenge_credentials`.
  - `appendChallengeCreated` writes the challenge event, credentials, and pending summary in one transaction.
  - raw/unhashed challenge credentials are rejected before insert.
  - challenge credential insert failure rolls back the event and summary.
  - `resolveChallengeCredential` returns challenger/challenged role and identity for valid tokens.
  - wrong token, missing challenge, or invalid credential rows return `null` or fail closed without exposing data.
- [x] Run `npm test -- src/online/server/__tests__/PostgresOnlineGameStore.test.ts` and verify the new tests fail.
- [x] Add `online_challenge_credentials(challenge_id, role, token_hash, identity, created_at, PRIMARY KEY(challenge_id, role))` with role check and token hash shape check.
- [x] Implement credential validation, insert, and resolver using `verifyOnlineToken`.
- [x] Keep low-level `appendChallengeEvent` for decline/cancel/lazy-expire only.
- [x] Run `npm test -- src/online/server/__tests__/PostgresOnlineGameStore.test.ts`.

## Task 3: Atomic Accept Store Method

- [x] Add store method:
  - `acceptChallengeAndCreateGame(input): Promise<OnlineChallengeAcceptResult>`
- [x] Input contains `challengeId`, resolved challenged credential, `gameCreatedEvent`, resolved white/black identities, and server time. The store derives game credentials and `gameRecord` from stored challenge credential hashes and the durable challenge setup.
- [x] Add failing tests in `src/online/server/__tests__/PostgresOnlineGameStore.test.ts`:
  - challenged credential accepts a pending challenge, creates one game event, stores game credentials derived from challenge credentials, writes one `challenge_accepted`, refreshes both summaries, and returns game/challenge summaries plus the game record.
  - challenger credential cannot accept.
  - wrong or unrelated credential cannot accept.
  - expired pending challenge cannot accept.
  - declined/cancelled/accepted challenge cannot accept again.
  - accepted game event setup must equal the challenge summary setup.
  - invalid game credentials roll back all rows.
  - challenge summary refresh failure rolls back game event, credentials, accepted event, and summaries.
  - deterministic `challengerSeat: "w"` and `"b"` bind seats correctly.
  - `challengerSeat: "random"` persists the resolved seats and returned invite seats correctly.
  - concurrent double accept leaves exactly one accepted challenge and one created game.
  - lock order matches the documented sequence.
- [x] Run `npm test -- src/online/server/__tests__/PostgresOnlineGameStore.test.ts` and verify the new tests fail.
- [x] Implement the single explicit transaction without composing `appendGameCreated` or `appendChallengeEvent`.
- [x] Run `npm test -- src/online/server/__tests__/PostgresOnlineGameStore.test.ts`.

## Task 4: HTTP Challenge Routes

- [x] Add failing tests in `src/online/server/__tests__/createOnlineHttpServer.test.ts`:
  - create challenge returns `201`, no-store headers, summary with setup, and fragment-token browser URLs.
  - invalid setup, invalid seat, public visibility, too-short/too-long expiry, and rate limit return controlled errors.
  - query token auth is rejected for view and accept routes.
  - challenger and challenged tokens can view pending challenge with correct role.
  - wrong/missing token returns 404 without summary.
  - challenged token can decline; challenger token can cancel; wrong role cannot.
  - challenged token can accept and receives only its own game invite.
  - challenger token can fetch the accepted challenge and receives only its own game invite.
  - accepted route installs `gameRecord` into `OnlineGameService`; immediate REST join and WebSocket join work with returned invites.
  - already terminal challenges return controlled public errors, not generic persistence failures.
  - action responses/logs contain no challenge tokens outside explicit fragment URLs returned on create.
- [x] Run `npm test -- src/online/server/__tests__/createOnlineHttpServer.test.ts` and verify the new tests fail.
- [x] Implement challenge id/token helpers, fragment browser URL builder, bearer resolver, lazy expiry helper, and rate limiters.
- [x] Wire store callbacks: `appendChallengeCreated`, `appendChallengeEvent`, `loadChallengeSummaries`, `resolveChallengeCredential`, and `acceptChallengeAndCreateGame`.
- [x] Keep an in-memory challenge fallback for local tests/dev only, using the same token hashing and role resolution semantics.
- [x] Run `npm test -- src/online/server/__tests__/createOnlineHttpServer.test.ts`.

## Task 5: Minimal Browser Challenge Flow

- [x] Add client helpers in `src/online/client.ts`:
  - parse challenge browser links.
  - store challenge tokens in `sessionStorage`.
  - strip fragment tokens from the visible URL.
  - call challenge view/accept/decline/cancel routes with bearer headers.
- [x] Add minimal app state in `src/App.tsx` for challenge pending, challenged accept, accepted redirect, expired, declined, cancelled, and access-denied states.
- [x] In `src/components/GameSetup.tsx`, keep immediate online rooms as a clearly named private room action and add/prepare a distinct challenge action; do not present two identical invite concepts.
- [x] Add tests for token stripping, pending view, accept navigation, and challenger post-accept game invite retrieval.
- [x] Run the focused app/client tests.

## Task 6: Smoke, Browser QA, Docs, Review

- [x] Update direct smoke to create a challenge, fetch as challenged, accept, fetch as challenger, and join the created game from both role-specific game invites.
- [x] Update browser smoke to exercise fragment token capture, pending page, accept, challenger retrieval, and immediate two-player join.
- [x] Update docs:
  - immutable challenge setup terms.
  - challenge credential storage.
  - fragment browser links and bearer API auth.
  - role-specific game invite retrieval.
  - atomic accept transaction.
  - lazy/internal expiry.
- [x] Update UI benchmark checklist with challenge pending/accept/accepted/expired/cancelled/declined screenshots.
- [x] Run reviewers for backend transaction/security and challenge/UI fit.
- [x] Fix Critical and Important findings.
- [x] Run `npm test`, `npm run build`, `npm run server:build`, direct online smoke, browser smoke, and `git diff --check`.
- [x] Commit and push with message `Add online challenge endpoint auth flow`.

## Stop Condition

This slice is complete when a user can create a private challenge link, a second browser can open it, accept/decline works, the challenger can retrieve their own game link after acceptance, both players can immediately join the created game, durable rows contain no bearer tokens, accepted challenge persistence is atomic with game creation, reviewers report no Critical/Important findings, verification passes, and the branch is pushed.
