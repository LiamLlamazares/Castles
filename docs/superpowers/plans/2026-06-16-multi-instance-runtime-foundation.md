# Multi-Instance Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the item 11 runtime-coordinator foundation without enabling multi-instance mode or changing current single-node behavior.

**Architecture:** Add a small `OnlineRuntimeCoordinator` boundary for node identity, local snapshot fanout hooks, spectator counting, and operation gates. The first implementation is explicitly single-node and process-local; it prepares `createOnlineHttpServer` for later PostgreSQL-backed fanout, presence, and shared gates while keeping `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected.

**Tech Stack:** TypeScript, Node HTTP/WebSocket server, Vitest, existing Castles online server modules.

---

## Source Documents

- Approved design: `docs/superpowers/specs/2026-06-15-multi-instance-online-runtime-design.md`
- Roadmap: `docs/online-multiplayer-plan.md`
- Current single-node guardrail: `src/online/server/serverRuntimeConfig.ts`
- Current HTTP/WebSocket runtime: `src/online/server/createOnlineHttpServer.ts`

## File Structure

- Create `src/online/server/onlineRuntimeCoordinator.ts`
  - Owns coordinator interfaces, node-id parsing, single-node coordinator factory, and process-local helper behavior.
- Create `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`
  - Unit tests for node-id validation, same-node event subscription behavior, spectator count behavior, and operation gates.
- Modify `src/online/server/serverRuntimeConfig.ts`
  - Add `runtimeNodeId` to parsed config, sourced from `CASTLES_NODE_ID` or a generated default.
- Modify `src/online/server/__tests__/serverRuntimeConfig.test.ts`
  - Cover default and explicit node id behavior, plus unsafe explicit id rejection.
- Modify `server/configReport.ts` and `server/__tests__/config-report.test.ts`
  - Expose runtime node identity only in operator-facing `server:check-config`, not public health.
- Modify `src/online/server/createOnlineHttpServer.ts`
  - Accept an optional coordinator, default to single-node coordinator, and route local spectator counts plus local game gates through it.
- Modify `src/online/server/__tests__/createOnlineHttpServer.test.ts`
  - Prove default health/deployment behavior stays single-node and coordinator hooks are used without changing public protocol.
- Modify `docs/online-multiplayer-plan.md`
  - Mark item 11 foundation sub-slice as active/completed with exact verification evidence.

## Non-Goals For This Plan

- Do not accept `CASTLES_DEPLOYMENT_MODE=multi-instance`.
- Do not add PostgreSQL `LISTEN/NOTIFY`, outbox tables, shared spectator presence rows, drain mode, or shared rate limiting in this slice.
- Do not change client WebSocket message shapes.
- Do not redo profile/dashboard or palette work.

### Task 1: Add Runtime Coordinator Unit Contract

**Files:**
- Create: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`
- Dependency implemented in Task 2: `src/online/server/onlineRuntimeCoordinator.ts`

- [ ] **Step 1: Write the failing coordinator tests**

