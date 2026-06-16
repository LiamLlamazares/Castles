# Shared Rate Limit Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advance Item 11 by making Castles online HTTP/WebSocket fixed-window rate limits explicit runtime-coordinator semantics with a PostgreSQL-backed shared implementation available for multi-instance readiness.

**Architecture:** Replace the route-local `FixedWindowRateLimiter` objects in `createOnlineHttpServer.ts` with `runtimeCoordinator.consumeRateLimit(...)`. The single-node coordinator preserves the current process-local fixed-window behavior; a new PostgreSQL rate-limit store implements the same fixed-window consume operation with row locks and safe key validation. Production remains on the single-node coordinator, so this slice does not enable `CASTLES_DEPLOYMENT_MODE=multi-instance`.

**Tech Stack:** TypeScript, Express, WebSocket, Vitest, PostgreSQL row-lock fixed-window counters.

---

## Scope

This slice implements the multi-instance design requirement to make rate-limit semantics explicit. It covers the existing server-side fixed-window limiter scopes currently embedded in `createOnlineHttpServer.ts`:

- `create_game`
- `account_create`
- `account_auth`
- `account_read`
- `admin_read`
- `create_challenge`
- `create_open_seek`
- `quick_match`
- `challenge_action`
- `open_seek_action`
- `public_directory`
- `spectator_snapshot`
- `socket_message`

Non-goals:

- Do not enable `CASTLES_DEPLOYMENT_MODE=multi-instance`.
- Do not wire the PostgreSQL rate-limit coordinator into production traffic yet.
- Do not change current limit numbers, windows, route response bodies, trusted error copy, or client backoff behavior.
- Do not add two-instance smoke tests in this slice.
- Do not keep the legacy `FixedWindowRateLimiter` after all call sites route through the coordinator.

## Files

- Modify `src/online/server/onlineRuntimeCoordinator.ts`
- Create `src/online/server/PostgresOnlineRateLimitStore.ts`
- Modify `src/online/server/createOnlineHttpServer.ts`
- Modify `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`
- Create `src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts`
- Modify `src/online/server/__tests__/createOnlineHttpServer.test.ts`
- Modify `docs/online-multiplayer-plan.md`
- Modify this plan with execution evidence

## Tasks

### Task 1: Coordinator Rate-Limit API

- [x] Write failing coordinator tests proving the single-node coordinator enforces a fixed-window limit per `(scope, key)` and keeps scopes independent.
- [x] Write a failing PostgreSQL coordinator delegation test proving `consumeRateLimit(...)` delegates the full `{ scope, key, limit, windowMs }` input to a rate-limit store.
- [x] Run `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "rate limit"` and confirm failures are missing coordinator API/delegation.
- [x] Add `OnlineRuntimeRateLimitScope`, `OnlineRuntimeRateLimitInput`, `OnlineRuntimeRateLimitStore`, and `consumeRateLimit(...)` to `OnlineRuntimeCoordinator`.
- [x] Add process-local fixed-window state to `createSingleNodeOnlineRuntimeCoordinator`.
- [x] Add `createPostgresRateLimitRuntimeCoordinator(...)` and capability metadata for shared PostgreSQL rate limits.
- [x] Re-run the targeted coordinator tests and confirm they pass.

### Task 2: PostgreSQL Rate-Limit Store

- [x] Write failing store tests proving safe scopes/keys create and update one fixed-window row under a transaction.
- [x] Write failing store tests proving the store rejects invalid scopes, invalid limits/windows, empty/long keys, and secret-looking keys before persistence.
- [x] Write failing store tests proving a row at limit rejects further consumes until the window expires, then resets to count 1.
- [x] Run `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts` and confirm failures are due to the missing store.
- [x] Implement `PostgresOnlineRateLimitStore` with an `online_rate_limits` table keyed by `(scope, rate_key, window_ms)`.
- [x] Use a transaction, row creation, `FOR UPDATE`, and database/app-row timestamps to update the counter atomically.
- [x] Re-run the store tests and confirm they pass.

### Task 3: HTTP/WebSocket Route Wiring

