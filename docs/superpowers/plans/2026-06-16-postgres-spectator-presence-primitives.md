# PostgreSQL Spectator Presence Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostgreSQL-backed live spectator presence primitives for item 11 without enabling multi-instance deployment or changing the public client protocol.

**Architecture:** Create a focused `PostgresOnlineSpectatorPresenceStore` that owns the `online_spectator_presence` operational table and exposes register, refresh, remove, count, and cleanup methods. Keep it out of production wiring for this slice; the next slice can plug it into a PostgreSQL runtime coordinator and cross-node spectator count flow.

**Tech Stack:** TypeScript, PostgreSQL SQL through the existing lightweight `query(text, values)` pattern, Vitest.

---

## Source Documents

- Approved design: `docs/superpowers/specs/2026-06-15-multi-instance-online-runtime-design.md`
- Roadmap: `docs/online-multiplayer-plan.md`
- Current coordinator foundation: `src/online/server/onlineRuntimeCoordinator.ts`
- PostgreSQL store patterns: `src/online/server/PostgresOnlineGameStore.ts`
- Backup/restore policy: `scripts/deploy/postgres-online-backup.mjs`

## Scope

This slice implements only shared live spectator presence storage primitives.

In scope:

- Create `online_spectator_presence` schema with minimal non-secret columns.
- Register WebSocket spectator presence rows with `{ gameId, nodeId, connectionId, expiresAt }`.
- Refresh presence expiry for socket heartbeat/activity.
- Remove presence rows on socket close.
- Count only non-expired rows for a game.
- Delete expired rows.
- Validate node ids and generated connection ids through existing runtime-id helpers.
- Record in the roadmap that this is not multi-instance readiness and is not yet wired to production traffic.

Out of scope:

- Do not accept `CASTLES_DEPLOYMENT_MODE=multi-instance`.
- Do not wire this into `createOnlineHttpServer` yet.
- Do not add `LISTEN/NOTIFY`, snapshot fanout, room hydration, drain mode, or shared rate limits.
- Do not add live presence rows to backup/restore tables; they are operational TTL state, not durable game/account history.

## File Structure

- Create `src/online/server/PostgresOnlineSpectatorPresenceStore.ts`
  - Owns schema creation and PostgreSQL operations for live spectator presence.
- Create `src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts`
  - Uses a fake in-memory queryable that records SQL and simulates the table behavior.
- Modify `docs/online-multiplayer-plan.md`
  - Add item 11 sub-slice status and exact verification evidence.

## API Contract

```ts
export interface PostgresOnlineSpectatorPresenceStoreOptions {
  nodeId: string;
  queryable: PostgresQueryable;
  now?: () => number;
  presenceTtlMs?: number;
  connectionIdFactory?: () => string;
}

export interface PostgresSpectatorPresenceRegistration {
  gameId: string;
  nodeId: string;
  connectionId: string;
  expiresAt: string;
}
```

Methods:

```ts
registerSpectator(input: { gameId: string }): Promise<PostgresSpectatorPresenceRegistration>;
refreshSpectator(input: { gameId: string; connectionId: string }): Promise<PostgresSpectatorPresenceRegistration | null>;
removeSpectator(input: { gameId: string; connectionId: string }): Promise<void>;
countSpectators(gameId: string): Promise<number>;
cleanupExpiredSpectators(): Promise<number>;
ensureSchema(): Promise<void>;
```

## Task 1: Add Failing Presence Store Tests

**Files:**
- Create: `src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts`
- Dependency implemented in Task 2: `src/online/server/PostgresOnlineSpectatorPresenceStore.ts`

- [x] **Step 1: Write tests for schema, register/count, refresh, remove, cleanup, and secret hygiene**

Use a fake queryable with `query(text, values)` and an internal `presence` map keyed by `nodeId + "\0" + connectionId`.

Required tests:

```ts
it("creates the operational spectator presence table and indexes");
it("registers opaque spectator rows and counts only non-expired rows for a game");
it("refreshes only this node connection and extends expiry");
it("removes only this node connection");
it("cleans expired spectator rows");
it("rejects unsafe node ids and refuses secret-shaped connection ids");
```

