# Game Visibility Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` plus `superpowers:test-driven-development`. Run reviewer passes before commit.

**Goal:** Add a durable visibility lifecycle for online games so players can deliberately publish an unlisted game to Watch/Online Archive and later return it to unlisted, without editing materialized summaries directly.

**Scope:** Public/unlisted player controls only. `private` remains a reserved visibility state until spectator socket reauthorization/disconnect behavior is implemented for active private transitions.

## Tasks

- [x] Add failing event/read-model tests for a `visibility_changed` game event that projects `visibility`, `updatedAt`, and `lastEventId` without changing gameplay version.
- [x] Add failing store tests proving visibility events are appended inside the per-game transaction, refresh summaries atomically, and return the refreshed summary.
- [x] Add failing HTTP/client tests for `PATCH /api/online/games/:gameId/visibility` using bearer player credentials, rejecting spectators/missing persistence/invalid visibility, and returning the protocol version plus summary.
- [x] Add failing UI tests for an online player visibility control that publishes/unpublishes the current game with in-app feedback and without exposing bearer tokens.
- [x] Implement event validation, projection, store method, server route, client helper, and player UI control.
- [x] Update `online-data-contract.md`, `online-multiplayer-plan.md`, and the UI checklist with the implemented visibility boundary and remaining private-visibility socket work.
- [x] Run focused tests, reviewer pass, full tests/build/server build, online browser smoke, then commit and push.

## Acceptance

- Public lists still return only `visibility: "public"` summaries.
- Created games still default to `unlisted`.
- Publishing/unpublishing is append-only and rebuildable from the event log.
- Gameplay room replay remains unaffected by visibility-only events.
- Player bearer tokens authorize visibility changes, but response bodies/logs never expose tokens.
