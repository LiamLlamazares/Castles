# Quick Match v1 Design

## Goal

Add a simple "Quick Match" path that gets a user into an online game by accepting a compatible open seek when one exists, or creating a normal open seek when none exists.

## Scope

- Quick Match v1 is automation on top of open seeks.
- No accounts, usernames, ratings, chat, queues table, durable matchmaking sessions, or cross-server presence.
- No legacy compatibility. Existing unused local/server data can be ignored.
- The server remains the source of truth for accepting seeks and creating games.
- The UI must explain that it is checking existing compatible open seeks, not imply a real-time player pool or ongoing queue.

## User Flow

1. User opens Lobby and presses `Quick Match`.
2. App sends the current setup plus an anonymous session id to the server.
3. Server serializes Quick Match work by public session id.
4. Server checks whether the same session already owns an open or accepted seek before matching or creating anything.
5. If the same session already owns an open or accepted seek, server returns a sanitized conflict instead of matching or creating another seek.
6. Server checks public open seeks for a compatible seek not created by the same session, paging through the directory until a match is accepted or the directory is exhausted.
7. If one exists, server accepts it atomically and returns an acceptor game invite.
8. If none exists, server creates a normal random-side open seek and returns creator credentials.
9. Client either joins the accepted game immediately or stores creator credentials and shows the existing "Your open seek" panel while it waits.

## Compatibility Rules

Quick Match v1 should be intentionally narrow:

- Match only open, unexpired seeks.
- Never match a user's own seek.
- Scan the open-seek directory page-by-page at the maximum bounded directory page size. Do not create a fallback merely because the first page is full of incompatible seeks.
- Normalize the submitted setup once using the same helper as normal open-seek creation. That helper fills missing `timeControl` with the existing default `20+20`, preserving the current server semantics.
- Require an exact canonical setup signature match after normalization. The signature must include board config/castles, pieces, sanctuaries, sanctuary settings, time control, victory-points mode, initial pool types, and piece theme. Object keys should be sorted before stringifying so PostgreSQL JSONB key ordering does not affect compatibility; array order remains significant.
- Accept the existing seek creator's full setup when matched; do not try to merge setup details.
- Create a fallback seek with `creatorSeat: "random"` using the same normalized setup that was used for compatibility comparison.

The narrow rules avoid surprising mismatches while still allowing players with the same common preset to meet.

## API Contract

Add `POST /api/online/matchmaking/quick`.

Request:

```json
{
  "setup": { "...": "OnlineGameSetupDTO" },
  "sessionId": "anon_session_id",
  "expiresInMs": 600000
}
```

Response when matched:

```json
{
  "protocolVersion": 1,
  "outcome": "matched",
  "role": "acceptor",
  "summary": { "...": "OpenSeekSummary" },
  "gameInvite": {
    "gameId": "game_...",
    "seat": "w",
    "token": "acceptor-token",
    "url": "https://example/?onlineGame=game_...&seat=w"
  }
}
```

Response when waiting:

```json
{
  "protocolVersion": 1,
  "outcome": "waiting",
  "role": "creator",
  "seekId": "seek_...",
  "summary": { "...": "OpenSeekSummary" },
  "creator": { "token": "creator-token" }
}
```

Safety:

- Response validators must reject missing protocol version, invalid outcome, malformed summary, malformed invite, and missing creator token.
- Token-bearing fields appear only in direct authenticated/creation responses, never in public directory responses.
- The public URL in `gameInvite.url` remains tokenless.
- Rate limit Quick Match with a dedicated per-client limiter no looser than normal open-seek creation: 20 requests per 60 seconds. Do not use the looser public-directory limiter.
- Guard the endpoint with a per-session Quick Match lock or queue before reading candidates. Under that lock, check all current seek summaries for the same public session identity with status `open` or `accepted` before accepting candidates or creating a fallback seek. If one exists, return `409` with a sanitized `existing_open_seek` error.
- The v1 per-session Quick Match lock is process-local and assumes the current single Node service deployment. Before running multiple app workers or instances, replace it with a durable PostgreSQL advisory lock, a transactional active-seek constraint, or another shared lock that covers the same check/match/create sequence.
- Under concurrent same-session requests, at most one request may match or create a fallback seek. Later same-session requests in the same queue must re-check the active-seek guard after the first request finishes and return sanitized `409 existing_open_seek` if the first request created an owned seek.
- On a race where a candidate seek is no longer open, try the next compatible seek before creating a fallback seek.
- Do not echo submitted setup/session data in error messages.

