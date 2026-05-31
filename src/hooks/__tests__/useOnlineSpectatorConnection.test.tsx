import { act, renderHook, waitFor } from "@testing-library/react";
import { useOnlineSpectatorConnection } from "../useOnlineSpectatorConnection";

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

describe("useOnlineSpectatorConnection", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ snapshot: { gameId: "game_123", version: 0 } }),
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
      type: "spectate",
      gameId: "game_123",
    });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "spectating",
          snapshot: { gameId: "game_123", version: 1 },
        }),
      });
    });

    expect(result.current.status).toBe("connected");
    expect(snapshots.at(-1)).toMatchObject({ version: 1 });
  });
});
