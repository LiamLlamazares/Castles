# Phase 6M Lobby Flow Cleanup

## Goal

Remove the confusing and unsafe edges found after Phase 6L: challenge creator links should survive a same-tab refresh but be cleared on exit, closed owned lobby listings should not leave dead controls behind, and Lobby actions should make it clear which controls search existing listings versus use the current Play setup.

## Implemented Slice

- Challenger challenge share links are restored from session storage after a tokenless reload, so a creator can refresh and still copy the friend link.
- Challenge share-link storage is cleared with the challenge token on challenge exits, online handoff, spectator/replay handoff, local game start, setup, online recovery navigation, PGN/load, quick match, open lobby listing creation, and editor play.
- Cancelled and expired owned lobby listings are cleared by App refresh/restore paths and hidden defensively by `OnlineGameBrowser`, so a closed listing no longer shows a dead Refresh control.
- Browser Lobby copy now separates list filters from current-setup actions: filters search existing listings, while Quick Match and List Current Setup use the current Play setup.
- The Online browser action formerly labelled "List in Lobby" is now "List Current Setup" with an accessible label that explains it lists the current Play setup.

## Review Findings Accepted

- Challenge share URLs containing bearer fragments must not remain in session storage after leaving challenge surfaces.
- Challenge and pre-snapshot online state mobile layout was not the blocker; browser geometry checks still need to accompany future long-copy changes.
- Lobby filters looked like they configured Quick Match/List in Lobby even though they only filter existing listings.
- Cancelled/expired owned listings could remain as a confusing owner panel.
- The next product slice should separate Find listings from Play from current setup more strongly, not only with copy.
- Learn progress is currently resume position, not true lesson completion; the next Learn slice should add completed lesson IDs and checkable objectives before claiming lichess-style progress.
- Analysis mode needs a visible return-to-game path.
- Drawer actions need real distinct icons or the icon column should be removed consistently.

## Audit Artifacts

- Browser screenshot/layout artifacts: `artifacts/ui-audit/phase6m-safety-lobby-cleanup`.
- Covered desktop 1440 x 900, 430 x 932, 390 x 844, and 360 x 640 Lobby; 360 x 640 restored challenge link; and 390 x 844 cancelled owned seek restoration.
- All audited states passed no-horizontal-overflow and no-interactive-overlap checks.

## Verification

- Focused tests: `npm test -- --run src/online/__tests__/client.test.ts src/__tests__/App.test.tsx src/components/__tests__/OnlineGameBrowser.test.tsx`.
- Full tests: `npm test`.
- Client build: `npm run build`.
- Server build: `npm run server:build`.

## Next Slices

- Lobby visual redesign: more minimal/list-like layout, separate "Find listings" filters from "Play from current setup", improve live Watch prominence, and decide default public spectatability for lobby games.
- Learn course redesign: module index, completed lesson IDs, checkable objectives, and mobile layout that prioritizes objectives without unsupported engine grading.
- Navigation clarity: streamline setup labels into Play Local, Invite Friend, and Find Match; standardize "New Game" wording; add analysis return-to-game; fix drawer icons.
