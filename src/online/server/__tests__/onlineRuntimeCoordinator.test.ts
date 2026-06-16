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
