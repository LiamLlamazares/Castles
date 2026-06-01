# Quick Match v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simple Quick Match action that accepts a compatible open seek or creates a normal open seek when no match exists.

**Architecture:** Build Quick Match as a thin server-backed automation layer over the existing open-seek lifecycle. The server selects and accepts compatible seeks with existing atomic accept logic, or falls back to existing seek creation; the client validates the outcome and reuses current accepted-game and owned-seek UI paths.

**Tech Stack:** TypeScript, Express, PostgreSQL-backed open seeks, React, Vitest, Testing Library, Playwright screenshot audit.

---

### Task 1: Quick Match Contract And Client Helper

**Files:**
- Modify: `src/online/client.ts`
- Test: `src/online/__tests__/client.test.ts`

- [x] Add `QuickMatchResponse` as a discriminated union:
  - `outcome: "matched"`, `role: "acceptor"`, `summary`, `gameInvite`.
  - `outcome: "waiting"`, `role: "creator"`, `seekId`, `summary`, `creator`.
- [x] Add `startQuickMatch(setup, options, fetchImpl)` that posts to `/api/online/matchmaking/quick` with `{ setup, sessionId, expiresInMs }`.
- [x] Reuse existing `resolveOnlineAnonymousSessionId`, `validateOpenSeekSummary`, and game-invite validation.
- [x] Test matched response validation, waiting response validation, malformed outcome rejection, missing creator token rejection, malformed invite rejection, and tokenless invite URL preservation.
- [x] Add red tests for missing `protocolVersion`, mismatched `outcome`/`role`, `gameInvite.url` containing `token=`, and `waiting.seekId !== waiting.summary.seekId`.
- [x] Test that `startQuickMatch` sends the anonymous session id by default and allows a supplied `sessionId`.

### Task 2: Server Quick Match Route

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Test: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] Extract the duplicated open-seek accept logic from `POST /api/online/seeks/:seekId/accept` into a local helper that accepts a loaded summary and acceptor identity, then returns the existing acceptor response shape.
- [x] Extract normal open-seek setup normalization into a helper shared by `POST /api/online/seeks` and Quick Match. It must keep the current behavior of filling missing `timeControl` with the default `20+20`.
- [x] Add a pure canonical setup signature helper inside the server module:
  - input is a normalized `OnlineGameSetupDTO`;
  - recursively sort object keys before JSON stringifying;
  - preserve array order;
  - include board config/castles, pieces, sanctuaries, sanctuary settings, time control, game rules, initial pool types, and piece theme.
- [x] Match candidates only when `canonicalSetupSignature(candidate.setup) === canonicalSetupSignature(normalizedSubmittedSetup)`.
- [x] Add `POST /api/online/matchmaking/quick`.
- [x] Validate request setup with `validateOnlineGameSetup`.
- [x] Validate `sessionId` with `normalizePublicSessionIdentity`.
- [x] Parse `expiresInMs` with existing open-seek expiry bounds.
- [x] Rate limit the endpoint with a dedicated per-client limiter no looser than normal open-seek creation: 20 requests per 60 seconds. Do not use the public-directory limiter.
- [x] Add a per-session Quick Match queue or lock keyed by the validated public session id. The lock must wrap same-session active-seek checks, candidate matching, terminal-race retries, and fallback creation.
- [x] Document that the v1 lock is process-local and that multi-instance deployment needs a PostgreSQL advisory lock, active-seek constraint, or equivalent shared lock before horizontal workers are enabled.
- [x] Under that lock, load all current seek summaries and reject same-session summaries with status `open` or `accepted` before accepting candidates or creating fallback seeks, using `409` and a sanitized `existing_open_seek` error. This protects direct API callers and client restore races from creating duplicate same-session seeks or matching while an owned seek still needs action.
- [x] Page through open seeks with `{ state: "open", limit: ONLINE_SEEK_DIRECTORY_MAX_LIMIT }` until a compatible candidate is accepted or the directory is exhausted; skip expired, incompatible, and same-session seeks. This intentionally avoids treating a compatible seek on a later page as nonexistent.
- [x] If accepting a candidate fails because it is terminal, retry the next compatible candidate.
- [x] If no candidate can be accepted, create a normal open seek with `creatorSeat: "random"` using the same normalized setup helper, existing credential creation, and `appendOpenSeekCreated`.
- [x] Return `outcome: "matched"` with tokenless accepted-game URL, or `outcome: "waiting"` with creator token only in the direct response.
- [x] Add HTTP tests for match-first, fallback-create, same-session open/accepted conflict before matching or fallback, concurrent same-session fallback where only one request proceeds and the other receives sanitized `409 existing_open_seek`, self-seek skip, exact setup mismatch skip, missing-time-control normalization, terminal race retry, malformed request rejection, sanitized errors, token hygiene, and the dedicated 20-per-minute rate limit.
- [x] Add one store-wired HTTP test using injected `listOpenSeekSummaries` and `acceptOpenSeekAndCreateGame`, proving the route works with the same boundaries as the PostgreSQL-backed server path rather than only the default in-memory path.

