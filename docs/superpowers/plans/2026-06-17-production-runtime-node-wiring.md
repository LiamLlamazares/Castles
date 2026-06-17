# Production Runtime Node Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the PostgreSQL runtime-node state primitive into production store creation, coordinator drain state, startup node registration, and lifecycle cleanup while keeping multi-instance deployment rejected.

**Architecture:** Extend the existing PostgreSQL store bundle with `PostgresOnlineRuntimeNodeStore`, pass it into `createConfiguredRuntimeCoordinator(...)`, and call `recordNodeStarted()` during production startup before runtime maintenance. Keep `/api/health` using the existing coordinator `getDrainState()` path, so production health starts reading drain state from the runtime-node store once wired.

**Tech Stack:** TypeScript, Vitest, `createOnlineGameStoreFromEnv`, `server/runtimeCoordinator.ts`, `server/index.ts`, `server/check-config.ts`, `docs/online-multiplayer-plan.md`.

---

## Scope

- Add `runtimeNodeStore` to the configured PostgreSQL store bundle.
- Pass `runtimeNodeStore` into the production runtime coordinator.
- Compose `runtimeNodeStore` in `createPostgresCompositeRuntimeCoordinator(...)`.
- Call `runtimeNodeStore.recordNodeStarted()` during production startup before startup maintenance and service creation.
- Close `runtimeNodeStore` during normal shutdown, startup failure, and `server:check-config`.
- Update roadmap and this slice plan with evidence.

## Non-Goals

- No heartbeat scheduler.
- No live PostgreSQL smoke/rehearsal.
- No bounded forced socket close timer.
- No `CASTLES_DEPLOYMENT_MODE=multi-instance` enablement.
- No UI/screenshots.

## Files

- Modify: `src/online/server/createOnlineGameStore.ts`
- Modify: `src/online/server/__tests__/createOnlineGameStore.test.ts`
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Modify: `server/runtimeCoordinator.ts`
- Modify: `server/__tests__/runtime-coordinator.test.ts`
- Modify: `server/index.ts`
- Modify: `server/__tests__/server-index-runtime.test.ts`
- Modify: `server/check-config.ts`
- Modify: `server/__tests__/check-config.test.ts`
- Modify: `docs/online-multiplayer-plan.md`
- Modify: this plan file

## Task 1: Store Factory Wiring

- [x] **Step 1: Add failing store factory assertions**

Update `src/online/server/__tests__/createOnlineGameStore.test.ts` to import `PostgresOnlineRuntimeNodeStore`, expect `configured.runtimeNodeStore` to be an instance, construct it in the direct store pool test, include pool max rejection, and update pool option counts from 7 to 8.

