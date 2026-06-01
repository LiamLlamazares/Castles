# Online UI Benchmark Checklist

Last refreshed: 2026-06-01

This checklist turns the Lichess-style target into concrete Castles UI checks. Lichess is the benchmark for fast navigation, dense game panels, and clear play/learn/watch/tools entry points. Chess.com is a secondary benchmark for persistent category navigation and beginner learning entry points. Castles should adapt these patterns to a hex strategy game rather than copy either product.

Reference pages checked:

- Lichess home, TV, analysis, and learn pages: https://lichess.org/, https://lichess.org/tv, https://lichess.org/analysis, https://lichess.org/learn
- Chess.com play and beginner learning pages: https://www.chess.com/play/online, https://www.chess.com/learn-how-to-play-chess

## Adopt

- Keep the live board as the primary visual surface.
- Keep game controls and clocks close to the game, not buried in a general settings area.
- Give top-level destinations stable names: Play, Learn, Library, Tools, and future Watch/Lobby/Archive.
- Make learning entry points easy to find from both the game and setup surfaces.
- Keep share/invite/spectator actions separate, because Castles has private player links and public read-only spectator links.
- Keep mobile navigation as a drawer, but make it suppress or move transient banners so controls do not overlap.
- Preserve a clear return path from tutorial, library, setup, and future lobby/archive screens.

## Reject

- Do not add account, rating, tournament, chat, or community UI before the supporting backend exists.
- Do not turn the current app into a marketing landing page.
- Do not hide save/library behind export/import wording.
- Do not put tutorial progress only in memory; leaving and returning should continue the current lesson.
- Do not let browser history, shared-game URLs, or online invite URLs accidentally reset the current game.

## Castles-Specific Adaptations

- Tutorial is a first-class Learn destination, not just a secondary tool.
- Library is a first-class local archive for now; later online archive should use a separate label.
- Setup is the Play destination until lobby/challenges exist.
- Board editor and analysis board remain Tools.
- Online player links, spectator links, and local share/export stay visually distinct.
- Challenge links are distinct from immediate private-room links: a challenge has pending, accept/decline, cancel, accepted, expired, and access-denied states.
- Challenge accept pages show side selection result, time control, board/game terms, and who can act next without adding accounts, ratings, chat, or community UI.
- Navigation must never expose or persist bearer invite tokens.

## Screenshot QA Matrix

Capture before and after screenshots at these viewport sizes:

- Desktop game: 1440 x 900
- Mobile game: 430 x 932
- Mobile drawer open: 430 x 932
- Desktop tutorial: 1440 x 900
- Mobile tutorial: 430 x 932
- Library desktop/mobile after at least one long save name
- Online player and spectator game states once a temporary local online server is running
- Challenge pending as challenger, challenged accept page, accepted redirect/retrieval, expired, declined, and cancelled states once challenge UI exists
- Terminal state after resign/timeout/result

For every screenshot, check:

- No transient banner overlaps drawer controls, back buttons, or primary game actions.
- Important buttons fit inside their containers without clipping.
- The board stays visible and centered in the remaining play area.
- Back/return actions are visible above the fold.
- Save/library actions are discoverable from the game drawer.
- Tutorial progress is visible and survives leaving/reopening the tutorial.
- Mobile bottom controls do not cover the board or each other.

## Automated Checks

- App navigation test: menu -> tutorial -> back returns to the originating game view.
- App navigation test: menu -> library -> back returns to the originating game view.
- Tutorial test: current lesson progress is restored from localStorage.
- Tutorial test: next/previous lesson changes persist progress.
- Hamburger menu test: opening the drawer reports open state so game-level transient hints can be suppressed.
- CSS/static assertion where practical: mobile drawer z-index is above hint banners and action controls.
- Browser smoke: create/join/spectate/terminal flow still passes after shell changes.
