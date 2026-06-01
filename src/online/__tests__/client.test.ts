import { describe, expect, it } from "vitest";
import {
  buildOnlineWebSocketUrl,
  buildSpectatorUrl,
  copyOnlineInviteUrl,
  fetchOnlineGameSummaries,
  fetchOnlineSnapshot,
  fetchOnlineSpectatorSnapshot,
  formatOnlineGameResult,
  parseOnlineJoinParams,
  parseOnlineSpectatorParams,
  rememberOnlineOpponentInviteUrl,
  removeOnlineTokenFromUrl,
  resolveOnlineAnonymousSessionId,
  resolveOnlineOpponentInviteUrl,
  resolveOnlineJoinParams,
  shouldApplyOnlineSnapshot,
  shouldApplyOnlineSnapshotVersion,
} from "../client";
import { ONLINE_PROTOCOL_VERSION } from "../protocolVersion";

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

describe("online client helpers", () => {
  it("parses private online invite URLs", () => {
    expect(
      parseOnlineJoinParams(
        "https://castles.example/?onlineGame=game_123&seat=w&token=secret"
      )
    ).toEqual({
      gameId: "game_123",
      seat: "w",
      token: "secret",
    });
  });

  it("builds secure websocket URLs from https origins", () => {
    expect(buildOnlineWebSocketUrl("https://castles.example/path")).toBe(
      "wss://castles.example/ws"
    );
  });

  it("builds local websocket URLs from http origins", () => {
    expect(buildOnlineWebSocketUrl("http://127.0.0.1:3000")).toBe(
      "ws://127.0.0.1:3000/ws"
    );
  });

  it("parses and builds spectator URLs without player tokens", () => {
    expect(
      parseOnlineSpectatorParams("https://castles.example/?onlineGame=game_123&view=spectator")
    ).toEqual({ gameId: "game_123" });
    expect(buildSpectatorUrl("https://castles.example/?onlineGame=game_123&seat=w", "game_123")).toBe(
      "https://castles.example/?onlineGame=game_123&view=spectator"
    );
  });

  it("stores invite tokens outside the URL and resolves tokenless reload URLs", () => {
    const storage = new Map<string, string>();
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };

    const join = resolveOnlineJoinParams(
      "https://castles.example/?onlineGame=game_123&seat=w&token=secret",
      storageAdapter
    );

    expect(join).toEqual({
      gameId: "game_123",
      seat: "w",
      token: "secret",
    });
    expect(removeOnlineTokenFromUrl("https://castles.example/?onlineGame=game_123&seat=w&token=secret")).toBe(
      "https://castles.example/?onlineGame=game_123&seat=w"
    );
    expect(
      resolveOnlineJoinParams(
        "https://castles.example/?onlineGame=game_123&seat=w",
        storageAdapter
      )
    ).toEqual(join);
  });

  it("stores creator opponent invites for same-session reloads", () => {
    const storage = new Map<string, string>();
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };

    rememberOnlineOpponentInviteUrl(
      "game_123",
      "https://castles.example/?onlineGame=game_123&seat=b&token=black-secret",
      storageAdapter
    );

    expect(resolveOnlineOpponentInviteUrl("game_123", storageAdapter)).toBe(
      "https://castles.example/?onlineGame=game_123&seat=b&token=black-secret"
    );
    expect(resolveOnlineOpponentInviteUrl("game_other", storageAdapter)).toBeNull();
  });

  it("stores a stable anonymous session id outside URLs", () => {
    const storage = new Map<string, string>();
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };

    const first = resolveOnlineAnonymousSessionId(storageAdapter, () => "anon_browser_123");
    const second = resolveOnlineAnonymousSessionId(storageAdapter, () => {
      throw new Error("stored id should be reused");
    });

    expect(first).toBe("anon_browser_123");
    expect(second).toBe("anon_browser_123");
  });

  it("replaces malformed anonymous session ids", () => {
    const storage = new Map<string, string>([["castles_online_anonymous_session_id", ""]]);
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };

    expect(resolveOnlineAnonymousSessionId(storageAdapter, () => "anon_repaired")).toBe(
      "anon_repaired"
    );
  });

  it("ignores stale or duplicate snapshot versions during reconnect resync", () => {
    expect(shouldApplyOnlineSnapshotVersion(null, 0)).toBe(true);
    expect(shouldApplyOnlineSnapshotVersion(0, 0)).toBe(false);
    expect(shouldApplyOnlineSnapshotVersion(2, 1)).toBe(false);
    expect(shouldApplyOnlineSnapshotVersion(2, 3)).toBe(true);
  });

  it("accepts same-version snapshots when they carry fresher clock server time", () => {
    const latest = {
      version: 2,
      clock: { serverNow: 1_000 },
    } as any;

    expect(
      shouldApplyOnlineSnapshot(latest, {
        version: 2,
        clock: { serverNow: 1_500 },
      } as any)
    ).toBe(true);
    expect(
      shouldApplyOnlineSnapshot(latest, {
        version: 2,
        clock: { serverNow: 900 },
      } as any)
    ).toBe(false);
  });

  it("accepts same-version snapshots that restore a missing clock", () => {
    const latest = {
      version: 2,
    } as any;

    expect(
      shouldApplyOnlineSnapshot(latest, {
        version: 2,
        clock: { serverNow: 1_500 },
      } as any)
    ).toBe(true);
  });

  it("formats online timeout results for the game-over overlay", () => {
    expect(formatOnlineGameResult({ winner: "b", reason: "timeout" })).toBe(
      "Black wins on time"
    );
    expect(formatOnlineGameResult({ winner: "w", reason: "resignation" })).toBe(
      "White wins by resignation"
    );
  });

  it("copies online invite links to the supplied clipboard", async () => {
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };

    await copyOnlineInviteUrl("https://castles.example/?onlineGame=g&seat=b&token=t", clipboard);

    expect(clipboard.writeText).toHaveBeenCalledWith(
      "https://castles.example/?onlineGame=g&seat=b&token=t"
    );
  });

  it("fetches spectator snapshots without authorization headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ protocolVersion: ONLINE_PROTOCOL_VERSION, snapshot: snapshot(2) }),
    });

    await expect(fetchOnlineSpectatorSnapshot("game_123", fetchImpl as any)).resolves.toMatchObject({
      gameId: "game_123",
      version: 2,
    });

    expect(fetchImpl).toHaveBeenCalledWith("/api/online/games/game_123/spectator");
  });

  it("fetches player snapshots with authorization and validates the response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ protocolVersion: ONLINE_PROTOCOL_VERSION, snapshot: snapshot(3) }),
    });

    await expect(
      fetchOnlineSnapshot(
        { gameId: "game_123", seat: "w", token: "white-token" },
        fetchImpl as any
      )
    ).resolves.toMatchObject({
      gameId: "game_123",
      version: 3,
    });

    expect(fetchImpl).toHaveBeenCalledWith("/api/online/games/game_123", {
      headers: { authorization: "Bearer white-token" },
    });
  });

  it("rejects malformed player and spectator snapshot responses", async () => {
    const malformedSnapshot = {
      gameId: "game_123",
      version: 1,
      setup: {},
      state: {},
      moveHistory: [],
      playerToMove: "w",
      turnPhase: "Movement",
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        snapshot: malformedSnapshot,
      }),
    });

    await expect(
      fetchOnlineSnapshot(
        { gameId: "game_123", seat: "w", token: "white-token" },
        fetchImpl as any
      )
    ).rejects.toThrow(/snapshot response was malformed/);
    await expect(fetchOnlineSpectatorSnapshot("game_123", fetchImpl as any)).rejects.toThrow(
      /snapshot response was malformed/
    );
  });

  it("rejects unversioned player and spectator snapshot responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ snapshot: snapshot(3) }),
    });

    await expect(
      fetchOnlineSnapshot(
        { gameId: "game_123", seat: "w", token: "white-token" },
        fetchImpl as any
      )
    ).rejects.toThrow(/protocol version/);
    await expect(fetchOnlineSpectatorSnapshot("game_123", fetchImpl as any)).rejects.toThrow(
      /protocol version/
    );
  });

  it("fetches validated game summaries without player authorization", async () => {
    const summary = {
      schemaVersion: 1,
      gameId: "game_123",
      rulesetVersion: "castles-beta-v1",
      createdAt: "2026-05-31T12:00:00.000Z",
      updatedAt: "2026-05-31T12:00:00.000Z",
      version: 0,
      status: "active",
      visibility: "public",
      archiveState: "active",
      hasTimeControl: true,
      participants: [
        { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_game_123_w" } },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_game_123_b" } },
      ],
      lastEventId: "evt-create",
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ games: [summary] }),
    });

    await expect(fetchOnlineGameSummaries(fetchImpl as any)).resolves.toEqual([summary]);

    expect(fetchImpl).toHaveBeenCalledWith("/api/online/games");
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("authorization");
  });

  it("rejects malformed game summary responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ games: [{ gameId: "game_123", version: 0 }] }),
    });

    await expect(fetchOnlineGameSummaries(fetchImpl as any)).rejects.toThrow(/summary/);
  });
});
