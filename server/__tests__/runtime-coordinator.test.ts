import { describe, expect, it } from "vitest";
import { createConfiguredRuntimeCoordinator } from "../runtimeCoordinator";
import type {
  OnlineRuntimeDrainState,
  OnlineRuntimeGameSnapshotChangedEvent,
  OnlineRuntimeNodeStore,
  OnlineRuntimeOperationGateScope,
  OnlineRuntimeRateLimitInput,
  OnlineRuntimeStoredGameSnapshotChangedEvent,
} from "../../src/online/server/onlineRuntimeCoordinator";

class FakeSpectatorPresenceStore {
  readonly calls: string[] = [];
  cleanupCount = 0;

  async registerSpectator(input: { gameId: string }) {
    this.calls.push(`register:${input.gameId}`);
    return { connectionId: "spectator_shared_1" };
  }

  async refreshSpectator(input: { gameId: string; connectionId: string }) {
    this.calls.push(`refresh:${input.gameId}:${input.connectionId}`);
    return { connectionId: input.connectionId };
  }

  async removeSpectator(input: { gameId: string; connectionId: string }) {
    this.calls.push(`remove:${input.gameId}:${input.connectionId}`);
  }

  async countSpectators(gameId: string) {
    this.calls.push(`count:${gameId}`);
    return 12;
  }

  async cleanupExpiredSpectators() {
    this.cleanupCount += 1;
    return 3;
  }
}

class FakeRuntimeEventStore {
  readonly recorded: Array<{
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: string;
  }> = [];
  remoteEvents: OnlineRuntimeStoredGameSnapshotChangedEvent[] = [];

  async recordGameSnapshotChanged(input: {
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: OnlineRuntimeGameSnapshotChangedEvent["reason"];
  }) {
    this.recorded.push(input);
    return {};
  }

  async listGameSnapshotChangedEventsAfter(input: {
    afterId: number;
    limit: number;
    excludeNodeId?: string;
  }) {
    return {
      events: this.remoteEvents.filter((event) => event.id > input.afterId),
      nextAfterId: this.remoteEvents.at(-1)?.id ?? input.afterId,
    };
  }
}

class FakeOperationGateStore {
  readonly calls: Array<{ scope: OnlineRuntimeOperationGateScope; key: string }> = [];

  async withOperationGate<T>(
    input: { scope: OnlineRuntimeOperationGateScope; key: string },
    operation: () => Promise<T>
  ) {
    this.calls.push(input);
    return operation();
  }
}

class FakeRateLimitStore {
  readonly calls: OnlineRuntimeRateLimitInput[] = [];
  nextResult = false;

  async consumeRateLimit(input: OnlineRuntimeRateLimitInput) {
    this.calls.push(input);
    return this.nextResult;
  }
}

class FakeStartupMaintenanceStore {
  readonly calls: Array<{ taskKey: string; runKey: string; nodeId: string }> = [];

  async runStartupMaintenance<T>(
    input: { taskKey: string; runKey: string; nodeId: string },
    operation: () => Promise<T>
  ) {
    this.calls.push(input);
    return { status: "completed" as const, value: await operation() };
  }
}

class FakeRuntimeNodeStore implements OnlineRuntimeNodeStore {
  readonly calls: Array<["getDrainState"] | ["startDrain", unknown]> = [];
  drainState: OnlineRuntimeDrainState = { draining: false };

  async getDrainState(): Promise<OnlineRuntimeDrainState> {
    this.calls.push(["getDrainState"]);
    return { ...this.drainState };
  }

  async startDrain(input = {}): Promise<OnlineRuntimeDrainState> {
    this.calls.push(["startDrain", input]);
    return { ...this.drainState };
  }
}

