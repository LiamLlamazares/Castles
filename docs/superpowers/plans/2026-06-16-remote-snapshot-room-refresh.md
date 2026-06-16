# Remote Snapshot Hint Room Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and TDD. Keep `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected until the full item 11 readiness gate is met.

**Goal:** Advance item 11 by making the HTTP/WebSocket server respond to remote runtime `game_snapshot_changed` hints with store-authoritative warm-room refresh and local socket broadcast.

**Architecture:** Runtime events remain hints. On a remote snapshot hint, the server must load the authoritative `OnlineGameRoomRecord` from the durable store before replacing local warm state or broadcasting. If the durable record is missing, stale, or cannot be loaded, the server must not broadcast a local snapshot. This slice adds the minimal room-record load contract needed for this server behavior, but does not wire production to a PostgreSQL runtime-event coordinator, does not enable `CASTLES_DEPLOYMENT_MODE=multi-instance`, does not add `LISTEN/NOTIFY`, and does not claim complete cross-node readiness.

**Source of truth:** `docs/superpowers/specs/2026-06-15-multi-instance-online-runtime-design.md`, Warm Room State. This slice advances the “Receiving a snapshot event invalidates or replaces the local warm room if the event `roomVersion` or `lastEventId` is newer than the local copy” requirement for server-local subscribers.

---

### Task 1: Store Loader Contract

Status: done on 2026-06-16.

**Files:**
- Modify: `src/online/server/OnlineGameStore.ts`
- Modify: `src/online/server/PostgresOnlineGameStore.ts`
- Modify: `src/online/server/__tests__/PostgresOnlineGameStore.test.ts`
- Modify: `server/index.ts`

- [x] **Step 1: Add failing store test**

Add a `PostgresOnlineGameStore` test proving `loadGameRoomRecord(gameId)` returns exactly one current room record for an existing game and `null` for a missing game.

- [x] **Step 2: Verify red**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineGameStore.test.ts -t "loadGameRoomRecord"
```

Expected and observed: failed because `loadGameRoomRecord` did not exist.

- [x] **Step 3: Implement minimal loader**

Add `loadGameRoomRecord(gameId)` to `OnlineGameStore` and `PostgresOnlineGameStore`. Use current event projection plus credentials for that game only. Do not add legacy fallback behavior.

- [x] **Step 4: Wire production option**

Pass `loadGameRoomRecord: (gameId) => store.loadGameRoomRecord(gameId)` from `server/index.ts` into `createOnlineHttpServer`.

### Task 2: Remote Hint Server Behavior

Status: done on 2026-06-16.

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Add failing server tests**

Add tests proving:

- remote runtime hint loads the durable record, replaces a stale warm room, and broadcasts the authoritative snapshot to local sockets for that game;
- stale or equal-version remote hints do not load or broadcast;
- loader failure logs `online.runtime.remote_snapshot` failure and does not broadcast a stale local snapshot.

- [x] **Step 2: Verify red**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "remote snapshot hint|remote runtime snapshot"
```

Expected and observed: failed because the server did not subscribe to runtime snapshot hints.

- [x] **Step 3: Implement remote hint handler**

Add `loadGameRoomRecord?: (gameId: string) => OnlineGameRoomRecord | null | Promise<OnlineGameRoomRecord | null>` to `CreateOnlineHttpServerOptions`.

Subscribe to `runtimeCoordinator.subscribeGameSnapshotChanged` and, for events from another node:

- run under `enqueueGameAction(event.gameId, ...)`;
- ignore events when no local sockets are connected to the game;
- ignore events whose `roomVersion` is not newer than the current warm room version;
- require `loadGameRoomRecord`; without it, log and return without broadcast;
- load the durable record, require `record.gameId === event.gameId`, require loaded snapshot version is at least `event.roomVersion`, replace the warm room, disconnect stale player sockets, and broadcast the loaded snapshot to local sockets.

### Task 3: Roadmap, Review, Verification, Commit

Status: done on 2026-06-16 except commit/push, which is performed after this file and the roadmap are staged.

**Files:**
- Modify: `docs/online-multiplayer-plan.md`

- [x] **Step 1: Update roadmap**

Record this as a completed item 11 sub-slice only after review and verification pass, including exact commands and non-goals.

- [x] **Step 2: Review**

Run code review focused on store authority, no stale local broadcast on loader failure, socket/token hygiene, current-node filtering, operation-gate ordering, and avoiding multi-instance overclaiming. Classify findings before applying changes.

Review dispositions:

- Accepted and fixed: add fail-closed branch coverage for missing loader, null record, mismatched record, stale loaded record, same-node hints, and no-local-socket hints.
- Accepted and fixed: extend the PostgreSQL room loader test to prove current projection after an accepted action and additional seat credential rows.
- Accepted and fixed: wrap remote room replacement/broadcast failures with `online.runtime.remote_snapshot` failure logging so invalid returned records fail closed without rejecting runtime publication.
- Ledger: appended a micro-reflection to `codex-research-skills/cognitive_ledger.md` for the safety-branch undercoverage pattern.

- [x] **Step 3: Final verification**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

No browser screenshot is required unless UI-visible behavior changes beyond existing socket snapshots.

Observed verification:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineGameStore.test.ts -t "loadGameRoomRecord"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "remote runtime snapshot hints|remote snapshot hint"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "unsafe remote runtime snapshot|same-node and disconnected-game|invalid remote room refresh"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

Results: all commands passed. `npm run build` retained the existing large-chunk warning, and `git diff --check` retained CRLF conversion warnings only.

- [ ] **Step 4: Commit and push**

Run:

```bash
git status --short
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-remote-snapshot-room-refresh.md src/online/server/OnlineGameStore.ts src/online/server/PostgresOnlineGameStore.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/createOnlineHttpServer.test.ts server/index.ts
git commit -m "Refresh rooms from remote runtime snapshots"
git push origin HEAD:online-action-log
```
