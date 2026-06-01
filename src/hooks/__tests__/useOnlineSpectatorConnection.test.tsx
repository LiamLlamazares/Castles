import { act, renderHook, waitFor } from "@testing-library/react";
import { useOnlineSpectatorConnection } from "../useOnlineSpectatorConnection";
import { ONLINE_PROTOCOL_VERSION } from "../../online/protocolVersion";

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

describe("useOnlineSpectatorConnection", () => {
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

  it("fetches a public spectator snapshot and joins the websocket as a spectator", async () => {
    const snapshots: Array<{ version: number }> = [];

    const { result } = renderHook(() =>
      useOnlineSpectatorConnection("game_123", (snapshot) => {
        snapshots.push(snapshot as { version: number });
      })
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/online/games/game_123/spectator");
    });
    expect(snapshots.at(-1)).toMatchObject({ version: 0 });

    act(() => {
      MockWebSocket.instances[0].onopen?.();
    });

    expect(JSON.parse(MockWebSocket.instances[0].sent[0])).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: "spectate",
      gameId: "game_123",
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "spectating",
          snapshot: snapshot(1),
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });
    expect(snapshots.at(-1)).toMatchObject({ version: 1 });
  });

  it("turns malformed spectator messages into controlled errors", async () => {
    const snapshots: Array<{ version: number }> = [];

    const { result } = renderHook(() =>
      useOnlineSpectatorConnection("game_123", (snapshot) => {
        snapshots.push(snapshot as { version: number });
      })
    );

    await waitFor(() => expect(snapshots).toHaveLength(1));
    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({ type: "spectating" }),
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("protocol-error");
      expect(result.current.lastError).toContain("invalid");
    });
    expect(snapshots).toHaveLength(1);
  });

  it("ignores websocket snapshots after the spectator connection is cleared", async () => {
    const snapshots: Array<{ version: number }> = [];

    const { unmount } = renderHook(() =>
      useOnlineSpectatorConnection("game_123", (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number });
      })
    );

    await waitFor(() => expect(snapshots).toHaveLength(1));
    const socket = MockWebSocket.instances[0];

    unmount();

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "spectating",
          snapshot: snapshot(1),
        }),
      });
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ version: 0 });
  });

  it("turns non-json spectator frames into controlled errors", async () => {
    const snapshots: Array<{ version: number }> = [];

    const { result } = renderHook(() =>
      useOnlineSpectatorConnection("game_123", (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number });
      })
    );

    await waitFor(() => expect(snapshots).toHaveLength(1));
    act(() => {
      MockWebSocket.instances[0].onmessage?.({ data: "not-json" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("protocol-error");
      expect(result.current.lastError).toContain("invalid");
    });
    expect(snapshots).toHaveLength(1);
  });

  it("handles snapshot, pong, rejected, error, and wrong-role frames predictably", async () => {
    const snapshots: Array<{ version: number }> = [];

    const { result } = renderHook(() =>
      useOnlineSpectatorConnection("game_123", (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number });
      })
    );

    await waitFor(() => expect(snapshots).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    act(() => {
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

    act(() => {
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
      socket.onmessage?.({
        data: JSON.stringify({
          type: "error",
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          error: { code: "bad_request", message: "Server problem." },
          snapshot: snapshot(2),
        }),
      });
    });
    await waitFor(() => expect(result.current.status).toBe("server-error"));
    expect(result.current.lastError).toBe("Server problem.");
    expect(snapshots.at(-1)).toMatchObject({ version: 2 });

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "joined",
          color: "w",
          snapshot: snapshot(3),
        }),
      });
    });
    await waitFor(() => {
      expect(result.current.status).toBe("protocol-error");
      expect(result.current.lastError).toContain("player message");
    });
    expect(snapshots.at(-1)).toMatchObject({ version: 2 });
  });

  it("treats action rejection frames as invalid for spectator connections", async () => {
    const { result } = renderHook(() => useOnlineSpectatorConnection("game_123", vi.fn()));

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "rejected",
          clientActionId: "client-action-spectator-reject",
          error: { code: "stale_action", message: "Old action." },
          snapshot: snapshot(1),
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("protocol-error");
      expect(result.current.lastError).toContain("action rejection");
    });
  });

  it("marks missing spectator games as access denied", async () => {
    const { result } = renderHook(() => useOnlineSpectatorConnection("game_123", vi.fn()));

    await act(async () => {
      await Promise.resolve();
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances.at(-1)!;

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "error",
          error: { code: "not_found", message: "This game no longer exists." },
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("access-denied");
      expect(result.current.lastError).toBe("This game no longer exists.");
    });
  });

  it("marks terminal spectator snapshots as terminal connection state", async () => {
    const { result } = renderHook(() => useOnlineSpectatorConnection("game_123", vi.fn()));

    await act(async () => {
      await Promise.resolve();
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances.at(-1)!;

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: {
            ...snapshot(4),
            result: { winner: "w", reason: "resignation" },
          },
        }),
      });
    });

    await waitFor(() => expect(result.current.status).toBe("terminal"));
  });

  it("does not let stale non-terminal spectator snapshots overwrite terminal state", async () => {
    const snapshots: Array<{ version: number; result?: unknown }> = [];
    const { result } = renderHook(() =>
      useOnlineSpectatorConnection("game_123", (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number; result?: unknown });
      })
    );

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: {
            ...snapshot(4),
            result: { winner: "w", reason: "resignation" },
          },
        }),
      });
    });
    await waitFor(() => expect(result.current.status).toBe("terminal"));

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "snapshot",
          snapshot: snapshot(3),
        }),
      });
    });

    expect(result.current.status).toBe("terminal");
    expect(snapshots.at(-1)).toMatchObject({ version: 4, result: { reason: "resignation" } });
  });

  it("does not reconnect spectator sockets after protected error states", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOnlineSpectatorConnection("game_123", vi.fn()));

    await act(async () => {
      await Promise.resolve();
    });
    const socket = MockWebSocket.instances.at(-1)!;

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "error",
          error: { code: "not_found", message: "Game not found." },
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

  it("does not let later snapshots clear protected spectator error states", async () => {
    const snapshots: Array<{ version: number }> = [];
    const { result } = renderHook(() =>
      useOnlineSpectatorConnection("game_123", (nextSnapshot) => {
        snapshots.push(nextSnapshot as { version: number });
      })
    );

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances.at(-1)!;

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "error",
          error: { code: "bad_request", message: "Server problem." },
        }),
      });
    });
    expect(result.current.status).toBe("server-error");

    act(() => {
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

  it("marks terminal spectator REST snapshots as terminal before websocket frames", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          snapshot: {
            ...snapshot(5),
            result: { winner: "w", reason: "resignation" },
          },
        }),
      })
    );
    const { result } = renderHook(() => useOnlineSpectatorConnection("game_123", vi.fn()));

    await waitFor(() => expect(result.current.status).toBe("terminal"));
  });

  it("reports disconnected and resyncing states before reconnecting spectators", async () => {
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
    const { result } = renderHook(() => useOnlineSpectatorConnection("game_123", vi.fn()));

    await act(async () => {
      await Promise.resolve();
    });
    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances.at(-1)!;

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
          snapshot: snapshot(2),
        }),
      });
      await Promise.resolve();
    });

    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    expect(result.current.status).toBe("connecting");
  });

  it("does not reconnect spectators after a terminal REST resync", async () => {
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
              result: { winner: "w", reason: "resignation" },
            },
          }),
        })
    );
    const { result } = renderHook(() => useOnlineSpectatorConnection("game_123", vi.fn()));

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
