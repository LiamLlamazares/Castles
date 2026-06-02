import { describe, expect, it } from "vitest";
import {
  buildOnlineWebSocketUrl,
  buildSpectatorUrl,
  acceptOnlineChallenge,
  cancelOnlineChallenge,
  acceptOpenSeek,
  copyOnlineInviteUrl,
  cancelOpenSeek,
  createOpenSeek,
  declineOnlineChallenge,
  fetchOnlineChallenge,
  fetchOpenSeek,
  fetchOpenSeekDirectory,
  fetchOnlineGameSummaries,
  fetchOnlineGameSummary,
  fetchOnlineSnapshot,
  fetchOnlineSpectatorSnapshot,
  formatOnlineConnectionStatus,
  formatOnlinePendingConnectionMessage,
  formatOnlineGameResult,
  parseOnlineJoinParams,
  parseOnlineChallengeParams,
  parseOnlineSpectatorParams,
  rememberOnlineChallengeParams,
  rememberOnlineChallengeShareUrl,
  rememberOnlineOpponentInviteUrl,
  rememberOnlineJoinParams,
  removeOnlineChallengeTokenFromUrl,
  resolveOnlineChallengeParams,
  resolveOnlineChallengeShareUrl,
  removeOnlineTokenFromUrl,
  resolveOnlineAnonymousSessionId,
  resolveOnlineOpponentInviteUrl,
  resolveOnlineJoinParams,
  shouldApplyOnlineSnapshot,
  shouldApplyOnlineSnapshotVersion,
  startQuickMatch,
  updateOnlineGameVisibility,
  forgetOnlineChallengeParams,
  forgetOnlineChallengeShareUrl,
  forgetOnlineJoinParams,
  forgetOnlineOpponentInviteUrl,
  forgetOpenSeekCreatorParams,
  listOpenSeekCreatorParams,
  rememberOpenSeekCreatorParams,
  resolveOpenSeekCreatorParams,
} from "../client";
import { ONLINE_PROTOCOL_VERSION } from "../protocolVersion";
import { ONLINE_GAME_SUMMARY_SCHEMA_VERSION } from "../readModel";
import { PieceType } from "../../Constants";
import type { OnlineConnectionStatus } from "../types";

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

