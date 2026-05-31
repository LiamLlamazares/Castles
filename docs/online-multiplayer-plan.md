# Online Multiplayer Plan

Last refreshed: 2026-05-31

Castles now has a private-link online beta path. The current implementation is intentionally small: one authoritative Node server owns each game room, validates actions with the existing TypeScript rules engine, persists accepted events to JSONL or PostgreSQL, and broadcasts full snapshots over WebSocket.

## Current Beta Shape

```text
Client
  -> POST /api/online/games with setup DTO
Server
  -> validates setup, creates private white/black bearer tokens, appends game_created event
Client
  -> opens /ws, joins with game id + token
Server
  -> validates token, sends authoritative snapshot
Client action
  -> versioned action DTO over /ws
Server
  -> validates schema, turn, ownership, rules, terminal state
  -> appends accepted action or timeout event
  -> broadcasts authoritative snapshot
```

The client can still compute local legal moves for responsiveness, but the server decides truth.

## Deployment Baseline

Run the first remote beta as a single Node process behind HTTPS.

Required public ports:

- `443/tcp` for HTTPS and WebSocket upgrade at `/ws`
- `80/tcp` only if the reverse proxy redirects HTTP to HTTPS
- `22/tcp` or your friend’s preferred admin port for SSH

The app process port, for example `3000`, should stay private on the server or bound to localhost behind the reverse proxy.

Important environment:

```powershell
$env:PORT="3000"
$env:PUBLIC_BASE_URL="https://your-server.example"
$env:ONLINE_STORE_PATH="C:\path\to\online-game-events.jsonl"
npm run server:start
```

PostgreSQL persistence uses the same event format and is selected with:

```powershell
$env:ONLINE_STORE_BACKEND="postgres"
$env:DATABASE_URL="postgresql://castles:password@localhost:5432/castles"
npm run server:start
```

To import an existing JSONL event log into PostgreSQL:

```powershell
$env:ONLINE_STORE_PATH="C:\path\to\online-game-events.jsonl"
$env:DATABASE_URL="postgresql://castles:password@localhost:5432/castles"
npm run online:migrate-jsonl-to-postgres
```

Build before deployment:

```powershell
npm run build
npm run server:build
```

## Current Hardening

Implemented for private beta:

- strict setup/action/message DTO validation before hydration,
- request body limits, WebSocket payload limits, basic per-client rate limits,
- `Referrer-Policy: no-referrer` and bearer-token snapshot fetches,
- invite tokens stored in `sessionStorage` and removed from the browser URL after first use,
- service worker and HTTP cache bypass for online/API/token-bearing requests,
- `Cache-Control: no-store` and `Vary: Authorization` on online API responses,
- queued JSONL event persistence,
- create-game responses wait for persistence,
- accepted actions are serialized per game and saved before snapshot broadcast,
- append-only v1 event-log persistence for game creation, accepted actions, and timeout adjudication,
- startup replay from the event log into authoritative room records,
- corrupt or unsupported event log lines fail startup loudly instead of replaying partial history,
- health checks report build metadata, event schema, ruleset version, and store readiness,
- terminal game results are latched so no later action can sneak through,
- reconnect attempts with exponential backoff, heartbeat pings, and REST snapshot resync,
- server-authoritative clocks with timeout adjudication and reconnect-safe clock snapshots,
- optional PostgreSQL event storage with JSONL-to-Postgres migration.

## Known Constraints

This is not ready for a public lobby or multiple server replicas.

- Do not run multiple app instances against the same JSONL file.
- JSONL persistence is fine for a friend beta, not for a large public service.
- PostgreSQL is more durable than JSONL, but this app still assumes one writer process until cross-process coordination is added.
- Accepted actions are serialized in the single Node process, but there is still no explicit per-game database transaction or advisory lock.
- Private invite links are bearer secrets. Use HTTPS and avoid posting them publicly.
- Accounts, ratings, moderation, spectator permissions, and anti-cheat are intentionally out of scope for this phase.

## Next Phases

1. Remote PostgreSQL beta: deploy one instance with `ONLINE_STORE_BACKEND=postgres`, migrate any JSONL events worth keeping, and verify create/join/play/restart recovery.
2. Spectators and archive: create read-only links, archived game views, and PGN/export UX.
3. Public service features: lobby, accounts, ratings, moderation, observability, and anti-cheat.
4. Multi-instance coordination: database transactions/advisory locks, shared pub/sub, rolling deploys, and operational dashboards.
