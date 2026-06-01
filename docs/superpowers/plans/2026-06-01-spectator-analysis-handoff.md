# Phase 6C: Spectator Analysis Handoff

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make online spectator and completed online games easy to move into local analysis/replay without carrying online connection state.

**Architecture:** Keep the online session as the live source of truth until the user explicitly opens analysis. Pass a coherent current/displayed board state into the existing `App.onLoadGame` cleanup path, expose the action in the sidebar, and prune sparse online move trees instead of offering broken replay navigation.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Playwright browser smoke.

---

## Context

- Phase 6B added Watch and Online Archive with token-free spectator URLs.
- `App.handleLoadGame` already clears online join/spectator/challenge state and loads PGN imports as analysis mode.
- `Game.handleEnterAnalysis` previously performed a PGN reload and the visible entry point was buried in the hamburger menu.
- The stale `onEnableAnalysis` prop from `App` into `Game` has been removed; `Game` uses `onLoadGame` for analysis handoff so `App` can clear online state in one place.

## Task Checklist

- [x] Add coverage proving online spectator analysis handoff clears `onlineGame`, `view`, tokens, challenge params, URL hash, and removes `onlineSession`.
- [x] Add a failing `ControlPanel` test proving read-only/completed online sessions expose a visible `Analysis` action in the Save and review section.
- [x] Implement the minimal `ControlPanel` prop/action and wire it from `Game` only when analysis is useful and not already active.
- [x] Replace the PGN round-trip handoff with a direct current-state handoff so online analysis does not depend on incomplete snapshot history.
- [x] Clear query `challengeToken` along with hash challenge tokens during analysis and new-game cleanup.
- [x] Ignore late spectator WebSocket frames after the online spectator hook is cleared.
- [x] Use coherent viewed history state from `GameProvider` and prune sparse online move trees to current-position analysis.
- [x] Keep play controls disabled for spectators and terminal games, but keep move history navigation available.
- [x] Update Phase 6 docs to mark this handoff as implemented and list remaining spectator/archive/lobby work.
- [ ] Run focused tests, then full tests/build/server build and browser smoke.
- [ ] Run reviewer passes for spec compliance and code/UX quality; fix Critical/Important findings before committing.
- [ ] Commit and push.

## Acceptance Criteria

- Spectators and completed online games can see an `Analysis` button without opening the hamburger menu.
- Clicking `Analysis` remounts the board in local analysis mode.
- The browser URL no longer contains online player, spectator, challenge, PGN, game, token, or fragment state after the handoff.
- The new analysis board has no `onlineSession`, so it does not reconnect or show player/spectator badges.
- Existing online create/join/spectate/browser smoke checks still pass.
