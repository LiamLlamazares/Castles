# Multi-Instance Online Runtime Design

## Goal

Make the Castles online runtime safe to run behind more than one Node process or host, while preserving the current player and spectator protocol.

The v1 target is a conservative two-instance private-beta deployment. It must prove that players, spectators, challenges, open seeks, Quick Match, presence, health checks, and rolling deploy behavior work across instances before `CASTLES_DEPLOYMENT_MODE=multi-instance` can be accepted.

## Current Baseline

The current service is deliberately single-node:

- WebSocket connections live in one `createOnlineHttpServer` process.
- Snapshot broadcast iterates the local `connections` map.
- Spectator counts are counted from local sockets only.
- `OnlineGameService` keeps warm rooms in a local `Map`.
- `enqueueGameAction` serializes only inside one process.
- PostgreSQL store transactions protect durable game, challenge, open-seek, summary, rating, and account writes.
- Production health reports `multiInstanceReady: false`, and `CASTLES_DEPLOYMENT_MODE=multi-instance` is rejected.

The important distinction is that PostgreSQL already protects mutation correctness, but it does not deliver WebSocket fanout, global live presence, cross-process room invalidation, or process-local queue serialization.

## Recommended Architecture

Use PostgreSQL first, not Redis, for v1 multi-instance coordination.

Reasons:

- PostgreSQL is already required for production online data.
- Local rehearsal can use the existing disposable PostgreSQL setup.
- Deployment stays one infrastructure dependency smaller.
- The target is private-beta two-instance correctness, not high-throughput public autoscaling.

Redis or another dedicated pub/sub layer remains a later option if PostgreSQL notifications become a measured bottleneck.

## Components

### Runtime Node Identity

Each server process gets a runtime node id.

- Default: generated at process start.
- Optional env override: `CASTLES_NODE_ID`, validated as a short visible identifier.
- Public health may report an opaque generated node id only if it is non-sensitive. Operator-chosen stable names must either be validated as non-sensitive identifiers or exposed only through an operator-facing diagnostic endpoint.

### Online Runtime Coordinator

Add a small server-side coordinator interface used by `createOnlineHttpServer`.

Responsibilities:

- Publish game snapshot events after durable game changes.
- Subscribe to game snapshot events from other nodes.
- Publish live spectator socket presence deltas.
- Read aggregated spectator counts.
- Acquire shared lightweight operation gates where process-local queues are currently relied on.
- Support graceful drain state for rolling deploys.

The first implementation should provide:

- `SingleNodeOnlineRuntimeCoordinator`, preserving current process-local behavior.
- `PostgresOnlineRuntimeCoordinator`, using PostgreSQL-backed coordination.

The HTTP server should depend on the coordinator interface rather than direct process-local assumptions where cross-node behavior matters.

### Snapshot Fanout

After a game action, timeout, visibility change, challenge accept, open-seek accept, or any operation that changes a live room snapshot:

1. The durable store transaction commits.
2. The local service replaces or reloads the affected warm room.
3. The local server sends to its own sockets.
4. The coordinator records and publishes `{ type: "game_snapshot_changed", gameId, roomVersion, lastEventId, reason, nodeId }`.
5. Other nodes receive the event, reload or invalidate the affected room, and broadcast the latest snapshot to their local sockets for that game.

Events are hints, not the source of truth. A receiving node must load the authoritative room/snapshot from the durable store before broadcasting when its local room is missing or stale.

Publish failure after a successful store commit must not leave remote sockets stale indefinitely. V1 must use either a durable runtime outbox table drained after commit or a bounded reconciliation loop for locally connected games that can discover changed `lastEventId` values without relying on a successfully delivered `NOTIFY`.

### Warm Room State

Warm rooms remain an optimization. In multi-instance mode:

- Joining, rejoining, account snapshot, and spectating must hydrate a room from the store if it is missing locally.
- Receiving a snapshot event invalidates or replaces the local warm room if the event `roomVersion` or `lastEventId` is newer than the local copy.
- A stale local room must not be used to authorize an action after the store has rejected or advanced the game.
- Local room state is never enough to claim multi-instance readiness.

This preserves the existing `OnlineGameRoom` model while making the store authoritative across nodes.

### Spectator Presence

Spectator counts become shared live metadata:

- Each WebSocket spectator connection registers `{ gameId, nodeId, connectionId, expiresAt }`.
- `connectionId` is server-generated, opaque, non-secret, and unrelated to account ids, session ids, IP addresses, user agents, or player tokens.
- Heartbeat or socket activity refreshes the row.
- Socket close removes the row when possible.
- Counts are queried as non-expired rows grouped by `gameId`.
- Count reads are still filtered through the same public/unlisted/private spectator access policy as game summaries.
- A periodic cleanup removes expired rows.

