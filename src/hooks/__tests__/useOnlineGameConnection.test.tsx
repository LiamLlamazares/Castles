import { act, renderHook, waitFor } from "@testing-library/react";
import { useOnlineGameConnection } from "../useOnlineGameConnection";

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
        json: async () => ({ snapshot: snapshot(0) }),
      })
    );
  });

  afterEach(() => {
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
      type: "join",
      gameId: "game_123",
      token: "white-token",
    });

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
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
      expect(result.current.status).toBe("error");
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
      expect(result.current.status).toBe("error");
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
      socket.onmessage?.({ data: JSON.stringify({ type: "snapshot", snapshot: snapshot(1) }) });
    });
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(snapshots.at(-1)).toMatchObject({ version: 1 });

    await act(async () => {
      socket.onmessage?.({ data: JSON.stringify({ type: "pong", clientTime: 123, serverTime: 456 }) });
    });
    expect(result.current.status).toBe("connected");
    expect(snapshots.at(-1)).toMatchObject({ version: 1 });

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "rejected",
          error: { code: "stale_action", message: "Old action." },
          snapshot: snapshot(2),
        }),
      });
    });
    await waitFor(() => expect(result.current.lastError).toBe("Old action."));
    expect(result.current.status).toBe("connected");
    expect(snapshots.at(-1)).toMatchObject({ version: 2 });

    await act(async () => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "error",
          error: { code: "bad_request", message: "Server problem." },
          snapshot: snapshot(3),
        }),
      });
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.lastError).toBe("Server problem.");
    expect(snapshots.at(-1)).toMatchObject({ version: 3 });

    await act(async () => {
      socket.onmessage?.({ data: JSON.stringify({ type: "spectating", snapshot: snapshot(4) }) });
    });
    await waitFor(() => {
      expect(result.current.status).toBe("error");
      expect(result.current.lastError).toContain("spectator message");
    });
    expect(snapshots.at(-1)).toMatchObject({ version: 3 });
  });
});
