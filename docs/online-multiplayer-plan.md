# Online Multiplayer Master Roadmap

Last refreshed: 2026-06-06

This document is the source of truth for Castles online multiplayer work. The current direction assumes no legacy compatibility burden: old online drafts, incomplete protocols, and pre-roadmap UI assumptions may be replaced instead of preserved.

Lichess is a UI/UX benchmark for clarity, speed, and chess-player expectations, not a product clone. Before designing or implementing lobby, archive, spectator, challenge, or analysis screens, benchmark Lichess and at least one other mature chess/board-game service, then record the concrete interaction patterns Castles will adopt or reject.

Contract decisions that affect online storage and public read models are tracked in [online-data-contract.md](online-data-contract.md).

## Completed State

Current private-link beta:

- One authoritative Node server owns each online room.
- Setup/action/message DTOs are validated before hydration.
- The existing TypeScript rules engine validates turn, ownership, legal moves, and terminal state.
- Accepted game events are persisted to PostgreSQL before authoritative snapshot broadcast.
- Startup replay rebuilds rooms from an append-only v2 event log and fails loudly on corrupt or unsupported events.
- Game creation events are token-free; player credentials are stored separately as token hashes keyed by game and seat.
- Accepted challenges and accepted lobby listings bind durable white/black participant identities into the game creation event, so rebuilt summaries preserve who played which side without storing bearer secrets.
- Accepted actions are serialized per game in the single Node process.
- Action submissions carry required `clientActionId` values; exact retries are idempotent and conflicting id reuse is rejected.
- Server-authoritative clocks support timeout adjudication and reconnect-safe snapshots.
- Private white/black bearer invite tokens are removed from URLs and stored in `sessionStorage`.
- Online API/token-bearing responses bypass browser, service worker, and HTTP caching.
- REST snapshot resync, heartbeat pings, reconnect backoff, and readiness health checks exist.
- WebSocket client messages, WebSocket server messages, and REST snapshot envelopes require `protocolVersion: 1`; old disposable beta clients fail loudly.
- Read-only public spectator URLs and WebSocket spectator joins exist; spectators cannot submit actions.
- Lichess-style open lobby seeks exist as a separate pre-game lifecycle from private challenges and public Watch/Archive summaries. Public seek lists are token-free; creator tokens stay in `sessionStorage`; accepting a seek creates a normal online game and reuses the token-stripped player handoff.
- Challenge creator share links survive same-tab tokenless reloads for copying, then are cleared with challenge token storage whenever the user leaves the challenge flow or joins/opens another game surface.
- Cancelled and expired owned lobby listings are cleared during restore/refresh and hidden defensively in the Online browser so they do not show dead Refresh controls.
- Active online players can step backward and forward through the move list to inspect what happened, while non-analysis history review remains read-only and returns to live state before actions resume.
- Local PostgreSQL restart smoke tooling verifies create, join, action persistence, shutdown, restart, and reload.
- Local PostgreSQL concurrency smoke tooling verifies per-game locking and stale-action behavior.
- The game shell has shared Play/Learn/Online/Library navigation, contextual game controls, guarded New Game flow, save feedback, mobile tutorial bounds, modal drawer focus management, shared challenge/online pending shells, and browser screenshot overlap checks.

Current constraints:

- One writer process only; no cross-process coordination yet.
- Private invite links are bearer secrets and require HTTPS.
- Public spectator URLs expose games to anyone with the random game id.
- Display-name/password accounts, optional Google OAuth sign-in, and account-backed personal history exist as a beta foundation. Ratings now have a beta Glicko-2 write path, public summaries, public leaders, and visible Casual/Rated setup controls. Moderation, anti-cheat, admin tooling, email, and password reset are not implemented.

## Phase Gates

Every phase must pass these gates before the next phase becomes active:

- Contract gate: public DTOs, persisted events, URLs, and read models are versioned or explicitly disposable.
- Test gate: phase-specific unit/integration/e2e/smoke tests pass locally and in CI.
- Review gate: correctness, security, UX, accessibility, and operational risks are reviewed with findings accepted, rejected, investigated, or deferred.
- Deploy gate: rollout, rollback, health checks, logging, metrics, and data migration/replay impact are documented.
- Scope gate: unrelated refactors and UI expansion are deferred unless they unblock the phase.

## Phase 1: Private Beta Polish, Smoke, Ops Safety

Goal: make the existing private-link beta boring to run for a small trusted group.

Work:

- Tighten remote deploy notes, environment validation, HTTPS assumptions, static-build checks, and backup/restore steps.
- Keep invite creation, join, reconnect, spectator, timeout, terminal state, and restart paths smoke-tested.
- Add minimal operator runbook entries for logs, health checks, database readiness, and emergency disable.
- Fix beta-blocking UX defects without adding public-service concepts.

Tests/review/deploy gates:

- Smoke: local PostgreSQL restart smoke plus browser create/join/action/reconnect/spectator path.
- Tests: online DTO, event replay, action persistence, timeout, and no-store/cache bypass tests.
- Review: beta security review focused on bearer links, logs, cache behavior, and failure modes.
- Deploy: single-node HTTPS deploy can be rebuilt, restarted, health-checked, backed up, and rolled back.

## Phase 2: Data Contract, Read Model, Identity Primitives

Goal: define the durable data shapes needed before richer online UX.

Work:

- Decide which event schemas are durable and which are disposable before public launch.
- Introduce read models for game summaries, participants, result, timestamps, visibility, and archive state.
- Add identity primitives for anonymous/session users and future accounts without forcing account launch.
- Define access roles: player, spectator, challenged user, moderator/admin placeholder.
- Keep private bearer credentials out of durable game events before public lobby/challenge work.

Tests/review/deploy gates:

- Tests: replay from event log into read models, migration/rebuild idempotence, role/access unit tests.
- Review: data-contract review for schema versioning, privacy, archive visibility, and future account fit.
- Deploy: read models can be rebuilt from existing beta data or explicitly reset under the no-legacy assumption.

## Phase 3: Concurrency Correctness

Goal: harden accepted game actions beyond the current single-node PostgreSQL writer path.

Work:

- Expand and stress-test the current per-game PostgreSQL transaction/lock path.
- Keep accepted action writes, version checks, and summary refreshes atomic under realistic contention.
- Stress duplicate submit, reconnect race, timeout race, and simultaneous resign/draw behavior.
- Prepare the event flow for later pub/sub or worker separation.

Tests/review/deploy gates:

- Tests: concurrent action fuzz/integration tests, duplicate message tests, timeout/action race tests.
- Review: correctness review of locking, transaction boundaries, idempotency, and replay equivalence.
- Deploy: lock strategy is observable, has timeout/error handling, and can roll back without data loss.

## Phase 4: Online Protocol and Client State

Goal: formalize the client/server online protocol and make client state resilient.

Status: in final verification. The protocol envelope now requires `protocolVersion: 1` on WebSocket client messages, WebSocket server messages, and REST snapshot responses. The browser client now distinguishes connected, resyncing, access-denied, protocol-error, server-error, terminal, disconnected, and connecting states instead of flattening every problem into a generic error. Action-scoped `rejected` frames now carry `clientActionId`, stale-action rejections keep the client live after applying the authoritative snapshot, play controls pause while reconnecting or waiting for action confirmation, and terminal REST resyncs stop reconnect attempts. Browser smoke coverage now checks stale-action server contracts, browser-client stale-action UX, real-game bad-token recovery, and forced WebSocket reconnects with visible disconnected/resyncing states. The client transition diagram is documented in [online-data-contract.md](online-data-contract.md).

Work:

- Version WebSocket and REST messages with explicit error, resync, stale-version, and reconnect semantics.
- Separate local optimistic UI from authoritative online state.
- Define client state machines for idle, connecting, connected, disconnected, resyncing, terminal, access-denied, protocol-error, and server-error states. Current hooks expose explicit state labels and action-pending guards, and the transition diagram is documented in the online data contract.
- Add protocol documentation close to DTO definitions.

Tests/review/deploy gates:

- Tests: protocol contract tests, stale-version tests, reconnect/resync e2e tests, malformed-message tests.
- Review: client-state review for impossible states, stale UI, duplicated actions, and accessibility regressions.
- Deploy: old disposable beta clients are blocked or forced to reload cleanly.

## Phase 5: Challenges and Access UX

Goal: support intentional game creation and joining flows before public discovery.

Status: access-policy foundation, the direct challenge lifecycle contract, challenge credential persistence, private challenge HTTP routes, atomic accept into online games, and durable public/unlisted game visibility changes are in place locally. Challenge creation stores immutable setup terms and private credential hashes; accepted challenges derive game credentials from the challenge credentials so each side can retrieve only its own game link. Accept, decline, cancel, lazy expiry, access-denied, fragment-token capture, post-accept challenger retrieval, and player publish/unlist controls are covered by focused tests. Local and browser smoke checks cover challenge create, bearer view, accept, challenger retrieval, and immediate two-player join. A minimal browser challenge surface exists before the broader UI polish tranche.

Work:

- Benchmark challenge UX before implementation.
- Keep the durable direct-challenge lifecycle event contract as the base for private challenge endpoints.
- Use durable visibility lifecycle events before public challenges, lobby listings, or archives depend on mutable exposure.
- Introduce a shared access-policy module so HTTP, WebSocket, spectator, challenge, and future lobby routes enforce the same visibility and role rules.
- Build challenge creation, accept/decline/expire, copied links, access-denied, and pending states.
- Define private, unlisted, and public visibility semantics.
- Add clear UI for player link, spectator link, and challenged-user access.

Tests/review/deploy gates:

- Tests: challenge lifecycle, expiration, access roles, link handling, and browser e2e tests.
- Review: contract/security review for challenge events, visibility changes, shared access policy, confusing links, accidental public exposure, and unauthorized joins.
- Deploy: challenge records are observable, expirable, and recoverable after restart.

Sequencing note: after challenge/access surfaces are sketched, pull Phase 6A UI shell polish forward before building broader lobby/archive surfaces. Sidebar navigation, tutorial placement, save/progress paths, go-back overlap, and mobile layout defects should be resolved while challenge UI is still small. The first three Phase 6A passes have now resolved the major shell/navigation defects found so far; repeat the audit when lobby, open seeks, accounts, or matchmaking add new destinations.

## Phase 6: Spectator, Archive, Lobby, Matchmaking

Goal: add discovery and post-game surfaces on top of stable contracts.

Status: Phase 6H through 6N are implemented and locally verified on 2026-06-01. The first discovery surface is a public Watch/Online Archive browser backed by token-free `OnlineGameSummary` read models. It lists only summaries marked `visibility: "public"` and does not expose private or unlisted invite games. Phase 6C adds a visible sidebar Analysis handoff for spectators and completed online games; it passes the current board state directly into local analysis and clears online URL/session state before remounting. Phase 6D separates archived-game replay launch from live spectating: completed archive rows fetch a single public snapshot, clear online URL/session state, and open local analysis directly. Phase 6E adds durable player publish/unlist controls through `visibility_changed` events and `PATCH /api/online/games/:gameId/visibility`; `private` changes remain deferred until spectator socket reauthorization exists. Phase 6F adds Public Directory v1: state-filtered public list responses, bounded limits, opaque cursors, single-summary lookup, store-level public list queries, rate-limited public directory reads, and Watch/Archive sort/time/result controls. Phase 6H adds open lobby seeks: separate durable seek events/summaries, PostgreSQL persistence, public token-free seek directory, creator-owned cancel/refresh/join flow, accept-to-game handoff, and Lobby/Watch/Online Archive tabs. Phase 6J adds server-backed seek filters, visible-tab auto-refresh, rate-limit backoff, freshness text, pending-action preservation, and mobile screenshot-verified Lobby/Watch/Archive layout. Phase 6K adds Quick Match v1 on top of open seeks without accounts or ratings. Phase 6M fixes challenge share-link reload/cleanup, stale terminal owned-lobby panels, lobby copy that confused list filters with current-setup actions, lobby listing create/accept/cancel/refresh and Quick Match failures now surface trusted server rejection details instead of replacing them with generic copy, and same-session reload coverage now verifies accepted owned lobby games can still be joined. Phase 6N makes analysis/replay reversible with `Back to Live Game`, `Back to Online Archive`, and local `Return to Game` actions while blocking active online players from using analysis as an unconfirmed escape hatch. Accounts, ratings, chat, and moderation remain deferred.

Work:

- Benchmark spectator, archive, lobby, matchmaking, and analysis entry points before screen design.
- Polish spectator experience, archived-game labels, result display, move list, share/export entry points, and public/unlisted visibility language.
- Redesign Lobby into a quieter, list-first page that separates listing filters from current-setup matchmaking actions and clarifies which games appear in Watch by default.
- Keep the visible analysis return path verified as spectator/archive usage grows.
- Build archive browse/search read models before broad public lobby.
- Add lobby presence and deeper matchmaking only after the Quick Match/open-seek loop is stable.

Tests/review/deploy gates:

- Tests: archive rebuild/search tests, spectator e2e tests, lobby presence tests, matchmaking lifecycle tests.
- Review: UX/accessibility review for scanning, empty states, mobile layouts, and analysis handoff.
- Deploy: discovery features can be rate-limited, disabled, and monitored independently.

## Phase 6B: Watch and Online Archive Browser

Goal: make public online games discoverable without changing visibility semantics.

Work:

- Add a Watch/Online Archive screen that fetches `/api/online/games`, separates active public games from completed archived games, and shows result/time/move summary labels.
- Add online browser navigation from the game shell and setup surfaces while keeping local Library distinct from Online Archive; Watch lives inside Online rather than as a top-level destination.
- Hand off row actions to the existing read-only spectator URL shape: `?onlineGame=<id>&view=spectator`.
- Strip stale player tokens, challenge parameters, PGN parameters, and URL fragments during spectator handoff.
- Keep empty states explicit: most current private-beta games are unlisted, so they will not appear until a later public visibility/open-lobby contract exists.

Tests/review/deploy gates:

- Tests: component coverage for empty/error/live/archive/search/spectate states, App navigation coverage for Watch return paths and token-free spectator handoff, and client coverage for spectator URL cleanup.
- Review: data/access-policy review to confirm only public summaries are listed; UX/accessibility review for keyboard row actions, mobile list layout, and clear public/unlisted language.
- Deploy: existing online browser smoke must still pass through create/join/spectate/terminal flows.

## Phase 6D: Archive Replay Launch

Goal: completed Online Archive rows should open local analysis/replay directly instead of first joining the spectator WebSocket flow.

Work:

- Keep active Watch rows on the token-free spectator URL flow.
- Add a distinct archive replay callback for completed rows, labelled as analysis/replay rather than spectating.
- Fetch a single public spectator snapshot for archived games, clear online/challenge/shared-game URL state, and remount the local game in analysis mode.
- Prefer a replay-built PGN analysis from the snapshot setup and move history; fall back to current-position analysis if replay import fails.
- Preserve hydrated online state such as victory points, graveyard, phoenix records, promotion state, piece theme, time control, rules, and sanctuary data during replay handoff.

Tests/review/deploy gates:

- Tests: Online Archive row action coverage, App archive replay handoff coverage, focused replay tests, full suite/build/server build, and browser smoke.
- Review: spectator/archive UX and correctness review focused on not accidentally opening WebSocket spectator mode, preserving state, clearing stale URL secrets, and keeping copy/link labels honest.
- Deploy: existing online smoke must still pass through create/join/action/spectate/terminal flows.

## Phase 6F: Public Directory V1

Goal: make Watch and Online Archive use a bounded public-directory contract before any lobby or matchmaking concepts.

Work:

- Add `GET /api/online/games?state=active|archived|all&limit=...&cursor=...` with schema-versioned responses and opaque keyset cursors.
- Add `GET /api/online/games/:gameId/summary` for one public summary.
- Move public listing to store-level queries where available, while keeping memory/dev fallback behavior.
- Reject token/auth/credential-looking query parameters on public directory endpoints.
- Add Watch/Archive scan controls for sort, clock type, and result filters without adding lobby/open-seek semantics.

Tests/review/deploy gates:

- Tests: read-model/client response validation, server query parsing, Postgres list/load queries, UI filter/sort coverage, App navigation coverage, full suite/build/server build, and browser smoke.
- Review: data-contract/security review for public-only listing and UX/accessibility review for Watch/Archive scan density on mobile.
- Deploy: existing online smoke must still pass through create/join/action/spectate/terminal flows.

## Phase 6H: Open Lobby Seeks Foundation

Goal: add the first Lichess-style public lobby slice without turning private challenges or public archives into matchmaking.

Status: implemented and locally verified on 2026-06-01. Open seeks are a separate pre-game lifecycle from direct challenges and online game summaries. Public Lobby rows expose only seek summaries and never include creator tokens, player tokens, credential hashes, challenge data, or invite URLs. Creator tokens are stored in `sessionStorage`, and accepted seek game invites reuse the existing token-stripped player join path.

Work:

- Add schema-versioned `seek_created`, `seek_accepted`, `seek_cancelled`, and `seek_expired` events with summary projection, lifecycle guards, secret rejection, directory cursors, and self-accept prevention.
- Add PostgreSQL `online_seek_events`, `online_seek_credentials`, `online_seek_summaries`, and `online_seek_locks` with transactional accept that creates exactly one normal online game and terminalizes the seek.
- Add HTTP routes for create, token-free list, creator fetch, creator cancel, and public accept.
- Add client helpers for open seek storage, create/list/fetch/cancel/accept, and response validation.
- Add Lobby tab beside Watch and Online Archive, with Castles-specific metadata: side preference, board radius, clock/casual, victory points, and expiry.
- Add setup and App integration so users can create a lobby seek from Play, accept someone else's seek, cancel/refresh their own seek, and join the accepted game.

Tests/review/deploy gates:

- Tests: seek contract tests, server route tests, PostgreSQL store tests, client helper tests, GameSetup/App/OnlineGameBrowser UI tests, full suite, client build, server build, browser smoke, and screenshot audit.
- Review: backend/security review for token exposure, public directory safety, self-accept, races, and transaction boundaries; UI/UX/accessibility review for Lichess-style density, mobile row actions, creator flow, and navigation hygiene.
- Deploy: existing online smoke must still pass through create/join/action/spectate/terminal flows. Server deploy must run schema readiness against PostgreSQL before enabling open lobby usage.

## Phase 6A: UI Shell, Navigation, Tutorial, and Save UX Polish

Goal: make the app feel navigable and sturdy before broader public discovery.

Status: third pass implemented and locally verified on 2026-06-01. The shell now uses shared primary navigation on setup, tutorial, local Library, online browser, challenge, and pending online/error screens; the game side panel is contextual to live play and review actions; New Game is guarded for active games; Save Game reports in-app feedback; mobile tutorial layout keeps the board reachable on short screens; the drawer is a modal dialog with focus trap, Escape close, focus restoration, and background inerting; and stale topbar/sidebar CSS and unused ControlPanel navigation props were removed under the no-legacy-support direction. Phase 6L now names the primary destinations Play, Learn, Online, and Library.

This phase is required before calling the online experience Lichess-like. The current app shell has known rough edges: the side bar can feel awkward, the tutorial entry point is not placed naturally, routes/views can be hard to return from, save/progress affordances are not prominent enough, and some controls may overlap on smaller layouts.

Work:

- Benchmark Lichess navigation, game-page side panels, tutorial/help entry points, archive/lobby affordances, and mobile layouts; compare with at least one other mature online board-game service.
- Audit the current app shell with screenshots across desktop and mobile viewports, including setup, game, tutorial/rules, library/save/progress, online spectator, pending action, access-denied, disconnected, resyncing, and terminal states.
- Address the current audit findings: fragile `previousView`/`viewStack` navigation, cramped setup topbar, tutorial mobile ordering risk, overloaded game sidebar actions, hidden mobile move history/progress, split save/export/library affordances, mixed hamburger-menu icon styles, top-overlay crowding, library page mismatch with app workflow, global overflow clipping, and silent tutorial progress.
- Rework the side bar/navigation so users can reliably move between setup, game, tutorial/rules, saved games/library, online links, and future lobby/archive screens.
- Place tutorial/help where a new player naturally expects it, while keeping the actual game screen primary.
- Make save/progress controls discoverable without crowding turn controls or online status.
- Fix overlapping controls, especially go-back/navigation affordances, tutorial navigation, online status, and mobile bottom controls.
- Scan for similar layout and navigation problems across all current pages before stopping at the first visible overlap.
- Preserve game-state safety: navigation must not accidentally reset an online or local game without a clear explicit action.

Implemented notes:

- Game side-panel actions are grouped into turn controls, save/review, online links, and navigation on desktop; mobile keeps secondary navigation in the drawer so the board remains primary at 360 x 640.
- Tutorial progress is labelled, persisted, and restartable from the tutorial topbar.
- Mobile move history is reachable through a disclosure, and history moves are keyboard-accessible buttons.
- Online invite/spectator controls use short visible labels while preserving full accessible names for tests and smoke automation.
- Top online/status/hint overlays no longer collide with the hamburger/drawer; online games suppress the generic discovery hint.
- Setup, Learn, Online, and Library share one `AppShellNav` pattern with non-destructive Play navigation back to the current game when one exists.
- Active local and online games use an in-app New Game confirmation dialog with focus trap, Escape handling, background inerting, and focus restoration to the invoking control or hamburger button.
- Library import is collapsed by default so saved games stay primary; Online and Library use denser app-shell headers.
- Reviewer findings from the second pass were accepted and fixed: drawer-started New Game focus restoration and short-height mobile tutorial clipping.
- Reviewer findings from the third pass were accepted and fixed: challenge and failed-online states now use the shared shell, drawer focus cannot escape through the trigger, app-level background content is inert while the drawer is open, the drawer sits above the install prompt layer, stale online/challenge/autosave/session credential state is cleared when leaving failed online states, and short-screen tutorial/online-state spacing avoids horizontal overflow.

Tests/review/deploy gates:

- Tests: route/view navigation tests, save/progress interaction tests, responsive layout assertions where practical, and browser smoke through create/join/spectate/terminal flows after shell changes.
- Manual browser QA: Playwright screenshots for desktop and mobile before/after, including access-denied, pending-action, disconnected, resyncing, and terminal online states, with explicit checks that controls do not overlap and important text fits.
- Review: UX/accessibility review focused on navigation clarity, keyboard/focus order, mobile ergonomics, and consistency with Lichess-inspired expectations adapted for Castles.
- Deploy: UI shell changes are shipped only after online smoke still passes and no local-save data is lost.

## Phase 6G: Navigation, Tutorial, and Save UX Refinement

Goal: substantially improve the app shell after the online directory foundation, using Lichess as the primary navigation-density benchmark with Castles-specific changes where the game differs.

Status: implemented and locally verified on 2026-06-01. Navigation state now uses explicit view-entry helpers instead of `previousView`; game-entry paths, saved-game loads, online spectate/replay, editor play, and restart clear stale return history. The drawer and all app-shell sidebars keep primary destinations before Board/Tools; Phase 6L now names those primary destinations Play, Learn, Online, and Library. Tutorial/Learn has a compact lesson header, visible lesson count, grouped controls, labelled lesson-board region, screen-reader progress status, and a more board-forward mobile split. Save Game now opens an in-app named-save modal with cancel, duplicate-save protection, focus trap, Escape close, background inerting, retryable failure, and saved-name feedback instead of a browser prompt. Screenshot artifacts are in `artifacts/ui-audit/phase6g-after`.

Work:

- Take fresh screenshots of Lichess navigation/game/learn/watch patterns and compare them against Castles desktop, tablet, short mobile, and drawer-open states.
- Audit all current routes and states for the issues the user reported: awkward sidebar shape, tutorial placement, unclear return navigation, weak save/progress affordances, and overlapping controls such as go-back/navigation actions.
- Redesign the sidebar/drawer so top destinations are easy to scan and do not compete with turn controls, clocks, online status, or save/review actions.
- Make Learn/Tutorial reachable from natural entry points while keeping the board-first game screen primary.
- Make save, saved-game progress, and return-to-game flows obvious without using destructive navigation or accidental resets.
- Scan for similar layout defects across setup, game, tutorial/rules, Library, Watch/Archive, online active/spectator, pending action, disconnected/resyncing, access-denied, challenge, and terminal states before stopping.

Tests/review/deploy gates:

- Tests: app navigation return-path tests, tutorial progress persistence tests, save/progress tests, and responsive assertions where practical.
- Browser QA: Playwright screenshots at desktop, tablet, 430 x 932, 390 x 844, and 360 x 640 for all changed states, with overflow and overlap metrics.
- Review: UI/UX/accessibility reviewer pass before implementation and again before commit, focused on Lichess-style density, keyboard/focus order, mobile ergonomics, and no hidden destructive resets.
- Deploy: full automated suite, builds, browser online smoke, and screenshot audit must pass before push.

## Phase 6I: Full UI Navigation and Learning Sweep

Goal: after the open lobby foundation is stable, substantially improve the whole app UI so Play, Learn, Online, Library, save/progress, and in-game controls feel coherent and do not overlap.

Status: first sweep implemented locally on 2026-06-01 after Phase 6H. The shared app shell now avoids the sticky mobile header and negative-margin overlap pattern, primary destinations wrap cleanly on small screens, the drawer labels Tutorial as Learn, setup actions are grouped in stable controls, Library rename/delete uses accessible in-app dialogs instead of browser prompts, Library action feedback is visible outside the collapsed import section, and screenshots found no interactive overlaps in the audited desktop/mobile/short-mobile game, drawer, setup, tutorial, Library, online browser, and save-modal states. Phase 6L now names the primary destinations Play, Learn, Online, and Library.

Work:

- Benchmark Lichess lobby/play/learn/navigation screens and compare them to Castles with targeted improvements for a hex strategy game.
- Audit the current sidebar, drawer, tutorial/Learn placement, setup actions, online Lobby/Watch/Archive, Library, save modal, progress indicators, and back/navigation controls across desktop, tablet, mobile, and short-mobile viewports.
- Fix awkward side bar shape and navigation hierarchy while keeping game controls contextual and the board primary.
- Move or redesign tutorial entry/progress so a new player can find Learn naturally and return to the game or setup without confusion.
- Make save/progress state easier to understand, including the difference between autosave, named Library saves, tutorial progress, local Library, and Online Archive.
- Fix any go-back/navigation/control overlap found in screenshots, then scan for similar layout problems across all pages before stopping.
- Keep changes no-legacy and source-controlled; no support for unused old UI states.

Tests/review/deploy gates:

- Tests: App navigation reducer/return-path tests, Tutorial progress/resume tests, save/autosave/Library tests, responsive component assertions where practical, and any regression tests for overlap defects found.
- Browser QA: Playwright screenshots and bounding-box checks at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640 for game, setup, tutorial, Library, Lobby, Watch, Archive, online pending/error, drawer-open, save modal, and long-text states.
- Review: UI/UX/accessibility reviewer before implementation and after fixes, plus final code review for navigation-state architecture and stale-state cleanup.
- Deploy: full automated suite, builds, browser online smoke, screenshot audit, commit, and push before moving to matchmaking or account features.

## Phase 6J: Lobby Refresh and Filters

Goal: make the open-seek Lobby feel live and scannable without adding accounts, ratings, chat, or automated matchmaking before their contracts exist.

Status: implemented and locally verified on 2026-06-01. Public open-seek filters are now server-backed for creator side, clock type, and victory-points scoring, with local text search layered on top. Public Lobby refreshes every 30 seconds only while visible, serializes in-flight loads, backs off after rate limits, preserves current rows during background refreshes, and keeps pending accept/cancel rows focused until the action resolves. Creator-owned open seeks refresh through the existing authenticated creator fetch path. Last-checked freshness is visible without repeatedly announcing timestamp changes in the polite status region.

Work:

