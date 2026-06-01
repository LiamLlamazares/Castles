# Online UI Benchmark Checklist

Last refreshed: 2026-06-01

This checklist turns the Lichess-style target into concrete Castles UI checks. Lichess is the benchmark for fast navigation, dense game panels, and clear play/learn/watch/tools entry points. Chess.com is a secondary benchmark for persistent category navigation and beginner learning entry points. Castles should adapt these patterns to a hex strategy game rather than copy either product.

Phase 6A implementation status, 2026-06-01:

- Current game shell follows the board-first benchmark on desktop, 390 x 844, and 360 x 640 viewports.
- Shared Play/Learn/Library/Watch navigation is in place on setup, tutorial, Library, and Watch, with Play returning to the current game without resetting it.
- Game actions are grouped into turn controls, save/review, online links, and Play; mobile keeps secondary navigation in the drawer to preserve board space.
- Active games now guard New Game with an in-app confirmation, focus trap, Escape cancel, background inerting, and focus restoration to the invoking control.
- Save Game reports in-app success/failure instead of silent browser prompts.
- Tutorial progress is visible, persisted, restartable, and placed near the top of the Learn surface.
- Mobile move history is available through a disclosure, and move entries are keyboard-accessible buttons.
- Library import is collapsed by default so saved games stay primary.
- Final Playwright viewport audit covered desktop/mobile game, setup, tutorial, Watch, Library, drawer-open, and online smoke states with no clipped controls or top overlay collisions.
- Screenshot artifacts for the second pass are in `artifacts/ui-audit/phase6a2-after`.
- Full online browser smoke passed after the shell changes.

Phase 6B implementation status, 2026-06-01:

- Watch and Online Archive are first-class public-summary destinations, distinct from the local Library.
- The first version lists only `visibility: "public"` summaries returned by `/api/online/games`; private and unlisted games remain off public browse surfaces.
- Online players can deliberately publish an unlisted game to Watch and unlist it again; the control uses durable server state and does not expose bearer tokens.
- Spectate handoff uses `?onlineGame=<id>&view=spectator` and strips player tokens, challenge parameters, PGN parameters, and URL fragments.
- Public lobby creation, open seeks, accounts, ratings, chat, and matchmaking stay deferred until the backend contracts exist.

Phase 6A third-pass implementation status, 2026-06-01:

- Challenge creation/pending/error states and failed pre-snapshot online states now use the shared Play/Learn/Watch/Library app-shell navigation.
- Leaving failed online/challenge states clears stale online URLs, challenge parameters, invite tokens, and local autosave before opening another destination.
- Long online status and error text uses a wrapped status block with stable responsive spacing at narrow widths.
- The mobile drawer now behaves as a modal dialog: initial focus moves into the drawer, Tab and Shift+Tab stay inside it, Escape closes it, focus is restored, app-level background content is inert while open, and the drawer/backdrop sit above the install prompt layer.
- Tutorial lesson quick navigation uses stable accessible groups and compact short-screen rules so progress, lesson controls, and the board remain reachable at 360 x 640.
- Reviewer follow-ups were fixed for drawer-trigger focus escape, install-prompt overlay risk, AppShellNav negative-margin overflow inside online state panels, and stale autosave/session-credential cleanup.
- Screenshot artifacts for this pass are in `artifacts/ui-audit/phase6c-third-pass`.

Public Directory v1 implementation status, 2026-06-01:

- Watch and Online Archive now use a schema-versioned public directory contract instead of an unbounded public list.
- Directory responses support `state=active|archived|all`, bounded limits, and opaque cursors while still returning only public summaries.
- Public directory endpoints reject token/auth/credential-looking query parameters.
- Store-level listing and single-summary lookup are available so public discovery does not require replaying events or loading credentials.
- Watch/Archive scan controls now include sort, clock filter, and result filter; filtered no-results states are distinct from truly empty public lists.
- Focused Playwright screenshot audit covered desktop 1440 x 900, tablet 820 x 700, and mobile 430 x 932 Watch/Archive/filtered-empty states with no horizontal overflow. Artifacts are in `artifacts/ui-audit/phase6f-public-directory`.
- Review follow-ups were fixed for filtered-empty pagination reachability, shown-count copy, archive result-filter reset coverage, and mid-width toolbar overflow risk.
- Open seeks, matchmaking, accounts, ratings, chat, and public lobby creation remain deferred.

Phase 6H Open Lobby Seeks implementation status, 2026-06-01:

- Lobby is now a sibling tab to Watch and Online Archive inside the online browser, matching the Lichess-style scan pattern without adding account/rating/chat concepts.
- Open seek rows show Castles-specific terms: side preference, board radius, clock/casual, victory-points mode, and expiry.
- Create Lobby Seek is available from Play/setup and stores the creator token in `sessionStorage`, not in the URL.
- Public seek listing is token-free. Accepting a seek creates a normal online game and reuses the existing token-stripped join flow.
- Creator-owned seek state shows a private refresh/cancel/join panel so the creator can see when another player has accepted and join the resulting game.
- Focused tests cover setup creation, App token hygiene, accept handoff, creator refresh/join, row-local pending actions, client validators, server routes, and PostgreSQL store behavior.
- Benchmark screenshots for Lichess and Chess.com lobby/play/learn references are in `artifacts/ui-audit/phase6h-benchmark`.
- Final Playwright screenshot/layout audit covered Lobby, Watch, and Online Archive at desktop and 820 x 700 tablet sizes, plus Lobby at 430 x 932, 390 x 844, and 360 x 740 mobile sizes. No horizontal overflow or overlapping interactive controls were detected.
- Screenshot artifacts and layout metrics are in `artifacts/ui-audit/phase6h-after`.

