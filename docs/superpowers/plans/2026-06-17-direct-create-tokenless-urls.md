# Direct-Create Tokenless URLs Slice

Date: 2026-06-17
Status: completed

## Objective

Delete the remaining legacy direct-created online game URL shape that places player bearer tokens in `?token=` query parameters.

## Assumptions

- Direct-created games may still return raw `white.token` and `black.token` in the authenticated create response body.
- Browser clients should store those returned seat tokens in `sessionStorage` before navigating tokenless player URLs.
- Existing negative fixtures that intentionally mention `token=secret` remain useful sanitizer coverage and are not part of this cleanup.
- `CASTLES_DEPLOYMENT_MODE=multi-instance` remains rejected; this slice is only a no-legacy URL contract cleanup.

## Non-Goals

- No new account, rating, moderation, lobby, or deployment-mode behavior.
- No migration for historical browser URLs.
- No UI layout work or screenshots unless the implementation changes visible layout.

## Required Artifacts

- Service test proving direct-created `white.url` and `black.url` are tokenless.
- HTTP API test proving `POST /api/online/games` returns tokenless player URLs.
- Browser smoke script test proving the direct-create smoke stores response-body tokens before tokenless navigation.
- Roadmap update with verification evidence and review disposition.
- Commit and push from `master`.

## Success Criteria

- `OnlineGameService.createGame()` returns direct player URLs with `onlineGame` and `seat` but no `token`.
- The direct-create HTTP response still includes `white.token` and `black.token`.
- The production browser smoke never depends on query-token direct-create URLs; it stores tokens into the existing `castles_online_join:<gameId>:<seat>` session storage keys before navigation.
- Focused tests, full tests, build, server build, audit, and diff check pass.
- Code review findings are classified as accept/reject/investigate/defer.

## Planned Tests

- `npx vitest run src/online/__tests__/OnlineGameService.test.ts -t "creates tokenless private invite URLs"`
- `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "creates games through the HTTP API"`
- `npx vitest run scripts/deploy/__tests__/online-browser-smoke-script.test.mjs`
- Full verification after green.

## Evidence

- Red tests first failed for direct-created service URLs, direct-created HTTP URLs, and the production browser-smoke direct-create token-storage helper.
- Green focused verification passed:
  - `npx vitest run src/online/__tests__/OnlineGameService.test.ts -t "creates tokenless private invite URLs"`
  - `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "creates games through the HTTP API"`
  - `npx vitest run scripts/deploy/__tests__/online-browser-smoke-script.test.mjs`
  - `npx vitest run src/online/__tests__/client.test.ts -t "account"`
  - `npx vitest run scripts/deploy/__tests__/local-online-browser-smoke-script.test.mjs`
- Live local browser smoke passed with `DATABASE_URL=postgresql://castles_local:castles_local_dev@localhost:5432/castles_local`: `npm run online:smoke:local:browser`.
- Final verification passed `npx vitest run` (140 files passed, 1 skipped; 1681 tests passed, 3 skipped), `npm run build`, `npm run server:build`, `npm run audit`, and `git diff --check` with CRLF conversion warnings only.

## Review Findings

| Finding | Source | Severity | Counterexample / Evidence | Proposed Action | Decision | Cognitive Root |
|---|---|---|---|---|---|---|
| Direct-create tokenless URL contract | Local code review | note | Service/API/browser-smoke tests and live local browser smoke prove direct-created URLs no longer carry `token=` while response-body tokens still seed `sessionStorage`. | No change. | reject | none |
| Local browser smoke shutdown timeout was too broad after the initial fix | Local code review | minor | The graceful drain path needs 40 seconds, but the post-SIGKILL cleanup path should retain a short 7-second wait. | Split graceful `shutdownTimeoutMs` from `forcedKillTimeoutMs` and add a source guard. | accept | over-broad timeout repair |

## Follow-Up

- The broader `onlineOpponentInviteUrl` storage and `Copy Opponent Invite` UI path still looks like legacy direct-invite surface area. It was not deleted in this non-layout slice because it is visible UI behavior and needs its own screenshot/review gate.