- Extend open-seek directory options and client query helpers with token-free `creatorSeat`, `clock`, and `vp` filters.
- Apply filters before cursor/limit pagination in both the in-memory HTTP paginator and PostgreSQL store, using exact JSONB predicates and parameter binding for user-provided values.
- Reject invalid, duplicate, and secret-looking public seek query parameters without echoing the submitted values.
- Add Lobby filter controls for side, clock, scoring, Refresh, Create Open Seek, and search while keeping Watch/Archive controls stable.
- Add visible-tab public and owner refresh loops with in-flight guards, 60-second rate-limit backoff, honest status copy, and non-disruptive background updates.
- Preserve pending accept/cancel rows and focus through refresh races.

Tests/review/deploy gates:

- Tests: shared seek filter predicate tests, client URL tests, HTTP parser/pagination/security tests, PostgreSQL query tests, OnlineGameBrowser fake-timer/visibility/focus/backoff tests, and CSS toolbar regression tests.
- Browser QA: Playwright screenshots and bounding-box checks at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640 for owner-open Lobby, public Lobby rows, pending accept, all-filters-active filtered empty, Watch, Archive, and owner-accepted states.
- Review: backend/security reviewer and UI/accessibility reviewer passes before final verification, including fixes for overlapping refreshes, pending-action races, stale rate-limit copy, and live-region timestamp churn.
- Deploy: full automated suite, client build, server build, diff check, PostgreSQL-backed browser smoke, screenshot audit, commit, and push before moving to matchmaking automation.

## Phase 6K: Quick Match V1

Goal: make the lobby playable with one-click matching while still using the existing open-seek lifecycle.

Status: implemented and locally verified on 2026-06-01. Full automated tests, client build, server build, diff check, PostgreSQL-backed browser smoke, and Phase 6K screenshot/layout audit passed before commit.

Work:

- Add `POST /api/online/matchmaking/quick` as automation over open seeks: page through the bounded public directory, accept the first compatible seek found, or create a normal random-side seek when none exists.
- Match only exact normalized setups, including board, pieces, sanctuaries, time control, scoring mode, pool, and theme.
- Keep bearer tokens out of public directories and URLs; creator/player tokens remain only in direct authenticated responses and `sessionStorage`.
- Serialize same-session quick-match work in the current single Node process and reject duplicate active same-session seeks with sanitized errors.
- Reuse accepted-game handoff and creator-owned seek panels so Quick Match does not introduce a second lobby lifecycle.
- Document the deployment constraint: multi-instance deployment needs a durable PostgreSQL advisory lock, active-seek constraint, or equivalent shared lock before enabling horizontal workers.

Tests/review/deploy gates:

- Tests: client response validation, HTTP route and injected-store tests, same-session race tests, token hygiene tests, App handoff tests, OnlineGameBrowser pending/focus/accessibility tests, full suite, client build, server build, browser smoke, and screenshot audit.
- Review: backend/security reviewer for race/token/rate-limit boundaries, UI/accessibility reviewer for Lichess-style lobby density and mobile flow, and final integration reviewer before commit.
- Deploy: push only after full local verification and PostgreSQL-backed browser smoke pass.

## Phase 6L: Post-Matchmaking UI Polish

Goal: after Quick Match lands, substantially improve the app shell and online surfaces so navigation feels closer to Lichess in speed and clarity while remaining Castles-specific.

Trigger: start immediately after Phase 6K is committed and pushed.

Status: first Phase 6L slices are implemented and locally verified on 2026-06-01. Online is now a top-level destination, Lobby/Watch/Archive are tabs inside it, the selected Online tab persists across Learn/Library return paths, player-facing "seek" wording is removed from the main UI, the challenge creator link wraps safely on mobile, the game sidebar exposes Local Library save status without mixing it with Online Archive, and Learn now has visible module/progress-storage cues with short-mobile lesson text above the board. The remaining Phase 6L work is narrower: keep rechecking long online status/error copy and new banners as later online surfaces grow.

Work:

- Take fresh Lichess reference screenshots for play, lobby, watch, analysis, and learn flows, then compare them against Castles screenshots rather than copying the UI directly.
- Keep the game side panel contextual to clocks, turn controls, online status, save/review actions, and local Library state; recheck it whenever new online banners or actions are added.
- Keep tutorial/Learn entry and progress natural as lessons expand, and verify users can return to Play, setup, Online, and Library without confusion.
- Keep save progress and local Library state obvious, including named saves, autosave, tutorial progress, and the distinction between local Library and Online Archive.
- Audit and fix overlapping controls, especially back/go-back buttons, drawer/menu controls, tutorial controls, online banners, quick-match/lobby status, and mobile bottom controls.
- Scan every page and important state for similar layout failures: game, setup, tutorial, Library, Lobby, Watch, Archive, private challenge, pending online, disconnected/resyncing, spectator, terminal game, save modal, and drawer-open states.
- Keep no-legacy-support discipline: remove defensive old UI paths that no current flow uses if they make navigation harder to reason about.

Tests/review/deploy gates:

- Tests: navigation return-path tests, tutorial persistence tests, save/autosave/Library tests, responsive CSS/static assertions where useful, and regression tests for every overlap found.
- Browser QA: Playwright screenshots and bounding-box checks at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640 for all changed surfaces.
- Review: UI/UX/accessibility reviewer before implementation and after fixes, plus final code review focused on navigation-state simplicity, focus order, mobile ergonomics, and stale-state cleanup.
- Deploy: full suite, client build, server build, browser online smoke, screenshot audit, commit, and push before moving to deeper matchmaking, accounts, ratings, chat, or moderation.

## Phase 6O: Online Lobby and Watch Structural Polish

Goal: make Online feel more like a practical Lichess-style play surface without implying unsupported ratings, accounts, chat, or server-side discovery features.

Status: implemented and locally verified on 2026-06-02. Lobby now separates "Find lobby listings" controls from "Play from current setup" actions. `Create Lobby Listing` creates the listing directly from Online using the current Play setup, disables while pending, and is hidden together with Quick Match during analysis/replay/online/challenge states. If no current Play setup exists, Lobby shows a `Configure Setup` prompt instead of referencing unavailable matchmaking actions. Watch now has a top-live-game plus more-games layout, visible-tab refresh, hidden-tab pause, and an in-flight guard so background refresh cannot clobber `Load more`. Open listing side labels, search placeholders, and accessibility group names were tightened after review.

Remaining work:

- Add a real TV-style selection signal from ratings, follows, account metadata, or another durable activity model before reintroducing any "featured game" claim.
- Move Watch/Archive search and richer filters into indexed server queries once the read model carries the remaining searchable fields.
- Decide whether current public-game preview belongs in Lobby long-term or should move entirely into Watch after the Watch selection model is stronger.

## Phase 6P: Learn Completion Progress Hardening

Goal: make Learn progress closer to a Lichess-style course without claiming engine-graded mastery.

Status: implemented locally on 2026-06-02, with objective validation hardened on 2026-06-03. Learn now separates resume position from completed lessons, stores checked objectives by authored lesson-scoped objective ids instead of array indexes or objective wording, derives completion from objective checks, and demotes completion if a checked objective is later unchecked. Unsupported legacy progress archaeology stays out of scope. Course copy now says lessons and objectives are completed rather than "mastered"; read-only lessons complete from Next. Every authored objective now declares explicit completion metadata, so lesson copy no longer controls validation behavior. Clear action objectives can auto-complete from movement, capture, recruitment, promotion, pledge, ability, phase-change, and inspection events; puzzle, comparison, and free-practice objectives remain manual until the emitted events include precise target evidence.

Remaining work:

- Add richer engine-graded objectives only after tutorial events carry explicit target/piece/hex evidence and each target board state is tested.
- Add richer lesson theory and practice modules once the ruleset is stable enough to avoid teaching stale mechanics.

## Phase 6Q: Learn Course Presentation Polish

Goal: make the Learn overview feel more like a compact Lichess-style learning path while keeping Castles-specific completion progress honest.

Status: implemented and locally verified on 2026-06-02. The Learn overview now has a current/next lesson panel, desktop course section map, per-module progress bars, per-lesson objective progress, piece/terrain-specific lesson visuals, clearer `Course overview` return controls, and bottom lesson navigation for users who scroll through lesson text. Mobile hides the section map so the first screen reaches the course title and current lesson panel sooner. A reviewer pass fixed the next-incomplete lesson label and no-objective completed-card aria wording. Screenshot artifacts are in `artifacts/ui-audit/phase6q-learn-after`.

Remaining work:

- Add real engine-graded lesson success only after each objective has an explicit validation event.
- Expand theory/practice lesson content after the ruleset is stable enough to avoid teaching stale mechanics.
- Recheck Learn at tablet boundary widths when the next broad UI sweep starts.

## Phase 6R: Online Lobby and Watch Clarity

Goal: make the current Online surface easier to understand without implying unsupported ratings, accounts, board thumbnails, or a real featured-game ranking.

Status: implemented and locally verified on 2026-06-02. The slice keeps the existing public summary data model, renames "Top live game" to "Most active live game", selects that featured card by move count rather than the active sort dropdown, adds a direct `Open Watch` handoff from the Lobby current-games section, makes live refresh labels explicit, and replaces terminal owned-listing dead ends with a clear closed-listing notice and next action.

Remaining work:

- Add a real TV-style selection signal from ratings, follows, account metadata, or another durable activity model before reintroducing any "featured game" claim.
- Decide whether the current public-game preview belongs in Lobby long-term or should move entirely into Watch after Watch has stronger selection controls.
- Keep cancelled and expired lobby listings out of public rows and avoid showing dead owner refresh controls.
- Re-audit Watch and Lobby at desktop/mobile sizes after each new public summary field is added.

## Phase 6S: Online Lobby Visual Clarity

Goal: make Lobby feel quieter and more list-first while preserving the current open-seek backend contract.

Status: implemented and locally verified on 2026-06-02. Open listings now sit before the secondary Watch/current-games preview, so Lobby filters visibly apply to the next list. Closed owned listings are status-only and no longer duplicate the current-setup create action. Creator-side wording is explicit, fixed-side listings explain the acceptor's side, and Castle-control listings are rendered and searchable. Quick Match copy describes the actual "try open listings, otherwise list this setup" behavior without implying ratings, accounts, or a richer matchmaking queue. Reviewer cleanup added visible terminal-panel focus, corrected accepted random-side owner copy, aligned search tokens with visible row metadata, and made scoring filter accessibility labels generic. Full verification passed `npm test`, `npm run build`, `npm run server:build`, `git diff --check`, browser online smoke, and Playwright screenshot/layout audit at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640. Screenshot artifacts are in `artifacts/ui-audit/phase6s-online-lobby`.

Remaining work:

- Add server-backed live-game preview fields before introducing board thumbnails, side-to-move, last move, clocks, spectator counts, ratings, or a true TV-style featured game.
- Decide later whether the compact Watch preview belongs in Lobby once Watch has richer scan controls.

## Phase 6T: Public Live Preview Read Model

Goal: make Watch and Lobby rows show trustworthy live-game metadata from the public read model instead of guessing from UI state or private snapshots.

Status: implemented and locally verified on 2026-06-02. `OnlineGameSummary` is now schema version 2 and groups token-free preview data under `livePreview`: side to move, turn phase, move-history count, last move, and persisted clock basis. Watch/Lobby rows now render move count from move history instead of the room version, show the active side and phase only for live games, show last move notation when available, and show a non-ticking `Clock snapshot` label for timed games. The summary validator rejects timed public summaries without clock basis, casual summaries with clock data, impossible last-move combinations, and clock objects that contain response-specific `serverNow` values. Production startup already calls the destructive summary rebuild path before listening, and regression coverage now verifies stale materialized v1 summary rows are deleted and replaced from the event log. Verification passed focused Phase 6T tests, the full automated suite, client build, server build, diff check, local PostgreSQL restart smoke, browser online smoke, and Lobby/Watch/Archive screenshot audit at 1440 x 900 and 390 x 844. Screenshot artifacts are in `artifacts/ui-audit/phase6t-live-preview`.

Deferred:

- Board thumbnails are handled in Phase 6U with a separate token-free board-preview read model.
- Spectator counts need a multi-instance-aware presence source; the current process-local socket map is not durable enough.
- Ratings, accounts, TV-style ranking, opening trees, and public archive search remain later phases.
- Live row clocks are snapshot labels only. Ticking public clocks should wait for a response-time basis and a UX review so rows do not imply more precision than the summary contract provides.

Commit status:

- Superseded by Phase 6U board-preview verification before commit/push.

## Phase 6U: Public Board Preview and First-Run Onboarding

Goal: make Watch and Lobby rows more scannable with token-free miniature board previews, and give first-time players a clear path into Learn before they are dropped into the board.

Status: implemented locally on 2026-06-02. `OnlineGameSummary` is now schema version 3 and includes `livePreview.boardPreview` with bounded board radius, piece coordinates/types, and castle owners. Lobby/Watch/Archive public rows render compact SVG board previews with accessible labels that expose White/Black piece and castle-owner counts without tokens or private snapshots. First-time local visitors see a one-time welcome dialog that recommends `Start Learn`, traps focus, supports Escape dismissal, and stores the dismissal in localStorage. Direct online/challenge/spectator links suppress the prompt until the user returns to normal local play.

Verification plan:

- Focused tests: read-model validation/projection, OnlineGameBrowser row rendering/accessibility, and App first-run modal/navigation tests.
- Wider tests: client/server summary fixtures, full automated suite, client build, server build, diff check.
- Browser QA: local Playwright smoke for first-run Learn handoff plus Online Lobby/Watch rows at desktop and mobile widths.
- Review: backend/read-model reviewer for schema, token hygiene, and startup rebuild assumptions; UI/accessibility reviewer for modal focus and preview labels.

Remaining work:

- Spectator counts need a multi-instance-aware presence source.
- A true TV/featured ranking still needs ratings/accounts or a durable activity signal.
- Public row clocks remain snapshot labels; ticking public clocks should wait for response-time basis and UX review.
- Consider richer board-preview art later, but only after the current compact preview proves readable on mobile.

