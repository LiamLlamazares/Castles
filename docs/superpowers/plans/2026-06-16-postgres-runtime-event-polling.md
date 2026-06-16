# PostgreSQL Runtime Event Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use TDD for every behavior change.

**Goal:** Add an unwired PostgreSQL runtime-event polling primitive that lets a node consume durable remote `game_snapshot_changed` hints from the existing outbox and fan them out to local coordinator subscribers without enabling multi-instance mode.

**Architecture:** Keep `createConfiguredRuntimeCoordinator()` on the single-node coordinator. Extend the runtime coordinator seam with a conservative polling method. The PostgreSQL-backed coordinator tracks an in-memory cursor, lists events after that cursor while excluding the current node, publishes remote hints only to local subscribers, and advances the cursor to the store-provided high-water id. Events remain hints; this slice does not hydrate or invalidate rooms, does not broadcast snapshots to sockets from remote events, does not add `LISTEN/NOTIFY`, and does not make `CASTLES_DEPLOYMENT_MODE=multi-instance` acceptable.

**Source of truth:** `docs/superpowers/specs/2026-06-15-multi-instance-online-runtime-design.md`, rollout steps 4 and 5. This slice advances step 4 only; step 5 room hydration/invalidation remains next.

---

### Task 1: Polling Contract Tests

**Files:**
- Modify: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`

- [x] **Step 1: Write failing tests**

Add tests proving:

- a PostgreSQL runtime-event coordinator polls remote outbox events after its cursor, excludes its own node id, and fans remote hints out to local subscribers without re-recording them;
- the cursor advances past own-node rows using the store's `nextAfterId`, so the poller does not rescan its own publications forever;
- the cursor does not advance if local subscriber fanout fails, so a transient local failure can retry the same remote hint.

- [x] **Step 2: Verify red**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "remote runtime event polling|runtime event cursor"
```

Expected: fail because the coordinator has no remote event polling method.

### Task 2: Minimal Polling Primitive

**Files:**
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`

- [x] **Step 1: Extend types conservatively**

Add:

- `OnlineRuntimeStoredGameSnapshotChangedEvent`
- `OnlineRuntimeEventPollResult`
- `OnlineRuntimeEventStore.listGameSnapshotChangedEventsAfter`
- `OnlineRuntimeCoordinator.pollRemoteGameSnapshotChangedEvents`

The single-node coordinator returns a no-op result and keeps capabilities unchanged.

- [x] **Step 2: Implement PostgreSQL wrapper polling**

In `createPostgresRuntimeEventCoordinator`:

- keep an in-memory `runtimeEventCursor`, initialized to `0`;
- validate poll limits to the same `1..500` range as the store;
- call `runtimeEventStore.listGameSnapshotChangedEventsAfter({ afterId: runtimeEventCursor, limit, excludeNodeId: nodeId })`;
- fan out each returned remote hint through the local coordinator only;
- do not call `recordGameSnapshotChanged` for remote events;
- update `runtimeEventCursor = nextAfterId` only after local fanout completes.

- [x] **Step 3: Verify green**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "remote runtime event polling|runtime event cursor|Postgres runtime event coordinator"
```

Expected: pass.

### Task 3: Roadmap, Review, Verification, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`

- [x] **Step 1: Update roadmap**

Record the polling primitive as a completed item 11 sub-slice only after tests and review pass. Explicitly record non-goals: no production multi-instance enablement, no room hydration/invalidation, no socket broadcast from remote hints, no `LISTEN/NOTIFY`.

- [x] **Step 2: Review**

Run code review focused on cursor semantics, failure/retry behavior, own-node filtering, token hygiene, and avoiding multi-instance overclaiming. Classify findings as accept/reject/investigate/defer before applying changes.

Review disposition: accepted/investigated the single-flight finding. The first implementation allowed overlapping poll calls to list from the same cursor and fan out the same remote hint twice. Added a red/green concurrent polling regression and a single-flight guard so overlapping calls share one in-flight poll. Cursor advancement still happens only after local subscriber fanout succeeds.

- [x] **Step 3: Final verification**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

No browser screenshot is required because this is backend/runtime plumbing with no user-facing UI.

- [x] **Step 4: Commit and push**

Run:

```bash
git status --short
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-postgres-runtime-event-polling.md src/online/server/onlineRuntimeCoordinator.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts
git commit -m "Add runtime event polling primitive"
git push origin HEAD:online-action-log
```
