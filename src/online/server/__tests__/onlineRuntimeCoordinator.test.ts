import { describe, expect, it } from "vitest";
import {
  createPostgresOperationGateRuntimeCoordinator,
  createPostgresRuntimeEventCoordinator,
  createPostgresStartupMaintenanceRuntimeCoordinator,
  createPostgresSpectatorPresenceRuntimeCoordinator,
  createSingleNodeOnlineRuntimeCoordinator,
  normalizeRuntimeNodeId,
  type OnlineRuntimeOperationGateScope,
  type OnlineRuntimeSnapshotReason,
  type OnlineRuntimeStartupMaintenanceResult,
} from "../onlineRuntimeCoordinator";

const HASHED_ACCOUNT_CHALLENGE_PAIR_KEY =
  "account_challenge_pair:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

class FakeRuntimeSpectatorPresenceStore {
  private readonly presence = new Map<string, { nodeId: string; connectionId: string; gameId: string }>();
  private nextConnectionId = 0;

  forNode(nodeId: string) {
    return {
      registerSpectator: async ({ gameId }: { gameId: string }) => {
        this.nextConnectionId += 1;
        const connectionId = `spectator_${nodeId}_${String(this.nextConnectionId).padStart(12, "0")}`;
        this.presence.set(`${nodeId}\u0000${connectionId}`, { nodeId, connectionId, gameId });
        return { connectionId };
      },
      refreshSpectator: async ({
        connectionId,
        gameId,
      }: {
        gameId: string;
        connectionId: string;
      }) => {
        const row = this.presence.get(`${nodeId}\u0000${connectionId}`);
        return row?.gameId === gameId ? { connectionId } : null;
      },
      removeSpectator: async ({
        connectionId,
        gameId,
      }: {
        gameId: string;
        connectionId: string;
      }) => {
        const key = `${nodeId}\u0000${connectionId}`;
        const row = this.presence.get(key);
        if (row?.gameId === gameId) {
          this.presence.delete(key);
        }
      },
      countSpectators: async (gameId: string) =>
        Array.from(this.presence.values()).filter((row) => row.gameId === gameId).length,
      cleanupExpiredSpectators: async () => 0,
    };
  }
}

class FakeRuntimeEventStore {
  readonly events: Array<{
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: OnlineRuntimeSnapshotReason;
  }> = [];
  readonly storedEvents: Array<{
    id: number;
    type: "game_snapshot_changed";
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: OnlineRuntimeSnapshotReason;
    nodeId: string;
    createdAt: string;
  }> = [];
  readonly listCalls: Array<{ afterId: number; limit: number; excludeNodeId?: string }> = [];

  constructor(private readonly onRecord?: () => void) {}

  onList?: (input: { afterId: number; limit: number; excludeNodeId?: string }) => void | Promise<void>;

  seedStoredEvent(event: {
    id: number;
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: OnlineRuntimeSnapshotReason;
    nodeId: string;
    createdAt?: string;
  }) {
    this.storedEvents.push({
      type: "game_snapshot_changed",
      createdAt: "2026-06-16T00:00:00.000Z",
      ...event,
    });
  }

  async recordGameSnapshotChanged(event: {
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: OnlineRuntimeSnapshotReason;
  }) {
    this.onRecord?.();
    this.events.push(event);
    return {
      id: this.events.length,
      type: "game_snapshot_changed" as const,
      ...event,
      nodeId: "node-a",
      createdAt: "2026-06-16T00:00:00.000Z",
    };
  }

  async listGameSnapshotChangedEventsAfter(input: {
    afterId: number;
    limit: number;
    excludeNodeId?: string;
  }) {
    this.listCalls.push(input);
    await this.onList?.(input);
    const allEvents = this.storedEvents
      .filter((event) => event.id > input.afterId)
      .sort((a, b) => a.id - b.id)
      .slice(0, input.limit);
    return {
      events: input.excludeNodeId
        ? allEvents.filter((event) => event.nodeId !== input.excludeNodeId)
        : allEvents,
      nextAfterId: allEvents.at(-1)?.id ?? input.afterId,
    };
  }
}