## Phase 6V: App Shell Deploy Freshness

Goal: prevent old production client bundles from surviving a deploy after the server has already moved to a newer commit.

Status: implemented and locally verified on 2026-06-02. The production service worker now uses a network-first policy for app-shell navigations and `index.html`, bypasses `/service-worker.js`, API/WebSocket routes, online game links, challenge links, and token-bearing URLs, and keeps static icon/manifest assets cacheable. The browser registration now sets `updateViaCache: "none"`, while the Node static server marks `index.html` and `service-worker.js` as `no-store` and hashed assets as immutable. This keeps future online hotfixes visible after a normal reload instead of requiring users to discover cache-busted links.

Verification:

- Focused service-worker policy tests cover online/challenge/token bypasses, network-first app-shell requests, and old-cache cleanup.
- Full verification passed `npm test`, `npm run build`, `npm run server:build`, and `git diff --check`.

Remaining work:

- Add a visible "new version available" prompt later if silent service-worker updates ever disrupt active long games.
- Keep deployment smoke checks pinned to the expected commit so stale clients are caught immediately after server restarts.

## Phase 6W: No-Account Recent Online Replays

Goal: let players find and analyze completed friend-link games from the same browser even when those games are unlisted and therefore absent from the public Online Archive.

Status: implemented locally on 2026-06-02. The app now records token-free recent online game ids in localStorage when an online player or spectator snapshot is seen, updates the record to complete once the server snapshot has a result, and passes those records to Online Archive. Archive now shows a distinct `Recent completed online games` section for completed local records that are not already present in the public archive, with `Analyze Replay` using the existing spectator snapshot and replay reconstruction path. The visible copy describes these as device-only replays rather than account history or public archive rows. Unlisted game ids in this list are local replay locators, not bearer tokens or harmless public-history entries. Known-private games are not newly added to this token-free replay list. The section also has a clear control so anonymous users can remove those local replay locators from the browser.

Verification:

- Focused tests cover recent-online-game storage validation, ordering, de-duplication, malformed data cleanup, extra token/URL field normalization, App snapshot-to-storage wiring without token leakage, Archive rendering, duplicate suppression against public rows, replay button handoff, and clearing the device-local replay list.
- Client build and server build passed locally.

Remaining work:

- Account-backed personal game history should replace or augment this local-only list once accounts exist, so registered players see their own finished games across devices while anonymous players keep the current on-this-device recent list.
- If private games later need replay from the same browser, add an authenticated replay endpoint or token-safe local credential design rather than using public spectator snapshots.
- Account-backed history should make this clear control affect only the anonymous/device-local fallback, not a signed-in user's durable game history.

## Phase 6X: Watch and Lobby Live Overview

Goal: make the current-games surfaces easier to scan without adding unsupported spectator counts, ratings, or TV-style ranking.

Status: implemented locally on 2026-06-02 and wording tightened on 2026-06-05. Lobby's Current games section and the Watch tab now show a compact live overview with the public live-game count, the current selected game, the literal selection reason, and the public-only visibility scope. This reuses the existing public summary read model and does not infer private/unlisted games or process-local spectator presence.

Verification:

- Focused OnlineGameBrowser tests cover the Lobby overview, the Watch overview, and the most-moves selected game when the visible list is sorted by newest.
- Regression tests cover total public-live counts when the Lobby preview is capped and when Watch filters reduce the visible game list.

Remaining work:

- Spectator counts still need a multi-instance-aware presence source.
- A true TV/featured ranking still needs ratings/accounts or a durable activity signal.
- Continue UI screenshot QA for desktop and mobile Watch/Lobby layouts before broad deployment.

## Phase 6Y: Setup Entry Point Streamlining

Goal: make the Play setup screen present one clear path for each game-start intent.

Status: implemented locally on 2026-06-02. The setup screen now keeps three primary actions: `Play Local`, `Invite Friend`, and `List in Lobby`. The older direct `Private Link` action was removed from setup because `Invite Friend` covers private invitations with a clearer accept/join lifecycle, while `List in Lobby` covers public matchmaking from the current setup. This avoids presenting two competing private-online flows.

Verification:

- Focused GameSetup tests cover the new action order and absence of the old `Private Link` button. App tests cover the `Invite Friend` and `List in Lobby` handoffs.

Remaining work:

- Continue to keep edited-board/private-invite flows available through the friend challenge and lobby listing paths.
- Revisit copy if account-backed challenges add named friends or rating-aware matchmaking.

## Phase 6Z: Durable Participant Identity and History Foundation

Goal: prepare account-backed personal history without exposing an unsafe "tell the server who I am" endpoint.

Status: implemented locally on 2026-06-02. Game creation events can now carry `whiteIdentity` and `blackIdentity`, and accepted direct challenges/open lobby listings bind those identities into the durable `game_created` event before persistence. Materialized game summaries project participants from the event stream, so summary rebuilds preserve player identities and seat assignment. Direct-created games use explicit generated anonymous identities. PostgreSQL also has a backend-only personal-history query that can list summaries for a server-resolved identity across public, unlisted, and private games.

Remaining work:

- Add a real account/session layer before exposing personal history over HTTP; future endpoints must derive identity server-side rather than accepting arbitrary client-provided identity fields.
- Add signed-in archive UI only after account identity exists, then keep device-local recent replays as an anonymous fallback.
- Ratings remain deferred until result contracts, account identity, and moderation basics are strong enough.

## Phase 6AA: Deployment Handoff and Reinstall Runbook

Goal: make a server move or fresh reinstall understandable without live debugging or guessing which layer is responsible.

Status: implemented locally on 2026-06-03. The production runbook now has a quick path for the current handoff shape where nginx already terminates HTTPS and proxies to `127.0.0.1:3000`, PostgreSQL is remote, and the missing piece may only be the Node service. The Node service now binds to `127.0.0.1` by default through `CASTLES_BIND_HOST`, so port `3000` stays behind nginx unless explicitly overridden. README now states that online multiplayer uses PostgreSQL through `ONLINE_STORE_BACKEND=postgres` and a secret `DATABASE_URL`, and points operators to the production runbook.

Remaining work:

- Keep smoke checks pinned to the expected commit on every live deploy.
- Update the runbook again when accounts, migrations, multi-instance deployment, or managed release automation change the deploy shape.

## Phase 6AB: Safe Live Online Move Replay

Goal: let players review the previous move during a live online game without creating an analysis escape hatch or accidental action submission.

Status: implemented and pushed on 2026-06-03, with a follow-up last-move highlight implemented locally the same day. Active online players can use Left/Right arrow replay just like spectators and completed games. While a live online player is viewing a historical node, piece selection, pass, resignation, promotion, and command-backed actions are read-only. Stepping forward onto the current move clears history mode immediately, so the next legal action can be submitted without needing an extra key press. The board marks the source and destination hexes for the currently viewed move, so players can see what changed without opening full analysis. A regression also covers direct castle capture on the final attack step entering the Recruitment phase when the captured castle can recruit.

Verification:

- Reviewer loop found and fixed resignation, promotion, and stale `viewNodeId` return-to-live bypasses; final review reported no findings.
- Focused replay, last-move highlight, and castle-capture tests passed.
- Full `npm test` and `npm run build` passed before commit `1750da0`.

Remaining work:

- Add richer animated piece movement and/or a last-action toast later if the static board highlight is not enough during fast play.
- Keep active-player analysis handoff blocked until a future server-confirmed takeback/analysis model exists.

## Phase 6AC: Watch Current-Audience Scan Mode

Goal: let Watch use the live spectator-count metadata without implying ratings, global popularity, or durable archive history.

Status: implemented on 2026-06-03 and wording tightened on 2026-06-05. The Watch tab now has a `Most watched in current list` sort option that ranks only the loaded public live-game page by current response-decorated spectator count, falling back to move count and recency. The selected Watch card and live overview use the watcher-ranked label only when the selected game has a positive current watcher count; otherwise they keep the existing most-moves activity model. Online Archive intentionally does not expose this sort because spectator counts are active-game-only and are not persisted into completed summaries.

Remaining work:

- Replace process-local watcher counts with a shared presence source before using this signal across multiple Node instances.
- Add a stronger TV/featured-game model only after accounts, ratings, or another durable activity signal exists.
- Keep browser screenshot QA on Watch rows because board previews, clock snapshots, watcher labels, and row actions are dense on mobile.

## Phase 6AD: Server-Backed Public Directory Filters

Goal: make Watch/Archive clock and Archive result filters apply before pagination, so archive scanning does not depend on whichever page happened to be loaded first.

Status: implemented and pushed on 2026-06-03. `GET /api/online/games` now accepts token-free `clock=timed|casual` and `result=white|black|resignation|timeout|castle_control|victory_points|monarch_captured` filters. The HTTP parser rejects invalid or duplicate values, the in-memory and PostgreSQL public directory paths apply these filters before cursor/limit pagination, and the Online browser sends Clock and Result controls through the shared client query helper.

Remaining work:

- Keep Watch `Most watched in current list` scoped to the loaded page until spectator presence is shared across Node instances.
- Continue Archive/replay row polish after the server can return the right filtered page.

## Phase 6AE: Server-Backed Public Directory Search

Goal: make Watch/Archive search apply before pagination without exposing secret-bearing data or raw identity ids.

Status: implemented on 2026-06-03 and client-tightened on 2026-06-06. `GET /api/online/games` accepts `q=<search>`, normalizes it to 1-80 visible characters, rejects duplicate/empty/control-character/secret-looking values, and applies it before cursor/limit pagination in both the in-memory and PostgreSQL public directory paths. The shared search text matches game id, registered display names, White/Black fallbacks, status/archive state, result labels, side-to-move labels, turn phase, timed/casual labels, and last-move notation. It intentionally does not search raw anonymous/session/registered ids, spectator counts, credentials, or full board JSON. Watch/Archive send a debounced `q`; Lobby search remains scoped to open seeks and does not affect the current-games preview. The Online browser now trusts server-returned public search pages after the matching query response lands, while retaining local filtering for pending search responses and account-history shortcuts.

Remaining work:

- Add richer indexed search once public archive volume grows beyond the bounded first-pass query.
- Add clearer player/title metadata after accounts exist.
- Continue Archive/replay row polish with the new server-backed filtered pages.

## Phase 6AF: Archive Replay Row Clarity

Goal: make completed public games scan like replays instead of live rows with a different button.

Status: implemented on 2026-06-03. Online Archive rows now show replay-specific metadata from the existing public summary: result, replay length, final side/phase, last move, time control, started time, and ended time. Live-only controls such as spectator-link copying and watcher labels remain hidden for archived games. The read model now pins `endedAt` to the terminal gameplay event for resignations, timeouts, monarch captures, castle-control wins, and victory-points wins, so later visibility changes can update `updatedAt` without moving the displayed completion time.

Remaining work:

- Add richer replay detail only after a separate archive-detail/read-model contract exists.
- Keep recent device-only replays clearly separate from public archive rows until account-backed history exists.

## Phase 6AG: Public Directory Clock Read Time

Goal: make Watch/Lobby live rows show clock values based on a server response time instead of vague persisted snapshots.

Status: implemented on 2026-06-03. Active timed public game summaries now receive a response-only `livePreview.clock.serverNow` from the HTTP server, while persisted/materialized summaries still store only the durable clock basis. Summary stripping and validation treat `serverNow` like spectator presence: it is active-game-only, safe for public responses, and removed before persistence checks. Watch/Lobby rows now render `Clock W ... B ...` from the response-time estimate; archived rows keep the stable time-control label.

Remaining work:

- If live rows later need ticking clocks, add a component-level refresh/ticker that is explicitly bounded and tested for background-tab behavior.
- Keep multi-instance clock freshness independent from spectator presence; `serverNow` is per HTTP response and does not need shared pub/sub.

## Phase 6AH: Local PostgreSQL Smoke Preflight

Goal: make local deployment rehearsal fail early and safely before any smoke script mutates a database.

Status: implemented on 2026-06-03. A shared local PostgreSQL prerequisite helper now backs a new `npm run online:smoke:local:preflight` command and the existing restart, concurrency, and challenge smoke entrypoints. The preflight checks built client/server artifacts, PostgreSQL URL shape, local-host safety, `psql` availability through `PATH`, `PSQL_PATH`, or `PGCLIENT_BIN`, database readiness, and the default local smoke identity `castles_local`/`castles_local`. A disposable override remains available for explicitly non-production custom databases, but the default path now rejects localhost tunnels or copied production-style credentials before any smoke game is created. The readiness check uses `PG*` environment variables rather than placing the full connection URL in process arguments.

Follow-up: the built-app browser smoke now matches the current setup flow. It no longer waits for the removed `Private Link` button, creates the low-level player/spectator regression game through the HTTP API, and keeps the user-facing challenge smoke on the `Invite Friend` path. A new `npm run online:smoke:local:browser` wrapper starts the built Node server on a private localhost port against the checked local PostgreSQL rehearsal database, runs the browser smoke, and shuts the server down through the local shutdown endpoint.

Verification:

- Focused prerequisite tests cover local/non-local URL handling, password-redacted output, `PGCLIENT_BIN` directory expansion, `psql` readiness parsing, identity rejection, artifact checks, and successful preflight.
- Local PostgreSQL preflight, restart persistence smoke, concurrency smoke, and challenge HTTP smoke passed against the clean `castles_local` rehearsal database.
- Local built-server browser smoke passed against the same rehearsal database.
- Full `npm test`, client build, server build, and diff hygiene passed after reviewer findings were fixed.

Remaining work:

- Keep live deployment smoke pinned to the expected commit after each server push.
- Revisit the runbook when migrations, account tables, or managed release automation are introduced.

## Phase 6AI: Repeatable Local UI Layout Audit

Goal: stop Phase 6 UI polish from depending on one-off screenshots by adding a local built-app audit that covers representative pages and viewports.