- [x] **Step 2: Run red store factory test**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineGameStore.test.ts -t "PostgreSQL store|pool max|runtime node"
```

Expected: fail because `runtimeNodeStore` is not in the configured bundle.

- [x] **Step 3: Implement store factory wiring**

Modify `src/online/server/createOnlineGameStore.ts` to import `PostgresOnlineRuntimeNodeStore`, add `runtimeNodeStore` to `ConfiguredOnlineGameStore`, and construct it with the validated connection string, parsed runtime node id, and pool max.

- [x] **Step 4: Run store factory test green**

Run the same command and expect pass.

## Task 2: Runtime Coordinator Wiring

- [x] **Step 1: Add failing coordinator composition assertions**

Update `server/__tests__/runtime-coordinator.test.ts` with a fake runtime-node store and prove `createConfiguredRuntimeCoordinator(...)` delegates `getDrainState()` and `startDrain(...)` to it while preserving `mode: "single-node"`.

- [x] **Step 2: Run red coordinator test**

Run:

```bash
npx vitest run server/__tests__/runtime-coordinator.test.ts -t "runtime node|composes all"
```

Expected: fail because `createConfiguredRuntimeCoordinator(...)` does not accept or pass `runtimeNodeStore`.

- [x] **Step 3: Implement coordinator wiring**

Modify `server/runtimeCoordinator.ts` and `src/online/server/onlineRuntimeCoordinator.ts` to accept optional `runtimeNodeStore` and apply the existing runtime-node wrapper in the composite coordinator.

- [x] **Step 4: Run coordinator test green**

Run the same command and expect pass.

## Task 3: Production Startup and Lifecycle Wiring

- [x] **Step 1: Add failing server/check-config source and lifecycle assertions**

Update `server/__tests__/server-index-runtime.test.ts` to require:

- `runtimeNodeStore` is destructured from `createOnlineGameStoreFromEnv(...)`.
- `runtimeNodeStore.recordNodeStarted()` runs before `createConfiguredRuntimeCoordinator(...)`.
- `runtimeNodeStore` is passed to the configured coordinator.
- normal shutdown and startup-failure paths close `runtimeNodeStore`.

Update `server/__tests__/check-config.test.ts` so the fake store includes `runtimeNodeStore.close()` and the close order includes `"runtime-node"`.

- [x] **Step 2: Run red lifecycle tests**

Run:

```bash
npx vitest run server/__tests__/server-index-runtime.test.ts server/__tests__/check-config.test.ts -t "runtime node|configured store|closes"
```

Expected: fail because production/check-config do not wire or close `runtimeNodeStore`.

- [x] **Step 3: Implement production lifecycle wiring**

Modify:

- `server/index.ts`: destructure `runtimeNodeStore`, call `await runtimeNodeStore.recordNodeStarted()` before `createConfiguredRuntimeCoordinator(...)`, pass `runtimeNodeStore`, and close it in both shutdown paths.
- `server/check-config.ts`: destructure and close `runtimeNodeStore`.

- [x] **Step 4: Run lifecycle tests green**

Run the same command and expect pass.

## Task 4: Roadmap, Review, Verification

- [x] **Step 1: Update roadmap evidence**

Add an item 11 paragraph to `docs/online-multiplayer-plan.md` after the runtime-node primitive paragraph.

- [x] **Step 2: Run verification**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineGameStore.test.ts server/__tests__/runtime-coordinator.test.ts server/__tests__/server-index-runtime.test.ts server/__tests__/check-config.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

Run full `npx vitest run` before commit because this touches production wiring and shared coordinator creation.

- [x] **Step 3: Run code review and classify findings**

Review scope: production startup ordering, store lifecycle closure, coordinator drain delegation, health drain path implications, check-config coverage, and no multi-instance enablement.

- [ ] **Step 4: Commit and push**

Run:

```bash
git status --short
git add src/online/server/createOnlineGameStore.ts src/online/server/__tests__/createOnlineGameStore.test.ts src/online/server/onlineRuntimeCoordinator.ts server/runtimeCoordinator.ts server/__tests__/runtime-coordinator.test.ts server/index.ts server/__tests__/server-index-runtime.test.ts server/check-config.ts server/__tests__/check-config.test.ts docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-17-production-runtime-node-wiring.md
git commit -m "Wire runtime node state into production startup"
git push
```

## Status

- Slice selected: item 11 production runtime-node wiring/health/startup.
- Implementation status: implementation, reviewer pass, and final verification complete; commit/push pending.
- TDD evidence:
  - Store factory test first failed because `configured.runtimeNodeStore` was missing and PostgreSQL pool option counts still expected seven stores.
  - Runtime coordinator test first failed because `createConfiguredRuntimeCoordinator(...)` still returned the process-local drain state instead of delegating to the fake runtime-node store.
  - Lifecycle tests first failed because `server/index.ts` did not record node startup, pass `runtimeNodeStore`, or close it, and `server/check-config.ts` did not close it.
  - Full-suite verification exposed a deterministic account-challenge stale-refresh race under load; a focused regression first failed because a stale all-inbox refresh erased a locally accepted challenge game recovery row.
- Verification evidence:
  - `npx vitest run src/online/server/__tests__/createOnlineGameStore.test.ts server/__tests__/runtime-coordinator.test.ts server/__tests__/server-index-runtime.test.ts server/__tests__/check-config.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineRuntimeNodeStore.test.ts` passed: 6 files, 62 tests.
  - `npx vitest run src/components/__tests__/OnlineGameBrowser.test.tsx -t "keeps a locally accepted challenge visible"` passed after the stale-refresh fix.
  - `npx vitest run src/components/__tests__/OnlineGameBrowser.test.tsx -t "lets signed-in players act on account challenges from the inbox"` passed after the stale-refresh fix.
  - `npx vitest run src/components/__tests__/OnlineGameBrowser.test.tsx` passed: 155 tests.
  - Full `npx vitest run` passed after the reviewer fix: 136 files passed, 1 skipped; 1632 tests passed, 3 skipped.
  - `npm run build` passed with the existing Vite large-chunk warning.
  - `npm run server:build` passed.
  - `npm run audit` passed with 0 vulnerabilities.
  - `git diff --check` passed with CRLF conversion warnings only.
- Review status: accepted one medium UI race finding. The first stale-refresh merge preserved accepted challenge shortcuts across every authoritative all-inbox response, which could keep a blocked/omitted accepted challenge visible locally. The fix now preserves local accepted rows only when the same all-inbox response contained that completed challenge as stale pending data; an authoritative omission clears the cached accepted row. The reviewer found no runtime-node lifecycle or multi-instance rejection issues.