class FakeOperationGateStore {
  readonly calls: Array<{
    phase: "start" | "end";
    scope: OnlineRuntimeOperationGateScope;
    key: string;
  }> = [];

  async withOperationGate<T>(
    input: { scope: OnlineRuntimeOperationGateScope; key: string },
    operation: () => Promise<T>
  ): Promise<T> {
    this.calls.push({ phase: "start", ...input });
    try {
      return await operation();
    } finally {
      this.calls.push({ phase: "end", ...input });
    }
  }
}

class FakeStartupMaintenanceStore {
  readonly calls: Array<{
    taskKey: string;
    runKey: string;
    nodeId: string;
  }> = [];
  nextResult: OnlineRuntimeStartupMaintenanceResult<unknown> | null = null;

  async runStartupMaintenance<T>(
    input: { taskKey: string; runKey: string; nodeId: string },
    operation: () => Promise<T>
  ): Promise<OnlineRuntimeStartupMaintenanceResult<T>> {
    this.calls.push(input);
    if (this.nextResult) {
      return this.nextResult as OnlineRuntimeStartupMaintenanceResult<T>;
    }
    return { status: "completed", value: await operation() };
  }
}

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
      startupMaintenance: "process-local",
    });
  });

  it("starts with process-local drain disabled", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });

    await expect(coordinator.getDrainState()).resolves.toEqual({ draining: false });
  });

  it("starts process-local drain once and preserves the original start time", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });

    await expect(
      coordinator.startDrain({
        reason: "rolling_deploy",
        startedAt: "2026-06-16T12:00:00.000Z",
      })
    ).resolves.toEqual({
      draining: true,
      reason: "rolling_deploy",
      startedAt: "2026-06-16T12:00:00.000Z",
    });
    await expect(
      coordinator.startDrain({
        reason: "manual_stop",
        startedAt: "2026-06-16T12:01:00.000Z",
      })
    ).resolves.toEqual({
      draining: true,
      reason: "rolling_deploy",
      startedAt: "2026-06-16T12:00:00.000Z",
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

  it("serializes same Quick Match session gate operations locally", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted!: () => void;
    const firstHasStarted = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const first = coordinator.withQuickMatchSessionGate("session:player-a", async () => {
      order.push("first-start");
      firstStarted();
      await firstMayFinish;
      order.push("first-end");
      return "first";
    });
    await firstHasStarted;

    const second = coordinator.withQuickMatchSessionGate("session:player-a", async () => {
      order.push("second-start");
      order.push("second-end");
      return "second";
    });
    await Promise.resolve();

    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  it("serializes same account challenge pair gate operations locally", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted!: () => void;
    const firstHasStarted = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const first = coordinator.withAccountChallengePairGate(
      HASHED_ACCOUNT_CHALLENGE_PAIR_KEY,
      async () => {
        order.push("first-start");
        firstStarted();
        await firstMayFinish;
        order.push("first-end");
        return "first";
      }
    );
    await firstHasStarted;

    const second = coordinator.withAccountChallengePairGate(
      HASHED_ACCOUNT_CHALLENGE_PAIR_KEY,
      async () => {
        order.push("second-start");
        order.push("second-end");
        return "second";
      }
    );
    await Promise.resolve();

    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  it("serializes same open seek lifecycle gate operations locally", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted!: () => void;
    const firstHasStarted = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const first = coordinator.withOpenSeekLifecycleGate("open_seek_lifecycle:seek_123", async () => {
      order.push("first-start");
      firstStarted();
      await firstMayFinish;
      order.push("first-end");
      return "first";
    });
    await firstHasStarted;

    const second = coordinator.withOpenSeekLifecycleGate("open_seek_lifecycle:seek_123", async () => {
      order.push("second-start");
      order.push("second-end");
      return "second";
    });
    await Promise.resolve();

    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  it("serializes same challenge lifecycle gate operations locally", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted!: () => void;
    const firstHasStarted = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const first = coordinator.withChallengeLifecycleGate("challenge_lifecycle:challenge_123", async () => {
      order.push("first-start");
      firstStarted();
      await firstMayFinish;
      order.push("first-end");
      return "first";
    });
    await firstHasStarted;

    const second = coordinator.withChallengeLifecycleGate("challenge_lifecycle:challenge_123", async () => {
      order.push("second-start");
      order.push("second-end");
      return "second";
    });
    await Promise.resolve();

    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  it("serializes same startup maintenance task locally while still executing each local call", async () => {
    const coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: "node-a" });
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted!: () => void;
    const firstHasStarted = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const first = coordinator.runStartupMaintenance(
      { taskKey: "startup_summary_rebuilds", runKey: "commit:one" },
      async () => {
        order.push("first-start");
        firstStarted();
        await firstMayFinish;
        order.push("first-end");
        return "first";
      }
    );
    await firstHasStarted;

    const second = coordinator.runStartupMaintenance(
      { taskKey: "startup_summary_rebuilds", runKey: "commit:one" },
      async () => {
        order.push("second-start");
        order.push("second-end");
        return "second";
      }
    );
    await Promise.resolve();

    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "completed", value: "first" },
      { status: "completed", value: "second" },
    ]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });
});

