# Remove Legacy Opponent Invite UI Slice

Date: 2026-06-17
Status: completed

## Objective

Delete the legacy move-enabled opponent invite surface that persisted and displayed a second player link from direct-created online games.

## Assumptions

- Direct-created player URLs are already tokenless, and player seat tokens live in `sessionStorage`.
- Lichess-like inviting should happen through challenge, account challenge, open seek, and spectator/share flows rather than a hidden "copy black's move-enabled link" control on the game board.
- No legacy compatibility migration is required; stale `castles_online_opponent_invite:*` browser keys may be ignored because no current code should read them.
- `CASTLES_DEPLOYMENT_MODE=multi-instance` remains rejected; this slice is UI/storage cleanup only.

## Non-Goals

- No new challenge, lobby, account, rating, or moderation behavior.
- No migration for historical browser `sessionStorage`.
- No changes to public spectator links, challenge share links, open seek creator tokens, or player join token storage.

## Required Artifacts

- Component tests proving stale opponent-invite props do not expose a "Copy Opponent Invite" control.
- Client/source tests proving legacy opponent-invite storage helpers are removed.
- Browser smoke script test proving both player screens check for absence of the legacy control.
- Screenshot or local UI audit evidence for the visible control removal.
- Roadmap update with verification evidence and review disposition.
- Commit and push from `master`.

## Success Criteria

- No `Copy Opponent Invite` button or move-enabled opponent invite copy handler remains.
- `OnlineClientSession` no longer carries `opponentInviteUrl`.
- `App` no longer stores, restores, or passes `onlineOpponentInviteUrl`.
- `src/online/client.ts` no longer exposes `rememberOnlineOpponentInviteUrl`, `resolveOnlineOpponentInviteUrl`, `forgetOnlineOpponentInviteUrl`, or the `castles_online_opponent_invite:*` storage key.
- Spectator links, publish/unlist controls, and private player join token storage continue to work.
- Focused tests, full tests, build, server build, audit, diff check, and UI verification pass.
- Code review findings are classified as accept/reject/investigate/defer.

## Planned Tests

- `npx vitest run src/components/__tests__/ControlPanel.test.tsx -t "ignores legacy opponent invite"`
- `npx vitest run src/components/__tests__/GameAbilityIntegration.test.tsx -t "ignores legacy opponent invite"`
- `npx vitest run src/online/__tests__/client.test.ts -t "legacy opponent invite"`
- `npx vitest run scripts/deploy/__tests__/online-browser-smoke-script.test.mjs`
- Full verification after green.

## Evidence

- Red tests first failed for the stale `ControlPanel` opponent invite callback path, stale `GameBoard` `opponentInviteUrl` path, legacy `src/online/client.ts` storage helpers, and missing white-player browser-smoke absence check.
- Green focused verification passed:
  - `npx vitest run src/components/__tests__/ControlPanel.test.tsx -t "ignores legacy opponent invite"`
  - `npx vitest run src/components/__tests__/GameAbilityIntegration.test.tsx -t "ignore legacy opponent invite"`
  - `npx vitest run src/online/__tests__/client.test.ts -t "legacy opponent invite|forgets stored private invite"`
  - `npx vitest run scripts/deploy/__tests__/online-browser-smoke-script.test.mjs`
- Related-suite verification passed `npx vitest run src/components/__tests__/ControlPanel.test.tsx src/components/__tests__/GameAbilityIntegration.test.tsx src/online/__tests__/client.test.ts src/__tests__/App.test.tsx scripts/deploy/__tests__/online-browser-smoke-script.test.mjs`.
- Local UI audit initially generated screenshots and metrics but failed during server shutdown because `check-local-ui-layout-audit.mjs` still used a 7-second graceful shutdown wait. A red source test for split graceful/forced shutdown timeouts failed, then passed after matching the local browser smoke wrapper's 40-second graceful and 7-second forced-kill waits.
- Reviewer found a minor inert `Share` button path after opponent-invite removal. A red `ControlPanel` test reproduced it, and the accepted fix makes the generic Share button render only when `onShare` exists.
- Final verification passed:
  - `npx vitest run src/components/__tests__/ControlPanel.test.tsx src/components/__tests__/GameAbilityIntegration.test.tsx src/__tests__/App.test.tsx src/online/__tests__/client.test.ts scripts/deploy/__tests__/online-browser-smoke-script.test.mjs scripts/deploy/__tests__/local-ui-layout-audit.test.mjs` (217 tests)
  - `npx vitest run` (140 files passed, 1 skipped; 1684 tests passed, 3 skipped)
  - `npm run build` (existing Vite large-chunk warning only)
  - `npm run server:build`
  - `npm run audit`
  - `node --check scripts/deploy/check-local-ui-layout-audit.mjs`
  - `node --check scripts/deploy/check-online-browser-smoke.mjs`
  - `$env:DATABASE_URL='postgresql://castles_local:castles_local_dev@localhost:5432/castles_local'; npm run ui:audit:local` (162 screenshots across 72 scenarios; zero violations; metrics at `artifacts/ui-audit/phase6ai-local-layout/metrics.json`)
- Runtime source search found no `onlineOpponentInviteUrl`, `opponentInviteUrl`, opponent-invite storage helper, or `castles_online_opponent_invite` references in `src` or `scripts` outside tests. The only `Copy Opponent Invite` runtime strings left are negative browser-smoke assertions.

## Review Findings

| Finding | Source | Severity | Counterexample / Evidence | Proposed Action | Decision | Cognitive Root |
|---|---|---|---|---|---|---|
| Legacy opponent-invite runtime surface removed | Local review | note | Runtime `rg` found no remaining opponent-invite storage/session field/helper references outside tests; smoke assertions check absence on both player screens. | No change. | reject | none |
| Private online sessions could show an inert generic Share button after removing opponent-invite controls | Subagent reviewer | minor | `ControlPanel` rendered Share whenever no online-link controls existed, even with `onShare` undefined. | Gate the generic Share button on `onShare` and add a regression test. | accept | callback contract drift |
| UI audit graceful shutdown timeout was still 7 seconds | Local verification/debugging | minor | `ui:audit:local` generated metrics/screenshots but failed after the local shutdown request; the local browser smoke wrapper already used a 40-second graceful timeout. | Split UI-audit shutdown timeouts into 40-second graceful wait and 7-second forced-kill wait with a source guard. | accept | verifier drift |

## Follow-Up

- Continue item 11 operational-readiness work. The no-legacy opponent-invite UI/storage cleanup is closed; this does not enable `CASTLES_DEPLOYMENT_MODE=multi-instance`.
