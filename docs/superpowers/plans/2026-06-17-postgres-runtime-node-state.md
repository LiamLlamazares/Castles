# PostgreSQL Runtime Node State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advance item 11 by adding the PostgreSQL runtime-node table primitive needed to persist node drain diagnostics.

**Architecture:** Add a `PostgresOnlineRuntimeNodeStore` that owns the `online_runtime_nodes` operational table and uses PostgreSQL `now()` for node start, heartbeat, and drain timestamps. Add a runtime-coordinator wrapper seam that delegates `getDrainState(...)` and `startDrain(...)` to a supplied node store, while keeping production wiring and `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected until a later reviewed slice.

**Tech Stack:** TypeScript, Vitest, existing PostgreSQL store patterns, `onlineRuntimeCoordinator.ts`, `docs/online-multiplayer-plan.md`.

---

## Scope

- Add `src/online/server/PostgresOnlineRuntimeNodeStore.ts`.
- Add `src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts`.
- Add `OnlineRuntimeNodeStore` interface and `createPostgresRuntimeNodeCoordinator(...)` seam in `src/online/server/onlineRuntimeCoordinator.ts`.
- Add coordinator tests proving the wrapper delegates drain reads/writes.
- Update `docs/online-multiplayer-plan.md` with in-progress and final evidence.

## Non-Goals

- No production store-factory wiring yet.
- No `/api/health` persistent-node dependency yet.
- No startup heartbeat scheduler.
- No bounded forced WebSocket close timer.
- No production smoke.
- No `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement.
- No UI/screenshots.

## Files

- Create: `src/online/server/PostgresOnlineRuntimeNodeStore.ts`
- Create: `src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts`
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Modify: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`
- Modify: `docs/online-multiplayer-plan.md`
- Modify: this plan file

## Task 1: PostgreSQL Runtime Node Store

- [x] **Step 1: Write failing store tests**

Create `src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts` with tests for:

```ts
it("creates the runtime node table and indexes", async () => {
  const queryable = new FakePostgresRuntimeNodeQueryable();
  const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

  await store.ensureSchema();
  await store.ensureSchema();

  expect(queryable.queries.filter((query) =>
    /CREATE TABLE IF NOT EXISTS online_runtime_nodes/i.test(query.text)
  )).toHaveLength(1);
  expect(queryable.queries.some((query) =>
    /PRIMARY KEY \(node_id\)/i.test(compactSql(query.text))
  )).toBe(true);
  expect(queryable.queries.some((query) =>
    /online_runtime_nodes_last_seen_at_idx/i.test(query.text)
  )).toBe(true);
  expect(queryable.queries.some((query) =>
    /online_runtime_nodes_draining_idx/i.test(query.text)
  )).toBe(true);
});

it("records node startup with database time and clears stale drain state", async () => {
  const queryable = new FakePostgresRuntimeNodeQueryable();
  queryable.seed({
    node_id: "node-a",
    first_seen_at: "2026-06-16T00:00:00.000Z",
    last_seen_at: "2026-06-16T00:05:00.000Z",
    draining: true,
    drain_started_at: "2026-06-16T00:04:00.000Z",
    updated_at: "2026-06-16T00:05:00.000Z",
  });
  queryable.databaseNowMs = Date.parse("2026-06-17T10:00:00.000Z");
  const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

  const state = await store.recordNodeStarted();

  expect(state).toEqual({
    nodeId: "node-a",
    firstSeenAt: "2026-06-16T00:00:00.000Z",
    lastSeenAt: "2026-06-17T10:00:00.000Z",
    draining: false,
    drainStartedAt: undefined,
    updatedAt: "2026-06-17T10:00:00.000Z",
  });
  expect(JSON.stringify(queryable.nodes.get("node-a"))).not.toContain("token");
});

it("starts drain idempotently with database time and does not persist the reason", async () => {
  const queryable = new FakePostgresRuntimeNodeQueryable();
  queryable.databaseNowMs = Date.parse("2026-06-17T10:05:00.000Z");
  const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

  const first = await store.startDrain({ reason: "operator" });
  queryable.databaseNowMs = Date.parse("2026-06-17T10:06:00.000Z");
  const second = await store.startDrain({ reason: "Authorization: Bearer secret" });

  expect(first).toEqual({ draining: true, startedAt: "2026-06-17T10:05:00.000Z" });
  expect(second).toEqual({ draining: true, startedAt: "2026-06-17T10:05:00.000Z" });
  expect(JSON.stringify(queryable.nodes.get("node-a"))).not.toContain("operator");
  expect(JSON.stringify(queryable.nodes.get("node-a"))).not.toContain("secret");
});