Status: implemented locally on 2026-06-03. `npm run ui:audit:local` starts the built Node server on a private localhost port against the checked local PostgreSQL rehearsal database, seeds open lobby, live public, and archived public game fixtures, waits for those rows to render, opens Playwright Chromium, captures desktop/mobile/short-mobile screenshots for Play setup, Online Lobby/Watch/Archive, Tutorial overview/lesson, Library, local game board, online player board, online spectator board, and the game drawer, then fails on horizontal page overflow, horizontally clipped interactive controls, text overflow inside interactive controls, required text that cannot be reached by scrolling audited containers, and obvious overlapping interactive targets at both initial and scrolled container positions. It navigates player pages through tokenless URLs backed by session storage and cleans up seeded fixtures before shutdown. Screenshots and metrics are written under ignored `artifacts/ui-audit/phase6ai-local-layout`.

Gate result: passed with `npm run online:smoke:local:browser` and `npm run ui:audit:local` before Phase 7A began. Phase 6 is now closed except for P0/P1 bugs that block a live match or make a deployed page unusable. Lower-priority visual polish should move into later UI phases so Phase 6 does not keep expanding.

## Phase 7: Accounts, Ratings, Fair Play, Moderation, Admin

Goal: add public-service trust and governance features.

## Phase 7A: Account Session and Personal History Foundation

Goal: add the first server-resolved account identity layer without yet adding profiles, ratings, chat, or moderation.

Status: implemented locally on 2026-06-03. The server now has account/session endpoints, PostgreSQL-backed `online_accounts` and `online_account_sessions` tables, account bearer resolution, and an authenticated personal-history endpoint. Account tokens are stored separately from public identities; `OnlineIdentity.id` remains a public non-secret registered-account id. Open seek creation, open seek acceptance, Quick Match, and challenge creation can use the authenticated account identity when an account bearer is present, while anonymous browser-session ids remain the fallback. Personal game history is derived from the server-resolved account identity and can include private, unlisted, and public game summaries for that account. Direct game/challenge bearer tokens remain separate from account sessions.

Work:

- Decide whether direct low-level game creation should bind the creator's account to a chosen seat, or continue to prefer the challenge/open-seek flows for account-owned games.
- Add account-bound challenge acceptance after a separate challenged-user binding design exists; do not infer challenged identity from an unauthenticated invite URL.
- Add account deletion/session revocation and privacy copy before public account launch.

Tests/review/deploy gates:

- Tests: account create/me/history route tests, account store tests, client helper tests, full suite, client build, server build, local PostgreSQL browser smoke, and UI audit when visible account UI is added.
- Review: account/session security review focused on token storage, accidental public identity leakage, authorization separation from game/challenge bearer tokens, and personal-history privacy.
- Deploy: `server:check-config` must verify both game and account stores against PostgreSQL before the Node service starts.

## Phase 7B: Visible Account UI and Account Archive

Goal: expose the Phase 7A account/session foundation to players without adding ratings, profiles, or moderation yet.

Status: implemented locally on 2026-06-03, with trusted account creation/sign-in/session deletion rejection messages added on 2026-06-05. The Online page now has a compact account panel for display-name/password account creation, password sign-in, saved-session refresh, current account display, sign-out, and account error messages. Account creation, sign-in, sign-out, sign-out-everywhere, and deletion preserve trusted server rejection copy such as duplicate display names, invalid credentials, or persistence failures instead of replacing it with generic account-panel text. The browser persists the account session in local storage as an account bearer session, separate from game/challenge/seek credentials. Signed-in challenge creation, open lobby listing, open seek acceptance, and Quick Match pass the account bearer so server summaries use the registered identity. The Online Archive now has an account archive section backed by `GET /api/online/account/games`, while device-local recent replays remain the anonymous fallback.

Tests/review/deploy gates:

- Tests: client account-session storage coverage, Online page account panel/archive coverage, full suite, client build, server build, local PostgreSQL browser smoke, and UI audit.
- Review: account UI/security review focused on bearer-session storage, duplicate public/account archive rows, signed-out fallback clarity, and not confusing account sessions with game seat tokens.
- Deploy: deploy only after account table config check and browser smoke pass against PostgreSQL.

## Phase 7C: Account Archive Scanability

Goal: make the visible account archive read like a mixed archive surface rather than a public-only directory after account history is available.

Status: implemented locally on 2026-06-03, with authenticated account-history filter pushdown added on 2026-06-06. The Archive tab now uses archive-specific search, sort, status, and section labels. Signed-in account games, device-only recent replays, and public replays are shown as distinct sections with a combined count in the status line. Account archive loads now pass safe clock, rating, result, and search filters through `GET /api/online/account/games`, where the server applies them after resolving the account bearer identity and before pagination, so older matching private/unlisted account games are not hidden behind a fixed first page. Device-only rows are deduped against both account and public archive rows, wait until account archive loading finishes for signed-in users, and only participate in filters their local metadata can satisfy: search by local game id/role is supported, while clock and result filters require server archive details. Direct low-level game creation remains anonymous for now; account-owned games continue to use challenge, open-seek, and Quick Match flows until a safe account-seat rejoin/renewal contract is designed.

Tests/review/deploy gates:

- Tests: focused Online browser tests for account archive counts, archive-specific search labels, archive sort labels, and filtered public replay empty states, then full suite/build/server build plus local PostgreSQL browser/UI checks.
- Review: UI/security review focused on not mixing account history, public archive, device-local replay locators, and game seat tokens.
- Deploy: deploy only after the account archive still loads with PostgreSQL-backed `GET /api/online/account/games`.

## Phase 7D: Same-Browser Active Account Game Return

Goal: let signed-in users see active account games and return to the local player seat when this browser session still has the saved game seat token, without treating account sessions as game seat tokens.

Status: implemented locally on 2026-06-03, with active-game turn ownership, account-rejoin recovery copy, and trusted rejoin rejection messages added on 2026-06-05. The account section now loads `GET /api/online/account/games?state=all`, separates active account games from completed account replays, shows the signed-in account's seat and whether it is their turn, and shows `Return to Game` only when session storage has the matching per-seat player token. Active account games without a local session token can offer account rejoin only when the summary identifies the signed-in account's participant seat, fall back to `Spectate` when the game visibility allows it, or clearly require the original browser session/invite link when neither recovery path is available; inconsistent rows now say the account seat is unavailable instead of implying a usable unknown seat. Failed account rejoin attempts preserve trusted server messages instead of replacing them with generic recovery copy. This improves local recovery after losing the URL while keeping account bearer tokens separate from move authorization.

Tests/review/deploy gates:

- Tests: client storage helper tests, Online browser active account return/spectate/private fallback, turn-ownership-copy, account-rejoin-copy, and missing-account-seat fallback tests, full suite, client build, server build, local PostgreSQL browser smoke, and UI audit.
- Review: account/session review focused on preserving the boundary between account sessions, player seat tokens, spectator access, and private-game visibility.
- Deploy: deploy only after active and completed account game lists still load from PostgreSQL-backed account history.

## Phase 7E: Account-Authorized Active Game Rejoin

Goal: let signed-in players recover their own active account games across browser sessions without turning account bearer tokens into move credentials.

Status: implemented locally on 2026-06-03. `POST /api/online/account/games/:gameId/rejoin` resolves the account from the bearer session, loads the canonical game summary, verifies that the registered account is one of the two active participants, adjudicates pending timeout state, and mints a fresh seat token for that account's own side. The raw seat token is returned only in the response body, while the URL remains token-free. PostgreSQL stores the new seat credential as an additive credential hash in `online_game_additional_credentials`, so the original invite token remains valid and rejoin credentials survive service reloads. The browser stores the fresh seat token in the same per-game session-storage slot used by normal joins, then enters the private or public game as a player.

Tests/review/deploy gates:

- Tests: account rejoin route success/nonparticipant coverage, Postgres additional-credential reload coverage, client helper tests, Online browser rejoin button coverage, App integration coverage, full suite, client build, server build, local PostgreSQL browser smoke, and UI audit.
- Review: account/session security review focused on account bearer vs player seat-token separation, participant authorization, terminal-game rejection, private-game recovery, credential hash persistence, and accidental token leakage through URLs or summaries.
- Deploy: deploy only after the route works against PostgreSQL-backed summaries and added seat credential hashes are available after a room reload. This is still a single-node deployment feature; multi-instance deployments need sticky routing, shared room refresh, or pub/sub before account-rejoin tokens are guaranteed to work on every app instance.

## Phase 7F: Account-Bound Direct Game Creation

Goal: make the low-level direct online-game creation path consistent with challenge, lobby, and Quick Match account identity rules, so signed-in private/friend-link games can enter account history and account rejoin.

Status: implemented locally on 2026-06-03. `POST /api/online/games` now accepts the existing account bearer session and an optional `creatorSeat` of `w` or `b`, defaulting to white. When a valid account bearer is present, the server binds that registered account identity to the selected creator seat in the durable `game_created` event; the other seat remains anonymous. The route still accepts anonymous direct creation when no account bearer is provided, and invalid account bearers fail closed instead of being ignored.

Tests/review/deploy gates:

- Tests: direct-create route account binding coverage, client helper bearer/body coverage, full suite, client build, server build, local PostgreSQL browser smoke, and UI audit if visible direct-create UI is changed.
- Review: account/session review focused on not accepting client-provided identity, binding exactly one seat, preserving anonymous fallback, and keeping raw account tokens out of event bodies.
- Deploy: deploy only after account history still lists signed-in direct-created games through PostgreSQL-backed summaries.

## Phase 7G: Current Account Session Revocation

Goal: make visible account sign-out revoke the current server-side account bearer session instead of only deleting browser-local state.

Status: implemented locally on 2026-06-03. `DELETE /api/online/account/session` resolves the current account bearer token through the existing account-session path, deletes only that account session token hash, and returns `{ protocolVersion, revoked }`. The browser sign-out handler waits for revocation before clearing local account state; if revocation fails, it keeps the account session available so the player can retry. Other open tabs listen for account-session storage changes and clear stale signed-in UI when the shared local session is removed. This does not revoke game seat tokens, challenge tokens, open-seek creator tokens, other account sessions, or the account record.

Tests/review/deploy gates:

- Tests: account-store revocation tests, HTTP route revocation/rejection tests including PostgreSQL-backed account store wiring, client helper coverage, App sign-out success/failure/cross-tab integration coverage, full suite, client build, server build, and local PostgreSQL browser smoke.
- Review: account/session security review focused on fail-closed bearer handling, current-session-only scope, token secrecy, and preserving the account-vs-game-token boundary.
- Deploy: deploy only after the route works against PostgreSQL-backed `online_account_sessions`.

## Phase 7H: Account Rejoin Credential Pruning

Goal: keep account-authorized active-game recovery from accumulating unlimited valid player-seat token aliases.

Status: implemented locally on 2026-06-03. Running game rooms and PostgreSQL persistence now cap additional account-rejoin credential aliases at five per game seat. The original invite credential remains the primary credential and is never pruned by this policy; adding a new account rejoin alias prunes only the oldest additional alias for that same game and seat. This keeps recent cross-device recovery working while bounding stale player-seat tokens.

Tests/review/deploy gates:

- Tests: in-memory service alias-cap tests, PostgreSQL store pruning tests, full suite, client build, server build, and local PostgreSQL browser smoke.
- Review: account/session security review focused on preserving original invite credentials, pruning only stale rejoin aliases, and keeping raw player tokens out of events/summaries/logs.
- Deploy: deploy only after PostgreSQL-backed account rejoin still works and old aliases are pruned on repeated rejoin.

## Phase 7I: Account Session List and Sign Out Everywhere

Goal: give signed-in users basic control over account sessions before public account launch, without adding profiles or account deletion yet.

Status: implemented locally on 2026-06-03. The account store now lists token-free account sessions and can revoke every session for an account. `GET /api/online/account/sessions` returns only session id, created time, last-used time, and a current-session flag after resolving the account bearer server-side. `DELETE /api/online/account/sessions` revokes all server-side account sessions for that account and fails closed if no sessions are revoked after authentication. The Online account panel shows active session count, supports manual session refresh, and adds `Sign Out Everywhere`, which waits for server revocation before clearing the local browser account session.

Tests/review/deploy gates:

- Tests: account-store session listing/revoke-all tests, HTTP route tests against PostgreSQL-backed store wiring, client helper validation tests, Online account-panel tests, App sign-out-everywhere wiring tests, full suite, client build, server build, and local PostgreSQL browser smoke.
- Review: account/session security review focused on token-free session metadata, account bearer separation from game credentials, fail-closed revoke-all behavior, and UI clarity between current-session sign-out and account-wide sign-out.
- Deploy: deploy only after the route works against PostgreSQL-backed `online_account_sessions` and browser sign-out-everywhere does not clear local state on server failure.

## Phase 7J: Account Deletion and Privacy Copy

Goal: let beta account users remove the sign-in account and every account session before public account launch, while stating clearly what happens to historical game records.

Status: implemented locally on 2026-06-03. The account store now deletes account records and cascades/removes account sessions while keeping display names permanently reserved once created. `DELETE /api/online/account` resolves the account bearer server-side, deletes the authenticated account, returns `{ protocolVersion, deleted: true }`, and fails closed if the bearer is invalid, deletion races after authentication, or persistence fails. The Online account panel exposes deletion behind an explicit confirmation and tells users that completed and active game records may still show the display name as part of game history. The browser keeps the local account session when deletion fails so the player can retry instead of silently losing access while the server account remains active.

Retention contract: deletion removes login/account access, account sessions, ordinary social state, private profile access, following relationships, blocks, and privacy settings. It does not release the deleted account's display name for reuse, and it does not rewrite durable game events, game summaries, challenge events, open-seek summaries, rating rows, moderation report display-name snapshots, local replay records, or exported games that already contain the registered display name. Historical rows keep their existing visibility rules: public games can remain public archive/search rows, private and unlisted games stay hidden except to still-authorized credentials or registered participants, and device-only replay locators remain local browser data. Historical anonymization remains a separate migration/policy decision because changing game records after the fact can make replays, ratings, moderation evidence, and shared archives inconsistent.