- [x] Write failing route tests proving Quick Match and challenge action limits call `runtimeCoordinator.consumeRateLimit(...)` with scopes `quick_match` and `challenge_action`.
- [x] Write failing route tests proving account/admin/public-directory/open-seek/spectator/socket limits call `runtimeCoordinator.consumeRateLimit(...)` with the correct scopes while preserving current status codes/messages.
- [x] Run the targeted route tests and confirm failures are missing coordinator calls.
- [x] Delete the embedded `FixedWindowRateLimiter` class and limiter instances from `createOnlineHttpServer.ts`.
- [x] Replace all `.take(...)` call sites with a shared async `consumeRouteRateLimit(scope, key, limit, windowMs)` helper that calls the runtime coordinator.
- [x] Preserve existing route ordering: rate limits that currently happen before auth remain before auth, and limits that intentionally hide admin-resource existence continue to influence the `rate_limited_not_found` log reason.
- [x] Re-run targeted route tests and confirm they pass.

### Task 4: Roadmap, Review, Verification, Commit

- [x] Update `docs/online-multiplayer-plan.md` with the completed sub-slice, evidence, non-goals, and remaining Item 11 work.
- [x] Update this plan with exact red/green verification evidence.
- [x] Run a code review pass focused on shared semantics coverage, key privacy, route ordering, admin hidden-resource behavior, and whether any legacy process-local limiter remains.
- [x] Classify findings as accept/reject/investigate/defer; apply accepted code/test fixes.
- [x] Run verification:
  - `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "rate limit|rate-limited|RateLimit"`
  - broader affected suites as needed
  - `npm run build`
  - `npm run server:build`
  - `npm run audit`
  - `git diff --check`
- [ ] Commit and push the completed slice.

## Execution Evidence

- Red: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "rate limit|rate-limit"` failed because `consumeRateLimit` and `createPostgresRateLimitRuntimeCoordinator` did not exist.
- Green: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "rate limit|rate-limit"` passed with 3 matching tests after adding coordinator rate-limit API, process-local fixed-window state, and PostgreSQL delegation.
- Red: `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts` failed because `../PostgresOnlineRateLimitStore` did not exist.
- Green: `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts` passed with 6 tests after adding the PostgreSQL store.
- Red: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "routes HTTP fixed-window rate limits|routes websocket message rate limits"` failed because HTTP routes returned their legacy non-429 responses and WebSocket ping returned `pong`; the injected runtime coordinator was not consulted.
- Green: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "routes HTTP fixed-window rate limits|routes websocket message rate limits"` passed with 2 matching tests after route wiring moved to `runtimeCoordinator.consumeRateLimit(...)`.
- Affected subset: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts` passed with 34 tests.
- Affected route subset: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "rate limits|rate-limited|routes HTTP fixed-window rate limits|routes websocket message rate limits|admin rate limit"` passed with 13 matching tests.
- Legacy cleanup: `rg -n "FixedWindowRateLimiter|accountReadLimiter|accountAuthLimiter|accountCreateLimiter|adminReadLimiter|createChallengeLimiter|createOpenSeekLimiter|quickMatchLimiter|challengeActionLimiter|openSeekActionLimiter|publicDirectoryLimiter|spectatorSnapshotLimiter|socketMessageLimiter|\\.take\\(" src/online/server/createOnlineHttpServer.ts src/online/server` found no matches.

## Review Findings