### Task 3: App And Lobby UI Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/OnlineGameBrowser.tsx`
- Test: `src/__tests__/App.test.tsx`
- Test: `src/components/__tests__/OnlineGameBrowser.test.tsx`

- [x] Add `onQuickMatch` prop to `OnlineGameBrowser`.
- [x] Render `Quick Match` beside `Create Open Seek` in Lobby with the accessible label `Quick Match: accept a compatible open seek or list yours`.
- [x] Render a compact setup summary near Quick Match showing that exact setup matching is used. It must include copy such as `Uses your exact current Play setup`, board radius, timed/casual clock details, victory-points/castle-control mode, and a short note that current board, pieces, sanctuaries, pool, theme, clock, and scoring mode must match.
- [x] Disable Quick Match while `ownedSeekIds.length > 0` and the owned seek is not known terminal. This includes the restore window where stored creator credentials exist but `ownedSeekResponse` is still `null`, plus `open` and `accepted` owner-panel states; Quick Match v1 supports one active owned seek at a time and the owner panel remains the path for refresh/cancel/join.
- [x] Disable `Quick Match`, `Create Open Seek`, and conflicting seek actions while quick match is pending or in the matched/opening transition.
- [x] Add status copy for pending, matched, waiting, and failure states:
  - pending: `Checking compatible open seeks...`
  - matched: `Match found. Opening game...`
  - waiting: `No compatible open seek found. Your open seek is listed for someone to accept.`
  - failure: `Could not start quick match.`
- [x] Announce Quick Match status through the existing polite status line without adding a second live region.
- [x] Restore focus to the Quick Match button on failure.
- [x] After a waiting outcome, make the owner panel keyboard reachable immediately and keep the user in Lobby.
- [x] In `App.tsx`, implement `handleQuickMatch` using the current `gameConfig` serialized setup.
- [x] On matched outcome, store the accepted game invite through the same path used by open-seek accept and navigate to the online game.
- [x] On waiting outcome, remember creator params in `sessionStorage`, set `openSeekCreator`, set `openSeekResponse`, and keep the user in Lobby.
- [x] Add UI tests for setup-summary text matching the posted setup and explaining exact current setup matching, keyboard activation, pending disablement, Quick Match disabled while an owned seek is open or accepted, Quick Match disabled while stored creator credentials are restoring and `ownedSeekResponse` is still `null`, polite status copy, waiting outcome owner panel reachability, matched navigation, failure focus restoration, and no token in URL.

### Task 4: Browser QA, Docs, Review, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/ui/online-ui-benchmark-checklist.md`

- [x] Run backend/security reviewer on route selection, race handling, token hygiene, and rate limiting.
- [x] Run UI/accessibility reviewer on Quick Match placement, copy, pending states, mobile layout, and Lichess-inspired scan density.
- [x] Run focused tests for client helper, HTTP route, App integration, and OnlineGameBrowser.
- [x] Run full `npm test`, `npm run build`, `npm run server:build`, and `git diff --check`.
- [x] Run browser online smoke with the local PostgreSQL-backed server.
- [x] Capture automated screenshot/layout QA at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640 for Lobby quick-match idle, pending, waiting owner panel, matched transition if capturable, filtered empty, Watch, and Archive.
- [x] Include dense 360 x 640 and 390 x 844 states with Quick Match idle or pending, active filters/search, freshness text, owner panel, and at least one public row; fail the audit on horizontal overflow, clipped button/select text, or overlapping interactive controls.
- [x] Prepare the verified Phase 6K changeset for commit and push after all gates pass.

## Self-Review

- Spec coverage: the plan covers the API contract, compatibility rules, token hygiene, UI states, tests, reviewers, and verification gates.
- Placeholder scan: no TBD/TODO/fill-in placeholders remain.
- Type consistency: `QuickMatchResponse`, `startQuickMatch`, `onQuickMatch`, and `handleQuickMatch` are named consistently across tasks.
