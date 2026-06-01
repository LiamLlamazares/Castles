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

## Review Findings Accepted

- Online tab return paths were lossy because the tab lived only inside `OnlineGameBrowser`.
- Top-level Watch was overloaded now that the screen owns Lobby, Watch, and Archive.
- Main UI labels leaked the backend "seek" term.
- The spectator link copy control used the same visible verb as opening a spectator view.
- Short-mobile page scrollports, install prompt z-index, and VP mobile layout needed regression coverage.
- The full audit pass found the challenge creator link was a single clipped input on mobile; it now wraps in a readable preview and has an explicit copy action.

## Audit Artifacts

- Broad pass: `artifacts/ui-audit/phase6l-full-pass-1` and `artifacts/ui-audit/phase6l-mobile-pass-2`.
- Challenge-link fix verification: `artifacts/ui-audit/phase6l-challenge-link-fix-2`; 430 x 932, 390 x 844, and 360 x 640 passed with no horizontal overflow, clipped controls, or interactive overlaps.

## Remaining Phase 6L Work

- Use the screenshot results to tighten the game side panel shape and any remaining overlapping controls.
- Improve save/autosave progress clarity beyond the existing named-save modal if the audit shows users still cannot tell what is stored locally.
- Re-run UI/accessibility and code reviewers after each broad UI surface change.
