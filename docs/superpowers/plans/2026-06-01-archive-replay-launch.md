# Phase 6D: Archive Replay Launch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make completed Online Archive rows open local analysis/replay directly instead of first joining the spectator WebSocket flow.

**Architecture:** Keep live Watch rows on the existing spectator URL path. Add a separate archive replay callback that fetches a single public spectator snapshot, rebuilds the best available analysis state from the snapshot/setup/history, clears online URL/session state, and remounts `Game` in analysis mode.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing online REST snapshot contract.

---

## Task Checklist

- [x] Add `OnlineGameBrowser` coverage proving active games call `onSpectate` and archived games call `onReplay`.
- [x] Add `App` coverage proving archive replay fetches `/api/online/games/:id/spectator`, does not enter spectator mode, clears online/challenge URL state, and remounts local analysis.
- [x] Implement `onReplay` in `OnlineGameBrowser` with clear labels: `Spectate` for live rows, `Analyze Replay` for archived rows.
- [x] Implement `handleReplayOnlineGame` in `App`, reusing snapshot hydration and online-state cleanup.
- [x] Prefer replay-built PGN analysis from snapshot setup plus move history; fall back to current-position analysis if replay import fails.
- [x] Update docs to mark archive-first analysis launch complete and leave broader archive search/lobby work deferred.
- [x] Run focused tests, full tests/build/server build, browser smoke/manual archive replay check, reviewer pass, then commit and push.

## Acceptance Criteria

- Clicking an active Watch row still enters `?onlineGame=<id>&view=spectator`.
- Clicking a completed Online Archive row does not set `onlineSpectator` or attach a WebSocket.
- Archive replay clears online/challenge/token/shared-game URL state and opens local analysis mode.
- Archived rows no longer label a spectator handoff as a replay.
