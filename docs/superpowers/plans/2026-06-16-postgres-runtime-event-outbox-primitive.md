# PostgreSQL Runtime Event Outbox Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PostgreSQL runtime event/outbox primitive for cross-node snapshot-change fanout hints without wiring production fanout or enabling multi-instance deployment.

**Architecture:** Create a focused `PostgresOnlineRuntimeEventStore` owning an operational `online_runtime_events` table. The table stores only routing metadata for `game_snapshot_changed` hints: id, event type, game id, room version, optional last event id, reason, source node id, and database creation time.

**Tech Stack:** TypeScript, PostgreSQL SQL through the existing lightweight `query(text, values)` pattern, Vitest.

---

## Source Documents

- Approved design: `docs/superpowers/specs/2026-06-15-multi-instance-online-runtime-design.md`
- Roadmap: `docs/online-multiplayer-plan.md`
- Runtime coordinator seam: `src/online/server/onlineRuntimeCoordinator.ts`
- Backup whitelist: `scripts/deploy/postgres-online-backup.mjs`

## Scope

This slice implements only the durable runtime-event primitive needed before fanout wiring.

In scope:

- Create `online_runtime_events` schema with operational routing columns only.
- Record `game_snapshot_changed` metadata after a future durable game change.
- List events after a cursor id, optionally excluding the current node.
- Cleanup old runtime events by timestamp.
- Validate runtime node id and event reason/type.
- Keep the table out of JSON backup/restore because it is replayable operational hint state, not game/account history.

Out of scope:

- Do not add PostgreSQL `LISTEN/NOTIFY`.
- Do not wire this store into `OnlineRuntimeCoordinator` yet.
- Do not broadcast to remote sockets.
- Do not hydrate or invalidate rooms from these events.
- Do not allow `CASTLES_DEPLOYMENT_MODE=multi-instance`.

## File Structure

- Create `src/online/server/PostgresOnlineRuntimeEventStore.ts`
  - Owns schema creation and PostgreSQL operations for runtime fanout hint events.
- Create `src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts`
  - Uses a fake queryable that simulates the operational table and database time.
- Modify `docs/online-multiplayer-plan.md`
  - Add item 11 sub-slice status and exact verification evidence.

## API Contract

```ts
export interface PostgresOnlineRuntimeEventStoreOptions {
  nodeId: string;
  queryable: PostgresQueryable;
}

export interface PostgresRuntimeGameSnapshotEvent {
  id: number;
  type: "game_snapshot_changed";
  gameId: string;
  roomVersion: number;
  lastEventId?: string;
  reason: OnlineRuntimeSnapshotReason;
  nodeId: string;
  createdAt: string;
}
```

Methods:

```ts
recordGameSnapshotChanged(input: {
  gameId: string;
  roomVersion: number;
  lastEventId?: string;
  reason: OnlineRuntimeSnapshotReason;
}): Promise<PostgresRuntimeGameSnapshotEvent>;

listGameSnapshotChangedEventsAfter(input: {
  afterId: number;
  limit: number;
  excludeNodeId?: string;
}): Promise<PostgresRuntimeGameSnapshotEvent[]>;

cleanupRuntimeEventsBefore(cutoffIso: string): Promise<number>;
ensureSchema(): Promise<void>;
```

## Task 1: Add Failing Runtime Event Store Tests

**Files:**
- Create: `src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts`
- Dependency implemented in Task 2: `src/online/server/PostgresOnlineRuntimeEventStore.ts`

- [x] **Step 1: Write tests for schema, record/list, cleanup, validation, and secret hygiene**

Required tests:

```ts
it("creates the operational runtime events table and indexes");
it("records snapshot-change metadata using database time only");
it("lists snapshot-change events after a cursor while excluding the current node");
it("cleans old runtime events by timestamp");
it("rejects unsafe node ids, unsupported reasons, invalid cursor limits, and malformed rows");
```

The fake queryable should record SQL text, simulate `created_at` from `databaseNowMs`, and throw on unexpected SQL.

