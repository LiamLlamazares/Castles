# Online UI Benchmark Checklist

Last refreshed: 2026-06-01

This checklist turns the Lichess-style target into concrete Castles UI checks. Lichess is the benchmark for fast navigation, dense game panels, and clear play/learn/watch/tools entry points. Chess.com is a secondary benchmark for persistent category navigation and beginner learning entry points. Castles should adapt these patterns to a hex strategy game rather than copy either product.

Phase 6A implementation status, 2026-06-01:

- Current game shell follows the board-first benchmark on desktop, 390 x 844, and 360 x 640 viewports.
- Shared Play/Learn/Online/Library navigation is in place on setup, tutorial, Library, and the online browser, with Play returning to the current game without resetting it.
- Game actions are grouped into turn controls, save/review, online links, and Play; mobile keeps secondary navigation in the drawer to preserve board space.
- Active games now guard New Game with an in-app confirmation, focus trap, Escape cancel, background inerting, and focus restoration to the invoking control.
- Save Game reports in-app success/failure instead of silent browser prompts.
- Tutorial progress is visible, persisted, restartable, and placed near the top of the Learn surface.
- Mobile move history is available through a disclosure, and move entries are keyboard-accessible buttons.
- Library import is collapsed by default so saved games stay primary.
- Final Playwright viewport audit covered desktop/mobile game, setup, tutorial, online browser, Library, drawer-open, and online smoke states with no clipped controls or top overlay collisions.
- Screenshot artifacts for the second pass are in `artifacts/ui-audit/phase6a2-after`.
- Full online browser smoke passed after the shell changes.

Phase 6B implementation status, 2026-06-01:

- Watch and Online Archive are first-class public-summary tabs inside Online, distinct from the local Library.
- The first version lists only `visibility: "public"` summaries returned by `/api/online/games`; private and unlisted games remain off public browse surfaces.
- Online players can deliberately publish an unlisted game to Watch and unlist it again; the control uses durable server state and does not expose bearer tokens.
- Spectate handoff uses `?onlineGame=<id>&view=spectator` and strips player tokens, challenge parameters, PGN parameters, and URL fragments.
- Public lobby creation, open seeks, accounts, ratings, chat, and matchmaking stayed deferred until their backend contracts existed; open seeks and Quick Match now remain limited to those contracts.

Phase 6A third-pass implementation status, 2026-06-01:

- Challenge creation/pending/error states and failed pre-snapshot online states now use the shared Play/Learn/Online/Library app-shell navigation.
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
- Accounts, ratings, chat, and broader matchmaking remain deferred until their backend contracts exist.

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

Phase 6I UI navigation and learning sweep status, 2026-06-01:

- The shared app shell no longer uses the mobile sticky header and negative-margin pattern that risked covering back/navigation controls.
- Play/Learn/Online/Library destinations now sit in a primary navigation group and wrap with flexible mobile columns instead of a fixed four-column layout.
- The drawer calls the tutorial destination Learn, matching the main shell and Lichess-style learning entry expectations while staying Castles-specific.
- Setup primary actions are grouped in stable buttons instead of scattered inline styles, so local play, private rooms, friend challenges, and lobby seeks scan as one action cluster.
- Library rename/delete now use accessible in-app dialogs with focus trap, Escape close, focus restoration, async pending guards, and in-dialog failure messages.
- Library action feedback is visible above the main Library layout, not hidden inside the collapsed import section.
- Final screenshots covered desktop/mobile/short-mobile game, drawer-open, setup, tutorial, Library, Watch, and save-modal states with no interactive overlaps found.
- Screenshot artifacts are in `artifacts/ui-audit/phase6i-after-final`.

Phase 6J Lobby refresh and filters status, 2026-06-01:

- Lobby now has server-backed side, clock, and scoring filters plus local seek search, with filtered-empty copy distinct from a truly empty lobby.
- Public Lobby and creator-owned open seeks refresh every 30 seconds while visible, with in-flight serialization, 60-second rate-limit backoff, no row clearing during background refresh, and pending accept/cancel focus preservation.
- Last-checked freshness is visible, but the changing timestamp is kept out of the polite live-region announcement loop and mirrored as non-live screen-reader text.
- PostgreSQL and HTTP directory filters apply before cursor/limit pagination, use exact JSONB predicates, and reject secret-looking public query keys or values.
- Reviewers cleared backend/security and UI/accessibility findings after fixes for overlapping refreshes, pending-action races, stale rate-limit copy, and freshness announcements.
- Full Playwright screenshot/layout audit covered owner-open Lobby, public Lobby row, pending accept, all-filters-active filtered empty, Watch, Archive, and owner-accepted states at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640 with no horizontal overflow, clipped controls, or interactive overlaps.
- Screenshot artifacts and layout metrics are in `artifacts/ui-audit/phase6j-after`.

