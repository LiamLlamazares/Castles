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
- Local PostgreSQL restart smoke tooling verifies create, join, action persistence, shutdown, restart, and reload.
- Local PostgreSQL concurrency smoke tooling verifies per-game locking and stale-action behavior.
- The game shell has shared Play/Learn/Library/Watch navigation, contextual game controls, guarded New Game flow, save feedback, mobile tutorial bounds, modal drawer focus management, shared challenge/online pending shells, and browser screenshot overlap checks.

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

Status: Phase 6F is implemented and locally verified on 2026-06-01. The first discovery surface is a public Watch/Online Archive browser backed by token-free `OnlineGameSummary` read models. It lists only summaries marked `visibility: "public"` and does not expose private or unlisted invite games. Phase 6C adds a visible sidebar Analysis handoff for spectators and completed online games; it passes the current board state directly into local analysis and clears online URL/session state before remounting. Phase 6D separates archived-game replay launch from live spectating: completed archive rows fetch a single public snapshot, clear online URL/session state, and open local analysis directly. Phase 6E adds durable player publish/unlist controls through `visibility_changed` events and `PATCH /api/online/games/:gameId/visibility`; `private` changes remain deferred until spectator socket reauthorization exists. Phase 6F adds Public Directory v1: state-filtered public list responses, bounded limits, opaque cursors, single-summary lookup, store-level public list queries, rate-limited public directory reads, and Watch/Archive sort/time/result controls. Open seeks, matchmaking, accounts, ratings, and chat remain deferred.

Work:

- Benchmark spectator, archive, lobby, matchmaking, and analysis entry points before screen design.
- Polish spectator experience, archived-game labels, result display, move list, share/export entry points, and public/unlisted visibility language.
- Build archive browse/search read models before broad public lobby.
- Add lobby presence and simple matchmaking only after archive/spectator contracts are stable.

Tests/review/deploy gates:

- Tests: archive rebuild/search tests, spectator e2e tests, lobby presence tests, matchmaking lifecycle tests.
- Review: UX/accessibility review for scanning, empty states, mobile layouts, and analysis handoff.
- Deploy: discovery features can be rate-limited, disabled, and monitored independently.

## Phase 6B: Watch and Online Archive Browser

Goal: make public online games discoverable without changing visibility semantics.

Work:

- Add a Watch/Online Archive screen that fetches `/api/online/games`, separates active public games from completed archived games, and shows result/time/move summary labels.
- Add top-level Watch navigation from the game shell and setup surfaces while keeping local Library distinct from Online Archive.
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

## Phase 6A: UI Shell, Navigation, Tutorial, and Save UX Polish

Goal: make the app feel navigable and sturdy before broader public discovery.

Status: third pass implemented and locally verified on 2026-06-01. The shell now uses shared Play/Learn/Library/Watch navigation on setup, tutorial, local Library, Watch, challenge, and pending online/error screens; the game side panel is contextual to live play and review actions; New Game is guarded for active games; Save Game reports in-app feedback; mobile tutorial layout keeps the board reachable on short screens; the drawer is a modal dialog with focus trap, Escape close, focus restoration, and background inerting; and stale topbar/sidebar CSS and unused ControlPanel navigation props were removed under the no-legacy-support direction.

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
- Setup, Learn, Library, and Watch share one `AppShellNav` pattern with non-destructive Play navigation back to the current game when one exists.
- Active local and online games use an in-app New Game confirmation dialog with focus trap, Escape handling, background inerting, and focus restoration to the invoking control or hamburger button.
- Library import is collapsed by default so saved games stay primary; Watch and Library use denser app-shell headers.
- Reviewer findings from the second pass were accepted and fixed: drawer-started New Game focus restoration and short-height mobile tutorial clipping.
- Reviewer findings from the third pass were accepted and fixed: challenge and failed-online states now use the shared shell, drawer focus cannot escape through the trigger, app-level background content is inert while the drawer is open, the drawer sits above the install prompt layer, stale online/challenge/autosave/session credential state is cleared when leaving failed online states, and short-screen tutorial/online-state spacing avoids horizontal overflow.

Tests/review/deploy gates:

- Tests: route/view navigation tests, save/progress interaction tests, responsive layout assertions where practical, and browser smoke through create/join/spectate/terminal flows after shell changes.
- Manual browser QA: Playwright screenshots for desktop and mobile before/after, including access-denied, pending-action, disconnected, resyncing, and terminal online states, with explicit checks that controls do not overlap and important text fits.
- Review: UX/accessibility review focused on navigation clarity, keyboard/focus order, mobile ergonomics, and consistency with Lichess-inspired expectations adapted for Castles.
- Deploy: UI shell changes are shipped only after online smoke still passes and no local-save data is lost.

## Phase 6G: Navigation, Tutorial, and Save UX Refinement

Goal: substantially improve the app shell after the online directory foundation, using Lichess as the primary navigation-density benchmark with Castles-specific changes where the game differs.

Status: implemented and locally verified on 2026-06-01. Navigation state now uses explicit view-entry helpers instead of `previousView`; game-entry paths, saved-game loads, online spectate/replay, editor play, and restart clear stale return history. The drawer and all app-shell sidebars order destinations as Play, Learn, Watch, Library before Board/Tools. Tutorial/Learn has a compact lesson header, visible lesson count, grouped controls, labelled lesson-board region, screen-reader progress status, and a more board-forward mobile split. Save Game now opens an in-app named-save modal with cancel, duplicate-save protection, focus trap, Escape close, background inerting, retryable failure, and saved-name feedback instead of a browser prompt. Screenshot artifacts are in `artifacts/ui-audit/phase6g-after`.

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

1. Commit and push Phase 6G.
2. Continue Phase 6 archive/lobby work only after the UI shell remains stable: archive detail pages if summaries are insufficient, then lobby presence, then simple matchmaking.
3. Start lobby presence/open-seek planning only after a fresh benchmark pass and contract review.
4. Before implementing lobby/matchmaking screens, run a fresh Lichess/modern-board-game benchmark pass and keep public creation/open seeks separate from Watch/Archive until the backend contracts exist.
5. Keep running screenshot QA after each broad UI destination is added, especially for 360 x 640 short mobile layouts and drawer-open states.