Counts are still response-only live metadata. They are not archived and must not affect game results, ratings, or public capacity claims.

### Account Presence

Account presence remains policy-filtered, coarse recent-activity metadata derived from the account/session store. Multi-instance work should not present it as live socket presence or expose finer presence than the current privacy contract.

For v1, account presence can remain in the account store if session activity is already durable. The design must keep spectator presence and account presence separate in health metadata unless a later reviewed presence backend intentionally unifies them.

### Shared Operation Gates

PostgreSQL locks already cover many durable operations. The implementation must audit and prove coverage for every process-local gate that matters in multi-instance mode:

- Game action and timeout application.
- Challenge accept/cancel/decline/expiry.
- Open-seek accept/cancel/expiry.
- Quick Match same-session check, match, and fallback create.
- Account challenge pair creation, duplicate-pending checks, and same-pair cooldown checks.
- Game id generation and collision handling.
- Visibility changes and account-game snapshot/rejoin operations.

Where store transactions already prove correctness, process-local queues may stay as per-node backpressure only. Where correctness still depends on process-local serialization, add a shared PostgreSQL advisory lock or transactional constraint.

Quick Match must have a shared gate keyed by normalized public session identity. Under that gate, the store must re-check active owned open seeks before accepting a candidate or creating a fallback seek. The invariant is: one public session identity may create or accept at most one active Quick Match/open-seek outcome for the same active flow.

Account challenge creation must have a shared gate or transactional constraint keyed by normalized challenger/challenged account pair. The invariant is: a pair cannot bypass pending-challenge duplication checks or cooldown checks by hitting different app nodes.

### Rolling WebSocket Drain

Add a runtime drain mode for rolling deploys:

- New HTTP health/readiness should report `draining: true`.
- Drain can be entered by a local process signal or authenticated operator route; production runbooks may use a systemd-controlled signal first and defer an admin route until needed.
- Liveness remains true while the process can serve existing sockets; readiness becomes false when the node is draining and should be removed from new traffic.
- Drain state is recorded with the runtime node row so diagnostics can distinguish a draining node from an unhealthy node.
- Existing WebSockets continue until game over, reconnect, or a bounded drain timeout.
- New WebSocket joins and spectators receive a retryable service-unavailable error once draining starts.
- Existing player sockets receive a clear reconnectable error only when the drain timeout closes them.
- Production runbook documents switching traffic away from a draining node before stop.

No client protocol version change is required if the existing `error` frame can carry the reconnectable service-unavailable reason.

### Deployment Mode

`CASTLES_DEPLOYMENT_MODE=multi-instance` remains rejected until all required tests pass.

When enabled, health must report:

- `mode: "multi-instance"`
- `multiInstanceReady: true`
- `websocketFanout: "postgres-notify"` or the actual selected mechanism
- `spectatorPresence: "postgres-live-presence"`
- `accountPresence: "session-store"` unless changed by a separate reviewed design
- `roomState: "store-authoritative-warm-cache"`
- `queueGuards: "postgres-locks-and-store-transactions"`
- `routing: "multi-node"`

Production freshness and monitoring must continue to fail if health omits this metadata or advertises unsupported combinations.

## Data Model

V1 may add small operational tables, for example:

- `online_runtime_nodes`
- `online_spectator_presence`
- `online_runtime_events` only if `LISTEN/NOTIFY` needs a durable fallback

Prefer `LISTEN/NOTIFY` for low-latency hints and tables for state that must survive process death, such as live presence with expirations and drain/readiness state. Because PostgreSQL notifications are not durable, every notification consumer must be able to recover by reloading the authoritative room or live-presence state from tables after reconnect, missed notification, or process restart.

If V1 uses an outbox, outbox rows must contain only routing metadata such as event id, game id, room version, summary event id, type, reason, node id, and creation time. They must not contain snapshots, credentials, account session data, IP addresses, user agents, or invite URLs.

Do not store player tokens, account session tokens, raw invite URLs, or private game snapshots in coordination tables.

## API And Client Impact

The public client protocol should not change.

Allowed visible changes:

- More accurate spectator counts across nodes.
- Retryable reconnect messaging during drain.
- Health/config metadata showing multi-instance readiness once enabled.

Disallowed visible changes:

- Token-bearing URLs in public responses.
- Public raw account ids.
- Archived spectator counts.
- Stronger capacity claims than the tests prove.

## Rollout Plan