Create `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createSingleNodeOnlineRuntimeCoordinator,
  normalizeRuntimeNodeId,
} from "../onlineRuntimeCoordinator";

describe("normalizeRuntimeNodeId", () => {
  it("accepts short visible operator node ids", () => {
    expect(normalizeRuntimeNodeId(" node-a_01 ")).toBe("node-a_01");
  });

  it("rejects node ids that are empty, too long, or URL-like", () => {
    expect(() => normalizeRuntimeNodeId("")).toThrow(/CASTLES_NODE_ID/);
    expect(() => normalizeRuntimeNodeId("node id")).toThrow(/CASTLES_NODE_ID/);
    expect(() => normalizeRuntimeNodeId("https://node-a")).toThrow(/CASTLES_NODE_ID/);
    expect(() => normalizeRuntimeNodeId("x".repeat(65))).toThrow(/CASTLES_NODE_ID/);
  });
});

describe("createSingleNodeOnlineRuntimeCoordinator", () => {
  it("uses the supplied node id and reports process-local capabilities", () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });

    expect(coordinator.nodeId).toBe("node-a");
    expect(coordinator.capabilities).toEqual({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
    });
  });

  it("keeps snapshot subscriptions local to the process", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });
    const seen: unknown[] = [];
    const unsubscribe = coordinator.subscribeGameSnapshotChanged((event) => {
      seen.push(event);
    });

    await coordinator.publishGameSnapshotChanged({
      type: "game_snapshot_changed",
      gameId: "game_123",
      roomVersion: 2,
      lastEventId: "event_2",
      reason: "action",
      nodeId: "node-a",
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    expect(seen).toEqual([
      {
        type: "game_snapshot_changed",
        gameId: "game_123",
        roomVersion: 2,
        lastEventId: "event_2",
        reason: "action",
        nodeId: "node-a",
        createdAt: "2026-06-16T00:00:00.000Z",
      },
    ]);

    unsubscribe();
    await coordinator.publishGameSnapshotChanged({
      type: "game_snapshot_changed",
      gameId: "game_123",
      roomVersion: 3,
      reason: "timeout",
      nodeId: "node-a",
      createdAt: "2026-06-16T00:00:01.000Z",
    });

    expect(seen).toHaveLength(1);
  });

  it("tracks process-local spectator presence without storing secrets", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });

    const first = await coordinator.registerSpectator({ gameId: "game_123" });
    const second = await coordinator.registerSpectator({ gameId: "game_123" });
    await coordinator.registerSpectator({ gameId: "game_456" });

    expect(first.connectionId).toMatch(/^spectator_/);
    expect(second.connectionId).toMatch(/^spectator_/);
    expect(first.connectionId).not.toBe(second.connectionId);
    expect(await coordinator.countSpectators("game_123")).toBe(2);

    await coordinator.removeSpectator({ gameId: "game_123", connectionId: first.connectionId });
    expect(await coordinator.countSpectators("game_123")).toBe(1);
  });

  it("serializes same-game process-local operation gates", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });
    const order: string[] = [];

    await Promise.all([
      coordinator.withGameOperationGate("game_123", async () => {
        order.push("first-start");
        await Promise.resolve();
        order.push("first-end");
      }),
      coordinator.withGameOperationGate("game_123", async () => {
        order.push("second-start");
        order.push("second-end");
      }),
    ]);

    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts
```

Expected: fail with an import error for `../onlineRuntimeCoordinator`.

### Task 2: Implement Single-Node Runtime Coordinator

**Files:**
- Create: `src/online/server/onlineRuntimeCoordinator.ts`
- Test: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`

- [ ] **Step 1: Add the coordinator implementation**

Create `src/online/server/onlineRuntimeCoordinator.ts`:

```ts
import { randomBytes } from "node:crypto";

export type OnlineRuntimeMode = "single-node";

export type OnlineRuntimeSnapshotReason =
  | "action"
  | "timeout"
  | "visibility"
  | "challenge"
  | "open_seek"
  | "snapshot";

export interface OnlineRuntimeGameSnapshotChangedEvent {
  type: "game_snapshot_changed";
  gameId: string;
  roomVersion: number;
  lastEventId?: string;
  reason: OnlineRuntimeSnapshotReason;
  nodeId: string;
  createdAt: string;
}

export interface OnlineRuntimeSpectatorRegistration {
  connectionId: string;
}

export interface OnlineRuntimeCoordinatorCapabilities {
  mode: OnlineRuntimeMode;
  websocketFanout: "process-local";
  spectatorPresence: "process-local";
  operationGates: "process-local";
}

