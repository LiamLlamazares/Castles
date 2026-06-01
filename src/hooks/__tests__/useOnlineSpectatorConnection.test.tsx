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
      expect(result.current.status).toBe("error");
      expect(result.current.lastError).toContain("invalid");
    });
    expect(snapshots).toHaveLength(1);
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
      expect(result.current.status).toBe("error");
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
          type: "rejected",
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          error: { code: "bad_request", message: "Spectators cannot move." },
          snapshot: snapshot(2),
        }),
      });
    });
    await waitFor(() => expect(result.current.lastError).toBe("Spectators cannot move."));
    expect(result.current.status).toBe("connected");
    expect(snapshots.at(-1)).toMatchObject({ version: 2 });

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "error",
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          error: { code: "bad_request", message: "Server problem." },
          snapshot: snapshot(3),
        }),
      });
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.lastError).toBe("Server problem.");
    expect(snapshots.at(-1)).toMatchObject({ version: 3 });

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          type: "joined",
          color: "w",
          snapshot: snapshot(4),
        }),
      });
    });
    await waitFor(() => {
      expect(result.current.status).toBe("error");
      expect(result.current.lastError).toContain("player message");
    });
    expect(snapshots.at(-1)).toMatchObject({ version: 3 });
  });
});