describe("createPostgresOperationGateRuntimeCoordinator", () => {
  it("delegates selected shared operation gates to a shared operation gate store", async () => {
    const operationGateStore = new FakeOperationGateStore();
    const coordinator = createPostgresOperationGateRuntimeCoordinator({
      nodeId: "node-a",
      operationGateStore,
    });

    await expect(
      coordinator.withQuickMatchSessionGate("account:acct_123", async () => "matched")
    ).resolves.toBe("matched");
    await expect(
      coordinator.withAccountChallengePairGate(
        HASHED_ACCOUNT_CHALLENGE_PAIR_KEY,
        async () => "created"
      )
    ).resolves.toBe("created");
    await expect(
      coordinator.withOpenSeekLifecycleGate(
        "open_seek_lifecycle:seek_123",
        async () => "cancelled"
      )
    ).resolves.toBe("cancelled");
    await expect(
      coordinator.withChallengeLifecycleGate(
        "challenge_lifecycle:challenge_123",
        async () => "declined"
      )
    ).resolves.toBe("declined");

    expect(operationGateStore.calls).toEqual([
      { phase: "start", scope: "quick_match_session", key: "account:acct_123" },
      { phase: "end", scope: "quick_match_session", key: "account:acct_123" },
      {
        phase: "start",
        scope: "account_challenge_pair",
        key: HASHED_ACCOUNT_CHALLENGE_PAIR_KEY,
      },
      {
        phase: "end",
        scope: "account_challenge_pair",
        key: HASHED_ACCOUNT_CHALLENGE_PAIR_KEY,
      },
      {
        phase: "start",
        scope: "open_seek_lifecycle",
        key: "open_seek_lifecycle:seek_123",
      },
      {
        phase: "end",
        scope: "open_seek_lifecycle",
        key: "open_seek_lifecycle:seek_123",
      },
      {
        phase: "start",
        scope: "challenge_lifecycle",
        key: "challenge_lifecycle:challenge_123",
      },
      {
        phase: "end",
        scope: "challenge_lifecycle",
        key: "challenge_lifecycle:challenge_123",
      },
    ]);
    expect(coordinator.capabilities).toEqual({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "postgres-selected-shared-gates",
      startupMaintenance: "process-local",
    });
  });
});