1. Add characterization tests that prove current two-node gaps while `multi-instance` stays rejected.
2. Introduce the coordinator interface and keep single-node behavior unchanged.
3. Add PostgreSQL notification and live-presence primitives with unit tests.
4. Wire fanout for game snapshot changes and cross-node spectator broadcasts.
5. Hydrate or invalidate warm rooms from the durable store on cross-node events.
6. Audit and close shared gate coverage for game actions, challenges, seeks, Quick Match, and visibility.
7. Decide and implement startup ownership for schema migrations, summary rebuilds, stale presence cleanup, and any outbox cleanup. Ordinary app-node startup must not repeatedly run expensive rebuilds against live traffic without a shared maintenance lock.
8. Decide and implement rate-limit semantics. Private-beta v1 may keep non-sensitive public reads per-node only if documented, but account creation, Quick Match, challenge/report mutation, admin routes, and other abuse-sensitive paths must either use shared rate limits or keep a documented deployment limit that preserves the current effective budget.
9. Add drain/readiness behavior and runbook steps.
10. Add two-instance integration tests and local smoke rehearsal.
11. Update health/config/freshness/monitoring metadata.
12. Only then allow `CASTLES_DEPLOYMENT_MODE=multi-instance`.

## Tests And Evidence

Required before enabling multi-instance mode:

- Unit tests for runtime config parsing and health metadata.
- Coordinator tests for publish/subscribe, stale event ignoring, reconnect handling, and node-id filtering.
- Coordinator tests for missed-notification recovery by reloading authoritative store state.
- Outbox or reconciliation tests proving a committed game change is eventually observed by another node even if immediate notify publishing fails.
- Presence tests for connect, refresh, close, expiry cleanup, and aggregated counts.
- HTTP/WebSocket tests with two server instances sharing PostgreSQL:
  - player on node A, spectator on node B receives action snapshot;
  - player reconnects through node B and sees the latest snapshot;
  - spectator counts aggregate across nodes and disappear after close/expiry;
  - timeout adjudication on one node fans out to sockets on the other;
  - visibility change on one node updates summaries and access decisions on the other according to the current public/unlisted policy;
  - challenge accept and open-seek accept create one game under race;
  - targeted account challenge pair races cannot bypass pending-duplicate or cooldown checks;
  - Quick Match same-session race creates or accepts at most one active seek/game;
  - rolling drain rejects new sockets and preserves or cleanly closes existing sockets.
- Local smoke command for two app instances against the disposable PostgreSQL database.
- Production freshness and monitoring tests for supported and unsupported health combinations.
- Full `npx vitest run`, `npm run build`, `npm run server:build`, `npm run audit`, `git diff --check`.
- Browser/UI audit only if user-visible surfaces change beyond reconnect/drain messages.

## Non-Goals

- No Redis or external broker in v1.
- No autoscaling claim.
- No global public TV ranking from spectator counts.
- No chat, messages, forums, teams, or other broad social expansion.
- No profile/dashboard redo.
- No change to the rating model.

## Review Gates

Before implementation:

- Review this design for hidden single-node assumptions and missing race cases.
- Convert findings into accept, reject, investigate, or defer decisions.

After implementation:

- Run a code review focused on correctness, cross-node races, token hygiene, and operational failure modes.
- Run an operations review focused on deployment mode, health metadata, monitoring alerts, and rollback.
- If any accepted or investigated finding exposes a reusable process mistake, append a Micro-Reflection to the tracked cognitive ledger.

## Initial Design Review Decisions

Review pass: focused architecture reviewer, 2026-06-15.

- Reject: deployment-mode parser/health metadata missing. The reviewer inspected a stale checkout; the current `online-qa-closure` worktree already includes the item 10 deployment-mode guardrails and health/config metadata.
- Accept: room hydration must be mandatory for join, rejoin, account snapshot, and spectate paths on nodes with missing warm rooms.
- Accept: snapshot fanout must use `roomVersion` plus `lastEventId`; visibility changes cannot rely on gameplay version alone.
- Accept: publish-after-commit failure requires a durable outbox or bounded reconciliation path before enabling multi-instance.
- Accept: Quick Match needs a shared session gate and invariant, not only process-local same-session serialization.
- Accept: targeted account challenge pair duplication and cooldown checks need shared gate coverage.
- Investigate: startup schema, summary rebuild, cleanup, and maintenance ownership must be defined before ordinary app nodes can start in multi-instance mode.
- Accept: rate-limit semantics must be explicit; abuse-sensitive routes need shared limits or a documented deployment limit.
- Accept: drain mode needs an entry mechanism, readiness/liveness split, node-state diagnostics, and shutdown ordering.
- Accept: spectator presence rows must be minimal, opaque, TTL-bound, and access-policy-filtered.
- Investigate: public health should not leak sensitive operator-chosen node ids.
- Defer: account presence remains coarse recent activity until a separate reviewed live-presence backend exists.
