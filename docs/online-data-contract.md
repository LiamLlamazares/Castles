# Online Data Contract

Last refreshed: 2026-06-01

This document records the current contract decisions for online multiplayer. The app still has no production users, so incompatible beta data can be reset instead of migrated.

## Durability Classes

### Disposable Beta Events

`OnlineGameEvent` schema v2 is a private-beta event stream. It is valid for the current single-node beta, but it is not a permanent public contract yet. Creation events are token-free: `game_created` stores only `gameId`, setup, and optional clock state. Version 2 requires `clientActionId` on every `action_accepted` event; because there are no production users, old beta event logs can be reset instead of migrated.

Player credentials live outside the event stream in private server-side credential records keyed by `gameId + seat`. Those records store token hashes, not raw invite tokens. Because the app has no production users, incompatible beta data can be reset rather than migrated.

Unsupported event schema versions must fail replay loudly. Silent partial replay is not allowed.

Accepted action events include a required `clientActionId`. Clients send this id with each action message, and the server persists it on the corresponding `action_accepted` event. For a given game and player, retrying the same `clientActionId` with the same action is idempotent and must not append another action event; if the clock has expired, the retry may still trigger timeout adjudication and return the current terminal snapshot. Reusing the same id with a different action is rejected as `duplicate_action` unless server timeout adjudication has already ended the game. The PostgreSQL store enforces a unique accepted-action index over `game_id + playerColor + clientActionId`.

Visibility changes are also durable `OnlineGameEvent` entries: `visibility_changed` stores `gameId` and `visibility`. Player-controlled visibility is currently limited to `public` and `unlisted`; `private` remains reserved until active spectator sockets can be reauthorized or disconnected. Visibility events do not carry or advance a gameplay version. Room replay validates that the game exists and then ignores these events, while summary projection updates `visibility`, `updatedAt`, and `lastEventId`.

## Online Protocol Envelope

The current WebSocket and REST snapshot protocol is version 1. Every WebSocket client message, WebSocket server message, and REST body that contains a snapshot must include:

- `protocolVersion: 1`

Version 1 WebSocket client messages are `join`, `spectate`, `action`, and `ping`. Version 1 WebSocket server messages are `joined`, `spectating`, `snapshot`, `rejected`, `error`, and `pong`.

`rejected` is action-scoped. It is only valid as the response to a player `action` message and must include the rejected action's `clientActionId`. Generic player, spectator, validation, authorization, persistence, and heartbeat failures use `error` instead. A spectator connection receiving `rejected` treats it as a protocol error because spectators never submit actions.

When a player receives `rejected` with a snapshot, the client applies the authoritative snapshot if it is newer, same-version fresher, or terminal. `stale_action` keeps the connection live and is presented as a resync outcome: the position has been updated from the server and the player may try again. `game_over` with a terminal snapshot moves the client to terminal and stops reconnecting. A late `rejected` frame for an action already settled by a newer broadcast is tolerated so same-player multi-tab races do not turn into protocol errors.

Because the app has no production users, old beta clients are not supported. Missing or unsupported protocol versions are rejected with a controlled `bad_request` error instead of being downgraded or guessed. REST snapshot reads also reject unversioned snapshot envelopes on the client before applying the snapshot.

## Client State Machine

Player and spectator hooks expose the same connection states. Pending action is an orthogonal player-only overlay, exposed as `isActionPending` while the connection status remains `connected`.

```mermaid
stateDiagram-v2
  state "connected + isActionPending" as connected_with_pending_action
  state "access-denied" as access_denied
  state "protocol-error" as protocol_error
  state "server-error" as server_error

  [*] --> idle
  idle --> connecting: online invite or spectator URL
  connecting --> connected: REST snapshot and socket join/spectate
  connecting --> terminal: REST snapshot or socket reports result
  connecting --> access_denied: not found or unauthorized
  connecting --> protocol_error: malformed or wrong-role message
  connecting --> server_error: server operation failure

  connected --> connected_with_pending_action: player sends action
  connected_with_pending_action --> connected: accepted snapshot or stale rejection with snapshot
  connected_with_pending_action --> terminal: terminal snapshot
  connected_with_pending_action --> disconnected: socket closes before confirmation
  connected_with_pending_action --> access_denied: authorization rejection
  connected_with_pending_action --> protocol_error: unexpected action rejection
  connected_with_pending_action --> server_error: non-access rejection or error

  connected --> disconnected: unexpected socket close
  disconnected --> resyncing: reconnect backoff expires
  resyncing --> connecting: REST snapshot is non-terminal or fetch fails
  resyncing --> terminal: REST snapshot is terminal

  connected --> terminal: terminal snapshot
  connected --> access_denied: access error
  connected --> protocol_error: malformed or wrong-role message
  connected --> server_error: server operation failure

  terminal --> [*]
  access_denied --> idle: user configures a new game
  protocol_error --> idle: user configures a new game
  server_error --> idle: user configures a new game
```