- [x] **Step 2: Verify red**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts
```

Expected: fail with missing import for `../PostgresOnlineRuntimeEventStore`.

## Task 2: Implement Runtime Event Store

**Files:**
- Create: `src/online/server/PostgresOnlineRuntimeEventStore.ts`
- Test: `src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts`

- [x] **Step 1: Add the store implementation**

Implementation requirements:

- Use `normalizeRuntimeNodeId` from `onlineRuntimeCoordinator.ts`.
- Accept only current `OnlineRuntimeSnapshotReason` values: `action`, `timeout`, `visibility`, `challenge`, `open_seek`, `snapshot`.
- Validate `roomVersion` as a non-negative safe integer.
- Validate `afterId` as a non-negative safe integer.
- Validate `limit` as a safe integer from 1 through 500.
- Use PostgreSQL `now()` for `created_at`.
- Use `ensureSchema()` with retry-after-failure behavior.
- Table columns:
  - `id BIGSERIAL PRIMARY KEY`
  - `event_type TEXT NOT NULL`
  - `game_id TEXT NOT NULL`
  - `room_version INTEGER NOT NULL`
  - `last_event_id TEXT`
  - `reason TEXT NOT NULL`
  - `node_id TEXT NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Indexes:
  - `(event_type, id)`
  - `(game_id, id)`
  - `(created_at)`

- [x] **Step 2: Verify green**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts
```

Expected: pass.

## Task 3: Roadmap, Verification, Review, Push

**Files:**
- Modify: `docs/online-multiplayer-plan.md`

- [x] **Step 1: Add roadmap evidence**

Record that `online_runtime_events` is an operational outbox/hint primitive only, is not in production fanout yet, and remains excluded from JSON backup/restore.

- [x] **Step 2: Run verification**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime event|snapshot|coordinator"
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all pass. Existing Vite large-chunk warnings are acceptable if unchanged.

- [x] **Step 3: Review**

Review scope:

```text
Review the PostgreSQL runtime event/outbox primitive. Focus on whether it stores only routing metadata, whether event ordering/cursor semantics are correct, whether it avoids token/secret-bearing data, whether backup/restore omission is correct, and whether docs avoid claiming fanout or multi-instance readiness.
```

Classify findings as `accept`, `reject`, `investigate`, or `defer`.

Review dispositions:

| Finding | Severity | Decision | Action |
|---|---|---|---|
| Real PostgreSQL `BIGSERIAL` ids are returned as strings by node-postgres and would fail numeric validation. | blocking | accept | Added string-id regression and safe decimal-string parsing for event ids. |
| Secret hygiene was only column-level; `gameId` and `lastEventId` could still carry token-looking strings. | major | accept | Added negative tests and rejected durable-secret-looking game ids / last event ids before persistence. |
| Excluding current-node rows made cursor advancement ambiguous when only own rows were returned. | major | investigate | Changed listing to return `{ events, nextAfterId }`, advancing the high-water cursor over fetched own-node rows while filtering them from returned events. |
| Roadmap evidence appeared incomplete. | minor | defer | Roadmap was already updated locally after the reviewer snapshot; final roadmap now records this slice precisely. |

Additional review-driven verification:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts
```

- [x] **Step 4: Commit and push**

Run:

```powershell
git add src/online/server/PostgresOnlineRuntimeEventStore.ts src/online/server/__tests__/PostgresOnlineRuntimeEventStore.test.ts docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-postgres-runtime-event-outbox-primitive.md
git commit -m "Add PostgreSQL runtime event outbox primitive"
git push origin online-qa-closure:online-action-log
```

## Plan Self-Review

- Spec coverage: this covers the runtime event/outbox primitive only. It does not implement fanout, notifications, room hydration, shared gates, drain, monitoring metadata, or two-instance tests.
- Placeholder scan: no placeholders are intended.
- Type consistency: `PostgresOnlineRuntimeEventStore`, `PostgresRuntimeGameSnapshotEvent`, and `online_runtime_events` are the canonical names for this slice.