- [x] **Step 2: Verify red**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts
```

Expected: fail with missing import for `../PostgresOnlineSpectatorPresenceStore`.

## Task 2: Implement PostgreSQL Spectator Presence Store

**Files:**
- Create: `src/online/server/PostgresOnlineSpectatorPresenceStore.ts`
- Test: `src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts`

- [x] **Step 1: Add the store implementation**

Implementation requirements:

- Use `normalizeRuntimeNodeId` from `onlineRuntimeCoordinator.ts`.
- Generate connection ids as `spectator_${randomBytes(9).toString("base64url")}` unless a test factory is supplied.
- Reject generated or supplied connection ids unless they match `/^spectator_[A-Za-z0-9_-]{12,64}$/`.
- Default TTL is `45_000` ms.
- Use ISO strings for `expires_at` values.
- `ensureSchema()` must be idempotent and memoized.
- Table columns:
  - `node_id TEXT NOT NULL`
  - `connection_id TEXT NOT NULL`
  - `game_id TEXT NOT NULL`
  - `expires_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - primary key `(node_id, connection_id)`
- Indexes:
  - `(game_id, expires_at)`
  - `(expires_at)`
- `countSpectators(gameId)` counts rows where `game_id = $1 AND expires_at > $2::timestamptz`.
- `cleanupExpiredSpectators()` deletes rows where `expires_at <= $1::timestamptz` and returns the affected row count.

- [x] **Step 2: Verify green**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

Run:

```powershell
git add src/online/server/PostgresOnlineSpectatorPresenceStore.ts src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts
git commit -m "Add PostgreSQL spectator presence store"
```

## Task 3: Roadmap, Verification, Review, Push

**Files:**
- Modify: `docs/online-multiplayer-plan.md`

- [x] **Step 1: Add roadmap evidence**

Add an item 11 bullet saying:

```md
   - PostgreSQL spectator-presence primitive sub-slice done on 2026-06-16: added the `PostgresOnlineSpectatorPresenceStore` and `online_spectator_presence` operational table contract for TTL-bound live WebSocket spectator rows. This is not wired into production traffic yet and does not make multi-instance mode acceptable; it is the shared-presence data primitive for the next coordinator wiring slice.
```

- [x] **Step 2: Run verification**

Run:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "spectator|runtime coordinator|PostgresOnlineSpectatorPresenceStore"
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all pass. Existing Vite chunk-size warnings are acceptable if unchanged.

- [x] **Step 3: Review**

Review scope:

```text
Review the PostgreSQL spectator presence primitive. Focus on token/secret hygiene, TTL semantics, count correctness, schema idempotence, backup/restore policy, and whether docs overstate multi-instance readiness.
```

Classify findings as `accept`, `reject`, `investigate`, or `defer`.

Review dispositions:

| Finding | Severity | Decision | Action |
|---|---|---|---|
| `ensureSchema()` memoized a rejected schema-creation promise after transient DDL failure. | major | accept | Added a red/green retry regression and reset `schemaReady` on schema creation failure. |
| Shared spectator counts will depend on app-node clocks if this store is wired as-is. | minor | defer | Resolve during coordinator wiring by choosing PostgreSQL-authoritative time or a documented/tested skew tolerance. |

Verification after review:

```powershell
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts -t "retries schema creation"
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts
npx vitest run src/online/server/__tests__/PostgresOnlineSpectatorPresenceStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts -t "spectator|runtime coordinator|PostgresOnlineSpectatorPresenceStore"
npm run build
npm run server:build
npm run audit
git diff --check
```

- [ ] **Step 4: Commit and push**

Run:

```powershell
git add docs/online-multiplayer-plan.md
git commit -m "Record PostgreSQL spectator presence primitive"
git push origin online-qa-closure:online-action-log
```

## Plan Self-Review

- Spec coverage: this covers the design's shared spectator presence primitive only. It does not cover fanout, room hydration, shared gates, drain, monitoring metadata, or two-instance tests.
- Placeholder scan: no implementation placeholders are intended.
- Type consistency: `PostgresOnlineSpectatorPresenceStore`, `PostgresSpectatorPresenceRegistration`, and `online_spectator_presence` are the canonical names for this slice.