Tests/review/deploy gates:

- Tests: account-store deletion/cascade tests, HTTP route tests against PostgreSQL-backed store wiring plus unauthorized/race/persistence failures, client helper validation tests, Online account-panel confirmation tests, App deletion success/failure integration coverage, full suite, client build, server build, and local PostgreSQL browser smoke.
- Review: account/session privacy review focused on deletion scope, fail-closed behavior, token secrecy, historical-retention copy, and preserving the account-vs-game-token boundary.
- Deploy: deploy only after PostgreSQL-backed account deletion removes sessions and the browser does not clear local state on server failure.

## Phase 7K: Rating Math Foundation

Goal: add tested, swappable rating primitives and the first public-safe rating read models before wiring deeper live games, matchmaking, profiles, friends, or moderation to ratings.

Status: implemented locally on 2026-06-03, with setup-level rated/casual protocol metadata added locally on 2026-06-04, the PostgreSQL rated-result write path added locally on 2026-06-05, the first public rating leaderboard read model added locally on 2026-06-05, following-scoped rating leaders added locally on 2026-06-05, visible Casual/Rated setup controls added locally on 2026-06-05, visible rating-mode labels in lobby/watch/archive/account-history rows added locally on 2026-06-05, and Casual/Rated filters for Lobby, Watch, and Archive directories added locally on 2026-06-05. `src/online/ratings.ts` defines a modular rating-engine contract with `glicko2-beta-v1` as the default Lichess-inspired Glicko-2 baseline, Castles beta defaults, durable engine ids on rating records, provisional display formatting, inactive-period deviation growth, and Glicko-2 rating-period updates. Online setup payloads now carry `ratingMode?: "casual" | "rated"`; the Play setup UI exposes this choice, Online lobby setup summaries and listing/game rows show it, server-created games, challenges, lobby seeks, and quick-match fallback listings normalize missing setup modes to `"casual"`, and setup matching keeps casual and rated requests separate. Public lobby listings and public game directories can be filtered by Casual/Rated mode before pagination. Completed PostgreSQL games now write ratings only when the game setup is rated, the terminal result is persisted through the locked action/timeout path, and both durable participants are distinct registered accounts. Account profile and following read models now surface only public rating summaries when a rating row exists. `GET /api/online/ratings/leaderboard` and the signed-in People panel now expose bounded `global` and authenticated `following` rating-leader lists using display names and sanitized public rating summaries only. The tests include the standard worked example, engine-swappability coverage, invalid future-engine rejection, rating input/output validation coverage, setup-mode validation, setup-mode serialization, visible setup-mode propagation, rating-mode summary labels/search, rating-mode directory filtering, default casual game creation, rated game creation, casual-vs-rated quick-match separation, rated resignation writes, rated timeout writes, retry idempotency, casual/anonymous no-write gates, rollback on rating-result persistence failure, public-profile rating summary exposure, client rejection of private rating internals, leaderboard query ordering, HTTP limit/no-leak validation, following-scope authorization/filtering, client leaderboard validation, and People-panel rendering. Ratings are still not used for rating-derived matchmaking.

Contract notes:

- Glicko-2 is the default unless Castles has a documented, stronger game-specific reason to use another rating engine.
- Rating records store a durable engine id so future engines cannot accidentally reinterpret old records without an explicit registry/migration decision.
- New account ratings start at 1500 with beta deviation 500 and volatility 0.06. The high initial deviation is an intentional beta choice while Castles balance is unsettled and should be revisited before public rated play.
- Ratings above deviation 110 are provisional and display with a question mark.
- Side/seat advantage adjustment is intentionally out of scope for Phase 7K because Castles balance is not established enough to model it. Future rated-game results can add side/seat context behind the rating-engine interface.
- The setup-level rated/casual flag is the server gate for rating writes. Casual games and games without two distinct registered account participants remain unrated even when the position reaches a terminal result.
- The server must derive rating participants from durable account-backed game participants, not display names or browser-provided identity fields.
- Rich rated profiles are deferred beyond the public profile and rating-leader summaries. Basic profiles, follows, friend challenges, following-scoped leaders, and privacy controls may ship before broader rating UI because they solve account discovery and private-match workflows without affecting matchmaking. Initial leaderboards should prefer rating/rating confidence; experimental metrics such as loss-of-superiority or Bayesian strength displays need a separate definition and reviewer pass before UI exposure.

Tests/review/deploy gates:

- Tests: pure rating math tests, engine-selection tests, setup-mode validation/serialization tests, rated-result write/no-write/idempotency/rollback tests, public leaderboard query/no-leak tests, full suite, client build, server build, and a reviewer pass focused on formula fidelity and preventing accidental rated-game side effects.
- Review: rating/fair-play review focused on Glicko-2 correctness, provisional display, casual-vs-rated separation, account-identity derivation, exactly-once writes, and rollback behavior.
- Deploy: deploy only after rated writes remain restricted to completed rated games with two distinct registered accounts, and public rating UI exposes only sanitized summaries without raw ids or rating-engine internals.

## Phase 7L: Friends, Follows, and Social Privacy

Goal: add lightweight friend functionality without turning accounts into an unsafe social network or creating moderation-heavy surfaces too early.

Status: backend/client-helper and visible Online People slices are implemented and pushed through 2026-06-04, with public rating leaders, following-scoped rating leaders, backend account-report submission, visible People-panel report actions, a protected report queue, admin report reason/reporter/target filtering, admin report cursor pagination, admin report status/audit lifecycle, and protected per-report audit-history readback added locally on 2026-06-05. Social v1 now has authenticated exact profile lookup, one-way follow/unfollow, following-list reads, block/unblock, account report submission, privacy get/patch, PostgreSQL persistence, memory-store parity, strict client response validation that rejects internal identity fields and private rating internals in profile/report payloads, signed-in followed-only lobby listings with server-side visibility filtering, and a signed-in Online People panel for exact lookup, follow/unfollow, block/unblock, report from profiles/followed-player rows, following refresh, a compact Online now rail for followed players with visible online presence, public rating summary badges where available, sanitized global/following rating-leader scopes, presence-aware following rows, local pinned followed-player ordering, local private notes for followed-player rows, All/Online friend filtering, mutual/follows-you labels, friend challenge/watch/direct-invite shortcuts, profile-card public live-game watch/direct-invite shortcuts, visible-history shortcuts from profile/following rows into the Archive search, account-authorized head-to-head summary cards and cursor-loaded pair-history rows backed by `GET /api/online/account/games/head-to-head/:displayName`, profile-card and followed-player rematch shortcuts from the latest loaded head-to-head game, followed-player discovery filters in Lobby/Watch/Archive/account-history rows, registered-player profile links from game rows, account-game row follow/challenge/same-settings rematch shortcuts for registered opponents through account-authorized source-game snapshots, signed-in game-end rematch prompts for registered opponents found through account history, a pending challenge notice with a focus shortcut into the account challenge inbox, Accept & Join labels plus setup-summary and accepted-game badges for account challenges that enter a game, a Pending/All account challenge inbox with terminal status history, follow/presence/challenge privacy controls, server-side same-pair account challenge throttling for pending/recent refused targeted challenges, account challenge inbox/action hiding after either registered participant blocks the other, block-triggered decline/cancel cleanup for pending targeted challenges, and visible People-panel messages for trusted account challenge rejection details such as pending-pair, cooldown throttles, or current target unavailability. It still does not add explicit invite-list lobby listings, private messages, public profile text, report adjudication policies, sanctions, dedicated rematch request records, or broader notifications yet.

Friend-action reliability update on 2026-06-05: follow/unfollow and follow/presence/challenge privacy saves now preserve trusted server rejection copy, so friend setup failures such as throttles or privacy locks are not replaced with generic People-panel text.

Deploy freshness diagnostic update on 2026-06-05: production `https://castles.ls314.xyz` reported health commit `c33b4c3263c103bd19dde2771817d4429d71339d`, which was 34 commits behind the then-current pushed branch head `a5d0d9b05ab10c691156292393c96ff2d216ca1d`. The app host `castles.ls314.xyz` and admin alias `contabo.ls314.xyz` are reachable on SSH port 22, while root `ls314.xyz` points elsewhere and can create a false SSH timeout in freshness checks. The remaining live gap is the deploy/restart path, not the push target.

Deploy freshness follow-up on 2026-06-05: `https://castles.ls314.xyz` was updated to commit `5be52ee5d279eed98001a7b3b7e236f6c6c768f6` and passed production freshness, API smoke, and browser smoke with PostgreSQL health. The exact 40-character SHA is required for these checks; short SHAs intentionally fail the commit equality gate.

Navigation update on 2026-06-05: the shared Play/Tutorial/Online/Library shell now uses a compact Castles top-strip with destination icons and hover/title text. Full-width pages keep text labels, while constrained setup/tutorial sidebars and narrow mobile widths use icon-only destination buttons so the board is not pushed down or crowded.

Online account entry update on 2026-06-05: account creation/sign-in is now a modal flow instead of a default inline slab on the Online page. The shared Online top strip shows a compact human account chip (`Guest` when signed out), and the game clock panel shows human/bot identity badges beside each clock; the signed-in/signed-out human badge opens the same account dialog from the board without pushing the board down or floating on top of the play surface. The dialog shows Google OAuth when the server reports an enabled provider and keeps password create/sign-in as the fallback. Screenshot QA artifacts are in `artifacts/account-ui-screenshots/desktop-game-account-entry.png`, `artifacts/account-ui-screenshots/desktop-game-account-dialog.png`, `artifacts/account-ui-screenshots/desktop-online-account-chip.png`, and `artifacts/account-ui-screenshots/desktop-online-account-dialog.png`. Production `https://castles.ls314.xyz/api/online/account/oauth/providers` now returns `{ provider: "google", enabled: true, startUrl: "/api/online/account/oauth/google/start" }`; the OAuth start route redirects to `accounts.google.com` with callback `https://castles.ls314.xyz/api/online/account/oauth/google/callback` and scope `openid email profile`.

OAuth deployment-smoke update on 2026-06-06: `scripts/deploy/check-online-smoke.mjs` now fails if production stops exposing enabled Google OAuth, if the Google start route stops redirecting to `accounts.google.com`, or if the authorization redirect uses a callback URL that does not match the deployed app base URL.

API smoke default update on 2026-06-06: `scripts/deploy/check-online-smoke.mjs` now defaults no-argument runs to `https://castles.ls314.xyz`, ignores empty `BASE_URL`/`EXPECTED_COMMIT` environment overrides, and still lets explicit CLI arguments target preview hosts or reviewed commit SHAs. This keeps standalone smoke checks pointed at the current production host instead of the retired `.com` domain.

Favicon update on 2026-06-05, tightened on 2026-06-06: the browser favicon, manifest SVG icon, service-worker core asset list, and `.ico` fallback now use an empty flat-top hexagonal board rendered from the app board viewBox, polygon point strings, terrain classes, high-ground shadow filter, and owned-castle stroke classes. The service-worker shell cache was bumped to refresh installed clients. The visual preview artifact is `artifacts/favicon/favicon-preview.png`.

Watch scanability update on 2026-06-05: the desktop Watch selected-game panel is top-aligned instead of stretching to the height of the secondary game list. This keeps the selected game content visible in the first viewport while preserving the two-column desktop Watch layout. The regenerated audit artifact is `artifacts/ui-audit/phase6ai-local-layout/desktop-online-watch.png`.

Watch selection wording update on 2026-06-05: Watch no longer calls the current-list heuristic a featured game in visible or accessible copy. The selected row now uses `Current live selection`, the overview says `Selected by`, and the reason is literal: `Most moves in current list` or `Most watched in current list`. A true TV-style featured signal remains future work until ratings, follows, account metadata, or another durable activity model exists.

Shared shell audit cleanup on 2026-06-05: the broad local UI audit now passes again after the shared app-shell back button kept its full `aria-label` while moving visible text into a child span that is removed from narrow icon-only layout flow, and the Online account chip compacts to an icon-only control at the same narrow breakpoint. This cleared the previous mobile/short-mobile `interactive-text-overflow` and account-chip overlap diagnostics without changing the desktop top strip. The regenerated audit artifacts are in `artifacts/ui-audit/phase6ai-local-layout/`.

Deploy backup hardening on 2026-06-05: the deploy runbook now keeps `pg_dump` as the preferred full SQL backup, but falls back to `scripts/deploy/postgres-online-backup.mjs` when PostgreSQL client tools are unavailable on the app server. The fallback writes a JSON snapshot of the known Castles `online_*` persistence tables through the app's Node PostgreSQL client, avoiding UI-only deploys that have no database-state backup artifact.

JSON backup validation update on 2026-06-06: `scripts/deploy/postgres-online-backup.mjs --validate <backup.json>` now checks the fallback JSON artifact before it is trusted for rollback evidence, including backup format, timestamp, sanitized database metadata, whitelisted table names, duplicate tables, safe column names, and table/global row-count consistency. The deploy runbook now validates fallback JSON backups immediately after writing them.

Automated deploy backup validation update on 2026-06-06: `npm run online:deploy:production` now validates the production JSON PostgreSQL backup immediately after normalizing backup ownership and before checksum generation, checkout, build, metadata update, or service restart. A malformed backup now fails the deploy before live code changes begin.

Deploy freshness default update on 2026-06-06: `npm run online:deploy:freshness` now defaults to the local Git `HEAD`, default production domain, tracked upstream branch, and deploy SSH host, so the common no-argument diagnostic catches stale live builds instead of reporting `Commit: not checked`. Empty freshness environment overrides are ignored rather than silently disabling the pinned commit or SSH checks.

Registered challenge smoke update on 2026-06-06: `npm run online:smoke:local:challenges` now wires the local built HTTP server to `PostgresOnlineAccountStore` and exercises a registered friend-style targeted challenge path: create two disposable accounts, have the challenged account follow the challenger, create the targeted challenge, verify both account challenge directories, accept through the account route, confirm both account histories include the created game, and rejoin that accepted game from both accounts through the durable PostgreSQL game-seat credential path.