it("returns false drain state for missing node rows", async () => {
  const queryable = new FakePostgresRuntimeNodeQueryable();
  const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

  await expect(store.getDrainState()).resolves.toEqual({ draining: false });
});

it("retries schema creation after a transient failure", async () => {
  const queryable = new FakePostgresRuntimeNodeQueryable();
  queryable.failNextSchema = true;
  const store = new PostgresOnlineRuntimeNodeStore({ nodeId: "node-a", queryable });

  await expect(store.ensureSchema()).rejects.toThrow(/schema unavailable/);
  await expect(store.ensureSchema()).resolves.toBeUndefined();
});

it("rejects unsafe node ids before querying", async () => {
  const queryable = new FakePostgresRuntimeNodeQueryable();

  expect(() => new PostgresOnlineRuntimeNodeStore({
    nodeId: "https://castles.example/?token=secret",
    queryable,
  })).toThrow(/CASTLES_NODE_ID/);
  expect(queryable.queries).toEqual([]);
});
```

The fake queryable should compact SQL, keep a `nodes` map keyed by `node_id`, model `now()` from `databaseNowMs`, and reject unexpected SQL.

- [x] **Step 2: Run the red store tests**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts
```

Expected: fail because the store file does not exist.

Observed: failed because `../PostgresOnlineRuntimeNodeStore` could not be resolved.

- [x] **Step 3: Implement the store**

Create `src/online/server/PostgresOnlineRuntimeNodeStore.ts`:

```ts
import { Pool } from "pg";
import {
  normalizeRuntimeNodeId,
  type OnlineRuntimeDrainState,
  type OnlineRuntimeStartDrainInput,
} from "./onlineRuntimeCoordinator";
import { resolvePostgresPoolMaxPerStore } from "./postgresPoolConfig";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
}

export interface PostgresOnlineRuntimeNodeStoreOptions {
  nodeId: string;
  connectionString?: string;
  poolMaxPerStore?: number;
  queryable?: PostgresQueryable;
  close?: () => Promise<void>;
}

export interface PostgresOnlineRuntimeNodeState {
  nodeId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  draining: boolean;
  drainStartedAt?: string;
  updatedAt: string;
}

const DEFAULT_POSTGRES_TIMEOUT_MS = 5_000;

function parseTimestamp(value: unknown, label: string): string {
  const date =
    typeof value === "string"
      ? new Date(value)
      : value instanceof Date
        ? value
        : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid PostgreSQL runtime node ${label}.`);
  }
  return date.toISOString();
}

function rowToNodeState(row: any): PostgresOnlineRuntimeNodeState {
  if (typeof row?.node_id !== "string" || typeof row.draining !== "boolean") {
    throw new Error("Invalid PostgreSQL runtime node row.");
  }
  return {
    nodeId: normalizeRuntimeNodeId(row.node_id),
    firstSeenAt: parseTimestamp(row.first_seen_at, "first_seen_at"),
    lastSeenAt: parseTimestamp(row.last_seen_at, "last_seen_at"),
    draining: row.draining,
    ...(row.drain_started_at ? { drainStartedAt: parseTimestamp(row.drain_started_at, "drain_started_at") } : {}),
    updatedAt: parseTimestamp(row.updated_at, "updated_at"),
  };
}

function drainStateFromNode(row: any | undefined): OnlineRuntimeDrainState {
  if (!row) return { draining: false };
  const state = rowToNodeState(row);
  return state.draining
    ? { draining: true, startedAt: state.drainStartedAt }
    : { draining: false };
}