export interface OnlineRuntimeCoordinator {
  readonly nodeId: string;
  readonly capabilities: OnlineRuntimeCoordinatorCapabilities;
  publishGameSnapshotChanged(event: OnlineRuntimeGameSnapshotChangedEvent): Promise<void>;
  subscribeGameSnapshotChanged(
    handler: (event: OnlineRuntimeGameSnapshotChangedEvent) => void | Promise<void>
  ): () => void;
  registerSpectator(input: { gameId: string }): Promise<OnlineRuntimeSpectatorRegistration>;
  removeSpectator(input: { gameId: string; connectionId: string }): Promise<void>;
  countSpectators(gameId: string): Promise<number>;
  withGameOperationGate<T>(gameId: string, operation: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeRuntimeNodeId(raw: string): string {
  const value = raw.trim();
  if (!NODE_ID_PATTERN.test(value)) {
    throw new Error(
      "CASTLES_NODE_ID must be 1-64 characters using only letters, numbers, underscores, or hyphens."
    );
  }
  return value;
}

export function createGeneratedRuntimeNodeId(): string {
  return `node_${randomBytes(6).toString("base64url")}`;
}

export function createSingleNodeOnlineRuntimeCoordinator(options: {
  nodeId: string;
}): OnlineRuntimeCoordinator {
  const nodeId = normalizeRuntimeNodeId(options.nodeId);
  const handlers = new Set<
    (event: OnlineRuntimeGameSnapshotChangedEvent) => void | Promise<void>
  >();
  const spectatorConnections = new Map<string, Set<string>>();
  const gates = new Map<string, Promise<void>>();

  const removeGateIfCurrent = (gameId: string, current: Promise<void>): void => {
    if (gates.get(gameId) === current) {
      gates.delete(gameId);
    }
  };

  return {
    nodeId,
    capabilities: {
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
    },
    async publishGameSnapshotChanged(event) {
      for (const handler of Array.from(handlers)) {
        await handler(event);
      }
    },
    subscribeGameSnapshotChanged(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async registerSpectator({ gameId }) {
      const connectionId = `spectator_${randomBytes(9).toString("base64url")}`;
      const connections = spectatorConnections.get(gameId) ?? new Set<string>();
      connections.add(connectionId);
      spectatorConnections.set(gameId, connections);
      return { connectionId };
    },
    async removeSpectator({ gameId, connectionId }) {
      const connections = spectatorConnections.get(gameId);
      if (!connections) return;
      connections.delete(connectionId);
      if (connections.size === 0) {
        spectatorConnections.delete(gameId);
      }
    },
    async countSpectators(gameId) {
      return spectatorConnections.get(gameId)?.size ?? 0;
    },
    async withGameOperationGate(gameId, operation) {
      const previous = gates.get(gameId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(operation);
      const settled = next.then(
        () => undefined,
        () => undefined
      );
      gates.set(gameId, settled);
      settled.finally(() => removeGateIfCurrent(gameId, settled));
      return next;
    },
    async close() {
      handlers.clear();
      spectatorConnections.clear();
      gates.clear();
    },
  };
}
```

- [ ] **Step 2: Run coordinator tests**

Run:

```powershell
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

Run:

```powershell
git add src/online/server/onlineRuntimeCoordinator.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts
git commit -m "Add single-node runtime coordinator"
```

### Task 3: Add Runtime Node Id To Server Config

**Files:**
- Modify: `src/online/server/serverRuntimeConfig.ts`
- Modify: `src/online/server/__tests__/serverRuntimeConfig.test.ts`
- Modify: `server/configReport.ts`
- Modify: `server/__tests__/config-report.test.ts`

- [ ] **Step 1: Write failing runtime node id config tests**

In `src/online/server/__tests__/serverRuntimeConfig.test.ts`, extend the production config test input with:

```ts
CASTLES_NODE_ID: "prod-node-a",
```

and extend the expected config with:

```ts
runtimeNodeId: "prod-node-a",
```

Add this test near the deployment-mode tests:

```ts
it("generates a safe runtime node id outside explicit configuration", () => {
  const config = parseServerRuntimeConfig({}, "C:/repo/Castles");

  expect(config.runtimeNodeId).toMatch(/^node_[A-Za-z0-9_-]+$/);
});

it("rejects unsafe explicit runtime node ids", () => {
  expect(() =>
    parseServerRuntimeConfig({ CASTLES_NODE_ID: "node a" }, "/srv/castles")
  ).toThrow(/CASTLES_NODE_ID/);
  expect(() =>
    parseServerRuntimeConfig({ CASTLES_NODE_ID: "https://node-a" }, "/srv/castles")
  ).toThrow(/CASTLES_NODE_ID/);
});
```

In `server/__tests__/config-report.test.ts`, extend the expected report with:

```ts
runtime: {
  nodeId: "prod-node-a",
},
```

- [ ] **Step 2: Run the failing config tests**

Run:

```powershell
npx vitest run src/online/server/__tests__/serverRuntimeConfig.test.ts server/__tests__/config-report.test.ts
```

Expected: fail because `runtimeNodeId` and `runtime` report output do not exist.

- [ ] **Step 3: Implement runtime node id parsing**

In `src/online/server/serverRuntimeConfig.ts`, import the helpers:

```ts
import {
  createGeneratedRuntimeNodeId,
  normalizeRuntimeNodeId,
} from "./onlineRuntimeCoordinator";
```

Add to `ServerRuntimeConfig`:

```ts
runtimeNodeId: string;
```

Add parser:

```ts
function parseRuntimeNodeId(env: NodeJS.ProcessEnv): string {
  const raw = env.CASTLES_NODE_ID?.trim();
  return raw ? normalizeRuntimeNodeId(raw) : createGeneratedRuntimeNodeId();
}
```

Inside `parseServerRuntimeConfig`, after deployment parsing:

```ts
const runtimeNodeId = parseRuntimeNodeId(env);
```

Return it:

```ts
runtimeNodeId,
```

- [ ] **Step 4: Add node id to operator config report**

In `server/configReport.ts`, add this top-level field after `onlineDeployment`:

```ts
runtime: {
  nodeId: config.runtimeNodeId,
},
```

Do not add the node id to public `/api/health` in this task.

- [ ] **Step 5: Run config tests**

Run:

```powershell
npx vitest run src/online/server/__tests__/serverRuntimeConfig.test.ts server/__tests__/config-report.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/online/server/serverRuntimeConfig.ts src/online/server/__tests__/serverRuntimeConfig.test.ts server/configReport.ts server/__tests__/config-report.test.ts
git commit -m "Add runtime node identity config"
```

### Task 4: Wire Coordinator Into HTTP Server Without Behavior Change

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [ ] **Step 1: Write failing coordinator injection test**

In `src/online/server/__tests__/createOnlineHttpServer.test.ts`, add this import near the existing server imports:

```ts
import { createSingleNodeOnlineRuntimeCoordinator } from "../onlineRuntimeCoordinator";
```

Then edit the existing test named `decorates public game summaries with current connected spectator counts`.

Add this before `createOnlineHttpServer` is called:

```ts
const runtimeCoordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });
```

Pass the coordinator into the server options:

```ts
const { server } = createOnlineHttpServer({
  publicBaseUrl: "https://castles.example",
  service,
  runtimeCoordinator,
  now: () => 12_345,
  loadGameSummaries: async () => [
    {
      ...publicSummary,
      livePreview: {
        ...publicSummary.livePreview,
        clock: {
          ...publicSummary.livePreview.clock!,
          serverNow: 99,
        },
        spectatorCount: 99,
      },
    },
  ],
  loadGameSummary: async (gameId: string) =>
    gameId === publicSummary.gameId
      ? {
          ...publicSummary,
          livePreview: {
            ...publicSummary.livePreview,
            clock: {
              ...publicSummary.livePreview.clock!,
              serverNow: 99,
            },
            spectatorCount: 99,
          },
        }
      : null,
});
```

Keep the existing WebSocket spectate flow and final assertions:

```ts
expect(directoryBody.games[0].livePreview.spectatorCount).toBe(1);
expect(summaryBody.summary.livePreview.spectatorCount).toBe(1);
expect(directoryBody.games[0].livePreview.clock.serverNow).toBe(12_345);
expect(summaryBody.summary.livePreview.clock.serverNow).toBe(12_345);
```

- [ ] **Step 2: Run the failing HTTP server test**

Run:

```powershell
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "runtime coordinator"
```

Expected: fail because `runtimeCoordinator` is not an accepted option or spectator counts do not use it.

- [ ] **Step 3: Add coordinator option and default**

In `src/online/server/createOnlineHttpServer.ts`, import:

```ts
import {
  createGeneratedRuntimeNodeId,
  createSingleNodeOnlineRuntimeCoordinator,
  type OnlineRuntimeCoordinator,
} from "./onlineRuntimeCoordinator";
```

Add to `CreateOnlineHttpServerOptions`:

```ts
runtimeCoordinator?: OnlineRuntimeCoordinator;
```

After the WebSocket server setup, create the coordinator:

```ts
const runtimeCoordinator =
  options.runtimeCoordinator ??
  createSingleNodeOnlineRuntimeCoordinator({ nodeId: createGeneratedRuntimeNodeId() });
```

- [ ] **Step 4: Route spectator counts through coordinator**

Replace the body of `countConnectedSpectators` with:

```ts
const countConnectedSpectators = async (gameId: string): Promise<number> => {
  return runtimeCoordinator.countSpectators(gameId);
};
```

Because `withLiveResponseFields` currently calls it synchronously, convert `withLiveResponseFields` to `async` and await it where summaries/directories are built. Keep response shapes unchanged.

- [ ] **Step 5: Register and remove spectator presence for WebSocket spectators**

Change `OnlineConnection` spectator shape from:

```ts
| { role: "spectator"; gameId: string };
```

to:

```ts
| { role: "spectator"; gameId: string; spectatorConnectionId?: string };
```

When accepting a WebSocket spectator, register before `connections.set`:

```ts
const spectatorPresence = await runtimeCoordinator.registerSpectator({
  gameId: message.gameId,
});
connections.set(socket, {
  role: "spectator",
  gameId: message.gameId,
  spectatorConnectionId: spectatorPresence.connectionId,
});
```

In `logSocketDisconnect`, after reading `connection`, remove spectator presence:

```ts
if (connection?.role === "spectator" && connection.spectatorConnectionId) {
  runtimeCoordinator
    .removeSpectator({
      gameId: connection.gameId,
      connectionId: connection.spectatorConnectionId,
    })
    .catch(() => undefined);
}
```

HTTP spectator snapshots should not register live spectator presence because they are short-lived fetches, not active WebSocket spectators.

- [ ] **Step 6: Route game operation gates through coordinator**

Replace `enqueueGameAction` implementation with:

```ts
const enqueueGameAction = (gameId: string, operation: () => Promise<void>): Promise<void> => {
  return runtimeCoordinator.withGameOperationGate(gameId, operation);
};
```

Remove the now-unused `actionQueues` map.

- [ ] **Step 7: Run focused HTTP server tests**

Run:

```powershell
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "runtime coordinator|spectator|join|action|health"
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/createOnlineHttpServer.test.ts
git commit -m "Wire single-node runtime coordinator"
```

### Task 5: Update Roadmap And Verify Foundation Slice

**Files:**
- Modify: `docs/online-multiplayer-plan.md`

- [ ] **Step 1: Add foundation status under item 11**

Append this bullet under item 11:

```md
   - Foundation sub-slice done on 2026-06-16: added the single-node `OnlineRuntimeCoordinator` boundary, runtime node-id config for operator diagnostics, coordinator-backed process-local spectator counts, and coordinator-backed per-game operation gates while keeping `CASTLES_DEPLOYMENT_MODE=multi-instance` rejected. This is not multi-instance readiness; it only creates the seam needed for later PostgreSQL outbox/fanout, live spectator presence, mandatory room hydration, shared gates, drain behavior, and two-instance tests.
```

- [ ] **Step 2: Run focused verification**

Run:

```powershell
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/serverRuntimeConfig.test.ts server/__tests__/config-report.test.ts src/online/server/__tests__/createOnlineHttpServer.test.ts
```

Expected: pass.

- [ ] **Step 3: Run build and diff checks**

Run:

```powershell
npm run build
npm run server:build
git diff --check
```

Expected: all pass. Existing Vite chunk-size warnings are acceptable if unchanged.

- [ ] **Step 4: Commit**

Run:

```powershell
git add docs/online-multiplayer-plan.md
git commit -m "Record runtime coordinator foundation"
```

### Task 6: Review And Push

**Files:**
- No planned edits unless review finds a concrete issue.

- [ ] **Step 1: Run a focused code review**

Review scope:

```text
Review the item 11 runtime coordinator foundation. Focus on behavior preservation, spectator count semantics, process-local gate behavior, public health privacy, and whether the code accidentally implies multi-instance readiness.
```

Classify each finding as `accept`, `reject`, `investigate`, or `defer`.

- [ ] **Step 2: Apply accepted non-architecture findings**

Only apply findings that preserve the approved design. Any finding that changes architecture belongs in `docs/superpowers/specs/2026-06-15-multi-instance-online-runtime-design.md` and needs Liam approval before runtime code changes.

- [ ] **Step 3: Run final verification**

Run:

```powershell
npx vitest run
npm run build
npm run server:build
npm run audit
git diff --check
```

Expected: all pass.

- [ ] **Step 4: Push**

Run:

```powershell
git push origin online-qa-closure:online-action-log
```

Expected: remote branch updates successfully.

## Plan Self-Review

- Spec coverage: this plan covers the first approved design sub-slice: coordinator boundary, node identity, process-local snapshot/presence/gate seams, and no multi-instance enablement. It deliberately does not implement PostgreSQL outbox/fanout, live presence tables, mandatory room hydration, shared Quick Match/account-challenge gates, startup ownership, rate limits, or drain; those require later plans.
- Placeholder scan: no open-ended implementation placeholders are intended.
- Type consistency: `OnlineRuntimeCoordinator`, `createSingleNodeOnlineRuntimeCoordinator`, `normalizeRuntimeNodeId`, and `runtimeNodeId` are the canonical names for this slice.
