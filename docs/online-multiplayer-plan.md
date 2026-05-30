# Online Multiplayer Plan

Last refreshed: 2026-05-30

Castles now has a private-link online beta path. The current implementation is intentionally small: one authoritative Node server owns each game room, validates actions with the existing TypeScript rules engine, persists room records to JSON, and broadcasts full snapshots over WebSocket.

## Current Beta Shape

```text
Client
  -> POST /api/online/games with setup DTO
Server
  -> validates setup, creates private white/black bearer tokens, saves room
Client
  -> opens /ws, joins with game id + token
Server
  -> validates token, sends authoritative snapshot
Client action
  -> versioned action DTO over /ws
Server
  -> validates schema, turn, ownership, rules, terminal state
  -> saves room record
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
$env:ONLINE_STORE_PATH="C:\path\to\online-games.json"
npm run server:start
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
- queued JSON persistence with unique temp files,
- create-game responses wait for persistence,
- accepted actions are saved before snapshot broadcast,
- corrupt persisted room records are skipped at startup instead of bricking the server,
- terminal game results are latched so no later action can sneak through,
- reconnect attempts with exponential backoff, heartbeat pings, and REST snapshot resync,
- online clocks are disabled until server-authoritative clocks exist.

## Known Constraints

This is not ready for a public lobby or multiple server replicas.

- Do not run multiple app instances against the same JSON file.
- JSON persistence is fine for a friend beta, not for a large public service.
- Accepted actions are persisted before broadcast, but the current in-memory mutation is not a fully transactional event log.
- Private invite links are bearer secrets. Use HTTPS and avoid posting them publicly.
- Accounts, ratings, moderation, spectator permissions, and anti-cheat are intentionally out of scope for this phase.

## Next Phases

1. Remote private beta: deploy one instance, verify create/join/play/restart recovery, and keep logs.
2. Durable game truth: move from snapshot JSON to an append-only action log, with replay and corruption quarantine tests.
3. Server clocks: add authoritative clock state, timeout adjudication, and reconnect-safe clock snapshots.
4. Spectators and archive: create read-only links, archived game views, and PGN/export UX.
5. Public service features: lobby, accounts, ratings, moderation, observability, and multi-instance coordination.
