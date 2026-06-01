# Phase 6N Analysis Return Path

## Goal

Make analysis/replay a reversible workflow. Spectators and archive viewers should be able to inspect a game locally and then return to the live spectator game or Online Archive without being stranded on an analysis board.

## Implemented Slice

- Analysis handoffs are tagged explicitly as `source: "analysis"` so PGN imports and library loads remain standalone analysis while in-game analysis keeps a return target.
- Spectator analysis now exposes `Back to Live Game`, restores the spectator URL, remounts the live online snapshot, and reconnects the spectator flow.
- Archived replay analysis now exposes `Back to Online Archive` after the archive snapshot loads successfully.
- Local game analysis exposes `Return to Game` and preserves the current board snapshot plus the existing AI opponent config.
- The return action is visible in both the side panel and hamburger drawer, with the drawer promoting it above New Game while analysis is active.
- Active online players no longer get an unconditional drawer Analysis action that could detach them from a live player seat without confirmation.
- Archive replay cancellation no longer leaves a stale `Back to Online Archive` action on the previous game.

## Review Findings Accepted

- Archive return state must not be set before a replay snapshot succeeds because cancellation can leave a stale return target.
- The hamburger drawer must obey the same online-analysis eligibility as the side panel, while still allowing local-game analysis.
- Local analysis returns should preserve AI opponent configuration where present.

## Audit Artifacts

- Browser screenshot artifacts: `artifacts/ui-audit/phase6n-analysis-return`.
- Covered spectator analysis with a visible `Back to Live Game` action and restored live spectator game after return.

## Verification

- Focused tests: `npm test -- --run src/__tests__/App.test.tsx src/components/__tests__/GameAbilityIntegration.test.tsx src/components/__tests__/ControlPanel.test.tsx src/components/__tests__/HamburgerMenu.test.tsx`.
- Full tests: `npm test`.
- Client build: `npm run build`.
- Server build: `npm run server:build`.
- Browser smoke: `node scripts/deploy/check-online-browser-smoke.mjs http://127.0.0.1:3030` with `CASTLES_ALLOW_ANY_COMMIT=1` for local working-tree verification.
- Targeted browser smoke: create private room, open spectator link, enter Analysis, click `Back to Live Game`, verify spectator URL/session restored.

## Next Slices

- Lobby structural redesign: public-by-default lobby-created games, live games rail, quieter list-first layout, and demoted archive chrome.
- Learn course redesign: durable completion progress, checkable objectives, and tutorial persistence isolation from normal game autosave.
- Drawer/navigation polish: replace placeholder markers with meaningful icons and streamline Play/Invite/Find Match entry language.