Phase 6K Quick Match status, 2026-06-01:

- Quick Match is a Lobby action that accepts a compatible open seek or lists the current setup as a normal open seek when no compatible seek exists.
- The UI states the strict setup-matching rule instead of implying a broad player pool: current board, pieces, sanctuaries, pool, theme, clock, and scoring mode must match.
- Quick Match uses the existing owned-seek panel for waiting games and the existing token-stripped online handoff for matched games.
- Pending Quick Match disables conflicting Lobby actions, failure returns focus to the Quick Match button, and waiting moves keyboard focus to the owned-seek panel.
- Final screenshot artifacts and layout metrics are in `artifacts/ui-audit/phase6k-quick-match`; desktop, tablet, large-mobile, 390 x 844, and 360 x 640 states passed with no horizontal overflow, clipped controls, or interactive overlaps.

Phase 6G implementation status, 2026-06-01:

- Navigation return paths now use explicit app helpers, and game-entry flows clear stale back stacks when opening live game, loaded analysis, spectator snapshots, archive replay, editor play, or restart.
- Drawer and AppShell destinations now share the same primary order: Play, Learn, Online, Library, with Board and Tools kept secondary in the drawer.
- Learn/Tutorial now has a compact current-lesson header, visible lesson count, grouped lesson controls, labelled lesson-board region, visually hidden live progress status, and a board-forward mobile split for short screens.
- Save Game now uses an in-app named-save modal instead of a browser prompt, with duplicate-save protection, Escape close, focus trap, background inerting, focus restoration, cancel handling, retryable failure state, and saved-name feedback.
- Control-panel save and Library buttons keep short visible labels while exposing hidden helper descriptions for assistive tech.
- Focused reviewer findings were fixed for duplicate save promises, incomplete modal behavior, destination-order drift, and duplicated tutorial progress chrome.
- Full verification passed: `npm test`, `npm run build`, `npm run server:build`, `git diff --check`, browser online smoke, and current-code Playwright screenshot audit at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640.
- Screenshot artifacts are in `artifacts/ui-audit/phase6g-after`.

Next UI polish audit:

- Keep lichess-style top destinations simple: Play, Learn, Online, Library, and later Tools when backed by server contracts. Online owns Lobby, Watch, and Online Archive as internal tabs.
- After Phase 6K lands, run the Phase 6L full UI pass: compare Castles against fresh Lichess play/lobby/watch/learn screenshots, then fix sidebar shape, tutorial/Learn placement, return navigation, save/progress clarity, and overlapping go-back/menu/status controls.
- Recheck drawer modal behavior after any new menu destination or banner is added.
- Recheck tutorial mobile compactness after adding new lessons or tutorial controls.
- Keep the game side panel contextual to clocks, turn phase, history, save/review, online links, and analysis; do not use it as general app navigation.
- Check long online status/error text at 360 px, 390 px, and 430 px widths whenever challenge or connection copy changes.
- Re-run the full navigation pass whenever Lobby, matchmaking, accounts, ratings, chat, or moderation add new destinations or persistent banners.
- Keep Watch/Archive read-only and Lobby seek/Quick-Match based until deeper matchmaking, accounts, ratings, and chat contracts exist.

Phase 6L first implementation slice, 2026-06-01:

- Top-level app navigation now uses Online instead of overloading Watch; Lobby, Watch, and Online Archive remain tabs inside the Online page.
- The selected Online tab is owned by App state, so returning from Learn or Library preserves Lobby/Watch/Archive instead of remounting to the wrong tab.
- Player-facing Lobby copy says "lobby listing" and "List in Lobby"; backend and tests may still use the open-seek domain term where it describes the protocol.
- The in-game spectator share control now says "Spectator Link" while Watch rows still use "Spectate" for opening a live spectator view.
- Page-level Online, Library, and online-state screens now use their own 100dvh scrollports; save/confirm/library dialogs sit above the install prompt; VP scoring spans the full mobile panel width.
- The game sidebar is now a contained panel with a visible Local Library save-status chip. Local games show ready/autosaved/saved-to-Library state; online games show "Not in Library" until the user creates a local named save.
- The game drawer now labels local saves as "Local named saves on this device", demotes duplicate Save to Library, and keeps Online Archive conceptually separate from the local Library.
- Screenshot artifacts for this sidebar/save slice are in `artifacts/ui-audit/phase6l-save-status-2`; desktop, mobile, short-mobile, drawer-open, and save-modal states passed overflow, clipping, and interactive-overlap checks.
- Learn now shows the current module, lesson count, and storage-aware progress chip. At 360 x 640 it hides the redundant page title, shortens the visual Restart label, and keeps the lesson sentence above the board.
- Screenshot artifacts for this Learn slice are in `artifacts/ui-audit/phase6l-learn-polish-2`; desktop, tablet, 430 x 932, 390 x 844, and 360 x 640 Learn states passed overflow, clipping, and interactive-overlap checks.

