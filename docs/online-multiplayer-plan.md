# Online Multiplayer Master Roadmap

Last refreshed: 2026-06-01

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
- Local PostgreSQL restart smoke tooling verifies create, join, action persistence, shutdown, restart, and reload.
- Local PostgreSQL concurrency smoke tooling verifies per-game locking and stale-action behavior.
- The game shell has shared Play/Learn/Online/Library navigation, contextual game controls, guarded New Game flow, save feedback, mobile tutorial bounds, modal drawer focus management, shared challenge/online pending shells, and browser screenshot overlap checks.

Current constraints:

- One writer process only; no cross-process coordination yet.
- Private invite links are bearer secrets and require HTTPS.
- Public spectator URLs expose games to anyone with the random game id.
- Accounts, ratings, matchmaking, moderation, anti-cheat, and admin tooling are not implemented.

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

Status: Phase 6H through 6N are implemented and locally verified on 2026-06-01. The first discovery surface is a public Watch/Online Archive browser backed by token-free `OnlineGameSummary` read models. It lists only summaries marked `visibility: "public"` and does not expose private or unlisted invite games. Phase 6C adds a visible sidebar Analysis handoff for spectators and completed online games; it passes the current board state directly into local analysis and clears online URL/session state before remounting. Phase 6D separates archived-game replay launch from live spectating: completed archive rows fetch a single public snapshot, clear online URL/session state, and open local analysis directly. Phase 6E adds durable player publish/unlist controls through `visibility_changed` events and `PATCH /api/online/games/:gameId/visibility`; `private` changes remain deferred until spectator socket reauthorization exists. Phase 6F adds Public Directory v1: state-filtered public list responses, bounded limits, opaque cursors, single-summary lookup, store-level public list queries, rate-limited public directory reads, and Watch/Archive sort/time/result controls. Phase 6H adds open lobby seeks: separate durable seek events/summaries, PostgreSQL persistence, public token-free seek directory, creator-owned cancel/refresh/join flow, accept-to-game handoff, and Lobby/Watch/Online Archive tabs. Phase 6J adds server-backed seek filters, visible-tab auto-refresh, rate-limit backoff, freshness text, pending-action preservation, and mobile screenshot-verified Lobby/Watch/Archive layout. Phase 6K adds Quick Match v1 on top of open seeks without accounts or ratings. Phase 6M fixes challenge share-link reload/cleanup, stale terminal owned-lobby panels, and lobby copy that confused list filters with current-setup actions. Phase 6N makes analysis/replay reversible with `Back to Live Game`, `Back to Online Archive`, and local `Return to Game` actions while blocking active online players from using analysis as an unconfirmed escape hatch. Accounts, ratings, chat, and moderation remain deferred.

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

- Add server-backed public-game thumbnails, side-to-move, last move, remaining clocks, spectator counts, and a real featured/TV selection signal before calling any game "featured".
- Move Watch/Archive search and richer filters into indexed server queries once the read model carries those fields.
- Decide whether current public-game preview belongs in Lobby long-term or should move entirely into Watch after Watch thumbnails exist.

## Phase 6P: Learn Completion Progress Hardening

Goal: make Learn progress closer to a Lichess-style course without claiming engine-graded mastery.

Status: implemented locally on 2026-06-02. Learn now separates resume position from completed lessons, stores checked objectives by authored lesson-scoped objective ids instead of array indexes or objective wording, derives completion from objective checks, and demotes completion if a checked objective is later unchecked. Unsupported legacy progress archaeology stays out of scope. Course copy now says lessons and objectives are completed rather than "mastered"; read-only lessons complete from Next, and clear action objectives can auto-complete from movement, capture, recruitment, promotion, pledge, ability, and inspection events.

Remaining work:

- Add engine-graded objectives only after each target board state and validation event is explicit and tested.
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

- Add server-backed public-game thumbnails, side-to-move, last move, remaining clocks, spectator counts, and a real featured/TV selection signal before showing richer game previews.
- Decide whether the current public-game preview belongs in Lobby long-term or should move entirely into Watch after Watch has thumbnails and stronger scan controls.
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

Status: implemented locally on 2026-06-02. The app now records token-free recent online game ids in localStorage when an online player or spectator snapshot is seen, updates the record to complete once the server snapshot has a result, and passes those records to Online Archive. Archive now shows a distinct `Recent completed online games` section for completed local records that are not already present in the public archive, with `Analyze Replay` using the existing spectator snapshot and replay reconstruction path. Known-private games are not newly added to this token-free replay list.

Verification:

- Focused tests cover recent-online-game storage validation, ordering, de-duplication, malformed data cleanup, App snapshot-to-storage wiring without token leakage, Archive rendering, duplicate suppression against public rows, and replay button handoff.
- Client build and server build passed locally.

Remaining work:

- Account-backed personal game history can replace or augment this local-only list once accounts exist.
- If private games later need replay from the same browser, add an authenticated replay endpoint or token-safe local credential design rather than using public spectator snapshots.

## Phase 7: Ratings, Fair Play, Moderation, Admin

Goal: add public-service trust and governance features.

Work:

- Add account-backed identity if required by ratings and moderation.
- Implement rating events/read models after result contracts are stable.
- Add fair-play signals, reporting, blocking, moderation queues, and admin audit logs.
- Define retention, privacy, appeal, and abuse-handling policies.

Tests/review/deploy gates:

- Tests: rating calculation tests, moderation permission tests, report lifecycle tests, audit-log tests.
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

## Next Immediate Work

1. Decide the next Watch/Lobby preview step: spectator counts with durable presence, a cleaner current-games section, or deeper navigation streamlining.
2. Continue navigation clarity by reducing duplicated online game-creation entry points only where doing so does not remove useful edited-board or private-invite flows.
3. Continue Tutorial course polish with richer theory and practice, but add engine-graded progress only after objective board states are explicit and tested.
4. Keep running screenshot QA after each broad UI destination is added, especially for 360 x 640 short mobile layouts, drawer-open states, Lobby rows, tutorial progress, first-run welcome, save modal overlays, and long online status/error text.
5. Keep deployment freshness in the gate: service-worker policy tests, expected-commit health checks, and browser smoke after each live push.