Local challenge smoke cleanup update on 2026-06-06: the same local PostgreSQL challenge smoke now resigns both its anonymous accepted challenge game and its registered account challenge game after verification, then checks the persisted summaries are complete, so repeated local rehearsal runs do not leave active smoke games behind.

Local restart smoke cleanup update on 2026-06-06: `npm run online:smoke:local` now resigns its restarted game after proving version-1 action persistence across shutdown and restart, then verifies the terminal spectator snapshot reaches version 2 with a resignation result, so local restart rehearsals no longer leave their primary smoke game active.

Production account recovery smoke update on 2026-06-06: `scripts/deploy/check-online-smoke.mjs` now creates two disposable production accounts, follows the challenger from the challenged account, creates a targeted unlisted challenge, verifies both account challenge directories and account histories, accepts through the account route, rejoins the accepted game from both account sessions, ends the smoke game by resignation with the fresh player-seat token, and deletes both disposable accounts before reporting production healthy.

Production smoke cleanup update on 2026-06-06: the same API smoke now resigns its direct-created game after the persisted player/spectator snapshot checks pass, so repeated deploy gates do not leave active anonymous smoke games in production persistence.

Browser smoke cleanup update on 2026-06-06: `scripts/deploy/check-online-browser-smoke.mjs` now also resigns the accepted UI challenge-flow game after both players join and waits for both player pages to show the resignation result, so browser smoke runs do not leave accepted challenge games active.

Browser stale-action smoke cleanup update on 2026-06-06: the browser smoke's raw stale-action contract helper now resigns its helper game after verifying the stale rejection snapshot, so that auxiliary protocol check no longer leaves an active game in production or local smoke persistence.

Recommended shape:

- Start with a Lichess-style one-way follow/favorite model rather than mandatory mutual friend requests. It is simpler, supports quick spectating/challenges, and avoids blocking real play on acceptance workflows.
- Define direction clearly: "friends" means accounts I follow/trust, not arbitrary accounts that follow me. Presence and challenges should use the account owner's privacy choices, and followed-only lobby visibility should use the creator's follow list or a future explicit invite list, never the follower's claim that they follow the player.
- Do not show vanity follower counts by default. The useful product surface is "people I follow" and "friends currently online", not public popularity.
- Keep v1 profiles structured: display name, rating only if rated play is enabled, public/account-authorized game links, follow/challenge/rematch/block/report actions, and privacy-respecting presence. Defer bios, avatars, status messages, public walls, comments, and freeform profile text.
- Add exact display-name profile lookup, follow/unfollow, a following list, online/last-seen presence when allowed by privacy settings, and an online-friends drawer or panel. Do not expose raw internal account ids in search results; search should be bounded, rate-limited, and should not include presence.
- Add friend shortcuts: challenge this player from the current setup, copy a direct invite for this player, spectate their public game, ask for a rematch after a completed game, and optionally follow or challenge a recent opponent. Add per-friend challenge presets later: last setup, current setup, casual/rated flag once ratings exist, and quick rematch with the same settings.
- Add privacy controls before broad exposure: allow follows from everyone/nobody, show online presence to accounts I follow/everyone/nobody, accept challenges from accounts I follow/everyone/nobody, report accounts through a sanitized backend route, and block accounts. Presence should default to hidden or visible only to accounts the user follows. Last-seen should be coarse, optional, and never expose private/unlisted games.
- Blocking must remove existing follow edges, prevent follows, challenges, messages if messages exist, followed-only lobby visibility, presence exposure, rematch suggestions, recent-opponent shortcuts, challenge inbox entries, account-token challenge actions, and profile/action discovery where practical.
- Followed-only lobby listings now exist as open-seek `visibility: "followed"`: the creator must be signed in, authorized viewers are the creator and accounts the creator follows, hidden rows are filtered server-side before normal lobby pagination where possible, and unauthorized accept attempts return `not_found`. Explicit invited-account listings remain future work.
- Add friend-aware discovery only where it helps play: a friends filter in Watch, a friends filter in Online Archive/account history, head-to-head/recent games when the viewer is authorized to see them, and a compact "friends playing now" section. Do not turn this into a global feed until moderation and privacy rules are stronger.
- Continue evolving the small challenge inbox/status surface before broader notifications: incoming challenge and accepted/declined/cancelled/expired history are now visible, the inbox defaults to All so accepted-game recovery is visible immediately, pending inbox rows show remaining expiry time, setup badges, and invites expiring soon, accepted rows show the created game id when present, show the signed-in player's accepted game side when known, and offer account-authorized `Join Game` recovery from both the challenge inbox and people shortcuts such as profile/following rows; people shortcuts now retain accepted-game recovery after switching the visible inbox back to Pending or after a foreground inbox refresh fails, while stale pending People actions are dropped on that foreground load error. Incoming challenge actions are labelled as Accept & Join because the accepted challenge handoff enters the game, same-pair targeted account challenge throttling now rejects duplicate pending challenges plus repeats within 60 seconds of a declined, cancelled, or expired challenge, current blocks now hide account challenges from both registered participants, reject account-token challenge actions, and best-effort decline or cancel pending targeted challenges between the blocked accounts. Trusted challenge-creation and challenge inbox action rejection messages now surface in the People panel instead of being replaced by generic copy, including friend-facing cooldown or "not available" messages when challenge privacy rejects the request. Rematch requests, report/block from invite, and broader notification-loop handling remain future work.
- Private notes for followed players are now local/account-scoped browser data and are removed on visible unfollow/block cleanup. Future nicknames can use the same local/private constraint unless there is a deliberate server-side privacy contract.
- Fold in the most useful Lichess-like friend shortcuts once the base graph is stable: pinned favorite friends and private notes are now local/account-scoped, followed/profile rows now expose current-setup challenge and copied direct-invite shortcuts, completed account-game rows now expose follow/challenge/same-settings rematch shortcuts for registered opponents through account-authorized source-game snapshots, signed-in online game-end overlays now expose a rematch prompt when account history confirms a registered opponent, People rows can jump to the visible Archive history for a player with an account-authorized head-to-head summary and cursor-loaded pair-history list, profile and followed-player rows now offer a rematch from the latest loaded head-to-head game, and pending account challenges now surface a compact notice that jumps to the inbox; remaining work includes dedicated rematch request records and broader notification handling.
- Additional friend-facing candidates worth keeping in the backlog: friend challenge presets, last-opponent rematch, friend activity limited to public games, private spectator links for trusted friends, richer head-to-head history from game/profile rows, and friend-scoped non-rating activity panels. These should be added only when each has clear privacy rules and tests.
- Keep social scope tied to play. Do not add public walls, open comments, clubs, friend feeds, or direct messages until moderation, reporting, blocking, retention, and notification abuse rules are strong enough.
- Defer private messages, chat, timelines, teams/clubs, push/email notifications, public comments, and study-like collaboration until moderation tools exist. These are useful, but they multiply abuse-handling requirements.
- Following-scoped rating leaders are the initial friend leaderboard layer. Rating/confidence can be ranked; games played should be an activity stat, not the main skill leaderboard. Experimental LOS or Bayesian displays need a separate math/product review before exposure.

Tests/review/deploy gates:

- Tests: follow/unfollow idempotency, one-way directionality, profile lookup anti-enumeration, privacy blocks, report validation/sanitization, challenge permission checks, rematch permission checks, followed-only seek visibility/count/cursor filtering, online presence list filtering, challenge-inbox rate limits, and no token/id leakage in friend APIs. The current slices cover exact profile lookup, follow/unfollow, following lists, follow privacy, block cleanup/hiding, account-report submission, strict client no-internal-id validation, PostgreSQL persistence, HTTP bearer-auth behavior, the Online now friend rail, presence-aware following rows, local pinned friend ordering, local private-note persistence/cleanup, All/Online friend filtering, mutual/follows-you labels, friend challenge/watch/direct-invite shortcuts, profile-card public live-game watch/direct-invite shortcuts, visible-history shortcuts into Archive search, account-authorized head-to-head summary cards and pair-history rows, profile-card and followed-row rematch shortcuts from loaded head-to-head history, followed-player discovery filters, game-row profile links, account-game opponent follow/challenge/same-settings rematch shortcuts with source-game callback metadata, signed-in game-end rematch prompt resolution and challenge creation, pending challenge notice focus/disappearance behavior, account challenge status/actions including Accept & Join incoming challenge copy, setup-summary badges, and accepted-game badges, Pending/All challenge inbox history, same-pair pending/recent-terminal account challenge throttling, block-based account challenge inbox/action hiding and block-triggered targeted-challenge terminal cleanup, trusted challenge rejection message surfacing in People-panel actions, follow/presence/challenge privacy controls, followed-only lobby create/list/accept/access-control behavior, and the visible Online People panel.
- Review: privacy/moderation review focused on one-way follows, block enforcement, follower-count avoidance, challenge-spam prevention, profile enumeration, and presence leakage.
- Deploy: deploy only after privacy defaults are conservative and friend visibility cannot expose private games or bearer credentials.

Work:

- Build on Phase 7A account-backed identity for ratings and moderation.
- Define optional anonymization or erasure policy for account-linked historical game records before public launch.
- Implement rated-game events/read models after the rated-game flag and result-to-rating contract are stable.
- Basic account profiles, follows, friend links, public rating summary fields, and global/following rating-leader lists now exist. Add richer rated profile fields only after public-read privacy rules stay stable. Treat games-played and LOS-style/Bayesian metrics as optional analytics that need a separate product and math review.
- Add lightweight follows/friends before private messages or social feeds. Friend challenges and spectating are higher priority than timelines, inboxes, or clubs.
- Keep the current report queue/audit tools minimal for the friends-only beta; add only the review affordances needed to handle real reports from the small group.
- Defer fair-play signals, adjudication policy, sanctions, appeal flows, and broader abuse-handling policy until the audience grows beyond the current trusted group.

Tests/review/deploy gates:

- Tests: rating calculation tests, moderation permission tests, report lifecycle/status tests, audit-log tests.
- Review: security/privacy/fair-play review before public rating impact.
- Deploy: admin actions are logged, reversible where appropriate, and protected by least-privilege access.

## Phase 8: Scale and Ops

Goal: make the service reliable under public load and multi-instance deployment.

Work:

- Add shared pub/sub or equivalent fanout for multiple app instances.
- Support rolling deploys, draining, horizontal scaling, database pool limits, and backpressure.
- Add dashboards, alerts, SLOs, load tests, backup drills, and incident runbooks.
- Revisit storage partitioning, retention, and archival/export strategy.

Tests/review/deploy gates:

- Tests: load tests, multi-instance integration tests, rolling deploy tests, backup/restore drills.
- Review: ops review for capacity, observability, failure domains, and incident response.
- Deploy: scale changes ship behind flags or staged rollout with rollback and alert thresholds.

## Living Execution Plan

Last execution-plan refresh: 2026-06-06. Production evidence is recorded in the completed bullets when a slice is deployed.

This section is the working queue for the current `online-action-log` branch. Future online-multiplayer slices should come from this queue or first update this queue with a short reason. After each meaningful slice, update the relevant item from `Next` to `Done`, `Deferred`, or `Still open`, record the verification/deploy evidence when it matters, and keep this section honest before moving to another area.

### Recently Completed