Phase 6M lobby flow cleanup, 2026-06-01:

- Challenger challenge share links now survive same-tab tokenless reloads, but challenge share-link storage is cleared with the challenge token on every challenge exit and online/local handoff path.
- Cancelled and expired owned lobby listings no longer render a stale "Your lobby listing" owner panel or dead Refresh action; App clears them during restore/refresh and the Online browser hides them defensively.
- Lobby copy now distinguishes existing-list filters from current-setup actions. The browser listing action uses the current Play setup, while filters only search visible listings.
- Screenshot artifacts are in `artifacts/ui-audit/phase6m-safety-lobby-cleanup`; desktop, 430 x 932, 390 x 844, 360 x 640 Lobby, 360 x 640 restored challenge link, and 390 x 844 cancelled-owned-seek states passed overflow and interactive-overlap checks.

Phase 6O Online structural polish, 2026-06-02:

- Lobby now splits the search/filter controls from the current-setup actions. `Quick Match` and the current-setup lobby-listing action live in a separate "Play from current setup" panel, while filters are labelled as finding existing lobby listings.
- The current-setup lobby-listing action creates the lobby listing directly from Online instead of bouncing to Setup, disables while pending, and is hidden together with Quick Match while viewing analysis/replay/online/challenge states.
- Watch now uses a top-live-game plus more-games layout, refreshes while visible, pauses while hidden, and skips background refresh if a foreground directory load is in flight.
- The current public game row in Lobby remains a compact Watch preview, but the Lobby landmark and open-listing section now distinguish it from actual open lobby listings.

Phase 6P Learn progress hardening, 2026-06-02:

- Learn progress now separates resume position from completed lessons. Objective lessons complete only when every normalized objective id is checked or an explicit tutorial event completes the objective, and unchecking an objective removes completion.
- Existing index-based objective checks are normalized into lesson-scoped objective ids on load; unknown lessons and invalid objective ids are dropped.
- Course and lesson copy now says objectives/lessons are completed instead of "mastered"; read-only lessons complete from Next, while clear action objectives can auto-complete from movement, capture, recruitment, promotion, pledge, ability, and inspection events.
- Long objective text wraps inside the lesson sidebar, and the existing mobile course/lesson scrollports remain protected by tests.

Phase 6Q Navigation wording and drawer icon polish, 2026-06-02:

- The drawer Play entry now says `Configure New Game`, matching the setup/victory language and separating setup from the contextual in-game `New Game` control.
- Setup primary actions now use product-language labels: `Play Local`, `Invite Friend`, and `List in Lobby`; the older direct `Private Link` setup path was removed so private online play goes through the clearer invite lifecycle.
- Drawer icons remain real image assets but now have stable sizing, object fitting, opacity, and mobile spacing tests so blank marker-style placeholders do not silently return.
- Mobile drawer section notes are hidden to reduce density while keeping the same section landmarks and destination labels.

Phase 6R Lobby setup prompt polish, 2026-06-02:

- The Lobby now always shows a next-step panel: current setup users get `Quick Match` and `Create Lobby Listing`, while first-time users get a `Configure Setup` action instead of only an empty list.
- Lobby empty copy now points back to that setup panel and no longer references hidden matchmaking controls when no Play setup exists.
- `Create Lobby Listing` keeps the same direct current-setup listing behavior, but the visible label is clearer than `List Current Setup`.

Phase 6S Online lobby visual clarity, 2026-06-02:

- Open lobby listings now sit directly below the setup/owned-listing panels, so the lobby filters visibly apply to the next list rather than to the Watch preview.
- Closed owned listings are status-only panels. The page keeps one create/list path in the current-setup panel and no longer shows a duplicate terminal `Create New Listing` action.
- Lobby side copy now says `Creator side`, and fixed-side listings explain the acceptor's side. Castle-control listings are rendered and searchable instead of only showing Victory-points scoring.
- Quick Match copy now describes the actual open-listing flow instead of implying account/rating-style matchmaking.
- The lobby surface uses quieter panel styling while keeping Watch and Online Archive separate from unsupported ratings, accounts, chat, and global spectator-count features.
- Reviewer cleanup added visible focus styling for closed owner panels, corrected accepted random-side owner copy, aligned search tokens with visible row metadata, and made scoring filter accessibility labels generic.
- Final verification passed the full automated suite, client build, server build, diff check, browser online smoke, and Playwright screenshot/layout audit at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640. Screenshot artifacts are in `artifacts/ui-audit/phase6s-online-lobby`.

Phase 6T Public live-preview read model, 2026-06-02:

- Public game summaries now expose a schema-versioned `livePreview` object with side to move, turn phase, move count, last move, and persisted clock basis.
- Lobby and Watch rows may show `White to move`, `Black to move`, turn phase, last move notation, move count, and a `Clock snapshot` when the public summary provides it.
- Completed Online Archive rows must avoid active-game language such as "to move"; they can still show move count, result, last move, and whether the game was timed.
- Row clocks are summary snapshots, not ticking live clocks. Do not animate them until the contract carries enough response-time basis to make that honest.
- Continue excluding ratings, account names, global spectator counts, and TV-style ranking until separate backend read models exist. Process-local live spectator counts may appear only when the current server response includes them, and they must be omitted from archived rows.
- Startup rebuilds destructively replace stale materialized game-summary rows from the event log before serving the production app; this is intentional under the no-legacy-data direction.
- Final verification passed focused Phase 6T tests, the full automated suite, client build, server build, diff check, local PostgreSQL restart smoke, browser online smoke, and desktop/mobile Lobby/Watch/Archive screenshot audit. Screenshot artifacts are in `artifacts/ui-audit/phase6t-live-preview`.

Phase 6U Public board previews and first-run onboarding, 2026-06-02:

- Public summaries now carry a token-free board-preview contract, and Watch/Lobby/Archive rows render compact board thumbnails with accessible White/Black piece and castle-control counts.
- Board-preview validation is bounded to the current online setup limits so public rows cannot carry oversized board payloads.
- First-time local visitors see a short welcome dialog with a direct `Start Learn` recommendation and a `Play Now` dismissal. The modal uses the shared dialog focus trap and stores dismissal in localStorage.
- Direct online game, spectator, and challenge links suppress the first-run prompt until the user returns to ordinary local play, so shared links are not interrupted.
- Recheck first-run welcome, Lobby rows, Watch rows, and Archive rows in the next screenshot pass at desktop and mobile sizes.

Phase 6V App shell deploy freshness, 2026-06-02:

- The production service worker now uses network-first app-shell requests, bypasses service-worker/API/WebSocket/online/challenge/token URLs, and keeps old caches cleaned up under a new shell cache version.
- Service-worker registration bypasses the browser HTTP cache for update checks, and the Node static server serves `index.html` and `service-worker.js` with `no-store` while keeping hashed assets immutable.
- This was added after a live sanctuary hotfix proved that an already-installed service worker could keep an old client bundle visible after the server had moved to a new commit.
- Verification passed focused service-worker policy tests, the full automated suite, client build, server build, and diff check.

Next product slices accepted from reviewers:

- Improve public board previews only after screenshot QA shows the compact thumbnail is readable on mobile.
- Replace process-local spectator counts with shared cross-instance presence before multi-instance deployment or any TV-style ranking that depends on global watcher counts.
- Continue Learn course polish with authored objective ids, richer lesson theory, and only add engine-graded objectives when the target board state is explicit and tested.
- Improve navigation clarity in later slices by reducing duplicated online entry points where possible and continuing to separate private player links from public spectator/share actions.

Reference pages checked:

- Lichess home, TV, analysis, and learn pages: https://lichess.org/, https://lichess.org/tv, https://lichess.org/analysis, https://lichess.org/learn
- Chess.com play and beginner learning pages: https://www.chess.com/play/online, https://www.chess.com/learn-how-to-play-chess

## Adopt

- Keep the live board as the primary visual surface.
- Keep game controls and clocks close to the game, not buried in a general settings area.
- Give top-level destinations stable names: Play, Learn, Online, Library, and later Tools when the tool surface is mature enough for primary navigation.
- Keep Watch and Online Archive dense, task-oriented, and separate from matchmaking or account surfaces until those systems exist.
- Make learning entry points easy to find from both the game and setup surfaces.
- Keep share/invite/spectator actions separate, because Castles has private player links and public read-only spectator links.
- Keep mobile navigation as a drawer, but make it suppress or move transient banners so controls do not overlap.
- Preserve a clear return path from tutorial, library, setup, and online Lobby/Watch/Archive screens.

## Reject

- Do not add account, rating, tournament, chat, or community UI before the supporting backend exists.
- Do not turn the current app into a marketing landing page.
- Do not hide save/library behind export/import wording.
- Do not put tutorial progress only in memory; leaving and returning should continue the current lesson.
- Do not let browser history, shared-game URLs, or online invite URLs accidentally reset the current game.

## Castles-Specific Adaptations

- Tutorial is a first-class Learn destination, not just a secondary tool.
- Library is a first-class local archive for now; later online archive should use a separate label.
- Setup starts the Play destination; Lobby and challenge entry points belong under Online.
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
- App navigation test: Play from nested setup/library/online/learn returns to the current game without clearing it.
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
