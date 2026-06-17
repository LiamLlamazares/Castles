import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRuntimeNodeHeartbeat } from "../runtimeNodeHeartbeat";

describe("startRuntimeNodeHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T11:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createRuntimeNodeStore(heartbeat: () => Promise<unknown>) {
    return {
      recordNodeHeartbeat: vi.fn(heartbeat),
    };
  }

  it("records one heartbeat immediately and then repeats after the normal interval", async () => {
    const runtimeNodeStore = createRuntimeNodeStore(async () => ({}));
    const heartbeat = startRuntimeNodeHeartbeat({
      runtimeNodeStore,
      intervalMs: 1_000,
      maxBackoffMs: 8_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(1);
    expect(heartbeat.getStatus()).toMatchObject({
      running: true,
      ready: true,
      consecutiveFailures: 0,
      lastHeartbeatAt: "2026-06-17T11:00:00.000Z",
      lastSuccessAt: "2026-06-17T11:00:00.000Z",
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(2);

    await heartbeat.stop();
  });

  it("does not overlap heartbeats while a previous heartbeat is still in flight", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const firstHeartbeat = new Promise<unknown>((resolve) => {
      resolveFirst = resolve;
    });
    const runtimeNodeStore = createRuntimeNodeStore(
      vi.fn().mockReturnValueOnce(firstHeartbeat).mockResolvedValue({})
    );
    const heartbeat = startRuntimeNodeHeartbeat({
      runtimeNodeStore,
      intervalMs: 1_000,
      maxBackoffMs: 8_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(1);

    resolveFirst?.({});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(2);

    await heartbeat.stop();
  });

  it("waits for an in-flight heartbeat before stop resolves", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const firstHeartbeat = new Promise<unknown>((resolve) => {
      resolveFirst = resolve;
    });
    const runtimeNodeStore = createRuntimeNodeStore(vi.fn().mockReturnValueOnce(firstHeartbeat));
    const heartbeat = startRuntimeNodeHeartbeat({
      runtimeNodeStore,
      intervalMs: 1_000,
      maxBackoffMs: 8_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopPromise = Promise.resolve(heartbeat.stop()).then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveFirst?.({});
    await vi.advanceTimersByTimeAsync(0);
    await stopPromise;
    expect(stopped).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("backs off after failures and becomes ready again after a successful heartbeat", async () => {
    const runtimeNodeStore = createRuntimeNodeStore(
      vi.fn()
        .mockRejectedValueOnce(new Error("temporary node heartbeat failure"))
        .mockRejectedValueOnce(new Error("temporary node heartbeat failure"))
        .mockResolvedValue({})
    );
    const heartbeat = startRuntimeNodeHeartbeat({
      runtimeNodeStore,
      intervalMs: 1_000,
      maxBackoffMs: 4_000,
      failureReadinessThreshold: 2,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeat.getStatus()).toMatchObject({
      running: true,
      ready: true,
      consecutiveFailures: 1,
      lastError: "temporary node heartbeat failure",
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(2);
    expect(heartbeat.getStatus()).toMatchObject({
      running: true,
      ready: false,
      consecutiveFailures: 2,
      lastError: "temporary node heartbeat failure",
    });

    await vi.advanceTimersByTimeAsync(3_999);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(3);
    expect(heartbeat.getStatus()).toMatchObject({
      running: true,
      ready: true,
      consecutiveFailures: 0,
      lastError: undefined,
    });

    await heartbeat.stop();
  });

  it("sanitizes failure messages and stops future heartbeats", async () => {
    const runtimeNodeStore = createRuntimeNodeStore(async () => {
      throw new Error("connect failed for postgresql://castles:secret@db.example/castles refused");
    });
    const heartbeat = startRuntimeNodeHeartbeat({
      runtimeNodeStore,
      intervalMs: 1_000,
      maxBackoffMs: 8_000,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeat.getStatus().lastError).toBe("Runtime node heartbeat failed.");

    await heartbeat.stop();
    expect(heartbeat.getStatus()).toMatchObject({
      running: false,
      ready: true,
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtimeNodeStore.recordNodeHeartbeat).toHaveBeenCalledTimes(1);
  });
});