| Finding | Source | Severity | Counterexample / Evidence | Proposed Action | Decision | Cognitive Root |
|---|---|---|---|---|---|---|
| HTTP and WebSocket rate-limit keys forwarded raw trusted proxy values into the runtime coordinator. Oversized forwarded values could turn existing routes into 500/bad-request responses, and secret-looking forwarded values could reach the shared persistence boundary. | Read-only reviewer, 2026-06-16 | major | Red: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "bounds and sanitizes trusted forwarded"` failed with HTTP 500 for an oversized forwarded key and a WebSocket error instead of `pong`. | Normalize rate-limit client keys before `runtimeCoordinator.consumeRateLimit(...)`: preserve bounded safe client addresses, fingerprint oversized/unsafe/secret-looking values, and cover both HTTP and WebSocket entries. | accept | boundary normalization drift |
| `PostgresOnlineRateLimitStore.consumeRateLimit(...)` could run `BEGIN`, `SELECT ... FOR UPDATE`, updates, and `COMMIT` through a supplied `queryable` without requiring a transaction client; a pg.Pool would not guarantee all statements use the same connection. | Read-only reviewer, 2026-06-16 | major | Red: `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts -t "requires a transaction client factory"` resolved `true` instead of rejecting. | Require `transactionClientFactory` for valid consume operations while keeping queryable-only schema creation and invalid-input validation query-free. | accept | transaction-boundary assumption |
| The first key-normalization fix still preserved bounded raw online entity/session-shaped values such as `account_session_...`, `account_...`, and `challenge_...` because they matched the safe character pattern and `stringContainsDurableSecret(...)` does not flag standalone ids. | Read-only reviewer, 2026-06-16 | major | Red: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "bounds and sanitizes trusted forwarded"` failed because the runtime coordinator saw raw `account_session_forwarded_secret` and `challenge_forwarded_secret`; `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts -t "raw online entity"` failed because the store reached the transaction guard instead of rejecting the key. | Fingerprint raw entity/session-shaped HTTP/WebSocket rate-limit client keys and reject them before persistence in `PostgresOnlineRateLimitStore`. | accept | boundary normalization drift |

Accepted-fix evidence:

- Red: `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts -t "requires a transaction client factory"` failed because queryable-only consume resolved `true`.
- Green: `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts -t "requires a transaction client factory"` passed after requiring a transaction client factory before valid consumes.
- Red: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "bounds and sanitizes trusted forwarded"` failed because HTTP returned 500 for an oversized forwarded key and WebSocket returned an error instead of `pong`.
- Green: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "bounds and sanitizes trusted forwarded"` passed after normalizing client rate-limit keys before the runtime coordinator boundary.
- Affected fix subset: `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts` passed with 7 tests.
- Affected route subset after fixes: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "rate limits|rate-limited|routes HTTP fixed-window rate limits|routes websocket message rate limits|bounds and sanitizes trusted forwarded|admin rate limit"` passed with 15 matching tests.
- Coordinator subset after fixes: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "rate limit|rate-limit"` passed with 3 matching tests.
- Full affected trio after fixes: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts` passed with 230 tests.
- Red: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "bounds and sanitizes trusted forwarded"` failed because raw `account_session_forwarded_secret` and `challenge_forwarded_secret` were still preserved as coordinator keys.
- Red: `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts -t "raw online entity"` failed because `account_session_secret` reached the transaction-client guard instead of key validation.
- Green: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "bounds and sanitizes trusted forwarded"` passed with 2 matching tests after entity/session-shaped client keys were fingerprinted.
- Green: `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts -t "raw online entity"` passed after the store rejected raw online entity/session-shaped keys before persistence.
- Affected entity-fix subset: `npx vitest run src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts` passed with 8 tests; `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "rate limits|rate-limited|routes HTTP fixed-window rate limits|routes websocket message rate limits|bounds and sanitizes trusted forwarded|admin rate limit"` passed with 15 matching tests; `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "rate limit|rate-limit"` passed with 3 matching tests.
- Full affected trio after entity-fix review: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineRateLimitStore.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts` passed with 231 tests.
- Final full suite: `npx vitest run` passed with 133 files passed, 1 skipped; 1595 tests passed, 3 skipped. A prior full-suite run produced one non-reproduced `OnlineGameBrowser.test.tsx` failure; the failing test passed in isolation, the full `OnlineGameBrowser.test.tsx` file passed with 154 tests, and the later fresh full-suite run passed.
- Final build: `npm run build` passed with the existing Vite large-chunk warning only.
- Final server build: `npm run server:build` passed.
- Final audit: `npm run audit` passed with 0 vulnerabilities.
- Final diff check: `git diff --check` passed with CRLF conversion warnings only.
- Legacy limiter cleanup: `rg -n "FixedWindowRateLimiter|accountReadLimiter|accountAuthLimiter|accountCreateLimiter|adminReadLimiter|createChallengeLimiter|createOpenSeekLimiter|quickMatchLimiter|challengeActionLimiter|openSeekActionLimiter|publicDirectoryLimiter|spectatorSnapshotLimiter|socketMessageLimiter|\\.take\\(" src/online/server/createOnlineHttpServer.ts src/online/server server` found no matches.
