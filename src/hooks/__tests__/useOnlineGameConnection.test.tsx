import { act, renderHook, waitFor } from "@testing-library/react";
import { useOnlineGameConnection } from "../useOnlineGameConnection";
import { ONLINE_PROTOCOL_VERSION } from "../../online/protocolVersion";
import type { OnlineJoinParams } from "../../online/client";

class MockWebSocket {
  static readonly OPEN = 1;
  readonly sent: string[] = [];
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  static instances: MockWebSocket[] = [];

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.readyState = 3;
  }
}

function snapshot(version = 0) {
  return {
    gameId: "game_123",
    version,
    setup: { board: { config: { nSquares: 6 }, castles: [] }, pieces: [], sanctuaries: [] },
    state: {
      pieces: [],
      castles: [],
      sanctuaries: [],
      turnCounter: 0,
      sanctuaryPool: [],
      graveyard: [],
      phoenixRecords: [],
      promotionPending: null,
    },
    moveHistory: [],
    playerToMove: "w",
    turnPhase: "Movement",
  };
}

describe("useOnlineGameConnection", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ protocolVersion: ONLINE_PROTOCOL_VERSION, snapshot: snapshot(0) }),
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fetches a player snapshot and joins the websocket as that player", async () => {
    const snapshots: Array<{ version: number }> = [];
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };

    const { result } = renderHook(() =>
      useOnlineGameConnection(
        join,
        (nextSnapshot) => {
          snapshots.push(nextSnapshot as { version: number });
        }
      )
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/online/games/game_123", {
        headers: { authorization: "Bearer white-token" },
      });
    });
    expect(snapshots.at(-1)).toMatchObject({ version: 0 });

    const socket = MockWebSocket.instances.at(-1)!;
    await act(async () => {
      socket.onopen?.();
    });

    expect(JSON.parse(socket.sent[0])).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: "join",
      gameId: "game_123",
      token: "white-token",
    });

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "joined",
          color: "w",
          snapshot: snapshot(1),
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });
    expect(snapshots.at(-1)).toMatchObject({ version: 1 });
  });

  it("adds a fresh client action id to outbound action messages", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "client-action-hook-1"),
    });
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(async () => {
      socket.onopen?.();
    });
    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "joined",
          color: "w",
          snapshot: snapshot(0),
        }),
      });
    });

    act(() => {
      result.current.submitAction({ type: "PASS", baseVersion: 0 });
    });

    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: "action",
      clientActionId: "client-action-hook-1",
      action: { type: "PASS", baseVersion: 0 },
    });
    expect(result.current.isActionPending).toBe(true);
  });

  it("blocks overlapping online actions until the server confirms the pending action", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("client-action-pending-1")
        .mockReturnValueOnce("client-action-pending-2"),
    });
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(async () => {
      socket.onopen?.();
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "joined",
          color: "w",
          snapshot: snapshot(0),
        }),
      });
    });

    act(() => {
      result.current.submitAction({ type: "PASS", baseVersion: 0 });
      result.current.submitAction({ type: "RESIGN", baseVersion: 0 });
    });

    expect(socket.sent.map((message) => JSON.parse(message).type).filter((type) => type === "action")).toHaveLength(1);
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      clientActionId: "client-action-pending-1",
      action: { type: "PASS" },
    });
    expect(result.current.isActionPending).toBe(true);
    expect(result.current.lastError).toBe("Waiting for the server to confirm the previous action.");

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: snapshot(1),
        }),
      });
    });

    expect(result.current.isActionPending).toBe(false);
    expect(result.current.lastError).toBeUndefined();

    act(() => {
      result.current.submitAction({ type: "RESIGN", baseVersion: 1 });
    });

    expect(socket.sent.map((message) => JSON.parse(message).type).filter((type) => type === "action")).toHaveLength(2);
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      clientActionId: "client-action-pending-2",
      action: { type: "RESIGN" },
    });
  });

  it("turns malformed server messages into controlled connection errors", async () => {
    const snapshots: Array<{ version: number }> = [];
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() =>
      useOnlineGameConnection(
        join,
        (nextSnapshot) => {
          snapshots.push(nextSnapshot as { version: number });
        }
      )
    );

    await waitFor(() => expect(snapshots).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({ type: "joined", color: "w" }),
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("protocol-error");
      expect(result.current.lastError).toContain("invalid");
    });
    expect(snapshots).toHaveLength(1);
  });

  it("turns non-json server frames into controlled connection errors", async () => {
    const snapshots: Array<{ version: number }> = [];
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() =>
      useOnlineGameConnection(join, (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number });
      })
    );

    await waitFor(() => expect(snapshots).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(async () => {
      socket.onmessage?.({ data: "not-json" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("protocol-error");
      expect(result.current.lastError).toContain("invalid");
    });
    expect(snapshots).toHaveLength(1);
  });

  it("handles snapshot, pong, rejected, error, and wrong-role frames predictably", async () => {
    const snapshots: Array<{ version: number }> = [];
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() =>
      useOnlineGameConnection(join, (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number });
      })
    );

    await waitFor(() => expect(snapshots).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: snapshot(1),
        }),
      });
    });
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(snapshots.at(-1)).toMatchObject({ version: 1 });

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "pong",
          clientTime: 123,
          serverTime: 456,
        }),
      });
    });
    expect(result.current.status).toBe("connected");
    expect(snapshots.at(-1)).toMatchObject({ version: 1 });

    act(() => {
      result.current.submitAction({ type: "PASS", baseVersion: 1 });
    });
    const pendingAction = JSON.parse(socket.sent.at(-1)!);

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "rejected",
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          clientActionId: pendingAction.clientActionId,
          error: { code: "stale_action", message: "Old action." },
          snapshot: snapshot(2),
        }),
      });
    });
    await waitFor(() => expect(result.current.lastError).toBe("Position updated from server. Try again."));
    expect(result.current.status).toBe("connected");
    expect(snapshots.at(-1)).toMatchObject({ version: 2 });

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "error",
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          error: { code: "bad_request", message: "Server problem." },
          snapshot: snapshot(3),
        }),
      });
    });
    await waitFor(() => expect(result.current.status).toBe("server-error"));
    expect(result.current.lastError).toBe("Server problem.");
    expect(snapshots.at(-1)).toMatchObject({ version: 3 });

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "spectating",
          snapshot: snapshot(4),
        }),
      });
    });
    await waitFor(() => {
      expect(result.current.status).toBe("protocol-error");
      expect(result.current.lastError).toContain("spectator message");
    });
    expect(snapshots.at(-1)).toMatchObject({ version: 3 });
  });

  it("marks unauthorized and missing games as access denied", async () => {
    const join = { gameId: "game_123", seat: "w" as const, token: "bad-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "error",
          error: { code: "unauthorized", message: "Invite link is no longer valid." },
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("access-denied");
      expect(result.current.lastError).toBe("Invite link is no longer valid.");
    });
  });

  it("marks terminal snapshots as terminal connection state", async () => {
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: {
            ...snapshot(4),
            result: { winner: "b", reason: "timeout" },
          },
        }),
      });
    });

    await waitFor(() => expect(result.current.status).toBe("terminal"));
  });

  it("does not let stale non-terminal snapshots overwrite terminal state", async () => {
    const snapshots: Array<{ version: number; result?: unknown }> = [];
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() =>
      useOnlineGameConnection(join, (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number; result?: unknown });
      })
    );

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: {
            ...snapshot(4),
            result: { winner: "b", reason: "timeout" },
          },
        }),
      });
    });
    await waitFor(() => expect(result.current.status).toBe("terminal"));

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: snapshot(3),
        }),
      });
    });

    expect(result.current.status).toBe("terminal");
    expect(snapshots.at(-1)).toMatchObject({ version: 4, result: { reason: "timeout" } });
  });

  it("does not reconnect after terminal or protected error states", async () => {
    vi.useFakeTimers();
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await act(async () => {
      await Promise.resolve();
    });
    const socket = MockWebSocket.instances.at(-1)!;

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "error",
          error: { code: "unauthorized", message: "Invite link expired." },
        }),
      });
    });
    expect(result.current.status).toBe("access-denied");

    act(() => {
      socket.onclose?.();
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });

    expect(result.current.status).toBe("access-denied");
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("treats service unavailable player errors as reconnectable drain events", async () => {
    vi.useFakeTimers();
    let resolveResync!: (response: { ok: true; json: () => Promise<unknown> }) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ protocolVersion: ONLINE_PROTOCOL_VERSION, snapshot: snapshot(0) }),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveResync = resolve;
            })
        )
    );
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await act(async () => {
      await Promise.resolve();
    });
    const socket = MockWebSocket.instances.at(-1)!;

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "error",
          error: {
            code: "service_unavailable",
            message: "This node is draining for a deploy. Reconnect shortly.",
          },
        }),
      });
    });
    expect(result.current.status).toBe("connecting");
    expect(result.current.lastError).toBe(
      "This node is draining for a deploy. Reconnect shortly."
    );

    act(() => {
      socket.onclose?.();
    });
    expect(result.current.status).toBe("disconnected");

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(result.current.status).toBe("resyncing");

    await act(async () => {
      resolveResync({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          snapshot: snapshot(1),
        }),
      });
      await Promise.resolve();
    });

    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    expect(result.current.status).toBe("connecting");
  });

  it("does not let later snapshots clear protected player error states", async () => {
    const snapshots: Array<{ version: number }> = [];
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() =>
      useOnlineGameConnection(join, (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number });
      })
    );

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "error",
          error: { code: "bad_request", message: "Server problem." },
        }),
      });
    });
    expect(result.current.status).toBe("server-error");

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: snapshot(2),
        }),
      });
    });

    expect(result.current.status).toBe("server-error");
    expect(result.current.lastError).toBe("Server problem.");
    expect(snapshots.at(-1)).toMatchObject({ version: 0 });
  });

  it("marks terminal REST resync snapshots as terminal before websocket frames", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          snapshot: {
            ...snapshot(5),
            result: { winner: "b", reason: "timeout" },
          },
        }),
      })
    );
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await waitFor(() => expect(result.current.status).toBe("terminal"));
  });

  it("does not submit actions before the join handshake completes", async () => {
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    act(() => {
      result.current.submitAction({ type: "PASS", baseVersion: 0 });
    });

    expect(socket.sent.map((message) => JSON.parse(message).type)).not.toContain("action");
    expect(result.current.lastError).toBe("Online connection is not ready.");
  });

  it("clears pending actions when a matching stale rejection resyncs the game", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "client-action-stale"),
    });
    const snapshots: Array<{ version: number }> = [];
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() =>
      useOnlineGameConnection(join, (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number });
      })
    );

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(async () => {
      socket.onopen?.();
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "joined",
          color: "w",
          snapshot: snapshot(1),
        }),
      });
    });

    act(() => {
      result.current.submitAction({ type: "PASS", baseVersion: 0 });
    });
    expect(result.current.isActionPending).toBe(true);

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "rejected",
          clientActionId: "client-action-stale",
          error: { code: "stale_action", message: "Old action." },
          snapshot: snapshot(2),
        }),
      });
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.isActionPending).toBe(false);
    expect(result.current.lastError).toBe("Position updated from server. Try again.");
    expect(snapshots.at(-1)).toMatchObject({ version: 2 });
  });

  it("tolerates late stale rejections for actions already settled by a newer snapshot", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("client-action-stale-race")
        .mockReturnValueOnce("client-action-next"),
    });
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(async () => {
      socket.onopen?.();
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "joined",
          color: "w",
          snapshot: snapshot(0),
        }),
      });
    });

    act(() => {
      result.current.submitAction({ type: "PASS", baseVersion: 0 });
    });
    expect(result.current.isActionPending).toBe(true);

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: snapshot(1),
        }),
      });
    });
    expect(result.current.isActionPending).toBe(false);

    act(() => {
      result.current.submitAction({ type: "RESIGN", baseVersion: 1 });
    });
    expect(result.current.isActionPending).toBe(true);

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "rejected",
          clientActionId: "client-action-stale-race",
          error: { code: "stale_action", message: "Old action." },
          snapshot: snapshot(1),
        }),
      });
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.isActionPending).toBe(true);
    expect(result.current.lastError).toBe("Position updated from server. Try again.");
  });

  it("clears pending actions when the socket closes before confirmation", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "client-action-lost"),
    });
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await act(async () => {
      await Promise.resolve();
    });
    const socket = MockWebSocket.instances.at(-1)!;
    await act(async () => {
      socket.onopen?.();
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "joined",
          color: "w",
          snapshot: snapshot(0),
        }),
      });
    });

    act(() => {
      result.current.submitAction({ type: "PASS", baseVersion: 0 });
    });
    expect(result.current.isActionPending).toBe(true);

    act(() => {
      socket.onclose?.();
    });

    expect(result.current.isActionPending).toBe(false);
    expect(result.current.status).toBe("disconnected");
    expect(result.current.lastError).toBe("Connection dropped before the action was confirmed. Try again after resync.");
  });

  it("clears pending action bookkeeping when switching directly to a different join", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "client-action-before-switch"),
    });
    const firstJoin: OnlineJoinParams = { gameId: "game_123", seat: "w", token: "white-token" };
    const secondJoin: OnlineJoinParams = { gameId: "game_456", seat: "b", token: "black-token" };
    const snapshots: Array<{ version: number }> = [];
    const { result, rerender } = renderHook(
      ({ join }) =>
        useOnlineGameConnection(join, (nextSnapshot) => {
          snapshots.push(nextSnapshot as { version: number });
        }),
      { initialProps: { join: firstJoin } }
    );

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const firstSocket = MockWebSocket.instances.at(-1)!;
    await act(async () => {
      firstSocket.onopen?.();
      firstSocket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "joined",
          color: "w",
          snapshot: snapshot(0),
        }),
      });
    });
    act(() => {
      result.current.submitAction({ type: "PASS", baseVersion: 0 });
    });
    expect(result.current.isActionPending).toBe(true);

    rerender({ join: secondJoin });

    expect(result.current.isActionPending).toBe(false);

    await act(async () => {
      firstSocket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "rejected",
          clientActionId: "client-action-before-switch",
          error: { code: "stale_action", message: "Old action." },
          snapshot: snapshot(1),
        }),
      });
      await Promise.resolve();
    });

    expect(result.current.status).not.toBe("protocol-error");
    expect(snapshots.at(-1)).toMatchObject({ version: 0 });
  });

  it("treats not_joined as a server state problem, not access denial", async () => {
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "error",
          error: { code: "not_joined", message: "Join first." },
        }),
      });
    });

    expect(result.current.status).toBe("server-error");
    expect(result.current.lastError).toBe("Join first.");
  });

  it("reports disconnected and resyncing states before reconnecting", async () => {
    vi.useFakeTimers();
    let resolveResync!: (response: { ok: true; json: () => Promise<unknown> }) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ protocolVersion: ONLINE_PROTOCOL_VERSION, snapshot: snapshot(0) }),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveResync = resolve;
            })
        )
    );
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await act(async () => {
      await Promise.resolve();
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances.at(-1)!;

    await act(async () => {
      socket.onclose?.();
    });
    expect(result.current.status).toBe("disconnected");

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(result.current.status).toBe("resyncing");

    await act(async () => {
      resolveResync({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          snapshot: snapshot(2),
        }),
      });
      await Promise.resolve();
    });

    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    expect(result.current.status).toBe("connecting");
  });

  it("does not reconnect after a terminal REST resync", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ protocolVersion: ONLINE_PROTOCOL_VERSION, snapshot: snapshot(0) }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            protocolVersion: ONLINE_PROTOCOL_VERSION,
            snapshot: {
              ...snapshot(2),
              result: { winner: "b", reason: "timeout" },
            },
          }),
        })
    );
    const join = { gameId: "game_123", seat: "w" as const, token: "white-token" };
    const { result } = renderHook(() => useOnlineGameConnection(join, vi.fn()));

    await act(async () => {
      await Promise.resolve();
    });
    const socket = MockWebSocket.instances.at(-1)!;

    act(() => {
      socket.onclose?.();
    });
    expect(result.current.status).toBe("disconnected");

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe("terminal");
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
