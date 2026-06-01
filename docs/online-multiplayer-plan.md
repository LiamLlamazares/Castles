# Online Multiplayer Master Roadmap

Last refreshed: 2026-06-01

This document is the source of truth for Castles online multiplayer work. The current direction assumes no legacy compatibility burden: old online drafts, incomplete protocols, and pre-roadmap UI assumptions may be replaced instead of preserved.

Lichess is a UI/UX benchmark for clarity, speed, and chess-player expectations, not a product clone. Before designing or implementing lobby, archive, spectator, challenge, or analysis screens, benchmark Lichess and at least one other mature chess/board-game service, then record the concrete interaction patterns Castles will adopt or reject.

## Completed State

Current private-link beta:

- One authoritative Node server owns each online room.
- Setup/action/message DTOs are validated before hydration.
- The existing TypeScript rules engine validates turn, ownership, legal moves, and terminal state.
- Accepted game events are persisted to PostgreSQL before authoritative snapshot broadcast.
- Startup replay rebuilds rooms from an append-only v1 event log and fails loudly on corrupt or unsupported events.
- Accepted actions are serialized per game in the single Node process.
- Server-authoritative clocks support timeout adjudication and reconnect-safe snapshots.
- Private white/black bearer invite tokens are removed from URLs and stored in `sessionStorage`.
- Online API/token-bearing responses bypass browser, service worker, and HTTP caching.
- REST snapshot resync, heartbeat pings, reconnect backoff, and readiness health checks exist.
- Read-only public spectator URLs and WebSocket spectator joins exist; spectators cannot submit actions.
- Local PostgreSQL restart smoke tooling verifies create, join, action persistence, shutdown, restart, and reload.
- Local PostgreSQL concurrency smoke tooling verifies per-game locking and stale-action behavior.
- The game shell has responsive navigation, tutorial/rules/library access, save/load controls, and mobile overlap checks.

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

Tests/review/deploy gates:

- Tests: replay from event log into read models, migration/rebuild idempotence, role/access unit tests.
- Review: data-contract review for schema versioning, privacy, archive visibility, and future account fit.
- Deploy: read models can be rebuilt from existing beta data or explicitly reset under the no-legacy assumption.

## Phase 3: Concurrency Correctness

Goal: harden accepted game actions beyond the current single-node PostgreSQL writer path.

Work:

- Expand and stress-test the current per-game PostgreSQL transaction/lock path.
- Keep accepted action writes, version checks, and summary refreshes atomic under realistic contention.
- Define duplicate submit, reconnect race, timeout race, and simultaneous resign/draw behavior.
- Prepare the event flow for later pub/sub or worker separation.

Tests/review/deploy gates:

- Tests: concurrent action fuzz/integration tests, duplicate message tests, timeout/action race tests.
- Review: correctness review of locking, transaction boundaries, idempotency, and replay equivalence.
- Deploy: lock strategy is observable, has timeout/error handling, and can roll back without data loss.

## Phase 4: Online Protocol and Client State

Goal: formalize the client/server online protocol and make client state resilient.

Work:

- Version WebSocket and REST messages with explicit error, resync, stale-version, and reconnect semantics.
- Separate local optimistic UI from authoritative online state.
- Define client state machines for offline, connecting, joined, resyncing, terminal, and access-denied states.
- Add protocol documentation close to DTO definitions.

Tests/review/deploy gates:

- Tests: protocol contract tests, stale-version tests, reconnect/resync e2e tests, malformed-message tests.
- Review: client-state review for impossible states, stale UI, duplicated actions, and accessibility regressions.
- Deploy: old disposable beta clients are blocked or forced to reload cleanly.

## Phase 5: Challenges and Access UX

Goal: support intentional game creation and joining flows before public discovery.

Work:

- Benchmark challenge UX before implementation.
- Build challenge creation, accept/decline/expire, copied links, access-denied, and pending states.
- Define private, unlisted, and public visibility semantics.
- Add clear UI for player link, spectator link, and challenged-user access.

Tests/review/deploy gates:

- Tests: challenge lifecycle, expiration, access roles, link handling, and browser e2e tests.
- Review: UX/security review for confusing links, accidental public exposure, and unauthorized joins.
- Deploy: challenge records are observable, expirable, and recoverable after restart.

## Phase 6: Spectator, Archive, Lobby, Matchmaking

Goal: add discovery and post-game surfaces on top of stable contracts.

Work:

- Benchmark spectator, archive, lobby, matchmaking, and analysis entry points before screen design.
- Polish spectator experience, archived-game labels, result display, move list, share/export entry points, and analysis launch.
- Build archive browse/search read models before broad public lobby.
- Add lobby presence and simple matchmaking only after archive/spectator contracts are stable.

Tests/review/deploy gates:

- Tests: archive rebuild/search tests, spectator e2e tests, lobby presence tests, matchmaking lifecycle tests.
- Review: UX/accessibility review for scanning, empty states, mobile layouts, and analysis handoff.
- Deploy: discovery features can be rate-limited, disabled, and monitored independently.

## Phase 6A: UI Shell, Navigation, Tutorial, and Save UX Polish

Goal: make the app feel navigable and sturdy before broader public discovery.

Status: implemented for the current shell. Keep this phase as a regression checklist when adding future lobby, archive, challenge, spectator, or analysis screens.

This phase is required before calling the online experience Lichess-like. The current app shell has known rough edges: the side bar can feel awkward, the tutorial entry point is not placed naturally, routes/views can be hard to return from, save/progress affordances are not prominent enough, and some controls may overlap on smaller layouts.

Work:

- Benchmark Lichess navigation, game-page side panels, tutorial/help entry points, archive/lobby affordances, and mobile layouts; compare with at least one other mature online board-game service.
- Audit the current app shell with screenshots across desktop and mobile viewports, including setup, game, tutorial/rules, library/save/progress, online spectator, and terminal states.
- Rework the side bar/navigation so users can reliably move between setup, game, tutorial/rules, saved games/library, online links, and future lobby/archive screens.
- Place tutorial/help where a new player naturally expects it, while keeping the actual game screen primary.
- Make save/progress controls discoverable without crowding turn controls or online status.
- Fix overlapping controls, especially go-back/navigation affordances and mobile bottom controls.
- Preserve game-state safety: navigation must not accidentally reset an online or local game without a clear explicit action.

Tests/review/deploy gates:

- Tests: route/view navigation tests, save/progress interaction tests, responsive layout assertions where practical, and browser smoke through create/join/spectate/terminal flows after shell changes.
- Manual browser QA: Playwright screenshots for desktop and mobile before/after, with explicit checks that controls do not overlap and important text fits.
- Review: UX/accessibility review focused on navigation clarity, keyboard/focus order, mobile ergonomics, and consistency with Lichess-inspired expectations adapted for Castles.
- Deploy: UI shell changes are shipped only after online smoke still passes and no local-save data is lost.

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

1. Finish and verify Phase 1 runtime config validation, static-build checks, and deployment runbook updates.
2. Run the private beta smoke suite against local PostgreSQL, including restart, concurrency, and browser create/join/spectate checks.
3. Record Phase 2 data-contract decisions: durable/disposable events, game summary read model, identity primitive, and access roles.
4. Create the UI benchmarking checklist template required before challenge, spectator, archive, lobby, matchmaking, and analysis screens.
5. Re-run the Phase 6A responsive shell checklist whenever new navigation surfaces are added.