describe("createPostgresStartupMaintenanceRuntimeCoordinator", () => {
  it("delegates startup maintenance ownership to a PostgreSQL-backed store", async () => {
    const startupMaintenanceStore = new FakeStartupMaintenanceStore();
    const coordinator = createPostgresStartupMaintenanceRuntimeCoordinator({
      nodeId: "node-a",
      startupMaintenanceStore,
    });

    await expect(
      coordinator.runStartupMaintenance(
        {
          taskKey: "startup_summary_rebuilds",
          runKey: "commit:0123456789abcdef0123456789abcdef01234567",
        },
        async () => "rebuilt"
      )
    ).resolves.toEqual({ status: "completed", value: "rebuilt" });

    expect(startupMaintenanceStore.calls).toEqual([
      {
        taskKey: "startup_summary_rebuilds",
        runKey: "commit:0123456789abcdef0123456789abcdef01234567",
        nodeId: "node-a",
      },
    ]);
    expect(coordinator.capabilities).toEqual({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
      startupMaintenance: "postgres-once-per-run",
    });
  });

  it("does not run the local operation when startup maintenance is already complete", async () => {
    const startupMaintenanceStore = new FakeStartupMaintenanceStore();
    startupMaintenanceStore.nextResult = { status: "already_completed" };
    const coordinator = createPostgresStartupMaintenanceRuntimeCoordinator({
      nodeId: "node-a",
      startupMaintenanceStore,
    });
    const operations: string[] = [];

    await expect(
      coordinator.runStartupMaintenance(
        {
          taskKey: "startup_summary_rebuilds",
          runKey: "commit:0123456789abcdef0123456789abcdef01234567",
        },
        async () => {
          operations.push("should-not-run");
          return "rebuilt";
        }
      )
    ).resolves.toEqual({ status: "already_completed" });

    expect(operations).toEqual([]);
  });
});