export class PostgresOnlineRuntimeNodeStore {
  private readonly nodeId: string;
  private readonly queryable: PostgresQueryable;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineRuntimeNodeStoreOptions) {
    this.nodeId = normalizeRuntimeNodeId(options.nodeId);
    if (options.queryable) {
      this.queryable = options.queryable;
      this.closeConnection = options.close;
      return;
    }
    if (!options.connectionString) {
      throw new Error("PostgresOnlineRuntimeNodeStore requires a connectionString or queryable.");
    }
    const pool = new Pool({
      connectionString: options.connectionString,
      max: resolvePostgresPoolMaxPerStore(options.poolMaxPerStore),
      connectionTimeoutMillis: DEFAULT_POSTGRES_TIMEOUT_MS,
      query_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
      statement_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
    });
    this.queryable = pool;
    this.closeConnection = () => pool.end();
  }

  async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.createSchema().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });
    return this.schemaReady;
  }

  async recordNodeStarted(): Promise<PostgresOnlineRuntimeNodeState> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        INSERT INTO online_runtime_nodes (
          node_id,
          first_seen_at,
          last_seen_at,
          draining,
          drain_started_at,
          updated_at
        )
        VALUES ($1, now(), now(), false, NULL, now())
        ON CONFLICT (node_id) DO UPDATE
        SET
          last_seen_at = now(),
          draining = false,
          drain_started_at = NULL,
          updated_at = now()
        RETURNING node_id, first_seen_at, last_seen_at, draining, drain_started_at, updated_at
      `,
      [this.nodeId]
    );
    return rowToNodeState(result.rows[0]);
  }

  async getDrainState(): Promise<OnlineRuntimeDrainState> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        SELECT node_id, first_seen_at, last_seen_at, draining, drain_started_at, updated_at
        FROM online_runtime_nodes
        WHERE node_id = $1
      `,
      [this.nodeId]
    );
    return drainStateFromNode(result.rows[0]);
  }

  async startDrain(_input: OnlineRuntimeStartDrainInput = {}): Promise<OnlineRuntimeDrainState> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        INSERT INTO online_runtime_nodes (
          node_id,
          first_seen_at,
          last_seen_at,
          draining,
          drain_started_at,
          updated_at
        )
        VALUES ($1, now(), now(), true, now(), now())
        ON CONFLICT (node_id) DO UPDATE
        SET
          last_seen_at = now(),
          draining = true,
          drain_started_at = COALESCE(online_runtime_nodes.drain_started_at, now()),
          updated_at = now()
        RETURNING node_id, first_seen_at, last_seen_at, draining, drain_started_at, updated_at
      `,
      [this.nodeId]
    );
    return drainStateFromNode(result.rows[0]);
  }

  async close(): Promise<void> {
    await this.closeConnection?.();
  }

  private async createSchema(): Promise<void> {
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_runtime_nodes (
        node_id TEXT NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        draining BOOLEAN NOT NULL DEFAULT false,
        drain_started_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (node_id)
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_runtime_nodes_last_seen_at_idx
        ON online_runtime_nodes (last_seen_at)
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_runtime_nodes_draining_idx
        ON online_runtime_nodes (draining, drain_started_at)
    `);
  }
}
```

- [x] **Step 4: Run store tests green**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts
```

Expected: pass.

Observed:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts
```

Result: 6 passed.

## Task 2: Coordinator Seam

- [x] **Step 1: Write failing coordinator tests**

Add to `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`:

```ts
it("delegates drain state to a PostgreSQL runtime node store", async () => {
  const runtimeNodeStore = new FakeRuntimeNodeStore();
  runtimeNodeStore.drainState = { draining: true, startedAt: "2026-06-17T10:05:00.000Z" };
  const coordinator = createPostgresRuntimeNodeCoordinator({
    nodeId: "node-a",
    runtimeNodeStore,
  });

  await expect(coordinator.getDrainState()).resolves.toEqual({
    draining: true,
    startedAt: "2026-06-17T10:05:00.000Z",
  });
  await expect(coordinator.startDrain({ reason: "operator" })).resolves.toEqual({
    draining: true,
    startedAt: "2026-06-17T10:05:00.000Z",
  });
  expect(runtimeNodeStore.calls).toEqual([
    ["getDrainState"],
    ["startDrain", { reason: "operator" }],
  ]);
});
```

The fake store should implement `OnlineRuntimeNodeStore` with `calls` and `drainState`.

- [x] **Step 2: Run red coordinator test**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node"
```

Expected: fail because `OnlineRuntimeNodeStore` and `createPostgresRuntimeNodeCoordinator` do not exist.

Observed: failed with `TypeError: createPostgresRuntimeNodeCoordinator is not a function`.

- [x] **Step 3: Add interface and wrapper**

Modify `src/online/server/onlineRuntimeCoordinator.ts`:

```ts
export interface OnlineRuntimeNodeStore {
  recordNodeStarted?(): Promise<unknown>;
  getDrainState(): Promise<OnlineRuntimeDrainState>;
  startDrain(input?: OnlineRuntimeStartDrainInput): Promise<OnlineRuntimeDrainState>;
}
```

Add:

```ts
function withPostgresRuntimeNodeCoordinator(
  base: OnlineRuntimeCoordinator,
  runtimeNodeStore: OnlineRuntimeNodeStore
): OnlineRuntimeCoordinator {
  return {
    ...base,
    async getDrainState() {
      return runtimeNodeStore.getDrainState();
    },
    async startDrain(input = {}) {
      return runtimeNodeStore.startDrain(input);
    },
  };
}

export function createPostgresRuntimeNodeCoordinator(options: {
  nodeId: string;
  runtimeNodeStore: OnlineRuntimeNodeStore;
}): OnlineRuntimeCoordinator {
  return withPostgresRuntimeNodeCoordinator(
    createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId }),
    options.runtimeNodeStore
  );
}
```

Do not add the runtime-node store to `createPostgresCompositeRuntimeCoordinator(...)` in this slice unless production wiring is also being tested.

- [x] **Step 4: Run coordinator tests green**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node|drain"
```

Expected: pass.

Observed:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node"
```

Result: 1 passed, 28 skipped.

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node|PostgresOnlineRuntimeNodeStore"
```

Result: 7 passed, 28 skipped.

- [x] **Step 5: Add and pass review-driven stale drain timestamp regression**

Review found that an inconsistent row with `draining = false` but a non-null stale `drain_started_at` would preserve the old drain timestamp when starting a new drain. Added a regression that seeds that row shape and expects `startDrain(...)` to use the current PostgreSQL time for the new drain.

Observed red:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts -t "stale drain"
```

Result: failed with `startedAt: "2026-06-16T00:04:00.000Z"` instead of the new database time.

Fix: changed `startDrain(...)` SQL to preserve the prior `drain_started_at` only when the existing row is already `draining`; otherwise it writes `now()`.

Observed green:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts -t "stale drain"
```

Result: 2 passed, 5 skipped.

## Task 3: Roadmap, Review, Verification

- [ ] **Step 1: Update roadmap evidence**

Add an item 11 paragraph to `docs/online-multiplayer-plan.md` after the operator drain route paragraph. Mark it in progress before broad verification, then done after verification and review.

- [x] **Step 2: Run verification**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node|drain|PostgresOnlineRuntimeNodeStore"
npm run build
npm run server:build
npm run audit
git diff --check
```

If production wiring is not added, full `npx vitest run` is optional for this primitive slice but should be run before commit if touched shared coordinator types cause broader risk.

Observed verification before review fix:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node|drain|PostgresOnlineRuntimeNodeStore"
```

Result: 9 passed, 26 skipped.

```bash
npm run build
npm run server:build
npm run audit
git diff --check
```

Result: passed. `npm run build` emitted the existing Vite large-chunk warning. `git diff --check` emitted CRLF conversion warnings only.

Observed post-review focused verification:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node|drain|PostgresOnlineRuntimeNodeStore"
```

Result: 10 passed, 26 skipped.

```bash
npx vitest run
```

Result before the review fix: 136 files passed, 1 skipped; 1627 tests passed, 3 skipped.

Observed final verification after the review fix:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "runtime node|drain|PostgresOnlineRuntimeNodeStore"
```

Result: 10 passed, 26 skipped.

```bash
npx vitest run
```

Result: 136 files passed, 1 skipped; 1628 tests passed, 3 skipped.

```bash
npm run build
npm run server:build
npm run audit
git diff --check
```

Result: passed. `npm run build` emitted the existing Vite large-chunk warning. `git diff --check` emitted CRLF conversion warnings only.

- [x] **Step 3: Run code review and classify findings**

Review scope: DB-clock usage, row schema, reason/secret non-persistence, node-id validation, idempotent drain semantics, coordinator seam, and roadmap accuracy.

Review dispositions:

- Accept: stale `draining=false` row with non-null `drain_started_at` could preserve the old timestamp when starting a new drain. Fixed by changing SQL to preserve `drain_started_at` only when the existing row is already draining, plus a red/green regression.
- Accept: focused re-review reported no remaining issues.
- Defer: live PostgreSQL rehearsal, production wiring, health dependency, heartbeat scheduling, bounded forced socket close, and multi-instance enablement remain future item 11 slices.

- [x] **Step 4: Commit and push**

Run:

```bash
git status --short
git add src/online/server/PostgresOnlineRuntimeNodeStore.ts src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts src/online/server/onlineRuntimeCoordinator.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-17-postgres-runtime-node-state.md
git commit -m "Add PostgreSQL runtime node state store"
git push
```

Observed: committed on `master` with message `Add PostgreSQL runtime node state store` and pushed to `origin/master`.

## Status

- Slice selected: item 11 persistent runtime-node drain rows.
- Implementation status: runtime-node store and coordinator seam implemented; review finding fixed; final verification and re-review passed; committed and pushed.
