# Phase 6L Online UI Polish

## Goal

Make the post-Quick-Match UI easier to navigate by treating Online as a first-class destination, while keeping Lobby, Watch, and Online Archive as separate tabs inside that destination.

## Implemented Slice

- Rename the app-level destination from Watch to Online across shared headers, setup, Learn, Library, online recovery pages, and the game drawer.
- Keep Watch as the live-public-games tab inside Online, alongside Lobby and Online Archive.
- Lift the active Online tab into `App` state so leaving Online for Learn or Library and returning preserves the selected tab.
- Replace player-facing "open seek" wording with "lobby listing" and "List in Lobby"; leave protocol/store terms unchanged.
- Rename the in-game spectator share button from "Spectate" to "Spectator Link" so it does not conflict with Watch-row spectating.
- Fix first-pass layout risks: 100dvh scrollports for Online/Library/online-state pages, modal layers above the install prompt, and full-width VP scoring on mobile.
- Tighten the game side panel into a contained sidebar, rename the save/review group to Local Library, add a compact visible save-status chip, and make the drawer distinguish local named saves from Online Archive.
- Make Learn feel more like a course surface by adding module and progress-storage chips, compacting the short-mobile chrome, and keeping the first lesson sentence visible above the board at 360 x 640.

## Review Findings Accepted

- Online tab return paths were lossy because the tab lived only inside `OnlineGameBrowser`.
- Top-level Watch was overloaded now that the screen owns Lobby, Watch, and Archive.
- Main UI labels leaked the backend "seek" term.
- The spectator link copy control used the same visible verb as opening a spectator view.
- Short-mobile page scrollports, install prompt z-index, and VP mobile layout needed regression coverage.
- The full audit pass found the challenge creator link was a single clipped input on mobile; it now wraps in a readable preview and has an explicit copy action.
- The game shell still hid save progress behind button titles and assistive text; it now shows ready/autosaved/saved-to-Library/not-in-Library state directly in the side panel.
- The first save-status draft mixed online server persistence into the Local Library chip; review accepted and changed online games to say "Not in Library" until the user creates a local named save.
- A reviewer flagged stale local-save markers when switching online games; accepted and fixed with a game-id keyed reset plus an integration test.
- The short-mobile Learn screen hid lesson text behind navigation and controls; accepted and fixed by removing the redundant page title on short mobile, keeping a compact module/progress row, and showing the lesson sentence before the board.
- The first Learn progress chip claimed "Progress saved" even when browser storage failed; accepted and fixed by tracking actual write success and showing "Session only" when progress cannot be persisted.

## Audit Artifacts

- Broad pass: `artifacts/ui-audit/phase6l-full-pass-1` and `artifacts/ui-audit/phase6l-mobile-pass-2`.
- Challenge-link fix verification: `artifacts/ui-audit/phase6l-challenge-link-fix-2`; 430 x 932, 390 x 844, and 360 x 640 passed with no horizontal overflow, clipped controls, or interactive overlaps.
- Save-status/sidebar verification: `artifacts/ui-audit/phase6l-save-status-2`; desktop game, 430 x 932 mobile game, 360 x 640 short-mobile game, 430 x 932 drawer-open, and 430 x 932 save-modal passed with no horizontal overflow, clipped controls, or interactive overlaps.
- Learn polish verification: `artifacts/ui-audit/phase6l-learn-polish-2`; desktop, tablet, 430 x 932, 390 x 844, and 360 x 640 Learn states passed with no horizontal overflow, clipped controls, or interactive overlaps. Mobile stacked layouts show lesson text before the board.

## Remaining Phase 6L Work

- Re-run UI/accessibility and code reviewers after each broad UI surface change.