describe("createPostgresSpectatorPresenceRuntimeCoordinator", () => {
  it("delegates spectator presence to a shared PostgreSQL presence store", async () => {
    const presenceStore = new FakeRuntimeSpectatorPresenceStore();
    const nodeA = createPostgresSpectatorPresenceRuntimeCoordinator({
      nodeId: "node-a",
      spectatorPresenceStore: presenceStore.forNode("node-a"),
    });
    const nodeB = createPostgresSpectatorPresenceRuntimeCoordinator({
      nodeId: "node-b",
      spectatorPresenceStore: presenceStore.forNode("node-b"),
    });

    const first = await nodeA.registerSpectator({ gameId: "game_123" });
    const second = await nodeB.registerSpectator({ gameId: "game_123" });

    expect(nodeA.capabilities).toMatchObject({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "postgres-live-presence",
      operationGates: "process-local",
      startupMaintenance: "process-local",
    });
    expect(await nodeA.countSpectators("game_123")).toBe(2);
    await nodeA.removeSpectator({ gameId: "game_123", connectionId: first.connectionId });
    expect(await nodeB.countSpectators("game_123")).toBe(1);
    await nodeB.removeSpectator({ gameId: "game_123", connectionId: second.connectionId });
    expect(await nodeA.countSpectators("game_123")).toBe(0);
  });

  it("keeps snapshot fanout local when only spectator presence is PostgreSQL-backed", async () => {
    const presenceStore = new FakeRuntimeSpectatorPresenceStore();
    const nodeA = createPostgresSpectatorPresenceRuntimeCoordinator({
      nodeId: "node-a",
      spectatorPresenceStore: presenceStore.forNode("node-a"),
    });
    const nodeB = createPostgresSpectatorPresenceRuntimeCoordinator({
      nodeId: "node-b",
      spectatorPresenceStore: presenceStore.forNode("node-b"),
    });
    const seenByB: unknown[] = [];
    nodeB.subscribeGameSnapshotChanged((event) => {
      seenByB.push(event);
    });

    await nodeA.publishGameSnapshotChanged({
      type: "game_snapshot_changed",
      gameId: "game_123",
      roomVersion: 2,
      reason: "action",
      nodeId: "node-a",
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    expect(seenByB).toEqual([]);
  });

  it("refreshes spectator presence through the shared PostgreSQL presence store", async () => {
    const presenceStore = new FakeRuntimeSpectatorPresenceStore();
    const nodeA = createPostgresSpectatorPresenceRuntimeCoordinator({
      nodeId: "node-a",
      spectatorPresenceStore: presenceStore.forNode("node-a"),
    });
    const registration = await nodeA.registerSpectator({ gameId: "game_123" });

    await expect(
      nodeA.refreshSpectator({
        gameId: "game_123",
        connectionId: registration.connectionId,
      })
    ).resolves.toEqual({ connectionId: registration.connectionId });
    await expect(
      nodeA.refreshSpectator({
        gameId: "game_456",
        connectionId: registration.connectionId,
      })
    ).resolves.toBeNull();
  });
});

describe("createPostgresRuntimeEventCoordinator", () => {
  it("records snapshot-change hints before local fanout", async () => {
    const order: string[] = [];
    const runtimeEventStore = new FakeRuntimeEventStore(() => {
      order.push("store");
    });
    const coordinator = createPostgresRuntimeEventCoordinator({
      nodeId: "node-a",
      runtimeEventStore,
    });
    const seen: unknown[] = [];
    coordinator.subscribeGameSnapshotChanged((event) => {
      order.push("handler");
      seen.push(event);
    });

    await coordinator.publishGameSnapshotChanged({
      type: "game_snapshot_changed",
      gameId: "game_123",
      roomVersion: 4,
      lastEventId: "event_4",
      reason: "action",
      nodeId: "node-a",
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    expect(runtimeEventStore.events).toEqual([
      {
        gameId: "game_123",
        roomVersion: 4,
        lastEventId: "event_4",
        reason: "action",
      },
    ]);
    expect(seen).toHaveLength(1);
    expect(order).toEqual(["store", "handler"]);
  });

  it("does not overclaim remote fanout or multi-instance readiness", () => {
    const coordinator = createPostgresRuntimeEventCoordinator({
      nodeId: "node-a",
      runtimeEventStore: new FakeRuntimeEventStore(),
    });

    expect(coordinator.capabilities).toEqual({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
      startupMaintenance: "process-local",
    });
  });

  it("polls remote runtime event outbox rows into local subscribers without re-recording them", async () => {
    const runtimeEventStore = new FakeRuntimeEventStore();
    runtimeEventStore.seedStoredEvent({
      id: 1,
      gameId: "game_remote_1",
      roomVersion: 2,
      lastEventId: "event_remote_1",
      reason: "action",
      nodeId: "node-a",
    });
    runtimeEventStore.seedStoredEvent({
      id: 2,
      gameId: "game_own",
      roomVersion: 3,
      lastEventId: "event_own",
      reason: "timeout",
      nodeId: "node-b",
    });
    runtimeEventStore.seedStoredEvent({
      id: 3,
      gameId: "game_remote_2",
      roomVersion: 4,
      reason: "visibility",
      nodeId: "node-c",
      createdAt: "2026-06-16T00:00:03.000Z",
    });
    const coordinator = createPostgresRuntimeEventCoordinator({
      nodeId: "node-b",
      runtimeEventStore,
    });
    const seen: unknown[] = [];
    coordinator.subscribeGameSnapshotChanged((event) => {
      seen.push(event);
    });

    await expect(coordinator.pollRemoteGameSnapshotChangedEvents({ limit: 10 })).resolves.toEqual({
      afterId: 3,
      published: 2,
    });

    expect(runtimeEventStore.listCalls).toEqual([
      { afterId: 0, limit: 10, excludeNodeId: "node-b" },
    ]);
    expect(runtimeEventStore.events).toEqual([]);
    expect(seen).toEqual([
      {
        type: "game_snapshot_changed",
        gameId: "game_remote_1",
        roomVersion: 2,
        lastEventId: "event_remote_1",
        reason: "action",
        nodeId: "node-a",
        createdAt: "2026-06-16T00:00:00.000Z",
      },
      {
        type: "game_snapshot_changed",
        gameId: "game_remote_2",
        roomVersion: 4,
        reason: "visibility",
        nodeId: "node-c",
        createdAt: "2026-06-16T00:00:03.000Z",
      },
    ]);
  });

  it("advances the remote runtime event cursor past own-node rows", async () => {
    const runtimeEventStore = new FakeRuntimeEventStore();
    runtimeEventStore.seedStoredEvent({
      id: 2,
      gameId: "game_own",
      roomVersion: 3,
      lastEventId: "event_own",
      reason: "action",
      nodeId: "node-b",
    });
    const coordinator = createPostgresRuntimeEventCoordinator({
      nodeId: "node-b",
      runtimeEventStore,
    });
    const seen: unknown[] = [];
    coordinator.subscribeGameSnapshotChanged((event) => {
      seen.push(event);
    });

    await expect(coordinator.pollRemoteGameSnapshotChangedEvents()).resolves.toEqual({
      afterId: 2,
      published: 0,
    });
    await expect(coordinator.pollRemoteGameSnapshotChangedEvents()).resolves.toEqual({
      afterId: 2,
      published: 0,
    });

    expect(seen).toEqual([]);
    expect(runtimeEventStore.listCalls).toEqual([
      { afterId: 0, limit: 100, excludeNodeId: "node-b" },
      { afterId: 2, limit: 100, excludeNodeId: "node-b" },
    ]);
  });

  it("keeps the remote runtime event cursor retryable when local fanout fails", async () => {
    const runtimeEventStore = new FakeRuntimeEventStore();
    runtimeEventStore.seedStoredEvent({
      id: 5,
      gameId: "game_remote",
      roomVersion: 6,
      lastEventId: "event_remote",
      reason: "timeout",
      nodeId: "node-a",
    });
    const coordinator = createPostgresRuntimeEventCoordinator({
      nodeId: "node-b",
      runtimeEventStore,
    });
    const unsubscribe = coordinator.subscribeGameSnapshotChanged(() => {
      throw new Error("local fanout unavailable");
    });

    await expect(coordinator.pollRemoteGameSnapshotChangedEvents()).rejects.toThrow(
      /local fanout unavailable/
    );

    unsubscribe();
    const seen: unknown[] = [];
    coordinator.subscribeGameSnapshotChanged((event) => {
      seen.push(event);
    });
    await expect(coordinator.pollRemoteGameSnapshotChangedEvents()).resolves.toEqual({
      afterId: 5,
      published: 1,
    });

    expect(runtimeEventStore.listCalls).toEqual([
      { afterId: 0, limit: 100, excludeNodeId: "node-b" },
      { afterId: 0, limit: 100, excludeNodeId: "node-b" },
    ]);
    expect(seen).toEqual([
      {
        type: "game_snapshot_changed",
        gameId: "game_remote",
        roomVersion: 6,
        lastEventId: "event_remote",
        reason: "timeout",
        nodeId: "node-a",
        createdAt: "2026-06-16T00:00:00.000Z",
      },
    ]);
  });

  it("coalesces overlapping remote runtime event polls without duplicate fanout", async () => {
    const runtimeEventStore = new FakeRuntimeEventStore();
    runtimeEventStore.seedStoredEvent({
      id: 7,
      gameId: "game_remote",
      roomVersion: 8,
      lastEventId: "event_remote",
      reason: "action",
      nodeId: "node-a",
    });
    let holdFirstList = true;
    let releaseFirstList!: () => void;
    const firstListReleased = new Promise<void>((resolve) => {
      releaseFirstList = resolve;
    });
    const firstListStarted = new Promise<void>((resolve) => {
      runtimeEventStore.onList = async () => {
        if (!holdFirstList) return;
        holdFirstList = false;
        resolve();
        await firstListReleased;
      };
    });
    const coordinator = createPostgresRuntimeEventCoordinator({
      nodeId: "node-b",
      runtimeEventStore,
    });
    const seen: unknown[] = [];
    coordinator.subscribeGameSnapshotChanged((event) => {
      seen.push(event);
    });

    const firstPoll = coordinator.pollRemoteGameSnapshotChangedEvents();
    await firstListStarted;
    const secondPoll = coordinator.pollRemoteGameSnapshotChangedEvents();
    releaseFirstList();

    await expect(Promise.all([firstPoll, secondPoll])).resolves.toEqual([
      { afterId: 7, published: 1 },
      { afterId: 7, published: 1 },
    ]);
    expect(runtimeEventStore.listCalls).toEqual([
      { afterId: 0, limit: 100, excludeNodeId: "node-b" },
    ]);
    expect(seen).toEqual([
      {
        type: "game_snapshot_changed",
        gameId: "game_remote",
        roomVersion: 8,
        lastEventId: "event_remote",
        reason: "action",
        nodeId: "node-a",
        createdAt: "2026-06-16T00:00:00.000Z",
      },
    ]);
  });
});
