# Runtime Drain Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and TDD to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advance item 11 by adding a first rolling-drain readiness surface: coordinator drain state, health readiness metadata, and retryable WebSocket join/spectate rejection for new sockets while a node is draining.

**Architecture:** Add process-local drain state to `OnlineRuntimeCoordinator` as the first drain slice. `createOnlineHttpServer` reads this state for `/api/health` and for new `join`/`spectate` WebSocket messages; already joined sockets can continue sending `ping` and gameplay messages. Production shutdown marks the runtime coordinator draining before closing listeners. This does not add persistent `online_runtime_nodes`, cross-node drain state, an authenticated operator drain route, or bounded forced-close timers.

**Tech Stack:** TypeScript, Express, ws, Vitest HTTP/WebSocket tests.

---

### Task 1: Coordinator Drain State

**Files:**
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Modify: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`

- [x] **Step 1: Write failing coordinator drain tests**

Add tests proving:

- a new single-node coordinator reports `{ draining: false }`;
- `startDrain({ reason: "rolling_deploy", startedAt: "2026-06-16T12:00:00.000Z" })` flips the state to draining;
- a second `startDrain(...)` call is idempotent and preserves the original `startedAt`.

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "drain"
```

Expected before implementation: fail because `getDrainState()` and `startDrain()` do not exist.

- [x] **Step 2: Implement coordinator drain state**

Add:

```ts
export interface OnlineRuntimeDrainState {
  draining: boolean;
  startedAt?: string;
  reason?: string;
}

export interface OnlineRuntimeStartDrainInput {
  startedAt?: string;
  reason?: string;
}
```

Extend `OnlineRuntimeCoordinator` with:

```ts
getDrainState(): Promise<OnlineRuntimeDrainState>;
startDrain(input?: OnlineRuntimeStartDrainInput): Promise<OnlineRuntimeDrainState>;
```

In `createSingleNodeOnlineRuntimeCoordinator`, keep a local `drainState` initialized to `{ draining: false }`. `startDrain` sets it once using `input.startedAt ?? new Date().toISOString()` and `input.reason` if supplied, then returns the current state on later calls without changing the original `startedAt`.

- [x] **Step 3: Verify coordinator drain tests pass**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "drain"
```

Expected after implementation: matching drain tests pass.

Evidence: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "drain"` first failed with missing `getDrainState`/`startDrain`, then passed with 2 matching tests.

### Task 2: Health Readiness Drain Metadata

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Write failing health readiness test**

Add a test that starts drain on an injected runtime coordinator, then calls `/api/health` and expects:

```ts
expect(response.status).toBe(503);
expect(body).toMatchObject({
  ok: false,
  online: {
    runtime: {
      draining: true,
      drainStartedAt: "2026-06-16T12:00:00.000Z",
    },
    store: { ok: true },
  },
});
expect(JSON.stringify(body)).not.toContain("rolling_deploy");
```

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain.*health|health.*drain"
```

Expected before implementation: fail because health does not read coordinator drain state and remains 200/`ok: true`.

- [x] **Step 2: Implement health readiness state**

In `/api/health`, call `await runtimeCoordinator.getDrainState()`. Return readiness `ok` and status from `storeOk && !drainState.draining`. Add:

```ts
runtime: {
  draining: drainState.draining,
  drainStartedAt: drainState.startedAt,
}
```

Do not expose `drainState.reason` in public health. Keep store readiness metadata separate so operators can distinguish `store.ok: true` from `runtime.draining: true`.

- [x] **Step 3: Verify health drain test passes**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain.*health|health.*drain"
```

Expected after implementation: matching health test passes.

Evidence: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain.*health|health.*drain"` first failed with HTTP 200 instead of 503, then passed with 1 matching test.

### Task 3: WebSocket Drain Rejection

**Files:**
- Modify: `src/online/types.ts`
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Write failing WebSocket drain tests**

Add tests proving:

- when the runtime coordinator is already draining, a new `join` message receives `{ type: "error", error: { code: "service_unavailable" } }`;
- when the runtime coordinator is already draining, a new `spectate` message receives the same retryable error and does not register spectator presence;
- a player socket that joined before drain can still send `ping` after `startDrain()` and receives `pong`.

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain.*websocket|websocket.*drain"
```

Expected before implementation: fail because join/spectate are still accepted during drain and `service_unavailable` is not an allowed `OnlineRejectCode`.

- [x] **Step 2: Implement retryable WebSocket rejection**

Add `"service_unavailable"` to `OnlineRejectCode` in `src/online/types.ts` and map it to HTTP 503 in `httpStatusForOnlineError`.

Add a helper in `createOnlineHttpServer.ts`:

```ts
const drainUnavailableError = (): OnlineReject => ({
  code: "service_unavailable",
  message: "This node is draining for a deploy. Reconnect shortly.",
});
```

Before `join` and `spectate` enter `enqueueGameAction`, check:

```ts
if ((await runtimeCoordinator.getDrainState()).draining) {
  log({ event: "online.socket.join", gameId: message.gameId, role: "player", status: "rejected", reason: "draining" });
  sendSocketError(socket, drainUnavailableError());
  return;
}
```

Use the corresponding `online.socket.spectate` event and `role: "spectator"` for spectate. Do not block `ping` or `action` for sockets already in `connections`.

- [x] **Step 3: Verify WebSocket drain tests pass**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain.*websocket|websocket.*drain"
```

Expected after implementation: matching WebSocket drain tests pass.

Evidence: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain.*websocket|websocket.*drain"` first failed because drain still returned `joined`/`spectating`; after the guard, it passed with 3 matching tests.

