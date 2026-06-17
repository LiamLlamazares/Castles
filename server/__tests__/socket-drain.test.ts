import { describe, expect, it, afterEach, vi } from "vitest";
import { ONLINE_PROTOCOL_VERSION } from "../../src/online/protocolVersion";
import {
  DRAIN_SOCKET_ERROR,
  closeHttpServer,
  closeWebSocketServerAfterDrain,
} from "../socketDrain";

class FakeWebSocketClient {
  readyState = 1;
  readonly sent: string[] = [];
  readonly send = vi.fn((message: string) => {
    this.sent.push(message);
  });
  readonly close = vi.fn(() => {
    this.readyState = 2;
  });
  readonly terminate = vi.fn();
}

class FakeWebSocketServer {
  readonly clients = new Set<FakeWebSocketClient>();
  private closeCallback: (() => void) | undefined;

  readonly close = vi.fn((callback?: () => void) => {
    this.closeCallback = callback;
  });

  finishClose() {
    this.closeCallback?.();
  }
}

class FakeHttpServer {
  listening = true;
  private closeCallback: ((error?: Error) => void) | undefined;

  readonly closeAllConnections = vi.fn();
  readonly close = vi.fn((callback?: (error?: Error) => void) => {
    this.closeCallback = callback;
  });

  finishClose(error?: Error) {
    this.listening = false;
    this.closeCallback?.(error);
  }
}

describe("socket drain helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps websocket clients open during the drain grace period", async () => {
    vi.useFakeTimers();
    const client = new FakeWebSocketClient();
    const wss = new FakeWebSocketServer();
    wss.clients.add(client);

    const closing = closeWebSocketServerAfterDrain(wss as any, {
      drainGraceMs: 1_000,
      closeTimeoutMs: 500,
    });

    await vi.advanceTimersByTimeAsync(999);

    expect(wss.close).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
    expect(client.close).not.toHaveBeenCalled();
    expect(client.terminate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(wss.close).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(client.sent[0])).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: "error",
      error: DRAIN_SOCKET_ERROR,
    });
    expect(client.close).toHaveBeenCalledWith(1001, "Server draining for deploy");
    expect(client.terminate).not.toHaveBeenCalled();

    wss.finishClose();
    await expect(closing).resolves.toBeUndefined();
  });

  it("force terminates websocket clients that remain closing after the close timeout", async () => {
    vi.useFakeTimers();
    const client = new FakeWebSocketClient();
    const wss = new FakeWebSocketServer();
    wss.clients.add(client);

    const closing = closeWebSocketServerAfterDrain(wss as any, {
      drainGraceMs: 1_000,
      closeTimeoutMs: 500,
    });

    await vi.advanceTimersByTimeAsync(1_500);

    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledWith(1001, "Server draining for deploy");
    expect(client.readyState).toBe(2);
    expect(client.terminate).toHaveBeenCalledTimes(1);
    await expect(closing).resolves.toBeUndefined();
  });

  it("ignores websocket clients that are already closed when the drain grace expires", async () => {
    vi.useFakeTimers();
    const client = new FakeWebSocketClient();
    client.readyState = 3;
    const wss = new FakeWebSocketServer();
    wss.clients.add(client);

    const closing = closeWebSocketServerAfterDrain(wss as any, {
      drainGraceMs: 1_000,
      closeTimeoutMs: 500,
    });

    await vi.advanceTimersByTimeAsync(1_500);

    expect(client.send).not.toHaveBeenCalled();
    expect(client.close).not.toHaveBeenCalled();
    expect(client.terminate).not.toHaveBeenCalled();
    await expect(closing).resolves.toBeUndefined();
  });

  it("forces HTTP connections only after the HTTP close timeout", async () => {
    vi.useFakeTimers();
    const server = new FakeHttpServer();

    const closing = closeHttpServer(server as any, { timeoutMs: 1_000 });

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeAllConnections).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(server.closeAllConnections).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    await expect(closing).resolves.toBeUndefined();
  });

  it("does not force HTTP connections when the server closes before the timeout", async () => {
    vi.useFakeTimers();
    const server = new FakeHttpServer();

    const closing = closeHttpServer(server as any, { timeoutMs: 1_000 });
    server.finishClose();

    await expect(closing).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });
});
