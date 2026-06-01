# Lobby Refresh And Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add server-backed open-seek filters and a lightweight auto-refresh/freshness Lobby experience.

**Architecture:** Extend the open-seek directory contract first, then thread it through HTTP, PostgreSQL, client helpers, and the Lobby UI. Keep all filters token-free and apply them before pagination.

**Tech Stack:** TypeScript, Express, PostgreSQL JSONB payload filtering, React, Vitest, Testing Library, Playwright screenshot audits.

---

### Task 1: Open Seek Directory Filter Contract

**Files:**
- Modify: `src/online/seeks.ts`
- Test: `src/online/__tests__/seeks.test.ts`

- [x] Add `OpenSeekDirectoryClockFilter = "timed" | "casual"` and `OpenSeekDirectoryVpFilter = "enabled" | "disabled"`.
- [x] Extend `OpenSeekDirectoryListOptions` with optional `creatorSeat`, `clock`, and `vp`.
- [x] Add `openSeekMatchesDirectoryFilters(summary, options)` and test creator-side, timed/casual, VP enabled/disabled combinations.
- [x] Pin semantics in tests: `creatorSeat=random` is supported; `clock=casual` is missing `setup.timeControl`; `vp=disabled` includes missing `gameRules` and `vpModeEnabled:false`.
- [x] Keep directory response validation token-free and schema-compatible.

### Task 2: HTTP And PostgreSQL Filtering

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/PostgresOnlineGameStore.ts`
- Test: `src/online/server/__tests__/createOnlineHttpServer.test.ts`
- Test: `src/online/server/__tests__/PostgresOnlineGameStore.test.ts`

- [x] Parse `creatorSeat`, `clock`, and `vp` on `GET /api/online/seeks`, rejecting duplicates and invalid values.
- [x] Apply filters before cursor and limit in the in-memory paginator.
- [x] Apply equivalent parameterized PostgreSQL JSONB filters before cursor and limit; avoid `payload::text LIKE` and string-built SQL fragments containing untrusted values.
- [x] Add HTTP tests proving adversarial pagination: unmatching newer rows do not hide older matching rows with `limit=1`, equal-`updatedAt` seekId tie-breakers are stable, and second-page cursors continue under the same filters.
- [x] Add HTTP tests for invalid params, duplicate new params, secret-looking values on allowed params, unknown secret-looking params, and sanitized error bodies.
- [x] Add PostgreSQL store tests proving filters are reflected in query behavior, adversarial pagination works before limit/cursor, parameter values are bound, and responses do not leak tokens.

### Task 3: Client API And Lobby UI

**Files:**
- Modify: `src/online/client.ts`
- Modify: `src/components/OnlineGameBrowser.tsx`
- Modify: `src/css/OnlineGameBrowser.css`
- Test: `src/online/__tests__/client.test.ts`
- Test: `src/components/__tests__/OnlineGameBrowser.test.tsx`

- [x] Thread the new filter options through `fetchOpenSeekDirectory`.
- [x] Add Lobby filter controls for creator side, clock, and VP mode.
- [x] Load open seeks with those filters from the server; search remains local text filtering.
- [x] Add filtered-empty copy distinct from the true empty Lobby.
- [x] Add last-checked status text after successful loads.
- [x] Add 30-second auto-refresh for the public Lobby while active and visible; background refreshes must not clear the current list, must not repeatedly announce `Loading...`, must not overlap in-flight loads, and must run once when the document becomes visible again.
- [x] Add owner auto-refresh every 30 seconds while an owned seek is open, using the existing bearer-only `fetchOpenSeek` path, with the same visible-tab and in-flight guards.
- [x] Back off auto-refresh for at least 60 seconds after a rate-limit error while keeping manual Refresh available.
- [x] Preserve pending accept/cancel affordances and focus until the action resolves, even if a background refresh replaces or omits that seek row.
- [x] Cover fake-timer, visible/hidden, return-to-visible, no-spin-after-429, pending-action/focus, honest checked/refreshed copy, last-checked only after successful loads, filtered-empty, and filter tests.
- [x] CSS acceptance: at 430 x 932, 390 x 844, and 360 x 640, the Lobby toolbar with all filters plus Refresh/Create/Search/freshness text must not horizontally overflow, overlap, or clip button/select labels.

### Task 4: Verification, Review, Docs, And Push

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/ui/online-ui-benchmark-checklist.md`

- [x] Run focused tests for open seek contract, client helpers, HTTP server, PostgreSQL store, and OnlineGameBrowser.
- [x] Run reviewer agents for backend/security and UI/accessibility.
- [x] Run full `npm test`, `npm run build`, `npm run server:build`, `git diff --check`.
- [x] Run browser smoke with the local PostgreSQL-backed server.
- [x] Capture or update screenshot QA at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640 for all-Lobby-filters-active, Create button present, long seek IDs, filtered-empty, loading/refreshing, pending accept/cancel, owner open, owner accepted, and Watch/Archive toolbar regression.
- [x] Commit and push after all gates pass.
