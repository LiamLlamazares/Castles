import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnlineRuntimeEventPollResult } from "../../src/online/server/onlineRuntimeCoordinator";
import { startRuntimeEventPolling } from "../runtimeEventPolling";

describe("startRuntimeEventPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createCoordinator(
    poll: () => Promise<OnlineRuntimeEventPollResult>
  ) {
    return {
      pollRemoteGameSnapshotChangedEvents: vi.fn(async (input?: { limit?: number }) => {
        expect(input).toEqual({ limit: 25 });
        return poll();
      }),
    };
  }

  it("polls once immediately and then repeats after the normal interval", async () => {
    const coordinator = createCoordinator(async () => ({ afterId: 1, published: 0 }));
    const poller = startRuntimeEventPolling({
      runtimeCoordinator: coordinator,
      intervalMs: 1_000,
      maxBackoffMs: 8_000,
      pollLimit: 25,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(1);
    expect(poller.getStatus()).toMatchObject({
      running: true,
      ready: true,
      consecutiveFailures: 0,
      lastResult: { afterId: 1, published: 0 },
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(2);

    await poller.stop();
  });

  it("does not overlap polls while a previous poll is still in flight", async () => {
    let resolveFirst: ((value: OnlineRuntimeEventPollResult) => void) | undefined;
    const firstPoll = new Promise<OnlineRuntimeEventPollResult>((resolve) => {
      resolveFirst = resolve;
    });
    const coordinator = createCoordinator(vi.fn()
      .mockReturnValueOnce(firstPoll)
      .mockResolvedValue({ afterId: 2, published: 1 }));
    const poller = startRuntimeEventPolling({
      runtimeCoordinator: coordinator,
      intervalMs: 1_000,
      maxBackoffMs: 8_000,
      pollLimit: 25,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(1);

    resolveFirst?.({ afterId: 1, published: 1 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(2);

    await poller.stop();
  });

  it("waits for an in-flight poll before stop resolves", async () => {
    let resolveFirst: ((value: OnlineRuntimeEventPollResult) => void) | undefined;
    const firstPoll = new Promise<OnlineRuntimeEventPollResult>((resolve) => {
      resolveFirst = resolve;
    });
    const coordinator = createCoordinator(vi.fn().mockReturnValueOnce(firstPoll));
    const poller = startRuntimeEventPolling({
      runtimeCoordinator: coordinator,
      intervalMs: 1_000,
      maxBackoffMs: 8_000,
      pollLimit: 25,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopPromise = Promise.resolve(poller.stop()).then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveFirst?.({ afterId: 1, published: 1 });
    await vi.advanceTimersByTimeAsync(0);
    await stopPromise;
    expect(stopped).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(1);
  });

  it("backs off after failures and becomes ready again after a successful poll", async () => {
    const coordinator = createCoordinator(vi.fn()
      .mockRejectedValueOnce(new Error("temporary outbox failure"))
      .mockRejectedValueOnce(new Error("temporary outbox failure"))
      .mockResolvedValue({ afterId: 5, published: 2 }));
    const poller = startRuntimeEventPolling({
      runtimeCoordinator: coordinator,
      intervalMs: 1_000,
      maxBackoffMs: 4_000,
      pollLimit: 25,
      failureReadinessThreshold: 2,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(poller.getStatus()).toMatchObject({
      running: true,
      ready: true,
      consecutiveFailures: 1,
      lastError: "temporary outbox failure",
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(2);
    expect(poller.getStatus()).toMatchObject({
      running: true,
      ready: false,
      consecutiveFailures: 2,
      lastError: "temporary outbox failure",
    });

    await vi.advanceTimersByTimeAsync(3_999);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(3);
    expect(poller.getStatus()).toMatchObject({
      running: true,
      ready: true,
      consecutiveFailures: 0,
      lastError: undefined,
      lastResult: { afterId: 5, published: 2 },
    });

    await poller.stop();
  });

  it("sanitizes failure messages and stops future polls", async () => {
    const coordinator = createCoordinator(async () => {
      throw new Error("connect failed for postgresql://castles:secret@db.example/castles refused");
    });
    const poller = startRuntimeEventPolling({
      runtimeCoordinator: coordinator,
      intervalMs: 1_000,
      maxBackoffMs: 8_000,
      pollLimit: 25,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(poller.getStatus().lastError).toBe("Runtime event polling failed.");

    await poller.stop();
    expect(poller.getStatus()).toMatchObject({
      running: false,
      ready: true,
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(coordinator.pollRemoteGameSnapshotChangedEvents).toHaveBeenCalledTimes(1);
  });
});
