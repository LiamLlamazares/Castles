# Phase 5 Access Policy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put all online visibility and role decisions behind one shared access-policy module before adding challenges.

**Architecture:** Keep this slice contract-first and small. The read model keeps summary projection and validation; a new `src/online/accessPolicy.ts` owns role naming, public listing checks, and spectator authorization. HTTP and WebSocket spectator paths call the same policy helper so private/challenge work cannot accidentally diverge between transports.

**Tech Stack:** TypeScript, Vitest, Express, `ws`, existing online DTO/read-model/server helpers.

---

## Files

- Create: `src/online/accessPolicy.ts`
- Create: `src/online/__tests__/accessPolicy.test.ts`
- Modify: `src/online/readModel.ts`
- Modify: `src/online/__tests__/readModel.test.ts`
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`
- Modify: `docs/online-data-contract.md`
- Modify: `docs/online-multiplayer-plan.md`

## Task 1: Extract Shared Access Policy

- [x] Write failing tests in `src/online/__tests__/accessPolicy.test.ts` for:
  - `roleForOnlineSeat("w") === "white"` and `roleForOnlineSeat("b") === "black"`.
  - `canListOnlineGameSummary` returns true only for `visibility: "public"`.
  - `canAccessOnlineGameSummary` allows white, black, moderator, and admin for every visibility.
  - `canAccessOnlineGameSummary` allows spectator for `public` and `unlisted`, but not `private`.
  - `canAccessOnlineGameSummary` allows the `challenged` role for `private`, with a test name that says this role is only assigned after separate identity/challenge binding.
  - `canSpectateOnlineGameSummary` allows public/unlisted spectators and rejects private spectator access.
- [x] Run `npm test -- src/online/__tests__/accessPolicy.test.ts` and verify it fails because the module does not exist.
- [x] Create `src/online/accessPolicy.ts` with:
  - `OnlineAccessRole`
  - `roleForOnlineSeat`
  - `canAccessOnlineGameSummary`
  - `canListOnlineGameSummary`
  - `canSpectateOnlineGameSummary`
- [x] Update `src/online/readModel.ts` to import/re-export `OnlineAccessRole`, `roleForOnlineSeat`, `canAccessOnlineGameSummary`, and `canListOnlineGameSummary` so existing callers keep working during the no-legacy-but-low-churn transition.
- [x] Replace direct use of `isOnlineGameSummaryListed` in tests/callers with `canListOnlineGameSummary`; remove `isOnlineGameSummaryListed`.
- [x] Run `npm test -- src/online/__tests__/accessPolicy.test.ts src/online/__tests__/readModel.test.ts`.

## Task 2: Enforce Policy In HTTP And WebSocket Spectator Paths

- [x] Add a local helper in `src/online/server/createOnlineHttpServer.ts` that loads and validates a game summary by id when `loadGameSummaries` is configured.
- [x] Add a helper that checks spectator access through `canSpectateOnlineGameSummary`; if no summary loader is configured, keep current private-link beta behavior and allow access.
- [x] When `loadGameSummaries` is configured, fail closed: missing summaries, invalid summaries, and private summaries all return the same `not_found` rejection so private game existence is not leaked.
- [x] Write failing tests in `src/online/server/__tests__/createOnlineHttpServer.test.ts`:
  - HTTP spectator snapshot for a room whose summary is `private` returns 404.
  - HTTP spectator snapshot for a room whose summary is `unlisted` returns 200 when `loadGameSummaries` is configured.
  - WebSocket `spectate` for a room whose summary is `private` receives `error.code === "not_found"`.
  - WebSocket `spectate` for a room whose summary is `unlisted` receives `spectating` when `loadGameSummaries` is configured.
  - WebSocket `spectate` for a room with no summary receives `error.code === "not_found"` when `loadGameSummaries` is configured.
  - Existing public summary listing still returns only public summaries and no token-bearing data.
- [x] Run the targeted server test and verify the new tests fail.
- [x] Wire HTTP `/api/online/games/:gameId/spectator` through the shared spectator policy before timeout adjudication.
- [x] Wire WebSocket `spectate` through the same shared spectator policy before setting `connections`.
- [x] Run `npm test -- src/online/server/__tests__/createOnlineHttpServer.test.ts`.

## Task 3: Update Contract Docs And Review

- [x] Update `docs/online-data-contract.md` to state that summary listing and spectator authorization use `src/online/accessPolicy.ts`, that `challenged` is only a role after separate identity/challenge binding, and that configured summary lookup fails closed when a summary is missing or invalid.
- [x] Update `docs/online-multiplayer-plan.md` Phase 5 status to say the first access-policy foundation slice is underway, the next challenge slice must add lifecycle events and identity binding, and UI shell polish remains pulled forward after challenge/access surfaces are sketched.
- [x] Document that broadcasts are not re-authorized during a game until visibility-change events exist; future visibility changes must revalidate or disconnect spectator sockets before private/public visibility can change mid-game.
- [x] Document that summary lookup scans `loadGameSummaries()` for this low-scale slice and can be replaced by `loadGameSummary(gameId)` when scale requires it.
- [x] Run reviewers for access-policy correctness, security/privacy, and plan fit.
- [x] Fix Critical and Important review findings.
- [x] Run `npm test`, `npm run build`, `npm run server:build`, `git diff --check`, direct online smoke, and browser online smoke.
- [x] Commit and push with message `Add shared online access policy`.

## Stop Condition

This slice is complete when public listing and spectator access both use the shared policy, private summaries are no longer spectatable through either HTTP or WebSocket spectator paths, existing private-link beta flows still pass, docs identify the new policy boundary, reviewers report no Critical/Important findings, tests/builds/smokes pass, and the branch is pushed.
