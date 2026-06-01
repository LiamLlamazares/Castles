# Online Data Contract

Last refreshed: 2026-06-01

This document records the current contract decisions for online multiplayer. The app still has no production users, so incompatible beta data can be reset instead of migrated.

## Durability Classes

### Disposable Beta Events

`OnlineGameEvent` schema v1 is a private-beta event stream. It is valid for the current single-node beta, but it is not a permanent public contract because `game_created` still contains bearer invite tokens.

Before public launch, either:

- replace v1 with a token-free event schema and reset the beta database, or
- write an explicit one-time migration that extracts credentials from events and deletes raw token payloads.

Unsupported event schema versions must fail replay loudly. Silent partial replay is not allowed.

### Durable Public Read Model

`OnlineGameSummary` schema v1 is the public read-model boundary for lobby/archive-style features. It is token-free, rebuildable from the event log, and safe to return from unauthenticated public listing endpoints when `visibility === "public"`.

Summary payloads must include:

- `schemaVersion`
- `rulesetVersion`
- lifecycle timestamps and version
- `status`, `visibility`, and `archiveState`
- token-free participants and result
- `lastEventId`

## Identity Primitive

Online summaries support three identity kinds:

- `anonymous`: a generated per-game or temporary identity.
- `session`: a public, non-secret browser/session surrogate that can later back challenges without an account.
- `registered`: a future account identity with optional display name.

Current game creation still projects anonymous identities only. Session and registered identities are accepted by the summary validator so the read-model shape does not need to change when those systems arrive.

Identity `id` values in public summaries are never authentication secrets. Do not put cookies, bearer tokens, raw private invite tokens, or server auth session ids in `OnlineIdentity.id`. Use a separate private credential table for authentication material.

## Visibility And Access

Visibility values:

- `private`: visible to players, a bound challenged user, moderators, and admins.
- `unlisted`: excluded from public lists; current private-beta spectator links are random-id links and can view these games if the id is known.
- `public`: visible in public lists and intended for ordinary spectator access.

Current created games project as `unlisted`. A future `visibility_changed` or challenge/lobby event must be added before real public lobby entries exist.

Role names:

- `white`
- `black`
- `spectator`
- `challenged`
- `moderator`
- `admin`

The current access helper is a contract helper, not complete authorization. Current REST and WebSocket spectator routes still use random-id access and do not enforce summary visibility. Before private challenges or public lobby launch, those paths must enforce a shared access-policy module against visibility and identity binding.

## Next Contract Changes

1. Move raw player credentials out of durable game events.
2. Add credential records keyed by `gameId + seat`, storing token hashes rather than raw tokens.
3. Add idempotency primitives such as `clientActionId` for retry-safe action submission.
4. Add durable challenge and visibility lifecycle events before public lobby/challenge UI.