| State | Meaning | User action policy | Next transitions |
| --- | --- | --- | --- |
| `idle` | No online game is selected. | Local play is allowed. | `connecting` when an invite/spectator URL is opened. |
| `connecting` | REST snapshot or WebSocket join is in flight. | Online play controls are paused. | `connected`, `terminal`, `access-denied`, `protocol-error`, or `server-error`. |
| `connected` | The socket is live and snapshots are authoritative. | Player actions are allowed only for the side to move and only when no action is pending; spectators remain read-only. | `disconnected`, `terminal`, `server-error`, `access-denied`, or `protocol-error`. |
| `connected` with `isActionPending` | A player action has been sent and the browser is waiting for the server. This is not an `OnlineConnectionStatus`; it is a player-only overlay on `connected`. | Board clicks, pass, promotion, and resign are paused; the badge says `Waiting for server`. | A newer/terminal snapshot, matching `rejected`, `error`, or socket close clears the pending action. |
| `disconnected` | The live socket closed unexpectedly. | Online play controls are paused. | `resyncing` after reconnect backoff. |
| `resyncing` | The client is pulling a REST snapshot before reconnecting. | Online play controls are paused. | `connecting` for non-terminal snapshots or after a failed fetch attempt, and `terminal` for terminal snapshots. |
| `terminal` | The authoritative game result is known. | Play controls are disabled; analysis/new-game actions may be offered. | No automatic reconnect. |
| `access-denied` | The game or token is invalid or unavailable. | Show recovery actions such as `Configure New Game`. | User leaves the failed online URL or opens a valid invite. |
| `protocol-error` | The server sent malformed or wrong-role data. | Stop reconnecting; require reload/new game. | User leaves the failed online URL or reloads after a fixed deploy. |
| `server-error` | The server reported a non-access operational failure. | Stop reconnecting and show recovery actions. | User leaves the failed online URL or retries after server recovery. |

### Durable Public Read Model

`OnlineGameSummary` schema v3 is the public read-model boundary for lobby/archive-style features. It is token-free, rebuildable from the event log, and safe to return from unauthenticated public listing endpoints when `visibility === "public"`.

Summary payloads must include:

- `schemaVersion`
- `rulesetVersion`
- lifecycle timestamps and version
- `status`, `visibility`, and `archiveState`
- token-free participants and result
- `livePreview`: side to move, turn phase, move count, optional last move, optional clock snapshot, bounded board preview, and optional live spectator count
- `lastEventId`

`livePreview.spectatorCount` is response-only presence metadata. It is allowed only on active summaries, is omitted when the current count is zero or unknown, and must not be stored as durable archive/history data. In the current single-process deployment it is calculated from connected spectator WebSockets on the serving Node process; a future multi-instance deployment needs shared presence/pub-sub before the number can be global across all servers.

Public directory list responses wrap summaries in schema v1:

- `schemaVersion: 1`
- `games: OnlineGameSummary[]`
- optional `nextCursor`

`GET /api/online/games` accepts `state=active|archived|all`, `limit=1..100`, and an opaque `cursor`. It returns only public summaries. Token/auth/credential/api-key-looking query parameters or values are rejected instead of ignored, and public directory reads are lightly rate limited. `GET /api/online/games/:gameId/summary` returns one public summary or the same not-found shape for missing, private, or unlisted games.

Directory ordering is by recent public activity: `updatedAt DESC`, then `gameId ASC`. Cursors are opaque keyset cursors over that ordering; clients must not parse them or treat them as durable identifiers. Cursor payloads reject malformed or secret-looking game ids.

### Local Recent Replay Boundary

