# Public Directory V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track progress with the checkbox list below.

**Goal:** Make Watch and Online Archive use a small public-directory contract before lobby/matchmaking work. The slice is read-only discovery: public summaries only, state filtering, bounded result limits, opaque pagination cursors, and clearer client/UI scan controls. No accounts, ratings, chat, open seeks, or matchmaking.

**Architecture:** Keep `OnlineGameSummary` schema v1 unchanged. Add a versioned directory-list response around summaries. Move public listing from load-all/filter-in-route toward store-level listing and single-summary lookup. Keep a memory fallback for tests/dev. Then update the client and `OnlineGameBrowser` to call the directory contract.

## Files

- Modify: `src/online/readModel.ts` for directory response types, state options, validation, cursor helpers if shared.
- Modify: `src/online/client.ts` for `fetchOnlineGameSummaries({ state, limit, cursor })` and response validation.
- Modify: `src/online/server/OnlineGameStore.ts` for `listGameSummaries` and `loadGameSummary`.
- Modify: `src/online/server/PostgresOnlineGameStore.ts` for indexed public-list query and single-summary load.
- Modify: `src/online/server/createOnlineHttpServer.ts` for `GET /api/online/games?state=&limit=&cursor=` and `GET /api/online/games/:gameId/summary`.
- Modify tests under `src/online/**/__tests__`.
- Modify: `src/components/OnlineGameBrowser.tsx`, `src/css/OnlineGameBrowser.css`, and tests for state filters/sort/no-results.
- Modify docs: `docs/online-data-contract.md`, `docs/online-multiplayer-plan.md`, and `docs/ui/online-ui-benchmark-checklist.md`.

## Task 1: Contract And Client TDD

- [x] Add failing read-model/client tests for:
  - directory response schema version validation;
  - active/archive/all state queries;
  - limit/cursor query encoding;
  - invalid list response rejection;
  - no accidental acceptance of token-bearing public-list query inputs.
- [x] Implement directory response types and client helpers.
- [x] Verify focused client/read-model tests pass.

## Task 2: Server Route And Store TDD

- [x] Add failing server route tests for:
  - `state=active`, `state=archived`, and `state=all`;
  - `limit` bounds and malformed params;
  - opaque cursor pagination;
  - rejecting token/auth/credential-looking query params;
  - `/api/online/games/:gameId/summary` returning public summaries only.
- [x] Add failing Postgres store tests for store-level public listing and single-summary load without event/credential replay.
- [x] Implement store interface, Postgres queries, memory fallback, route parsing, and response wrappers.
- [x] Verify focused server/store tests pass.

## Task 3: Watch/Archive Scan UI

- [x] Add failing `OnlineGameBrowser` tests for:
  - calling the loader with tab state and bounded limit;
  - timed/casual filter;
  - result filter on archive;
  - newest/most-moves sorting;
  - filtered no-results state distinct from empty public directory;
  - long game ids/player names preserving row actions.
- [x] Implement the controls using dense Lichess-style scan rows adapted to Castles.
- [x] Verify component tests pass.

## Task 4: Review, Browser Checks, Docs, Commit

- [x] Run reviewers focused on data-contract/security and Watch/Archive UX/accessibility.
- [x] Run full verification:
  - `npm test`
  - `npm run build`
  - `npm run server:build`
  - `git diff --check`
- [x] Run local browser smoke:
  - `npm run online:smoke:browser -- http://127.0.0.1:<port>`
- [x] Run focused Playwright screenshot audit for desktop/mobile Watch with live/archive/filter/no-results states.
- [x] Update docs.
- [x] Commit and push.

## Review Notes

- Backend/data-contract/security reviewer found no remaining issues after secret-query, cursor, and rate-limit fixes.
- Watch/Archive UX reviewer found one Important issue: filtered-empty pages hid pagination. This was fixed by rendering the Load More control outside the empty/list branch and covered with a regression test.
- Minor UX reviewer findings were accepted: status copy now says games are shown rather than total, filtered-empty copy no longer suggests sort as a remedy, and the archive-result reset test verifies the filter returns to `all`.
- Focused Playwright screenshot audit passed at 1440 x 900, 820 x 700, and 430 x 932 with no horizontal overflow, visible pagination, and archive rows showing Analyze Replay without Copy Link.

## Reviewer Guidance

- Accept: public directory/read-only Watch/Archive improvements, server-owned public filtering, bounded pagination, scan controls.
- Reject/defer: public lobby/open seeks, matchmaking, accounts, ratings, chat, moderation, tournaments, and user-settable private visibility.
- Critical risk: never expose unlisted/private games or bearer material through public directory APIs.