## UI Contract

- Lobby gets a primary `Quick Match` action near `Create Open Seek`.
- The action must have an accessible label such as `Quick Match: accept a compatible open seek or list yours`.
- Lobby must show a compact setup summary near Quick Match so users know exact matching is stricter than the visible filters. The summary should start with copy such as `Uses your exact current Play setup` and show board radius, clock/casual setting, victory-points/castle-control mode, plus a short `Current board, pieces, sanctuaries, pool, and theme must match` note.
- Disable Quick Match while the user already owns or may own an active seek. If a creator token has been restored from `sessionStorage` but the owner summary is still loading, keep Quick Match disabled until the restore resolves or the seek is known terminal. If the owned seek is `open` or `accepted`, keep Quick Match disabled and route the user through the owner panel to refresh, cancel, or join. Quick Match v1 supports one owned open seek at a time.
- While pending or in the matched/opening transition, disable `Quick Match`, `Create Open Seek`, and row accept/cancel controls that would conflict.
- Matched result uses the existing accepted-game join flow.
- Waiting result stores creator params in `sessionStorage`, refreshes the owned seek panel, and leaves the user in Lobby.
- Pending, waiting, matched, and failure copy must be announced through the existing polite status line.
- If Quick Match fails, focus returns to the Quick Match button.
- If Quick Match creates a waiting open seek, the owner panel must be keyboard reachable immediately after the action resolves.
- Status copy examples:
  - pending: `Checking compatible open seeks...`
  - matched: `Match found. Opening game...`
  - waiting: `No compatible open seek found. Your open seek is listed for someone to accept.`
  - failure: `Could not start quick match.`

## Tests And Review

- Contract tests for response validation and storage behavior.
- Client validation tests for missing protocol version, mismatched `outcome`/`role`, token-bearing `gameInvite.url`, missing creator token, malformed invite, and `waiting.seekId !== waiting.summary.seekId`.
- HTTP tests for match-first, fallback-create, same-session open/accepted conflict before matching or fallback, concurrent same-session fallback where only one request proceeds and the other receives sanitized `409 existing_open_seek`, self-seek rejection, expired/terminal seek skipping, race retry, exact normalized setup compatibility, missing-time-control normalization, token hygiene, and the dedicated 20-per-minute rate limit.
- PostgreSQL/in-memory behavior should both be covered through server route tests and existing store tests. Include at least one store-wired HTTP Quick Match test that exercises injected `listOpenSeekSummaries` and `acceptOpenSeekAndCreateGame`.
- App/OnlineGameBrowser tests for pending state, matched handoff, waiting owner panel, failure recovery, and no token-in-URL behavior.
- UI tests for setup-summary text matching the posted setup, keyboard activation, polite status announcements, matched/opening disablement, focus restoration on failure, and keyboard reachability of the waiting owner panel.
- UI tests proving Quick Match is disabled while an owned open seek is already open or accepted.
- UI/App tests proving Quick Match is also disabled while an owned seek is being restored from stored creator credentials and the owner summary is not loaded yet.
- Reviewer pass before implementation and after implementation.
- Full suite, build, server build, diff check, browser smoke, and automated screenshot/bounding-box audit before commit.
- Screenshot audit must include dense mobile states at 360 x 640 and 390 x 844 with Quick Match idle or pending, active filters/search, freshness text, owner panel, and at least one public row.