describe("createConfiguredRuntimeCoordinator", () => {
  it("uses the parsed runtime node id for the server runtime coordinator", () => {
    const coordinator = createConfiguredRuntimeCoordinator({ runtimeNodeId: "prod-node-a" });

    expect(coordinator.nodeId).toBe("prod-node-a");
    expect(coordinator.capabilities).toMatchObject({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
      rateLimits: "process-local",
      startupMaintenance: "process-local",
    });
  });

  it("uses PostgreSQL startup maintenance ownership when a store is supplied", async () => {
    const startupMaintenanceStore = new FakeStartupMaintenanceStore();
    const coordinator = createConfiguredRuntimeCoordinator(
      { runtimeNodeId: "prod-node-a" },
      { startupMaintenanceStore }
    );

    await expect(
      coordinator.runStartupMaintenance(
        {
          taskKey: "startup_summary_rebuilds",
          runKey: "commit:0123456789abcdef0123456789abcdef01234567",
        },
        async () => "rebuilt"
      )
    ).resolves.toEqual({ status: "completed", value: "rebuilt" });

    expect(coordinator.nodeId).toBe("prod-node-a");
    expect(coordinator.capabilities).toMatchObject({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
      rateLimits: "process-local",
      startupMaintenance: "postgres-once-per-run",
    });
    expect(startupMaintenanceStore.calls).toEqual([
      {
        taskKey: "startup_summary_rebuilds",
        runKey: "commit:0123456789abcdef0123456789abcdef01234567",
        nodeId: "prod-node-a",
      },
    ]);
  });

  it("composes all supplied PostgreSQL runtime primitives without enabling multi-instance mode", async () => {
    const spectatorPresenceStore = new FakeSpectatorPresenceStore();
    const runtimeEventStore = new FakeRuntimeEventStore();
    const operationGateStore = new FakeOperationGateStore();
    const rateLimitStore = new FakeRateLimitStore();
    const startupMaintenanceStore = new FakeStartupMaintenanceStore();
    const runtimeNodeStore = new FakeRuntimeNodeStore();
    runtimeNodeStore.drainState = { draining: true, startedAt: "2026-06-17T10:05:00.000Z" };
    const coordinator = createConfiguredRuntimeCoordinator(
      { runtimeNodeId: "prod-node-a" },
      {
        spectatorPresenceStore,
        runtimeEventStore,
        operationGateStore,
        rateLimitStore,
        startupMaintenanceStore,
        runtimeNodeStore,
      }
    );
    const received: OnlineRuntimeGameSnapshotChangedEvent[] = [];
    coordinator.subscribeGameSnapshotChanged((event) => {
      received.push(event);
    });

    await expect(coordinator.registerSpectator({ gameId: "game_1" })).resolves.toEqual({
      connectionId: "spectator_shared_1",
    });
    await expect(
      coordinator.refreshSpectator({ gameId: "game_1", connectionId: "spectator_shared_1" })
    ).resolves.toEqual({ connectionId: "spectator_shared_1" });
    await expect(coordinator.countSpectators("game_1")).resolves.toBe(12);
    await coordinator.removeSpectator({ gameId: "game_1", connectionId: "spectator_shared_1" });

    const localEvent: OnlineRuntimeGameSnapshotChangedEvent = {
      type: "game_snapshot_changed",
      gameId: "game_1",
      roomVersion: 3,
      lastEventId: "event_3",
      reason: "action",
      nodeId: "prod-node-a",
      createdAt: "2026-06-16T12:00:00.000Z",
    };
    await coordinator.publishGameSnapshotChanged(localEvent);

    runtimeEventStore.remoteEvents = [
      {
        id: 7,
        type: "game_snapshot_changed",
        gameId: "game_2",
        roomVersion: 4,
        lastEventId: "event_4",
        reason: "snapshot",
        nodeId: "prod-node-b",
        createdAt: "2026-06-16T12:00:01.000Z",
      },
    ];
    await expect(coordinator.pollRemoteGameSnapshotChangedEvents({ limit: 10 })).resolves.toEqual({
      afterId: 7,
      published: 1,
    });

    await expect(
      coordinator.withQuickMatchSessionGate("session:public", async () => "quick")
    ).resolves.toBe("quick");
    await expect(
      coordinator.withAccountChallengePairGate(
        "account_challenge_pair:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN1",
        async () => "pair"
      )
    ).resolves.toBe("pair");
    await expect(
      coordinator.withOpenSeekLifecycleGate("open_seek_lifecycle:seek_1", async () => "seek")
    ).resolves.toBe("seek");
    await expect(
      coordinator.withChallengeLifecycleGate("challenge_lifecycle:challenge_1", async () => "challenge")
    ).resolves.toBe("challenge");

    await expect(
      coordinator.consumeRateLimit({
        scope: "quick_match",
        key: "client:127.0.0.1",
        limit: 2,
        windowMs: 1_000,
      })
    ).resolves.toBe(false);
    await expect(
      coordinator.runStartupMaintenance(
        {
          taskKey: "startup_summary_rebuilds",
          runKey: "commit:0123456789abcdef0123456789abcdef01234567",
        },
        async () => "rebuilt"
      )
    ).resolves.toEqual({ status: "completed", value: "rebuilt" });
    await expect(coordinator.getDrainState()).resolves.toEqual({
      draining: true,
      startedAt: "2026-06-17T10:05:00.000Z",
    });
    await expect(coordinator.startDrain({ reason: "operator" })).resolves.toEqual({
      draining: true,
      startedAt: "2026-06-17T10:05:00.000Z",
    });
    await coordinator.close();

    expect(coordinator.capabilities).toEqual({
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "postgres-live-presence",
      operationGates: "postgres-selected-shared-gates",
      rateLimits: "postgres-shared-fixed-window",
      startupMaintenance: "postgres-once-per-run",
    });
    expect(spectatorPresenceStore.calls).toEqual([
      "register:game_1",
      "refresh:game_1:spectator_shared_1",
      "count:game_1",
      "remove:game_1:spectator_shared_1",
    ]);
    expect(spectatorPresenceStore.cleanupCount).toBe(1);
    expect(runtimeEventStore.recorded).toEqual([
      { gameId: "game_1", roomVersion: 3, lastEventId: "event_3", reason: "action" },
    ]);
    expect(received).toEqual([
      localEvent,
      {
        type: "game_snapshot_changed",
        gameId: "game_2",
        roomVersion: 4,
        lastEventId: "event_4",
        reason: "snapshot",
        nodeId: "prod-node-b",
        createdAt: "2026-06-16T12:00:01.000Z",
      },
    ]);
    expect(operationGateStore.calls).toEqual([
      { scope: "quick_match_session", key: "session:public" },
      {
        scope: "account_challenge_pair",
        key: "account_challenge_pair:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN1",
      },
      { scope: "open_seek_lifecycle", key: "open_seek_lifecycle:seek_1" },
      { scope: "challenge_lifecycle", key: "challenge_lifecycle:challenge_1" },
    ]);
    expect(rateLimitStore.calls).toEqual([
      { scope: "quick_match", key: "client:127.0.0.1", limit: 2, windowMs: 1_000 },
    ]);
    expect(startupMaintenanceStore.calls).toEqual([
      {
        taskKey: "startup_summary_rebuilds",
        runKey: "commit:0123456789abcdef0123456789abcdef01234567",
        nodeId: "prod-node-a",
      },
    ]);
    expect(runtimeNodeStore.calls).toEqual([
      ["getDrainState"],
      ["startDrain", { reason: "operator" }],
    ]);
  });
});