- Done: production deploy freshness now points at `https://castles.ls314.xyz` and verifies the expected commit, SSH reachability, upstream branch presence, and production lag.
- Done: deploy backup hardening validates JSON PostgreSQL backups before code checkout/build/restart, so a malformed fallback backup blocks deployment before live code changes.
- Done: local and production smoke cleanup now resigns or cancels smoke games/challenges/seeks so repeated rehearsals do not leave ordinary active rows behind.
- Done: account recovery smoke now exercises disposable registered accounts, targeted challenge directories, account-history rejoin, fresh seat-token recovery, game cleanup, and account cleanup.
- Done: query-secret hardening now covers path-only account game snapshot/rejoin routes, direct challenge view/action routes, direct player snapshot/visibility routes, creator-owned open-seek refresh/cancel routes, and account session lookup/list/revoke/delete routes. The production commit is `b640ab0`.
- Done: account-token challenge accept/decline/cancel routes now reject query strings after valid account bearer auth. Red/green regression, account-challenge neighborhood tests, full HTTP server tests, `server:build`, and app build passed locally. The production commit is `64cb1db569968c8d40b3d1c9ac0198a8150d60c4`; deploy freshness, API smoke, browser smoke, and a targeted live account-challenge query-guard probe passed. Item 1 remains open for the remaining bearer/admin route-surface audit.
- Done: social/profile/privacy/report path-only account routes now reject query strings after valid account bearer auth. A red/green regression verifies profile, follows, blocks, report, and privacy routes reject leaked query tokens without mutating follow, block, report, or privacy state. Neighboring social/report/privacy tests, full HTTP server tests, `server:build`, and app build passed locally. The production commit is `7226613086b663c616db06fa709edf810a6716ac`; deploy freshness, API smoke, browser smoke, and a targeted live social/privacy query-guard probe passed. Item 1 remains open for admin report status update and optional-account action route classification.
- Done: admin report status update now rejects query strings after valid admin bearer auth. A red/green regression verifies leaked query tokens cannot update report status or append audit entries. Neighboring moderation tests, full HTTP server tests, `server:build`, and app build passed locally. The production commit is `7726121f71c9fe7eb1d3536269018f5ef6090668`; deploy freshness, API smoke, browser smoke, and a production hidden-admin-route check passed. The authenticated admin PATCH live probe is not applicable until production sets `CASTLES_ADMIN_BEARER_TOKEN`. Item 1 remains open for optional-account action route classification.
- Done: optional-account action routes now reject query strings for anonymous and account-bearing callers. A red/green regression verifies game creation, open seek creation/accept, Quick Match, and challenge creation reject leaked query tokens without creating games, extra seeks, or account challenges. Focused regression, neighboring route subset, full HTTP server tests, `server:build`, `git diff --check`, and app build passed locally. The production commit is `222cbecf21de316c9d20ba35f1aaf40095eb3268`; deploy freshness, API smoke, browser smoke, and a targeted live optional-account query-guard probe passed. Item 1 route-surface audit is complete.
- Done: item 2 response-boundary redaction now covers account challenge and account-history payloads. Registered identities in targeted challenge creation, direct challenge view/action responses, account challenge inbox/action responses, account game history, and account head-to-head history use display-name-derived public ids instead of raw account ids; a red/green regression verifies those payloads do not contain either participant's raw account id. Full HTTP server tests, full online client tests, full App tests, `server:build`, `git diff --check`, and app build passed locally. The production commit is `1bd9147789a7f4293199a98ca3823646b263c86d`; deploy freshness, API smoke, browser smoke, and a targeted live redaction probe passed. The live probe used disposable accounts `RedLiammq24cggej19ou` and `RedSamirmq24cggej19ou`, challenge `challenge_2S5VOg7ljcMq`, and game `game_D5DopXIPAQDv` to verify targeted challenge creation, direct challenge view, account challenge directories before and after accept, account challenge accept, account game histories before and after archive, and account head-to-head histories after archive do not include either raw account id.
- Done: item 2 client trusted-error hardening now refuses to surface server error messages that contain raw online identifiers such as account, account-session, challenge, game, seek, report, or report-audit ids. Clean trusted rate-limit/privacy messages still surface through `OnlineRequestError`, but identifier-bearing messages fall back to route-specific generic copy. A red/green regression covers follow/privacy failures containing `account_...` and `account_session_...`; full online client tests, full App tests, full OnlineGameBrowser tests, `git diff --check`, and app build passed locally. The production commit is `f259398b9397f2a37a161e88415faf3b9028f1e3`; backup validation, deploy freshness, API smoke, and browser smoke passed. Deploy backup `/home/lukasz/deploy-backups/castles-20260606-090618/online-postgres.json` validated 2779 rows from 24 online PostgreSQL tables, build id `20260606-090614`; API smoke used direct game `game_SGCOX-n8fjmK` plus account challenge `challenge_1eHdlzzM2oyu` / game `game_OejMEpP3GZA_`, and browser smoke used game `game_mMvyI4KOQ6p-`.
- Done: item 2 account challenge response-shape hardening now rejects unsupported account challenge directory item and challenge summary fields before the browser uses them. A red/green regression covers malformed account challenge directory responses containing an internal database key and a raw `accountId`; full online client tests, challenge contract tests, full HTTP server tests, full App tests, full OnlineGameBrowser tests, `server:build`, `git diff --check`, and app build passed locally. The production commit is `d2f6b7cb0b6cb3d3eb1da9233ae046b7a7a7c30e`; backup validation, deploy freshness, API smoke, and browser smoke passed. Deploy backup `/home/lukasz/deploy-backups/castles-20260606-091806/online-postgres.json` validated 2829 rows from 24 online PostgreSQL tables, build id `20260606-091801`; API smoke used direct game `game_7Z4D1fjwlkkv` plus account challenge `challenge_7f8yWfiIigfb` / game `game_IJb7_V8uNUU8`, and browser smoke used game `game_z73aOXh1soC8`.
- Done: item 2 account game-directory response-shape hardening now rejects unsupported account-history, account head-to-head, and shared public game-directory fields before the browser uses them. The strict summary validator now fails closed on unsupported directory, summary, participant, result, live-preview, last-move, clock, board-preview, board-preview piece, and board-preview castle fields. Red/green regressions cover malformed account game history containing a raw `accountId`, an internal database key, and nested clock token-hash data; full online client tests, full read-model tests, full HTTP server tests, full PostgreSQL store tests, full App tests, full OnlineGameBrowser tests, `server:build`, `git diff --check`, and app build passed locally. The production commit is `d82e0e8801b534e2feafb599c6b0664843695998`; backup validation, deploy freshness, API smoke, and browser smoke passed. Deploy backup `/home/lukasz/deploy-backups/castles-20260606-093524/online-postgres.json` validated 2879 rows from 24 online PostgreSQL tables, build id `20260606-093521`; API smoke used direct game `game_QpNKL5uJ2qQb` plus account challenge `challenge_FetW5BlFFRnO` / game `game_KViUaQThwbH-`, and browser smoke used game `game_czLnnx9gaNLu`.
- Done: item 2 social/privacy response-shape hardening now rejects unsupported profile, following, relationship mutation, privacy response-envelope, and privacy-settings fields before the browser uses them. A red/green regression covers malformed social/privacy responses containing raw `accountId`, internal database key, and account-session token-hash data; full online client tests, full App tests, full OnlineGameBrowser tests, full HTTP server tests, `server:build`, `git diff --check`, and app build passed locally. The production commit is `906b0f482f933a62167986e265078602cc0a90b0`; backup validation, deploy freshness, API smoke, and browser smoke passed. Deploy backup `/home/lukasz/deploy-backups/castles-20260606-094606/online-postgres.json` validated 2929 rows from 24 online PostgreSQL tables, build id `20260606-094602`; API smoke used direct game `game_yHJHEXYpLHpl` plus account challenge `challenge_XuJ79mP950wf` / game `game_X0E5VAJbciAX`, and browser smoke used game `game_waxcKUu9tCcQ`.
- Done: item 2 admin moderation response-shape hardening now rejects unsupported admin report and audit fields at the HTTP boundary before serializing store-returned rows. A red/green regression covers a malformed moderation store returning a raw `accountId`, internal token-hash field, and account-session hash in queue/status/audit responses; full HTTP server tests, full PostgreSQL account-store tests, full online client tests, full App tests, full OnlineGameBrowser tests, `server:build`, `git diff --check`, and app build passed locally. The production commit is `638069744302c54671e7c3de6db8489e0de5aac1`; backup validation, deploy freshness, API smoke, and browser smoke passed. Deploy backup `/home/lukasz/deploy-backups/castles-20260606-095927/online-postgres.json` validated 2979 rows from 24 online PostgreSQL tables, build id `20260606-095924`; API smoke used direct game `game_iJiKqriFEh9g` plus account challenge `challenge_eM0aiUsMSWSX` / game `game_D3GvvWH5m3kq`, and browser smoke used game `game_2aCZYjnjP9o1`.
- Done: item 2 rating-leaderboard response-shape hardening now rejects unsupported leaderboard entry and nested public rating summary fields at the HTTP boundary before serializing store-returned rows. A red/green regression covers malformed global and following leaderboard store responses containing a raw `accountId`, rating engine id, deviation, and account-session token-hash data; full HTTP server tests, full PostgreSQL account-store tests, full online client tests, full App tests, full OnlineGameBrowser tests, `server:build`, `git diff --check`, app build, and local code/privacy review passed locally. The production commit is `776cabf943a65d7472950fc3cff5697c2232dedc`; backup validation, deploy freshness, API smoke, and browser smoke passed. Deploy backup `/home/lukasz/deploy-backups/castles-20260606-101526/online-postgres.json` validated 3029 rows from 24 online PostgreSQL tables, build id `20260606-101522`; API smoke used direct game `game_51RNCilK5Hx_` plus account challenge `challenge_ynjNVLztAgLJ` / game `game_NoiMn_3bXMr4`, and browser smoke used game `game_cGlFUAYdl2DJ`.
- Done: item 2 account-report submission response-shape hardening now rejects unsupported report summary fields at the HTTP boundary before serializing store-returned rows. A red/green regression covers a malformed report submission store response containing a raw `accountId`, private report id, private report details, and account-session token-hash data; full HTTP server tests, full PostgreSQL account-store tests, full online client tests, full App tests, full OnlineGameBrowser tests, `server:build`, `git diff --check`, app build, and local code/privacy review passed locally. The production commit is `1d961d200d1dde64cb432e5f618d9070b801d5ec`; backup validation, deploy freshness, API smoke, and browser smoke passed. Deploy backup `/home/lukasz/deploy-backups/castles-20260606-102711/online-postgres.json` validated 3079 rows from 24 online PostgreSQL tables, build id `20260606-102705`; API smoke used direct game `game_XN_lD2poOaLv` plus account challenge `challenge_8M7H6lyLusGh` / game `game_8Y_cZQtzk2zh`, and browser smoke used game `game_cWO20NH_rvyn`.
- Done: item 2 social/privacy HTTP-boundary response-shape hardening now rejects unsupported profile, following-list profile, relationship mutation profile, and privacy-settings fields at the HTTP boundary before serializing store-returned rows. A red/green regression covers malformed social/privacy store responses containing a raw `accountId`, relationship database key, presence session hash, and account-session token-hash data; full HTTP server tests, full PostgreSQL account-store tests, full online client tests, full App tests, full OnlineGameBrowser tests, `server:build`, `git diff --check`, app build, and local code/privacy review passed locally. The production commit is `2842c5c8655b890d621e9a0393bc79ecbe3393f5`; backup validation, deploy freshness, API smoke, and browser smoke passed. Deploy backup `/home/lukasz/deploy-backups/castles-20260606-103938/online-postgres.json` validated 3129 rows from 24 online PostgreSQL tables, build id `20260606-103934`; API smoke used direct game `game_tT2AN_4m_rgT` plus account challenge `challenge_zfLSAiHvjloq` / game `game_uHovoOkMBX4H`, and browser smoke used game `game_pFT9tG21f36_`.
- Done: item 2 closure audit on 2026-06-06 found no remaining account/social privacy or moderation response-boundary candidates in the item scope. Account challenge directory/action responses, direct challenge view/action responses, account history/head-to-head directories, social/profile/following/privacy responses, rating leaderboards, account-report submission, and admin moderation report/audit responses now have redaction, strict response-shape validation, query-secret guards, trusted-error hardening, and recorded local/production evidence above. Account/session create, login, `me`, session list, revoke, and delete routes intentionally expose account/session metadata or freshly minted bearer tokens to the authenticated caller and are outside this item; any future tightening there should be a separate slice.

### Next Ordered Slices

1. Done: route-surface audit for the remaining bearer/admin endpoints.
   - Inventory every `Authorization: Bearer` route in `src/online/server/createOnlineHttpServer.ts`.
   - Classify each route as `path-only`, `safe-query`, `oauth-query`, or `admin-filter-query`.
   - Add regression tests and docs for any remaining path-only route that still accepts query strings after valid bearer auth.
   - Do not convert legitimate filter routes such as public directories, account archive filters, moderation report filters, OAuth callback/start, or rating leader scopes into path-only routes.
   - Current audit notes after the optional-account action sub-slice: no remaining query-secret classification candidates are known in this audit bucket. OAuth, rating, directory, archive, moderation list, and moderation audit filter routes keep their legitimate parsers. Production evidence is recorded above. Item 2 is now complete; the next slice is item 3.

2. Done: Account/social privacy and moderation boundary pass.
   - Confirm profile, follow, block, report, privacy, rating-leader, account challenge, and account history responses do not expose raw account ids, token hashes, bearer tokens, game seat tokens, challenge tokens, open-seek creator tokens, or internal database keys.
   - Tighten any remaining trusted-error paths so user-facing copy can explain privacy/rate-limit failures without echoing submitted secrets.
   - Keep report adjudication policy, sanctions, appeals, direct messages, public profile text, and broad notifications deferred until moderation rules are stronger.
   - Current item 2 notes: account challenge and account-history raw account id redaction is implemented with local and production verification passed. Client trusted-error promotion now refuses server messages containing raw online identifiers such as account/session/challenge/game/seek/report ids, with local and production verification passed. Account challenge directory/summary, account-history/head-to-head/shared public game-directory, social/profile/following/privacy browser-boundary, social/privacy HTTP-boundary, admin moderation report/audit, rating-leaderboard/public-rating, and account-report submission response shapes now fail closed on unsupported fields with local and production verification passed. The 2026-06-06 closure audit found no remaining in-scope item 2 response/privacy candidates; the next planned slice is item 3.

3. Challenge inbox and rematch reliability.
   - Keep the current account challenge inbox as the notification foundation.
   - Add dedicated rematch request records only after the existing same-settings challenge flow, block rules, cooldown rules, and accepted-game recovery stay stable.
   - Add report/block actions from invite or challenge rows without exposing hidden target state.

4. Lobby, Watch, Archive, and account-history scanability.
   - Continue list-first desktop design: quiet dense rows, stable filters, clear current-setup actions, no marketing layout.
   - Improve friend-aware discovery where it helps play: friends filters for Watch/Archive/account history, compact friends-playing-now, and richer authorized head-to-head/history links.
   - Add archive detail/search read models only when the current `OnlineGameSummary` payload stops being enough for replay/detail pages.

5. UI/navigation/tutorial/save QA.
   - Run screenshot QA after every broad destination change.
   - Keep desktop-first polish, but continue checking 360 x 640 short mobile, drawer-open states, Lobby rows, tutorial progress, first-run welcome, save modal overlays, and long online status/error text.
   - Fix overlap, clipped controls, unreadable status text, and confusing back/return paths before adding broader surfaces.

6. Ratings and moderation pre-public hardening.
   - Keep rated writes restricted to completed rated PostgreSQL games with two distinct registered accounts.
   - Verify public rating UI exposes only sanitized summaries and no rating-engine internals.
   - Add only the admin/report queue affordances needed for the trusted beta; defer fair-play signals, sanctions, appeals, and broad abuse policy until the audience grows.

7. Operational readiness before public load.
   - Keep deploy freshness, backup validation, production API smoke, and browser smoke in the live-push gate.
   - Add restore drills, pool-limit checks, load tests, metrics/alerts, and incident runbooks before attempting public-scale traffic.
   - Defer multi-instance work until the single-node service has clear observability and rollback evidence.

### Current Slice Selection Rule

- Pick the first non-Done slice from `Next Ordered Slices`; the next planned slice is item 3 unless a production blocker or user instruction overrides it.
- Before implementation, state which numbered item the slice advances.
- If a new issue is discovered while working, add it to this section before implementing it unless it is an emergency fix.
- After the slice, update this section with status, commit/deploy evidence if applicable, and any remaining follow-up.