No-account recent online replays are a browser convenience, not durable account history and not an authorization mechanism. The local record stores only a game id, last-seen timestamp, player/spectator role, optional player seat, and active/complete status. For unlisted games, that game id is still a local replay locator because the current spectator policy allows anyone who knows the random id to view the game. It is not a bearer token, but it should not be treated as harmless public-history data. Local recent records must not store bearer tokens, challenge tokens, raw invite URLs, cookies, session ids, or spectator URLs.

Opening a recent replay must still go through the server's spectator snapshot policy. Public and unlisted games can be replayed only if that token-free spectator path is allowed; private games need a future authenticated replay endpoint or a token-safe credential design.

Once registered accounts exist, signed-in player history should be server-backed and attached to the account identity. Local recent replays may remain as an anonymous/offline fallback, but they must not be the source of truth for a signed-in user's archive.

## Identity Primitive

Online summaries support three identity kinds:

- `anonymous`: a generated per-game or temporary identity.
- `session`: a public, non-secret browser/session surrogate that can later back challenges without an account.
- `registered`: a future account identity with optional display name.

Game creation events may now carry `whiteIdentity` and `blackIdentity`. Accepted challenges and accepted open lobby listings bind those identities into the durable `game_created` event before the game summary is projected, so a rebuild preserves the same participants. Direct-created games currently use explicit generated anonymous identities for both seats.

Identity `id` values in public summaries are never authentication secrets. Do not put cookies, bearer tokens, raw private invite tokens, or server auth session ids in `OnlineIdentity.id`. Use a separate private credential table for authentication material.

The PostgreSQL store has a backend-only personal-history query that can find public, unlisted, and private summaries for a server-resolved identity. There is intentionally no public HTTP endpoint for this yet. Future account/session endpoints must derive the identity from the authenticated server session, not from a request body, query parameter, or browser-supplied session id.

## Challenge Lifecycle Contract

`OnlineChallengeEvent` schema v1 is the durable contract for direct challenges. The current private challenge HTTP routes, browser links, and materialized summaries are built on this contract; broader public lobby/open-seek behavior remains deferred until separate visibility and accept-policy contracts exist.

Challenge v1 is direct-only. Public/open seeks are deferred to a later contract because they need a different accept policy and lobby exposure model.

Challenge event envelope:

- `schemaVersion: 1`
- `eventId`
- `createdAt`

Challenge events:

- `challenge_created`: `challengeId`, `challengerIdentity`, `challengedIdentity`, `challengerSeat`, `visibility`, immutable `setup`, and `expiresAt`.
- `challenge_accepted`: `challengeId`, `acceptedBy`, `acceptedAt`, `gameId`, `whiteIdentity`, and `blackIdentity`.
- `challenge_declined`: `challengeId`, `declinedBy`, and `declinedAt`.
- `challenge_cancelled`: `challengeId`, `cancelledBy`, and `cancelledAt`.
- `challenge_expired`: `challengeId`, `expiredBy: "system"`, and `expiredAt`.

Challenge statuses are `pending`, `accepted`, `declined`, `cancelled`, and `expired`. Challenge visibility is currently `private` or `unlisted`; `public` is reserved for future open-seek/lobby work.

Projection applies events in stream order and validates the lifecycle:

- A challenge can be created once, and event ids must be unique across the projected stream.
- Self-challenges are invalid.
- `expiresAt` must be later than challenge creation.
- Acceptance and decline must be performed by the challenged identity.
- Cancellation must be performed by the challenger identity.
- Expiry is system-only.
- Terminal domain timestamps equal the event envelope `createdAt`.
- Accepted, declined, and cancelled timestamps must be at or after challenge creation and before expiry.
- Expired timestamps must be at or after expiry.
- Any event after a terminal state is invalid.

Accepted challenges persist the resolved seats. If `challengerSeat === "w"`, the challenger must be white and the challenged identity black. If `challengerSeat === "b"`, the challenger must be black and the challenged identity white. If `challengerSeat === "random"`, the accepted event is the durable source of the resolved seats, but the two seats must still be exactly the challenger and challenged identities.

Challenge authorization helpers compare identity by `kind + id`; registered display names are public presentation data and do not affect identity equality. Action helpers for accept, decline, and cancel are intended for server-resolved authenticated identities only. Future endpoints must derive that identity from the server session/account layer, never from a request body field supplied by the browser.