Phase 6G implementation status, 2026-06-01:

- Navigation return paths now use explicit app helpers, and game-entry flows clear stale back stacks when opening live game, loaded analysis, spectator snapshots, archive replay, editor play, or restart.
- Drawer and AppShell destinations now share the same primary order: Play, Learn, Watch, Library, with Board and Tools kept secondary in the drawer.
- Learn/Tutorial now has a compact current-lesson header, visible lesson count, grouped lesson controls, labelled lesson-board region, visually hidden live progress status, and a board-forward mobile split for short screens.
- Save Game now uses an in-app named-save modal instead of a browser prompt, with duplicate-save protection, Escape close, focus trap, background inerting, focus restoration, cancel handling, retryable failure state, and saved-name feedback.
- Control-panel save and Library buttons keep short visible labels while exposing hidden helper descriptions for assistive tech.
- Focused reviewer findings were fixed for duplicate save promises, incomplete modal behavior, destination-order drift, and duplicated tutorial progress chrome.
- Full verification passed: `npm test`, `npm run build`, `npm run server:build`, `git diff --check`, browser online smoke, and current-code Playwright screenshot audit at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640.
- Screenshot artifacts are in `artifacts/ui-audit/phase6g-after`.

Next UI polish audit:

- Keep lichess-style top destinations simple: Play, Learn, Watch, Library, and later Tools/Lobby when backed by server contracts.
- Recheck drawer modal behavior after any new menu destination or banner is added.
- Recheck tutorial mobile compactness after adding new lessons or tutorial controls.
- Keep the game side panel contextual to clocks, turn phase, history, save/review, online links, and analysis; do not use it as general app navigation.
- Check long online status/error text at 360 px, 390 px, and 430 px widths whenever challenge or connection copy changes.
- Run the next navigation pass after Phase 6H: fix the awkward sidebar/drawer shape, tutorial placement, return navigation, save/progress discoverability, and any go-back/navigation overlap.
- Keep Watch/Archive read-only and Lobby seek-based until matchmaking automation, accounts, ratings, and chat contracts exist.

Reference pages checked:

- Lichess home, TV, analysis, and learn pages: https://lichess.org/, https://lichess.org/tv, https://lichess.org/analysis, https://lichess.org/learn
- Chess.com play and beginner learning pages: https://www.chess.com/play/online, https://www.chess.com/learn-how-to-play-chess

## Adopt

- Keep the live board as the primary visual surface.
- Keep game controls and clocks close to the game, not buried in a general settings area.
- Give top-level destinations stable names: Play, Learn, Library, Tools, and future Watch/Lobby/Archive.
- Keep Watch and Online Archive dense, task-oriented, and separate from matchmaking or account surfaces until those systems exist.
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
- Online Archive must never imply local saved-game storage; local Library and public online summaries are separate concepts.

## Screenshot QA Matrix

Capture before and after screenshots at these viewport sizes:

- Desktop game: 1440 x 900
- Mobile game: 430 x 932
- Short mobile game: 360 x 640
- Mobile drawer open: 430 x 932
- Desktop tutorial: 1440 x 900
- Mobile tutorial: 430 x 932
- Short mobile tutorial: 360 x 640
- Library desktop/mobile after at least one long save name
- Online player and spectator game states once a temporary local online server is running
- Watch and Online Archive desktop/mobile with empty lists, live public games, archived public results, search/filter states, and spectator handoff
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
- App navigation test: Play from nested setup/library/watch/learn returns to the current game without clearing it.
- Game test: active New Game confirmation restores focus after drawer cancel and traps focus while open.
- Tutorial test: current lesson progress is restored from localStorage.
- Tutorial test: next/previous lesson changes persist progress.
- Tutorial CSS test: mobile rows avoid fixed minimum heights that can clip the board on short screens.
- Hamburger menu test: opening the drawer reports open state so game-level transient hints can be suppressed.
- CSS/static assertion where practical: mobile drawer z-index is above hint banners and action controls.
- Browser smoke: create/join/spectate/terminal flow still passes after shell changes.
- Accessibility check: move history entries are real buttons so keyboard users can jump through history in desktop and mobile history surfaces.
- Online browser test: Watch -> Spectate enters a token-free spectator URL and clears stale player/challenge URL state.
- Online visibility test: a player can publish an unlisted game to Watch and unlist it again without exposing bearer tokens.
- Online state navigation test: failed pending online and challenge states expose shared navigation, clear stale online state when leaving, and keep long status text inside the responsive status block.
- Hamburger menu test: drawer open state is a modal dialog with focus trap, Escape close, focus restoration, and background inerting.
- Tutorial layout test: short mobile viewports use the compact split and stable quick-nav/text classes.
- Public directory tests: list response validation, state filters, limits/cursors, single-summary lookup, secret-query rejection, and hidden-game exclusion.
- Watch/Archive tests: tab-state loading, sort/time/result filters, filtered no-results, filtered-empty pagination reachability, and long-row action reachability.