function publicSummary(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
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
    livePreview: {
      sideToMove: "w",
      turnPhase: "Movement",
      moveCount: 0,
      boardPreview: {
        radius: 6,
        pieces: [
          { q: 0, r: 6, s: -6, color: "w", type: PieceType.Monarch },
          { q: 0, r: -6, s: 6, color: "b", type: PieceType.Monarch },
        ],
        castles: [
          { q: 0, r: 6, s: -6, owner: "w" },
          { q: 0, r: -6, s: 6, owner: "b" },
        ],
      },
      clock: {
        timeControl: { initialMs: 60_000, incrementMs: 0 },
        remainingMs: { w: 60_000, b: 60_000 },
        activeColor: "w",
        runningSince: 0,
      },
    },
    lastEventId: "evt-create",
    ...overrides,
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
    expect(
      buildSpectatorUrl(
        "https://castles.example/?onlineChallenge=challenge_123&challengeRole=challenged&challengeToken=secret&seat=w&token=secret#challengeToken=old",
        "game_456"
      )
    ).toBe("https://castles.example/?onlineGame=game_456&view=spectator");
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

  it("forgets stored private invite and opponent invite credentials", () => {
    const storage = new Map<string, string>();
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const join = { gameId: "game_123", seat: "w" as const, token: "secret" };

    rememberOnlineJoinParams(join, storageAdapter);
    rememberOnlineOpponentInviteUrl(
      "game_123",
      "https://castles.example/?onlineGame=game_123&seat=b&token=black-secret",
      storageAdapter
    );

    forgetOnlineJoinParams(join, storageAdapter);
    forgetOnlineOpponentInviteUrl("game_123", storageAdapter);

    expect(
      resolveOnlineJoinParams("https://castles.example/?onlineGame=game_123&seat=w", storageAdapter)
    ).toBeNull();
    expect(resolveOnlineOpponentInviteUrl("game_123", storageAdapter)).toBeNull();
  });

  it("stores challenge fragment tokens outside the URL and resolves tokenless reload URLs", () => {
    const storage = new Map<string, string>();
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const url =
      "https://castles.example/?onlineChallenge=challenge_123&challengeRole=challenged#challengeToken=secret";

    expect(parseOnlineChallengeParams(url)).toEqual({
      challengeId: "challenge_123",
      role: "challenged",
      token: "secret",
    });
    expect(resolveOnlineChallengeParams(url, storageAdapter)).toEqual({
      challengeId: "challenge_123",
      role: "challenged",
      token: "secret",
    });
    expect(removeOnlineChallengeTokenFromUrl(url)).toBe(
      "https://castles.example/?onlineChallenge=challenge_123&challengeRole=challenged"
    );
    expect(
      resolveOnlineChallengeParams(
        "https://castles.example/?onlineChallenge=challenge_123&challengeRole=challenged",
        storageAdapter
      )
    ).toEqual({
      challengeId: "challenge_123",
      role: "challenged",
      token: "secret",
    });

    const shareUrl =
      "https://castles.example/?onlineChallenge=challenge_123&challengeRole=challenged#challengeToken=friend-secret";
    rememberOnlineChallengeShareUrl("challenge_123", shareUrl, storageAdapter);
    expect(resolveOnlineChallengeShareUrl("challenge_123", storageAdapter)).toBe(shareUrl);
    forgetOnlineChallengeShareUrl("challenge_123", storageAdapter);
    expect(resolveOnlineChallengeShareUrl("challenge_123", storageAdapter)).toBeNull();
  });

  it("fetches and accepts challenges with bearer authorization", async () => {
    const challenge = {
      challengeId: "challenge_123",
      role: "challenged" as const,
      token: "challenge-token",
    };
    const body = {
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "challenged",
      summary: {
        schemaVersion: 1,
        challengeId: "challenge_123",
        challengerIdentity: { kind: "session", id: "challenge_123_challenger" },
        challengedIdentity: { kind: "session", id: "challenge_123_challenged" },
        challengerSeat: "w",
        visibility: "unlisted",
        setup: { board: { config: { nSquares: 6 }, castles: [] }, pieces: [], sanctuaries: [] },
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
        expiresAt: "2026-06-02T12:00:00.000Z",
        status: "pending",
        lastEventId: "challenge_evt_created",
      },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => body })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...body,
          summary: {
            ...body.summary,
            status: "accepted",
            updatedAt: "2026-06-01T12:05:00.000Z",
            acceptedAt: "2026-06-01T12:05:00.000Z",
            acceptedBy: body.summary.challengedIdentity,
            gameId: "game_from_challenge",
            whiteIdentity: body.summary.challengerIdentity,
            blackIdentity: body.summary.challengedIdentity,
          },
          gameInvite: {
            gameId: "game_from_challenge",
            seat: "b",
            token: "challenge-token",
            url: "https://castles.example/?onlineGame=game_from_challenge&seat=b&token=challenge-token",
          },
        }),
      });

    await expect(fetchOnlineChallenge(challenge, fetchImpl as any)).resolves.toMatchObject({
      role: "challenged",
      summary: { challengeId: "challenge_123", status: "pending" },
    });
    await expect(acceptOnlineChallenge(challenge, fetchImpl as any)).resolves.toMatchObject({
      role: "challenged",
      summary: { status: "accepted", gameId: "game_from_challenge" },
      gameInvite: { seat: "b", token: "challenge-token" },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(1, "/api/online/challenges/challenge_123", {
      headers: { authorization: "Bearer challenge-token" },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "/api/online/challenges/challenge_123/accept", {
      method: "POST",
      headers: { authorization: "Bearer challenge-token" },
    });
  });

  it("declines and cancels challenges with bearer authorization", async () => {
    const baseSummary = {
      schemaVersion: 1,
      challengeId: "challenge_123",
      challengerIdentity: { kind: "session", id: "challenge_123_challenger" },
      challengedIdentity: { kind: "session", id: "challenge_123_challenged" },
      challengerSeat: "w",
      visibility: "unlisted",
      setup: { board: { config: { nSquares: 6 }, castles: [] }, pieces: [], sanctuaries: [] },
      createdAt: "2026-06-01T12:00:00.000Z",
      updatedAt: "2026-06-01T12:00:00.000Z",
      expiresAt: "2026-06-02T12:00:00.000Z",
      status: "pending",
      lastEventId: "challenge_evt_created",
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          role: "challenged",
          summary: {
            ...baseSummary,
            status: "declined",
            updatedAt: "2026-06-01T12:02:00.000Z",
            declinedAt: "2026-06-01T12:02:00.000Z",
            declinedBy: baseSummary.challengedIdentity,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          role: "challenger",
          summary: {
            ...baseSummary,
            status: "cancelled",
            updatedAt: "2026-06-01T12:03:00.000Z",
            cancelledAt: "2026-06-01T12:03:00.000Z",
            cancelledBy: baseSummary.challengerIdentity,
          },
        }),
      });

    await expect(
      declineOnlineChallenge(
        { challengeId: "challenge_123", role: "challenged", token: "challenged-token" },
        fetchImpl as any
      )
    ).resolves.toMatchObject({
      role: "challenged",
      summary: { status: "declined" },
    });
    await expect(
      cancelOnlineChallenge(
        { challengeId: "challenge_123", role: "challenger", token: "challenger-token" },
        fetchImpl as any
      )
    ).resolves.toMatchObject({
      role: "challenger",
      summary: { status: "cancelled" },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(1, "/api/online/challenges/challenge_123/decline", {
      method: "POST",
      headers: { authorization: "Bearer challenged-token" },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "/api/online/challenges/challenge_123/cancel", {
      method: "POST",
      headers: { authorization: "Bearer challenger-token" },
    });
  });

  it("forgets stored challenge tokens when leaving a challenge", () => {
    const storage = new Map<string, string>();
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const challenge = {
      challengeId: "challenge_123",
      role: "challenger" as const,
      token: "challenge-token",
    };

    rememberOnlineChallengeParams(challenge, storageAdapter);
    expect(resolveOnlineChallengeParams(
      "https://castles.example/?onlineChallenge=challenge_123&challengeRole=challenger",
      storageAdapter
    )).toEqual(challenge);

    forgetOnlineChallengeParams(challenge, storageAdapter);

    expect(resolveOnlineChallengeParams(
      "https://castles.example/?onlineChallenge=challenge_123&challengeRole=challenger",
      storageAdapter
    )).toBeNull();
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

  it("stores open seek creator tokens outside public lobby responses", () => {
    const storage = new Map<string, string>();
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    const auth = { seekId: "seek_123", token: "creator-token" };

    rememberOpenSeekCreatorParams(auth, storageAdapter);
    expect(resolveOpenSeekCreatorParams("seek_123", storageAdapter)).toEqual(auth);
    expect(listOpenSeekCreatorParams(storageAdapter)).toEqual([auth]);

    rememberOpenSeekCreatorParams({ seekId: "seek_456", token: "second-token" }, storageAdapter);
    expect(listOpenSeekCreatorParams(storageAdapter)).toEqual([
      { seekId: "seek_456", token: "second-token" },
      auth,
    ]);

    forgetOpenSeekCreatorParams(auth, storageAdapter);
    expect(resolveOpenSeekCreatorParams("seek_123", storageAdapter)).toBeNull();
    expect(listOpenSeekCreatorParams(storageAdapter)).toEqual([
      { seekId: "seek_456", token: "second-token" },
    ]);
  });

  it("creates, fetches, cancels, lists, and accepts open seeks with validated responses", async () => {
    const baseSummary = {
      schemaVersion: 1,
      seekId: "seek_123",
      creatorIdentity: { kind: "session", id: "anon_creator" },
      creatorSeat: "w",
      setup: { board: { config: { nSquares: 6 }, castles: [] }, pieces: [], sanctuaries: [] },
      createdAt: "2026-06-01T12:00:00.000Z",
      updatedAt: "2026-06-01T12:00:00.000Z",
      expiresAt: "2026-06-01T12:10:00.000Z",
      status: "open",
      lastEventId: "seek_evt_created",
    };
    const acceptedSummary = {
      ...baseSummary,
      updatedAt: "2026-06-01T12:05:00.000Z",
      status: "accepted",
      acceptedAt: "2026-06-01T12:05:00.000Z",
      acceptedBy: { kind: "session", id: "anon_acceptor" },
      gameId: "game_from_seek",
      whiteIdentity: baseSummary.creatorIdentity,
      blackIdentity: { kind: "session", id: "anon_acceptor" },
    };
    const gameInvite = {
      gameId: "game_from_seek",
      seat: "b",
      token: "acceptor-token",
      url: "https://castles.example/?onlineGame=game_from_seek&seat=b&token=acceptor-token",
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          seekId: "seek_123",
          summary: baseSummary,
          creator: { token: "creator-token" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          seeks: [baseSummary],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          role: "creator",
          summary: baseSummary,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          role: "creator",
          summary: { ...baseSummary, status: "cancelled", updatedAt: "2026-06-01T12:04:00.000Z", cancelledAt: "2026-06-01T12:04:00.000Z", cancelledBy: baseSummary.creatorIdentity },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          role: "acceptor",
          summary: acceptedSummary,
          gameInvite,
        }),
      });

    await expect(
      createOpenSeek(snapshot().setup, { creatorSeat: "w", creatorSessionId: "anon_creator" }, fetchImpl as any)
    ).resolves.toMatchObject({
      seekId: "seek_123",
      creator: { token: "creator-token" },
      summary: { status: "open" },
    });
    await expect(fetchOpenSeekDirectory({}, fetchImpl as any)).resolves.toMatchObject({
      seeks: [{ seekId: "seek_123" }],
    });
    await expect(fetchOpenSeek({ seekId: "seek_123", token: "creator-token" }, fetchImpl as any)).resolves.toMatchObject({
      role: "creator",
      summary: { seekId: "seek_123" },
    });
    await expect(cancelOpenSeek({ seekId: "seek_123", token: "creator-token" }, fetchImpl as any)).resolves.toMatchObject({
      role: "creator",
      summary: { status: "cancelled" },
    });
    await expect(
      acceptOpenSeek("seek_123", { acceptorSessionId: "anon_acceptor" }, fetchImpl as any)
    ).resolves.toMatchObject({
      role: "acceptor",
      summary: { status: "accepted" },
      gameInvite: { seat: "b", token: "acceptor-token" },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(1, "/api/online/seeks", expect.objectContaining({ method: "POST" }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "/api/online/seeks");
    expect(fetchImpl).toHaveBeenNthCalledWith(3, "/api/online/seeks/seek_123", {
      headers: { authorization: "Bearer creator-token" },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(4, "/api/online/seeks/seek_123/cancel", {
      method: "POST",
      headers: { authorization: "Bearer creator-token" },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(5, "/api/online/seeks/seek_123/accept", expect.objectContaining({ method: "POST" }));
  });

  it("passes open seek directory filters as token-free query parameters", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        seeks: [],
      }),
    });

    await expect(
      fetchOpenSeekDirectory(
        {
          state: "open",
          limit: 10,
          cursor: "opaque-cursor",
          creatorSeat: "w",
          clock: "timed",
          vp: "enabled",
        },
        fetchImpl as any
      )
    ).resolves.toMatchObject({ seeks: [] });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/online/seeks?state=open&limit=10&cursor=opaque-cursor&creatorSeat=w&clock=timed&vp=enabled"
    );
  });

  it("starts quick match and validates matched and waiting outcomes", async () => {
    const setup = snapshot().setup;
    const baseSummary = {
      schemaVersion: 1,
      seekId: "seek_quick",
      creatorIdentity: { kind: "session", id: "anon_creator" },
      creatorSeat: "random",
      setup,
      createdAt: "2026-06-01T12:00:00.000Z",
      updatedAt: "2026-06-01T12:00:00.000Z",
      expiresAt: "2026-06-01T12:10:00.000Z",
      status: "open",
      lastEventId: "seek_quick_created",
    };
    const acceptedSummary = {
      ...baseSummary,
      status: "accepted",
      updatedAt: "2026-06-01T12:01:00.000Z",
      acceptedAt: "2026-06-01T12:01:00.000Z",
      acceptedBy: { kind: "session", id: "anon_acceptor" },
      gameId: "game_quick",
      whiteIdentity: baseSummary.creatorIdentity,
      blackIdentity: { kind: "session", id: "anon_acceptor" },
      lastEventId: "seek_quick_accepted",
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          outcome: "matched",
          role: "acceptor",
          summary: acceptedSummary,
          gameInvite: {
            gameId: "game_quick",
            seat: "b",
            token: "acceptor-token",
            url: "https://castles.example/?onlineGame=game_quick&seat=b",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          outcome: "waiting",
          role: "creator",
          seekId: "seek_quick",
          summary: baseSummary,
          creator: { token: "creator-token" },
        }),
      });

    await expect(
      startQuickMatch(setup, { sessionId: "anon_acceptor" }, fetchImpl as any)
    ).resolves.toMatchObject({
      outcome: "matched",
      role: "acceptor",
      gameInvite: {
        gameId: "game_quick",
        seat: "b",
        token: "acceptor-token",
        url: "https://castles.example/?onlineGame=game_quick&seat=b",
      },
    });
    await expect(startQuickMatch(setup, {}, fetchImpl as any)).resolves.toMatchObject({
      outcome: "waiting",
      role: "creator",
      seekId: "seek_quick",
      creator: { token: "creator-token" },
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/api/online/matchmaking/quick",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: expect.any(String),
      })
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      setup,
      sessionId: "anon_acceptor",
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toMatchObject({
      setup,
      sessionId: expect.any(String),
    });
  });

  it("rejects malformed quick match responses and token-bearing invite URLs", async () => {
    const setup = snapshot().setup;
    const summary = {
      schemaVersion: 1,
      seekId: "seek_quick",
      creatorIdentity: { kind: "session", id: "anon_creator" },
      creatorSeat: "random",
      setup,
      createdAt: "2026-06-01T12:00:00.000Z",
      updatedAt: "2026-06-01T12:00:00.000Z",
      expiresAt: "2026-06-01T12:10:00.000Z",
      status: "open",
      lastEventId: "seek_quick_created",
    };
    const matched = {
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      outcome: "matched",
      role: "acceptor",
      summary: {
        ...summary,
        status: "accepted",
        acceptedAt: "2026-06-01T12:01:00.000Z",
        acceptedBy: { kind: "session", id: "anon_acceptor" },
        gameId: "game_quick",
        whiteIdentity: summary.creatorIdentity,
        blackIdentity: { kind: "session", id: "anon_acceptor" },
      },
      gameInvite: {
        gameId: "game_quick",
        seat: "b",
        token: "acceptor-token",
        url: "https://castles.example/?onlineGame=game_quick&seat=b",
      },
    };
    const waiting = {
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      outcome: "waiting",
      role: "creator",
      seekId: "seek_quick",
      summary,
      creator: { token: "creator-token" },
    };

    for (const body of [
      { ...matched, protocolVersion: undefined },
      { ...matched, outcome: "bad_outcome" },
      { ...matched, role: "creator" },
      {
        ...matched,
        gameInvite: {
          ...matched.gameInvite,
          url: "https://castles.example/?onlineGame=game_quick&seat=b&token=secret",
        },
      },
      { ...waiting, creator: {} },
      { ...waiting, seekId: "seek_other" },
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => body,
      });

      await expect(startQuickMatch(setup, { sessionId: "anon_acceptor" }, fetchImpl as any))
        .rejects.toThrow(/quick match/i);
    }
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

  it("formats online connection states for UI labels", () => {
    const expectedStatusLabels = {
      idle: "Idle",
      connecting: "Connecting",
      connected: "Live",
      disconnected: "Disconnected",
      resyncing: "Resyncing",
      "access-denied": "Access denied",
      "protocol-error": "Protocol error",
      "server-error": "Server error",
      terminal: "Complete",
    } satisfies Record<OnlineConnectionStatus, string>;

    const expectedPendingMessages = {
      idle: "Connecting online game",
      connecting: "Connecting online game",
      connected: "Connecting online game",
      disconnected: "Disconnected from online game",
      resyncing: "Resyncing online game",
      "access-denied": "Access denied",
      "protocol-error": "Protocol error",
      "server-error": "Server error",
      terminal: "Online game complete",
    } satisfies Record<OnlineConnectionStatus, string>;

    for (const [status, label] of Object.entries(expectedStatusLabels)) {
      expect(formatOnlineConnectionStatus(status as OnlineConnectionStatus)).toBe(label);
    }
    for (const [status, message] of Object.entries(expectedPendingMessages)) {
      expect(formatOnlinePendingConnectionMessage(status as OnlineConnectionStatus)).toBe(message);
    }
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

  it("fetches validated game directory summaries without player authorization", async () => {
    const summary = publicSummary();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: 1, games: [summary], nextCursor: "WyIyMDI2LTA1LTMxVDEyOjAwOjAwLjAwMFoiLCJnYW1lXzEyMyJd" }),
    });

    await expect(
      fetchOnlineGameSummaries(
        { state: "active", limit: 25, cursor: "cursor_abc" },
        fetchImpl as any
      )
    ).resolves.toEqual([summary]);

    expect(fetchImpl).toHaveBeenCalledWith("/api/online/games?state=active&limit=25&cursor=cursor_abc");
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("authorization");
  });

  it("fetches a single public game summary by id", async () => {
    const summary = publicSummary();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: 1, summary }),
    });

    await expect(fetchOnlineGameSummary("game_123", fetchImpl as any)).resolves.toEqual(summary);

    expect(fetchImpl).toHaveBeenCalledWith("/api/online/games/game_123/summary");
  });

  it("updates game visibility with bearer authorization and validates the summary response", async () => {
    const summary = publicSummary({
      updatedAt: "2026-05-31T12:00:01.000Z",
      lastEventId: "evt-visibility",
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ protocolVersion: ONLINE_PROTOCOL_VERSION, summary }),
    });

    await expect(
      updateOnlineGameVisibility(
        { gameId: "game_123", seat: "w", token: "white-token" },
        "public",
        fetchImpl as any
      )
    ).resolves.toEqual(summary);

    expect(fetchImpl).toHaveBeenCalledWith("/api/online/games/game_123/visibility", {
      method: "PATCH",
      headers: {
        authorization: "Bearer white-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ visibility: "public" }),
    });
  });

  it("rejects malformed game summary responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: 1, games: [{ gameId: "game_123", version: 0 }] }),
    });

    await expect(fetchOnlineGameSummaries(undefined, fetchImpl as any)).rejects.toThrow(/summary/);
  });
});