Durable challenge events must not contain bearer secrets. Validation rejects token/credential/session/auth/cookie-like fields recursively, bearer/auth/cookie-looking string values, raw invite URLs, and absolute or relative URL strings with token-bearing query parameters or fragments. As with game summaries, `OnlineIdentity.id` is a public non-secret surrogate; obvious bearer, cookie, session, auth, or token material is invalid.

Challenge setup terms are immutable. Accept endpoints must create the game from the `setup` stored in `challenge_created` and must reject any attempt to accept with different game terms.

### Challenge Persistence

Challenge events are persisted in the append-only `online_challenge_events` table. Challenge summaries are materialized in `online_challenge_summaries` and can be rebuilt from the challenge event stream. Challenge persistence uses its own row-lock table and advisory summary lock, separate from game summary locking, so challenge rebuilds do not block ordinary game action summary refreshes.

Appending a non-accepted challenge event validates and canonicalizes the event first, inserts it, projects the affected challenge summary, and upserts that summary inside one transaction. If summary refresh or projection fails, the event insert rolls back.

Challenge bearer credentials are stored separately from durable events in `online_challenge_credentials`. The table stores token hashes and normalized public identities keyed by `challenge_id + role`; raw challenge tokens are never stored. Challenge creation must go through `appendChallengeCreated` so `challenge_created`, credential rows, and the pending summary are written atomically. The low-level `appendChallengeEvent` path is limited to decline, cancel, and lazy/internal expiry events.

Accepting a challenge uses `acceptChallengeAndCreateGame`, a dedicated atomic store method. It locks the challenge and new game, verifies the challenged role, creates the online game event from the immutable challenge setup, derives white/black game credential hashes from the private challenge credential hashes, appends `challenge_accepted`, and refreshes both game and challenge summaries in one transaction. The original challenger/challenged challenge bearer tokens become the corresponding game bearer tokens after acceptance, which lets either side retrieve only its own game invite later without storing raw game tokens.

Browser challenge links put bearer material in the URL fragment, not the query string: `onlineChallenge` and `challengeRole` are query parameters, while `challengeToken` is a fragment parameter captured into `sessionStorage` and stripped from the visible URL before API calls. Challenge API routes authenticate only with `Authorization: Bearer`; query-token authentication is rejected.

## Visibility And Access

Visibility values:

- `private`: visible to players, a bound challenged user, moderators, and admins.
- `unlisted`: excluded from public lists; current private-beta spectator links are random-id links and can view these games if the id is known.
- `public`: visible in public lists and intended for ordinary spectator access.

Current created games project as `unlisted`. A player can publish or unlist a game through `PATCH /api/online/games/:gameId/visibility`, authorized by the same bearer player token used for snapshots. The route returns `protocolVersion: 1` and a token-free `OnlineGameSummary`; it fails closed if durable persistence is unavailable.

Role names:

- `white`
- `black`
- `spectator`
- `challenged`
- `moderator`
- `admin`

Summary listing and spectator authorization use `src/online/accessPolicy.ts`. Public listing returns only `public` summaries. Spectator access is allowed for `public` and `unlisted` games and denied for `private` games. If the server has a configured summary loader, missing or invalid summary data fails closed with the same public `not_found` response as a missing game. If no summary loader is configured, the current private-link beta keeps its allow-open spectator behavior so local/dev smoke flows still work.

The `challenged` role is provisional until challenge identity binding exists. It must only be assigned after a separate challenge/session/account binding check proves the requester is the bound challenged user. It is not a permission that can be inferred from an unauthenticated HTTP or WebSocket request.

Initial HTTP and WebSocket spectator joins are checked against the shared policy. Existing spectator sockets are not re-authorized on every broadcast. Before any future visibility change can make a game private mid-game, broadcasts must either revalidate spectator sockets or disconnect sockets that no longer satisfy the policy.

Server spectator authorization now prefers `loadGameSummary(gameId)` when the configured store exposes it, falling back to the older low-scale summary scan only in memory/dev configurations.

## Next Contract Changes

1. Add archive detail/search read models if the summary payload stops being enough for richer analysis pages.
2. Add a public account/session ownership layer before exposing account-bound personal history, account-bound private challenges, ratings, and moderation.
3. Revalidate or disconnect spectator sockets before allowing mid-game visibility changes to `private`.