### Task 4: Production Shutdown Drain Mark

**Files:**
- Modify: `server/index.ts`
- Modify: `server/__tests__/server-index-runtime.test.ts`

- [x] **Step 1: Write failing source-level shutdown test**

Add a source-level test proving the production shutdown path calls `runtimeCoordinator?.startDrain({ reason })` before closing the WebSocket and HTTP servers.

Run:

```bash
npx vitest run server/__tests__/server-index-runtime.test.ts -t "drain"
```

Expected before implementation: fail because shutdown only closes listeners and stores.

- [x] **Step 2: Mark drain before shutdown**

In `server/index.ts`, update `shutdown(reason)` to attempt:

```ts
try {
  await runtimeCoordinator?.startDrain({ reason });
} catch (error) {
  console.error("Failed to mark online runtime coordinator draining", error);
  process.exitCode = 1;
}
```

Do this before `closeWebSocketServer(wss)` and `closeHttpServer(server)`. This is a first readiness/drain signal, not the final bounded graceful-drain timer.

- [x] **Step 3: Verify shutdown drain test passes**

Run:

```bash
npx vitest run server/__tests__/server-index-runtime.test.ts -t "drain"
```

Expected after implementation: matching source-level test passes.

Evidence: `npx vitest run server/__tests__/server-index-runtime.test.ts -t "drain"` first failed because `runtimeCoordinator?.startDrain({ reason })` was absent, then passed with 1 matching test.

### Task 5: Review, Verification, Roadmap, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-16-runtime-drain-readiness.md`

- [x] **Step 1: Review**

Run code/ops review focused on:

- health status and body distinguish store failure from drain readiness;
- public health does not expose operator drain reasons or sensitive runtime node ids;
- new WebSocket join/spectate requests are rejected while already-connected sockets can continue;
- shutdown marks drain before network listener closure;
- docs do not claim persistent cross-node drain state or full multi-instance readiness.

Classify findings as accept, reject, investigate, or defer before applying changes.

Review evidence: read-only reviewer `Ohm` found one blocking integration issue and one major retryability gap. Dispositions:

| Finding | Severity | Decision | Action |
|---|---:|---|---|
| `service_unavailable` was emitted by the server but omitted from protocol/client runtime allowlists. | blocking | accept | Centralized `ONLINE_REJECT_CODES` in `types.ts`, wired protocol/client validators to it, and added protocol/client tests. |
| Player/spectator hooks would treat `service_unavailable` as protected `server-error`, blocking reconnect. | major | accept | Added hook tests and changed player/spectator error handling to close the socket and reuse the reconnect/resync path. |

Focused reviewer-fix evidence: `npx vitest run src/online/__tests__/protocol.test.ts -t "known server message envelopes"`, `npx vitest run src/online/__tests__/client.test.ts -t "service unavailable rejection"`, `npx vitest run src/hooks/__tests__/useOnlineGameConnection.test.tsx -t "service unavailable player"`, and `npx vitest run src/hooks/__tests__/useOnlineSpectatorConnection.test.tsx -t "service unavailable spectator"` first failed before the fix and then passed. Micro-reflections were appended to the tracked `codex-research-skills` ledger.

- [x] **Step 2: Final verification**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "drain"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain.*health|health.*drain|drain.*websocket|websocket.*drain"
npx vitest run server/__tests__/server-index-runtime.test.ts -t "drain"
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts server/__tests__/server-index-runtime.test.ts server/__tests__/runtime-coordinator.test.ts src/online/server/__tests__/serverRuntimeConfig.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

No browser screenshots are required because the public UI is unchanged; this slice only sends existing WebSocket error frames.

Evidence:

- `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "drain"` passed with 2 matching tests.
- `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "drain.*health|health.*drain|drain.*websocket|websocket.*drain"` passed with 4 matching tests.
- `npx vitest run server/__tests__/server-index-runtime.test.ts -t "drain"` passed with 1 matching test.
- `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts server/__tests__/server-index-runtime.test.ts server/__tests__/runtime-coordinator.test.ts src/online/server/__tests__/serverRuntimeConfig.test.ts src/online/__tests__/protocol.test.ts src/online/__tests__/client.test.ts src/hooks/__tests__/useOnlineGameConnection.test.tsx src/hooks/__tests__/useOnlineSpectatorConnection.test.tsx` passed with 9 files and 337 tests.
- `npx vitest run` passed with 130 files passed, 1 skipped, 1554 tests passed, and 3 skipped; Vitest printed non-failing worker termination timeout warnings after completion.
- `npm run build` passed with the existing large-chunk warning only.
- `npm run server:build` passed.
- `npm run audit` passed with 0 vulnerabilities.
- `git diff --check` passed with CRLF conversion warnings only.

- [x] **Step 3: Roadmap update**

Record the completed item 11 drain-readiness sub-slice in `docs/online-multiplayer-plan.md`, including exact verification commands, non-goals, and the next item 11 pointer. Explicitly state that persistent runtime-node drain rows, authenticated operator drain route, bounded forced socket close, two-instance drain tests, and multi-instance enablement remain future work.

Evidence: `docs/online-multiplayer-plan.md` now records the runtime drain readiness sub-slice, its TDD/review/verification evidence, non-goals, and the next item 11 pointer.

- [x] **Step 4: Commit and push**

Run:

```bash
git status --short
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-runtime-drain-readiness.md src/online/server/onlineRuntimeCoordinator.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/types.ts server/index.ts server/__tests__/server-index-runtime.test.ts
git commit -m "Add runtime drain readiness gate"
git push origin HEAD:online-action-log
```

Evidence: this checked-off plan state is included in the runtime drain readiness commit and push.
