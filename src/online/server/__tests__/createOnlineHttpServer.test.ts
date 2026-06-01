import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { getStartingBoard, getStartingPieces } from "../../../ConstantImports";
import { SanctuaryGenerator } from "../../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../../Constants";
import { serializeOnlineGameSetup } from "../../serialization";
import {
  createOnlineActionAcceptedEvent,
  ONLINE_EVENT_SCHEMA_VERSION,
  OnlineGameEvent,
} from "../../events";
import { OnlineGameRoom } from "../../OnlineGameRoom";
import { OnlineGameService } from "../../OnlineGameService";
import { createOnlineHttpServer } from "../createOnlineHttpServer";
import {
  ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
  type AuthenticatedOnlineIdentity,
  type OnlineChallengeSummary,
} from "../../challenges";
import {
  ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
  type OnlineGameSummary,
} from "../../readModel";
import { ONLINE_PROTOCOL_VERSION } from "../../protocolVersion";
import { verifyOnlineToken } from "../onlineTokenCredentials";

const servers: Array<{ close: (callback: () => void) => void }> = [];

function createSetup() {
  const board = getStartingBoard(6);
  const pieces = getStartingPieces(6);
  const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, [
    SanctuaryType.WolfCovenant,
    SanctuaryType.SacredSpring,
  ]);

  return serializeOnlineGameSetup({
    board,
    pieces,
    sanctuaries,
    sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
    gameRules: { vpModeEnabled: false },
    initialPoolTypes: [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring],
    pieceTheme: "Castles",
  });
}

function createClockedSetup() {
  return {
    ...createSetup(),
    timeControl: { initial: 1, increment: 0 },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listen(server: { listen: (port: number, callback: () => void) => void; address: () => AddressInfo | string | null }) {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return (server.address() as AddressInfo).port;
}

function nextSocketMessage(socket: WebSocket, description = "WebSocket message"): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${description}`));
    }, 3_000);
    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const onMessage = (data: WebSocket.RawData) => {
      cleanup();
      try {
        resolve(JSON.parse(data.toString("utf8")));
      } catch (error) {
        reject(error);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.once("message", onMessage);
    socket.once("error", onError);
  });
}

function versionedMessage<T extends Record<string, unknown>>(
  message: T
): T & { protocolVersion: typeof ONLINE_PROTOCOL_VERSION } {
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    ...message,
  };
}

function fragmentChallengeToken(url: string): string {
  const fragment = new URL(url).hash.slice(1);
  const token = new URLSearchParams(fragment).get("challengeToken");
  if (!token) throw new Error(`Missing challenge token in ${url}`);
  return token;
}

function bearer(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

function pendingChallengeSummary(
  challengeId: string,
  overrides: Partial<OnlineChallengeSummary> = {}
): OnlineChallengeSummary {
  const challengerIdentity = {
    kind: "session" as const,
    id: `${challengeId}_challenger`,
  };
  const challengedIdentity = {
    kind: "session" as const,
    id: `${challengeId}_challenged`,
  };

  return {
    schemaVersion: ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
    challengeId,
    challengerIdentity,
    challengedIdentity,
    challengerSeat: "w",
    visibility: "unlisted",
    setup: createSetup(),
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2026-06-01T12:05:00.000Z",
    status: "pending",
    lastEventId: `${challengeId}_created`,
    ...overrides,
  };
}

function challengeCredentialFor(
  summary: OnlineChallengeSummary,
  role: "challenger" | "challenged"
) {
  return {
    challengeId: summary.challengeId,
    role,
    identity: (
      role === "challenger" ? summary.challengerIdentity : summary.challengedIdentity
    ) as AuthenticatedOnlineIdentity,
  };
}

function summaryForGame(
  gameId: string,
  visibility: OnlineGameSummary["visibility"]
): OnlineGameSummary {
  return {
    schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
    gameId,
    rulesetVersion: "castles-beta-v1",
    createdAt: "2026-05-31T12:00:00.000Z",
    updatedAt: "2026-05-31T12:00:00.000Z",
    version: 0,
    status: "active",
    visibility,
    archiveState: "active",
    hasTimeControl: true,
    participants: [
      { seat: "w", role: "white", identity: { kind: "anonymous", id: `anon_${gameId}_w` } },
      { seat: "b", role: "black", identity: { kind: "anonymous", id: `anon_${gameId}_b` } },
    ],
    lastEventId: `evt-${gameId}`,
  };
}

function waitForSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket open"));
    }, 3_000);
    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.off("open", onOpen);
      socket.off("error", onError);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.once("open", onOpen);
    socket.once("error", onError);
  });
}

async function waitForCondition(
  predicate: () => boolean,
  description: string,
  getDetails: () => string = () => ""
): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(5);
  }
  const details = getDetails();
  throw new Error(`Timed out waiting for ${description}.${details ? ` ${details}` : ""}`);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(resolve);
        })
    )
  );
});

describe("createOnlineHttpServer", () => {
  it("creates private challenge links with fragment tokens and bearer-only API auth", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();

    const response = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup,
        challengerSeat: "w",
        visibility: "unlisted",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.summary).toMatchObject({
      status: "pending",
      challengerSeat: "w",
      setup: {
        ...setup,
        timeControl: { initial: 20, increment: 20 },
      },
    });
    expect(body.challenger.url).toContain("onlineChallenge=");
    expect(body.challenged.url).toContain("onlineChallenge=");
    expect(new URL(body.challenger.url).searchParams.get("challengeRole")).toBe("challenger");
    expect(new URL(body.challenged.url).searchParams.get("challengeRole")).toBe("challenged");
    expect(new URL(body.challenger.url).searchParams.has("token")).toBe(false);
    expect(new URL(body.challenger.url).hash).toContain("challengeToken=");

    const challengedToken = fragmentChallengeToken(body.challenged.url);
    const queryTokenResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${body.challengeId}?token=${challengedToken}`
    );
    expect(queryTokenResponse.status).toBe(404);

    const viewResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${body.challengeId}`,
      { headers: bearer(challengedToken) }
    );
    const viewBody = await viewResponse.json();

    expect(viewResponse.status).toBe(200);
    expect(viewBody).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "challenged",
      summary: {
        challengeId: body.challengeId,
        status: "pending",
      },
    });
    expect(viewBody.gameInvite).toBeUndefined();
  });

  it("accepts a private challenge and lets both sides immediately join the created game", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup,
        challengerSeat: "w",
      }),
    });
    const created = await createResponse.json();
    const challengerToken = fragmentChallengeToken(created.challenger.url);
    const challengedToken = fragmentChallengeToken(created.challenged.url);

    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${created.challengeId}/accept`,
      { method: "POST", headers: bearer(challengedToken) }
    );
    const accepted = await acceptResponse.json();

    expect(acceptResponse.status).toBe(200);
    expect(accepted).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "challenged",
      summary: {
        challengeId: created.challengeId,
        status: "accepted",
      },
      gameInvite: {
        seat: "b",
        token: challengedToken,
      },
    });
    const gameId = accepted.gameInvite.gameId;

    const challengerViewResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${created.challengeId}`,
      { headers: bearer(challengerToken) }
    );
    const challengerView = await challengerViewResponse.json();

    expect(challengerViewResponse.status).toBe(200);
    expect(challengerView).toMatchObject({
      role: "challenger",
      summary: { status: "accepted", gameId },
      gameInvite: {
        gameId,
        seat: "w",
        token: challengerToken,
      },
    });

    const whiteJoinResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${gameId}`,
      { headers: bearer(challengerToken) }
    );
    const blackJoinResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${gameId}`,
      { headers: bearer(challengedToken) }
    );
    const whiteJoin = await whiteJoinResponse.json();
    const blackJoin = await blackJoinResponse.json();

    expect(whiteJoinResponse.status).toBe(200);
    expect(blackJoinResponse.status).toBe(200);
    expect(whiteJoin.color).toBe("w");
    expect(blackJoin.color).toBe("b");
  });

  it.each(["decline", "cancel"] as const)(
    "rate limits challenge %s actions before auth",
    async (action) => {
      const { server } = createOnlineHttpServer({
        publicBaseUrl: "https://castles.example/play",
      });
      servers.push(server);
      const port = await listen(server);

      let response: Response | undefined;
      for (let index = 0; index < 121; index += 1) {
        response = await fetch(
          `http://127.0.0.1:${port}/api/online/challenges/challenge_rate_${action}/${action}`,
          { method: "POST" }
        );
      }

      expect(response?.status).toBe(429);
      await expect(response?.json()).resolves.toMatchObject({
        error: { code: "rate_limited" },
      });
    }
  );

  it.each([
    ["decline", "challenged"],
    ["cancel", "challenger"],
  ] as const)("expires stale challenges before %s actions", async (action, role) => {
    const challengeId = `challenge_expired_${action}`;
    let summary = pendingChallengeSummary(challengeId);
    const appendedTypes: string[] = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:06:00.000Z"),
      loadChallengeSummaries: () => [summary],
      resolveChallengeCredential: (_challengeId, token) =>
        token === `${role}-token` ? challengeCredentialFor(summary, role) : null,
      appendChallengeEvent: (event) => {
        appendedTypes.push(event.type);
        if (event.type !== "challenge_expired") {
          throw new Error(`Unexpected ${event.type} event`);
        }
        summary = {
          ...summary,
          status: "expired",
          updatedAt: event.createdAt,
          expiredAt: event.expiredAt,
          expiredBy: "system",
          lastEventId: event.eventId,
        };
        return summary;
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${challengeId}/${action}`,
      { method: "POST", headers: bearer(`${role}-token`) }
    );

    expect(response.status).toBe(409);
    expect(appendedTypes).toEqual(["challenge_expired"]);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "game_over" },
    });
  });

  it("returns persistence failure when declining a pending challenge cannot be saved", async () => {
    const challengeId = "challenge_decline_persistence";
    const summary = pendingChallengeSummary(challengeId, {
      expiresAt: "2026-06-01T12:10:00.000Z",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:01:00.000Z"),
      loadChallengeSummaries: () => [summary],
      resolveChallengeCredential: (_challengeId, token) =>
        token === "challenged-token" ? challengeCredentialFor(summary, "challenged") : null,
      appendChallengeEvent: () => {
        throw new Error("database is unavailable");
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${challengeId}/decline`,
      { method: "POST", headers: bearer("challenged-token") }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "persistence_failed" },
    });
  });

  it("returns the current summary when concurrent lazy expiry has already won", async () => {
    const challengeId = "challenge_expiry_race";
    let summary = pendingChallengeSummary(challengeId);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:06:00.000Z"),
      loadChallengeSummaries: () => [summary],
      resolveChallengeCredential: (_challengeId, token) =>
        token === "challenged-token" ? challengeCredentialFor(summary, "challenged") : null,
      appendChallengeEvent: (event) => {
        if (event.type !== "challenge_expired") {
          throw new Error(`Unexpected ${event.type} event`);
        }
        summary = {
          ...summary,
          status: "expired",
          updatedAt: event.createdAt,
          expiredAt: event.expiredAt,
          expiredBy: "system",
          lastEventId: event.eventId,
        };
        throw new Error("Online challenge was already terminal.");
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${challengeId}`,
      { headers: bearer("challenged-token") }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "challenged",
      summary: {
        challengeId,
        status: "expired",
      },
    });
  });

  it("marks online HTTP responses as private no-store responses", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_headers",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    expect(createResponse.headers.get("cache-control")).toContain("no-store");
    expect(createResponse.headers.get("vary")).toContain("Authorization");

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const snapshotBody = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.headers.get("cache-control")).toContain("no-store");
    expect(snapshotResponse.headers.get("vary")).toContain("Authorization");
    expect(snapshotBody).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      snapshot: { gameId: "game_headers" },
    });
  });

  it("does not accept snapshot tokens in the URL query string", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_query_token",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}?token=${created.white.token}`
    );

    expect(snapshotResponse.status).toBe(404);
    expect(snapshotResponse.headers.get("cache-control")).toContain("no-store");
  });

  it("serves read-only spectator snapshots without player tokens", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_spectator_rest",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    const spectatorResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/spectator`
    );
    const spectatorBody = await spectatorResponse.json();

    expect(spectatorResponse.status).toBe(200);
    expect(spectatorResponse.headers.get("cache-control")).toContain("no-store");
    expect(spectatorBody).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "spectator",
      snapshot: {
        gameId: "game_spectator_rest",
        version: 0,
      },
    });
  });

  it("rejects malformed spectator game ids before queueing a lookup", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);

    const spectatorResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${"g".repeat(129)}/spectator`
    );
    const spectatorBody = await spectatorResponse.json();

    expect(spectatorResponse.status).toBe(400);
    expect(spectatorBody.error).toMatchObject({
      code: "bad_request",
    });
  });

  it("rate limits public spectator snapshot reads", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_spectator_limited",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const spectatorUrl = `http://127.0.0.1:${port}/api/online/games/${created.gameId}/spectator`;

    for (let i = 0; i < 120; i += 1) {
      const response = await fetch(spectatorUrl, {
        headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.10" },
      });
      expect(response.status).toBe(200);
    }
    const limitedResponse = await fetch(spectatorUrl, {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const otherClientResponse = await fetch(spectatorUrl, {
      headers: { "x-forwarded-for": "203.0.113.11" },
    });
    const spoofedOnlyResponse = await fetch(spectatorUrl, {
      headers: { "x-forwarded-for": "198.51.100.99" },
    });

    expect(limitedResponse.status).toBe(429);
    expect(otherClientResponse.status).toBe(200);
    expect(spoofedOnlyResponse.status).toBe(200);
  });

  it("reports deployment and store readiness metadata in health checks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      health: {
        buildId: "test-build",
        commit: "abc123",
        storeBackend: "postgres",
        storePath: "postgres",
        checkStoreReady: async () => true,
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      build: {
        buildId: "test-build",
        commit: "abc123",
      },
      online: {
        eventSchemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
        store: {
          ok: true,
          backend: "postgres",
          path: "postgres",
        },
      },
    });
    expect(body.online.rulesetVersion).toEqual(expect.any(String));
  });

  it("sanitizes store readiness errors in public health checks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      health: {
        storeBackend: "postgres",
        storePath: "postgres",
        checkStoreReady: async () => {
          throw new Error("postgresql://castles:secret@db.example/castles refused");
        },
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.online.store).toMatchObject({
      ok: false,
      backend: "postgres",
      path: "postgres",
      error: "Store readiness check failed.",
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("db.example");
  });

  it("times out slow store readiness checks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      health: {
        storeBackend: "postgres",
        storePath: "postgres",
        readinessTimeoutMs: 5,
        checkStoreReady: () => new Promise<boolean>(() => undefined),
      },
    });
    servers.push(server);
    const port = await listen(server);

    const startedAt = Date.now();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(response.status).toBe(503);
    expect(body.online.store).toMatchObject({
      ok: false,
      backend: "postgres",
      path: "postgres",
      error: "Store readiness check timed out.",
    });
  });

  it("creates games through the HTTP API", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);

    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.gameId).toMatch(/^game_/);
    expect(body.white.url).toContain("seat=w");
    expect(body.black.url).toContain("seat=b");
  });

  it("lists only public token-free online game summaries through the directory contract", async () => {
    const summaries: OnlineGameSummary[] = [
      {
        schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
        gameId: "game_public_summary_http",
        rulesetVersion: "castles-beta-v1",
        createdAt: "2026-05-31T12:00:00.000Z",
        updatedAt: "2026-05-31T12:00:01.000Z",
        endedAt: "2026-05-31T12:00:01.000Z",
        version: 1,
        status: "complete",
        visibility: "public",
        archiveState: "archived",
        hasTimeControl: true,
        participants: [
          { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_game_public_summary_http_w" } },
          { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_game_public_summary_http_b" } },
        ],
        result: { winner: "w", reason: "resignation" },
        lastEventId: "evt-summary",
      },
      {
        schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
        gameId: "game_unlisted_summary_http",
        rulesetVersion: "castles-beta-v1",
        createdAt: "2026-05-31T12:00:00.000Z",
        updatedAt: "2026-05-31T12:00:00.000Z",
        version: 0,
        status: "active",
        visibility: "unlisted",
        archiveState: "active",
        hasTimeControl: true,
        participants: [
          { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_game_unlisted_summary_http_w" } },
          { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_game_unlisted_summary_http_b" } },
        ],
        lastEventId: "evt-unlisted",
      },
      {
        schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
        gameId: "game_private_summary_http",
        rulesetVersion: "castles-beta-v1",
        createdAt: "2026-05-31T12:00:00.000Z",
        updatedAt: "2026-05-31T12:00:00.000Z",
        version: 0,
        status: "active",
        visibility: "private",
        archiveState: "active",
        hasTimeControl: true,
        participants: [
          { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_game_private_summary_http_w" } },
          { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_game_private_summary_http_b" } },
        ],
        lastEventId: "evt-private",
      },
    ];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => summaries,
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/api/online/games`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({ schemaVersion: 1, games: [summaries[0]] });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("game_unlisted_summary_http");
    expect(JSON.stringify(body)).not.toContain("game_private_summary_http");
  });

  it("supports public directory state filters limits and cursors", async () => {
    const publicActiveNew = {
      ...summaryForGame("game_public_active_new", "public"),
      updatedAt: "2026-05-31T12:03:00.000Z",
    };
    const publicActiveOld = {
      ...summaryForGame("game_public_active_old", "public"),
      updatedAt: "2026-05-31T12:02:00.000Z",
    };
    const publicArchive = {
      ...summaryForGame("game_public_archive", "public"),
      updatedAt: "2026-05-31T12:01:00.000Z",
      endedAt: "2026-05-31T12:01:00.000Z",
      status: "complete" as const,
      archiveState: "archived" as const,
      result: { winner: "w" as const, reason: "resignation" as const },
    };
    const summaries: OnlineGameSummary[] = [
      publicActiveOld,
      publicArchive,
      summaryForGame("game_unlisted_hidden", "unlisted"),
      publicActiveNew,
    ];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => summaries,
    });
    servers.push(server);
    const port = await listen(server);

    const firstPageResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=active&limit=1`
    );
    const firstPage = await firstPageResponse.json();

    expect(firstPageResponse.status).toBe(200);
    expect(firstPage.games.map((game: OnlineGameSummary) => game.gameId)).toEqual([
      "game_public_active_new",
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=active&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`
    );
    const secondPage = await secondPageResponse.json();

    expect(secondPage.games.map((game: OnlineGameSummary) => game.gameId)).toEqual([
      "game_public_active_old",
    ]);
    expect(secondPage.nextCursor).toBeUndefined();

    const archiveResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=archived`
    );
    const archiveBody = await archiveResponse.json();

    expect(archiveBody.games.map((game: OnlineGameSummary) => game.gameId)).toEqual([
      "game_public_archive",
    ]);

    const allResponse = await fetch(`http://127.0.0.1:${port}/api/online/games?state=all`);
    const allBody = await allResponse.json();

    expect(allBody.games.map((game: OnlineGameSummary) => game.gameId)).toEqual([
      "game_public_active_new",
      "game_public_active_old",
      "game_public_archive",
    ]);
  });

  it("rejects invalid public directory query parameters and secret-looking queries", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => [summaryForGame("game_public_directory_http", "public")],
    });
    servers.push(server);
    const port = await listen(server);

    for (const query of [
      "state=waiting",
      "limit=0",
      "limit=101",
      "cursor=not-valid-cursor",
      "token=secret",
      "sid=secret",
      "secret=value",
      "bearer=value",
      "api_key=value",
      "authorization=Bearer%20secret",
      "q=Bearer%20abc123",
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/games?${query}`);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(JSON.stringify(body)).not.toContain("secret");
    }
  });

  it("rate limits public directory reads", async () => {
    const publicSummary = summaryForGame("game_public_directory_limited_http", "public");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => [publicSummary],
      loadGameSummary: async (gameId: string) => gameId === publicSummary.gameId ? publicSummary : null,
    });
    servers.push(server);
    const port = await listen(server);
    const clientHeader = { "x-forwarded-for": "198.51.100.99, 203.0.113.60" };

    for (let i = 0; i < 240; i += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
        headers: clientHeader,
      });
      expect(response.status).toBe(200);
    }

    const limitedListResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      headers: { "x-forwarded-for": "203.0.113.60" },
    });
    const limitedDetailResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${publicSummary.gameId}/summary`,
      { headers: { "x-forwarded-for": "203.0.113.60" } }
    );
    const otherClientResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      headers: { "x-forwarded-for": "203.0.113.61" },
    });

    expect(limitedListResponse.status).toBe(429);
    expect(limitedDetailResponse.status).toBe(429);
    expect(otherClientResponse.status).toBe(200);
  });

  it("loads single public summaries without exposing hidden games", async () => {
    const publicSummary = summaryForGame("game_public_detail_http", "public");
    const privateSummary = summaryForGame("game_private_detail_http", "private");
    const loadGameSummary = vi.fn(async (gameId: string) => {
      if (gameId === publicSummary.gameId) return publicSummary;
      if (gameId === privateSummary.gameId) return privateSummary;
      return null;
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummary,
    });
    servers.push(server);
    const port = await listen(server);

    const publicResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${publicSummary.gameId}/summary`
    );
    const publicBody = await publicResponse.json();

    expect(publicResponse.status).toBe(200);
    expect(publicBody).toEqual({ schemaVersion: 1, summary: publicSummary });

    const privateResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${privateSummary.gameId}/summary`
    );
    const privateBody = await privateResponse.json();

    expect(privateResponse.status).toBe(404);
    expect(JSON.stringify(privateBody)).not.toContain(privateSummary.gameId);
    expect(loadGameSummary).toHaveBeenCalledWith(publicSummary.gameId);

    const secretQueryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${publicSummary.gameId}/summary?api_key=value`
    );
    const secretQueryBody = await secretQueryResponse.json();

    expect(secretQueryResponse.status).toBe(400);
    expect(JSON.stringify(secretQueryBody)).not.toContain("value");
  });

  it("lets an authenticated player publish an unlisted game without exposing bearer tokens", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_publish_http",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const appended: Array<Extract<OnlineGameEvent, { type: "visibility_changed" }>> = [];
    const logs: unknown[] = [];
    let summary = summaryForGame("game_publish_http", "unlisted");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onLog: (event) => logs.push(event),
      appendGameVisibilityChanged: (event) => {
        appended.push(event);
        summary = {
          ...summary,
          visibility: event.visibility,
          updatedAt: event.createdAt,
          lastEventId: event.eventId,
        };
        return summary;
      },
    });
    servers.push(server);
    const port = await listen(server);
    const created = service.createGame(createClockedSetup(), {
      publicBaseUrl: "https://castles.example",
    });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/visibility`,
      {
        method: "PATCH",
        headers: {
          ...bearer(created.white.token),
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "public" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      summary: {
        gameId: "game_publish_http",
        visibility: "public",
        version: 0,
      },
    });
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: "visibility_changed",
      gameId: "game_publish_http",
      visibility: "public",
    });
    expect(JSON.stringify(body)).not.toContain(created.white.token);
    expect(JSON.stringify(body)).not.toContain(created.black.token);
    expect(JSON.stringify(logs)).not.toContain(created.white.token);
    expect(JSON.stringify(logs)).not.toContain(created.black.token);
  });

  it("rejects private visibility changes until active spectator reauthorization exists", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_private_visibility_http",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const appendGameVisibilityChanged = vi.fn();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      appendGameVisibilityChanged,
    });
    servers.push(server);
    const port = await listen(server);
    const created = service.createGame(createClockedSetup(), {
      publicBaseUrl: "https://castles.example",
    });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/visibility`,
      {
        method: "PATCH",
        headers: {
          ...bearer(created.white.token),
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "private" }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
    expect(appendGameVisibilityChanged).not.toHaveBeenCalled();
  });

  it("requires player bearer credentials and persistence for visibility changes", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_visibility_auth_http",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);
    const created = service.createGame(createClockedSetup(), {
      publicBaseUrl: "https://castles.example",
    });

    const badTokenResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/visibility`,
      {
        method: "PATCH",
        headers: {
          ...bearer("spectator-or-wrong-token"),
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "public" }),
      }
    );
    const missingPersistenceResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/visibility`,
      {
        method: "PATCH",
        headers: {
          ...bearer(created.white.token),
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "public" }),
      }
    );

    expect(badTokenResponse.status).toBe(404);
    expect(missingPersistenceResponse.status).toBe(503);
  });

  it("allows HTTP spectator snapshots for unlisted summaries when summaries are configured", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_unlisted_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [summaryForGame("game_unlisted_spectator_http", "unlisted")],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_unlisted_spectator_http/spectator`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "spectator",
      snapshot: { gameId: "game_unlisted_spectator_http", version: 0 },
    });
  });

  it("denies HTTP spectator snapshots for private summaries", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_private_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [summaryForGame("game_private_spectator_http", "private")],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_private_spectator_http/spectator`
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "No online game was found for that id.",
      },
    });
  });

  it("fails closed when configured summaries are missing for HTTP spectator snapshots", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_missing_summary_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_missing_summary_spectator_http/spectator`
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "No online game was found for that id.",
      },
    });
  });

  it("fails closed when configured summaries are invalid for HTTP spectator snapshots", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_invalid_summary_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [
        {
          ...summaryForGame("game_invalid_summary_spectator_http", "unlisted"),
          schemaVersion: 99,
        } as unknown as OnlineGameSummary,
      ],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_invalid_summary_spectator_http/spectator`
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "No online game was found for that id.",
      },
    });
  });

  it("logs summary load failures separately while failing closed for spectator snapshots", async () => {
    const logs: unknown[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_summary_load_failed_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => {
        throw new Error("summary database unavailable");
      },
      onLog: (event) => {
        logs.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_summary_load_failed_spectator_http/spectator`
    );

    expect(response.status).toBe(404);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "online.http.spectate",
          gameId: "game_summary_load_failed_spectator_http",
          role: "spectator",
          status: "rejected",
          reason: "summary_load_failed",
        }),
      ])
    );
  });

  it("allows WebSocket spectator joins for unlisted summaries when summaries are configured", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_unlisted_spectator_ws",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [summaryForGame("game_unlisted_spectator_ws", "unlisted")],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(socket);
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "spectate",
            gameId: "game_unlisted_spectator_ws",
          })
        )
      );
      await expect(nextSocketMessage(socket, "unlisted spectator join")).resolves.toMatchObject({
        type: "spectating",
        snapshot: { gameId: "game_unlisted_spectator_ws", version: 0 },
      });
    } finally {
      socket.close();
    }
  });

  it("denies WebSocket spectator joins for private summaries", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_private_spectator_ws",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [summaryForGame("game_private_spectator_ws", "private")],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(socket);
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "spectate",
            gameId: "game_private_spectator_ws",
          })
        )
      );
      await expect(nextSocketMessage(socket, "private spectator denial")).resolves.toMatchObject({
        type: "error",
        error: { code: "not_found" },
      });
    } finally {
      socket.close();
    }
  });

  it("fails closed when configured summaries are missing for WebSocket spectator joins", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_missing_summary_spectator_ws",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(socket);
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "spectate",
            gameId: "game_missing_summary_spectator_ws",
          })
        )
      );
      await expect(nextSocketMessage(socket, "missing summary spectator denial")).resolves.toMatchObject({
        type: "error",
        error: { code: "not_found" },
      });
    } finally {
      socket.close();
    }
  });

  it("fails closed when configured summaries are invalid for WebSocket spectator joins", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_invalid_summary_spectator_ws",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [
        {
          ...summaryForGame("game_invalid_summary_spectator_ws", "unlisted"),
          schemaVersion: 99,
        } as unknown as OnlineGameSummary,
      ],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(socket);
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "spectate",
            gameId: "game_invalid_summary_spectator_ws",
          })
        )
      );
      await expect(nextSocketMessage(socket, "invalid summary spectator denial")).resolves.toMatchObject({
        type: "error",
        error: { code: "not_found" },
      });
    } finally {
      socket.close();
    }
  });

  it("logs structured create and join events without leaking player tokens", async () => {
    const logs: unknown[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_log_redaction",
      tokenFactory: (seat) => `${seat}-secret-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onLog: (event) => {
        logs.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket, "logged join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });
    } finally {
      socket.close();
    }

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "online.game.create",
          gameId: "game_log_redaction",
          status: "accepted",
        }),
        expect.objectContaining({
          event: "online.socket.join",
          gameId: "game_log_redaction",
          role: "player",
          status: "accepted",
        }),
      ])
    );
    expect(JSON.stringify(logs)).not.toContain("secret-token");
  });

  it("logs rejected action attempts with gameId role action and status fields", async () => {
    const logs: unknown[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_log_action_rejected",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onLog: (event) => {
        logs.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket, "logged action join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-log-reject",
          action: { type: "PASS", baseVersion: 99 },
        }))
      );
      await expect(nextSocketMessage(socket, "logged action rejection")).resolves.toMatchObject({
        type: "rejected",
        clientActionId: "client-action-log-reject",
        error: { code: "stale_action" },
      });
    } finally {
      socket.close();
    }

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "online.action",
          gameId: "game_log_action_rejected",
          role: "player",
          action: "PASS",
          status: "rejected",
          reason: "stale_action",
        }),
      ])
    );
  });

  it("keeps logging hook failures from changing create-game behavior", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_log_hook_failure",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onLog: () => {
        throw new Error("log sink unavailable");
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });

    expect(createResponse.status).toBe(201);
    expect(consoleError).toHaveBeenCalledWith(
      "Online server log hook failed",
      expect.any(Error)
    );
  });

  it("does not include malformed HTTP join ids in structured logs", async () => {
    const logs: unknown[] = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      onLog: (event) => {
        logs.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);
    const malformedGameId = "g".repeat(129);

    const response = await fetch(`http://127.0.0.1:${port}/api/online/games/${malformedGameId}`, {
      headers: { authorization: "Bearer bad-token" },
    });

    expect(response.status).toBe(400);
    expect(logs).toEqual([
      expect.objectContaining({
        event: "online.http.join",
        role: "player",
        status: "rejected",
        reason: "bad_request",
      }),
    ]);
    expect(JSON.stringify(logs)).not.toContain(malformedGameId);
    expect(JSON.stringify(logs)).not.toContain("bad-token");
  });

  it("adds the default online clock when a create request omits time control", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);

    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const snapshotBody = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotBody.snapshot.setup.timeControl).toEqual({ initial: 20, increment: 20 });
    expect(snapshotBody.snapshot.clock).toMatchObject({
      timeControl: { initialMs: 1_200_000, incrementMs: 20_000 },
      activeColor: "w",
    });
    expect(snapshotBody.snapshot.clock.remainingMs.w).toBeGreaterThan(1_199_000);
    expect(snapshotBody.snapshot.clock.remainingMs.b).toBe(1_200_000);
  });

  it("rejects structurally invalid setup data with a 400", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    setup.pieces[0] = {
      ...setup.pieces[0],
      hex: { q: 1, r: 1, s: 1 },
    };

    const response = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("waits for event persistence before returning a created game", async () => {
    let releasePersistence!: () => void;
    const persisted = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      onGameEvent: () => persisted,
    });
    servers.push(server);
    const port = await listen(server);

    const responsePromise = fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });

    await expect(
      Promise.race([responsePromise.then(() => "responded"), delay(25).then(() => "pending")])
    ).resolves.toBe("pending");

    releasePersistence();

    const response = await responsePromise;
    expect(response.status).toBe(201);
  });

  it("supports websocket heartbeats for reconnect health checks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    const pong = new Promise<unknown>((resolve, reject) => {
      socket.on("open", () => {
        socket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 123 })));
      });
      socket.on("message", (data) => resolve(JSON.parse(data.toString("utf8"))));
      socket.on("error", reject);
    });

    await expect(pong).resolves.toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: "pong",
      clientTime: 123,
    });

    socket.close();
  });

  it("rejects websocket messages without the supported protocol version", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);
    const unversionedSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const wrongVersionSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await Promise.all([
        waitForSocketOpen(unversionedSocket),
        waitForSocketOpen(wrongVersionSocket),
      ]);

      unversionedSocket.send(JSON.stringify({ type: "ping", clientTime: 1 }));
      wrongVersionSocket.send(
        JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION + 1,
          type: "ping",
          clientTime: 2,
        })
      );

      await expect(
        nextSocketMessage(unversionedSocket, "unversioned websocket rejection")
      ).resolves.toMatchObject({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "error",
        error: { code: "bad_request" },
      });
      await expect(
        nextSocketMessage(wrongVersionSocket, "wrong-version websocket rejection")
      ).resolves.toMatchObject({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "error",
        error: { code: "bad_request" },
      });
    } finally {
      unversionedSocket.close();
      wrongVersionSocket.close();
    }
  });

  it("allows websocket spectators to watch broadcasts but not submit actions", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_spectator_ws",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const spectatorSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let whiteSocket: WebSocket | undefined;

    try {
      spectatorSocket.on("open", () => {
        spectatorSocket.send(
          JSON.stringify(versionedMessage({ type: "spectate", gameId: created.gameId }))
        );
      });
      await expect(nextSocketMessage(spectatorSocket, "spectator join")).resolves.toMatchObject({
        type: "spectating",
        snapshot: { version: 0 },
      });

      spectatorSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-spectator",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(spectatorSocket, "spectator action rejection")).resolves.toMatchObject({
        type: "error",
        error: { code: "not_joined" },
      });

      const playerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      whiteSocket = playerSocket;
      playerSocket.on("open", () => {
        playerSocket.send(
          JSON.stringify(
            versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
          )
        );
      });
      await expect(nextSocketMessage(playerSocket, "white join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      const spectatorSnapshot = nextSocketMessage(spectatorSocket, "spectator broadcast");
      playerSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-spectator-broadcast",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );

      await expect(nextSocketMessage(playerSocket, "white action broadcast")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });
      await expect(spectatorSnapshot).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });
    } finally {
      spectatorSocket.close();
      whiteSocket?.close();
    }
  });

  it("broadcasts an out-of-turn resignation result to both players", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_resign_broadcast",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const blackSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      whiteSocket.on("open", () => {
        whiteSocket.send(
          JSON.stringify(
            versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
          )
        );
      });
      blackSocket.on("open", () => {
        blackSocket.send(
          JSON.stringify(
            versionedMessage({ type: "join", gameId: created.gameId, token: created.black.token })
          )
        );
      });

      await expect(nextSocketMessage(whiteSocket, "white join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });
      await expect(nextSocketMessage(blackSocket, "black join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      const whiteBroadcast = nextSocketMessage(whiteSocket, "white resignation broadcast");
      const blackBroadcast = nextSocketMessage(blackSocket, "black resignation broadcast");

      blackSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-resign-broadcast",
          action: { type: "RESIGN", baseVersion: 0 },
        }))
      );

      await expect(whiteBroadcast).resolves.toMatchObject({
        type: "snapshot",
        snapshot: {
          version: 1,
          result: { winner: "w", reason: "resignation" },
        },
      });
      await expect(blackBroadcast).resolves.toMatchObject({
        type: "snapshot",
        snapshot: {
          version: 1,
          result: { winner: "w", reason: "resignation" },
        },
      });

      const snapshotResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
        { headers: { authorization: `Bearer ${created.white.token}` } }
      );
      await expect(snapshotResponse.json()).resolves.toMatchObject({
        snapshot: {
          version: 1,
          result: { winner: "w", reason: "resignation" },
        },
      });
    } finally {
      whiteSocket.close();
      blackSocket.close();
    }
  });

  it("rate limits websocket messages by forwarded client address behind the proxy", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);
    const limitedSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.20" },
    });
    const sameRealClientSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-forwarded-for": "203.0.113.20" },
    });
    const otherClientSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-forwarded-for": "203.0.113.21" },
    });
    const spoofedOnlySocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-forwarded-for": "198.51.100.99" },
    });

    try {
      await Promise.all([
        waitForSocketOpen(limitedSocket),
        waitForSocketOpen(sameRealClientSocket),
        waitForSocketOpen(otherClientSocket),
        waitForSocketOpen(spoofedOnlySocket),
      ]);

      for (let i = 0; i < 120; i += 1) {
        limitedSocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: i })));
        await expect(nextSocketMessage(limitedSocket, `limited ping ${i}`)).resolves.toMatchObject({
          type: "pong",
          clientTime: i,
        });
      }

      limitedSocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 120 })));
      await expect(nextSocketMessage(limitedSocket, "limited websocket rate limit")).resolves.toMatchObject({
        type: "error",
        error: { code: "rate_limited" },
      });

      sameRealClientSocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 1 })));
      await expect(nextSocketMessage(sameRealClientSocket, "same real client rate limit")).resolves.toMatchObject({
        type: "error",
        error: { code: "rate_limited" },
      });

      otherClientSocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 1 })));
      await expect(nextSocketMessage(otherClientSocket, "other client ping")).resolves.toMatchObject({
        type: "pong",
        clientTime: 1,
      });

      spoofedOnlySocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 1 })));
      await expect(nextSocketMessage(spoofedOnlySocket, "spoofed-only client ping")).resolves.toMatchObject({
        type: "pong",
        clientTime: 1,
      });
    } finally {
      limitedSocket.close();
      sameRealClientSocket.close();
      otherClientSocket.close();
      spoofedOnlySocket.close();
    }
  });

  it("rolls back an accepted websocket action when persistence fails", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_rollback",
      tokenFactory: (seat) => `${seat}-token`,
    });
    let persistCount = 0;
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: () => {
        persistCount += 1;
        if (persistCount > 1) {
          throw new Error("disk unavailable");
        }
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-persistence-failure",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );

      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "error",
        error: { code: "persistence_failed" },
        snapshot: { version: 0 },
      });

      const snapshotResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
        { headers: { authorization: `Bearer ${created.white.token}` } }
      );
      const body = await snapshotResponse.json();
      expect(body.snapshot.version).toBe(0);
    } finally {
      socket.close();
    }
  });

  it("persists created games and accepted websocket actions as append-only events", async () => {
    const events: OnlineGameEvent[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_events",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        events.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "game_created",
      gameId: "game_events",
    });
    expect(JSON.stringify(events[0])).not.toContain("w-token");
    expect(JSON.stringify(events[0])).not.toContain("b-token");

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-events",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );

      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });
      expect(events).toHaveLength(2);
      expect(events[1]).toMatchObject({
        schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
        eventId: expect.any(String),
        createdAt: expect.any(String),
        rulesetVersion: "castles-beta-v1",
        type: "action_accepted",
        gameId: "game_events",
        playerColor: "w",
        clientActionId: "client-action-events",
        version: 1,
        action: { type: "PASS", baseVersion: 0 },
      });
    } finally {
      socket.close();
    }
  });

  it("persists game creation as a token-free event with separate credential hashes", async () => {
    const events: OnlineGameEvent[] = [];
    const credentials: Array<{ whiteCredential: string; blackCredential: string }> = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      onGameCreated: (event, eventCredentials) => {
        events.push(event);
        credentials.push(eventCredentials);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "game_created",
      gameId: created.gameId,
    });
    expect(JSON.stringify(events[0])).not.toContain(created.white.token);
    expect(JSON.stringify(events[0])).not.toContain(created.black.token);
    expect(credentials).toHaveLength(1);
    expect(credentials[0].whiteCredential).not.toContain(created.white.token);
    expect(credentials[0].blackCredential).not.toContain(created.black.token);
    expect(verifyOnlineToken(created.white.token, credentials[0].whiteCredential)).toBe(true);
    expect(verifyOnlineToken(created.black.token, credentials[0].blackCredential)).toBe(true);
  });

  it("rejects created-game persistence when an injected service supplies non-hash credentials", async () => {
    const onGameCreated = vi.fn();
    const service = new OnlineGameService({
      idFactory: () => "game_raw_credentials",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameCreated,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const body = await createResponse.json();

    expect(createResponse.status).toBe(503);
    expect(body.error).toMatchObject({ code: "persistence_failed" });
    expect(onGameCreated).not.toHaveBeenCalled();
    expect(service.getRoom("game_raw_credentials")).toBeNull();
  });

  it("uses the canonical store action result when local room state is stale", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_canonical_action",
      tokenFactory: (seat) => `${seat}-token`,
    });
    let applyCalls = 0;
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      applyGameAction: async (input) => {
        applyCalls += 1;
        expect(input).toMatchObject({
          gameId: "game_canonical_action",
          token: "w-token",
          clientActionId: "client-action-canonical",
          action: { type: "RESIGN", baseVersion: 1 },
        });
        const localRecord = service.getRoom(input.gameId)?.toRecord();
        if (!localRecord) {
          throw new Error("Expected local room record.");
        }
        const canonicalRoom = OnlineGameRoom.create(localRecord);
        canonicalRoom.submitAction(input.token, { type: "PASS", baseVersion: 0 }, "client-action-canonical-prior");
        const actionResult = canonicalRoom.submitAction(
          input.token,
          input.action,
          input.clientActionId
        );
        if (!actionResult.ok) {
          throw new Error(actionResult.error.message);
        }
        const accepted = canonicalRoom.toRecord().acceptedActions.at(-1)!;
        return {
          ok: true,
          event: createOnlineActionAcceptedEvent({
            type: "action_accepted",
            gameId: input.gameId,
            playerColor: accepted.playerColor,
            clientActionId: accepted.clientActionId,
            version: actionResult.snapshot.version,
            playedAt: accepted.playedAt,
            action: accepted.action,
            clock: accepted.clock,
          }),
          playerColor: accepted.playerColor,
          room: canonicalRoom.toRecord(),
          snapshot: actionResult.snapshot,
        };
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket, "canonical action join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-canonical",
          action: { type: "RESIGN", baseVersion: 1 },
        }))
      );

      await expect(nextSocketMessage(socket, "canonical action result")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: {
          version: 2,
          result: { winner: "b", reason: "resignation" },
        },
      });
      expect(applyCalls).toBe(1);
      expect(service.getRoom(created.gameId)?.getSnapshot()).toMatchObject({ version: 2 });
    } finally {
      socket.close();
    }
  });

  it("serializes action handling so later messages wait for prior persistence", async () => {
    let releaseFirstAction!: () => void;
    let firstActionReleased = false;
    const firstActionPersisted = new Promise<void>((resolve) => {
      releaseFirstAction = () => {
        if (firstActionReleased) return;
        firstActionReleased = true;
        resolve();
      };
    });
    const persistedActionVersions: number[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_serialized",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type !== "action_accepted") return;
        persistedActionVersions.push(event.version);
        if (event.version === 1) {
          return firstActionPersisted;
        }
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      const whiteMessages: any[] = [];
      whiteSocket.on("message", (data) => {
        whiteMessages.push(JSON.parse(data.toString("utf8")));
      });

      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-serialized-1",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-serialized-2",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );

      await delay(25);
      expect(persistedActionVersions).toEqual([1]);
      expect(whiteMessages).toEqual([]);

      releaseFirstAction();

      await waitForCondition(
        () => whiteMessages.length >= 2,
        "the queued second action to be handled after persistence",
        () =>
          `persisted=${JSON.stringify(persistedActionVersions)} whiteMessages=${JSON.stringify(
            whiteMessages.map((message) => ({
              type: message.type,
              error: message.error,
              version: message.snapshot?.version,
            }))
          )}`
      );
      expect(whiteMessages[0]).toMatchObject({ type: "snapshot", snapshot: { version: 1 } });
      expect(whiteMessages[1]).toMatchObject({
        type: "rejected",
        clientActionId: "client-action-serialized-2",
        error: { code: "stale_action" },
        snapshot: { version: 1 },
      });
      expect(persistedActionVersions).toEqual([1]);
    } finally {
      releaseFirstAction();
      whiteSocket.close();
    }
  });

  it("treats queued duplicate action ids as harmless retries in the in-memory path", async () => {
    const persistedClientActionIds: string[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_duplicate_retry",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type !== "action_accepted") return;
        persistedClientActionIds.push(event.clientActionId);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      const whiteMessages: any[] = [];
      whiteSocket.on("message", (data) => {
        whiteMessages.push(JSON.parse(data.toString("utf8")));
      });

      const message = {
        type: "action",
        clientActionId: "client-action-duplicate",
        action: { type: "PASS", baseVersion: 0 },
      };
      whiteSocket.send(JSON.stringify(versionedMessage(message)));
      whiteSocket.send(JSON.stringify(versionedMessage(message)));

      await waitForCondition(
        () => whiteMessages.length >= 2,
        "both duplicate action messages to receive canonical snapshots"
      );
      expect(whiteMessages[0]).toMatchObject({ type: "snapshot", snapshot: { version: 1 } });
      expect(whiteMessages[1]).toMatchObject({ type: "snapshot", snapshot: { version: 1 } });
      expect(persistedClientActionIds).toEqual(["client-action-duplicate"]);
    } finally {
      whiteSocket.close();
    }
  });

  it("rejects same-id different-action retries in the in-memory websocket path", async () => {
    const persistedClientActionIds: string[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_duplicate_conflict",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type !== "action_accepted") return;
        persistedClientActionIds.push(event.clientActionId);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "first duplicate-conflict action")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });

      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict",
          action: { type: "RESIGN", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "same-id changed action rejection")).resolves.toMatchObject({
        type: "rejected",
        clientActionId: "client-action-conflict",
        error: { code: "duplicate_action" },
        snapshot: { version: 1 },
      });
      expect(persistedClientActionIds).toEqual(["client-action-conflict"]);
    } finally {
      whiteSocket.close();
    }
  });

  it("adjudicates timeout before returning an exact duplicate action retry", async () => {
    let now = 0;
    const persistedEvents: string[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_duplicate_timeout",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      now: () => now,
      onGameEvent: (event) => {
        persistedEvents.push(event.type);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      now = 1_000;
      const duplicateMessage = {
        type: "action",
        clientActionId: "client-action-duplicate-timeout",
        action: { type: "PASS", baseVersion: 0 },
      };
      whiteSocket.send(JSON.stringify(versionedMessage(duplicateMessage)));
      await expect(nextSocketMessage(whiteSocket, "first action before timeout")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });

      now = 120_000;
      whiteSocket.send(JSON.stringify(versionedMessage(duplicateMessage)));
      await expect(nextSocketMessage(whiteSocket, "duplicate retry timeout snapshot")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: {
          version: 2,
          result: { reason: "timeout" },
        },
      });
      expect(persistedEvents).toEqual([
        "game_created",
        "action_accepted",
        "timeout_adjudicated",
      ]);
    } finally {
      whiteSocket.close();
    }
  });

  it("adjudicates timeout before rejecting a conflicting duplicate action id", async () => {
    let now = 0;
    const persistedEvents: string[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_duplicate_conflict_timeout",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      now: () => now,
      onGameEvent: (event) => {
        persistedEvents.push(event.type);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      now = 1_000;
      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict-timeout",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "first conflict-timeout action")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });

      now = 120_000;
      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict-timeout",
          action: { type: "RESIGN", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "conflicting duplicate timeout rejection")).resolves.toMatchObject({
        type: "rejected",
        clientActionId: "client-action-conflict-timeout",
        error: { code: "game_over" },
        snapshot: {
          version: 2,
          result: { reason: "timeout" },
        },
      });
      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict-timeout",
          action: { type: "RESIGN", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "repeated conflict after timeout")).resolves.toMatchObject({
        type: "rejected",
        clientActionId: "client-action-conflict-timeout",
        error: { code: "game_over" },
        snapshot: {
          version: 2,
          result: { reason: "timeout" },
        },
      });
      expect(persistedEvents).toEqual([
        "game_created",
        "action_accepted",
        "timeout_adjudicated",
      ]);
    } finally {
      whiteSocket.close();
    }
  });

  it("waits for pending action persistence before serving joins and snapshots", async () => {
    let releaseAction!: () => void;
    let actionReleased = false;
    const actionPersisted = new Promise<void>((resolve) => {
      releaseAction = () => {
        if (actionReleased) return;
        actionReleased = true;
        resolve();
      };
    });
    const persistedActionVersions: number[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_pending_reads",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type !== "action_accepted") return;
        persistedActionVersions.push(event.version);
        return actionPersisted;
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });

    let blackSocket: WebSocket | undefined;
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-pending-read",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      await waitForCondition(
        () => persistedActionVersions.length === 1,
        "the first action to reach persistence"
      );

      const readPromise = fetch(`http://127.0.0.1:${port}/api/online/games/${created.gameId}`, {
        headers: { authorization: `Bearer ${created.white.token}` },
      }).then(async (response) => response.json());

      const pendingBlackSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      blackSocket = pendingBlackSocket;
      const blackJoined = nextSocketMessage(pendingBlackSocket);
      pendingBlackSocket.on("open", () => {
        pendingBlackSocket.send(
          JSON.stringify(
            versionedMessage({ type: "join", gameId: created.gameId, token: created.black.token })
          )
        );
      });

      await expect(
        Promise.race([readPromise.then(() => "responded"), delay(25).then(() => "pending")])
      ).resolves.toBe("pending");
      await expect(
        Promise.race([blackJoined.then(() => "joined"), delay(25).then(() => "pending")])
      ).resolves.toBe("pending");

      releaseAction();

      await expect(readPromise).resolves.toMatchObject({
        snapshot: { version: 1 },
      });
      await expect(blackJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 1 },
      });
    } finally {
      releaseAction();
      whiteSocket.close();
      blackSocket?.close();
    }
  });

  it("persists timeout adjudication before serving an expired snapshot", async () => {
    let now = 0;
    const events: OnlineGameEvent[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_timeout_http",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        events.push(event);
      },
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    now = 61_000;
    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const body = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(200);
    expect(body.snapshot).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
      clock: {
        remainingMs: { w: 0, b: 60_000 },
        activeColor: null,
      },
    });
    expect(events.map((event) => event.type)).toEqual([
      "game_created",
      "timeout_adjudicated",
    ]);
  });

  it("uses the canonical store timeout result before serving player snapshots", async () => {
    let now = 0;
    const service = new OnlineGameService({
      idFactory: () => "game_canonical_timeout",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    let timeoutCalls = 0;
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      now: () => now,
      adjudicateGameTimeout: async (input) => {
        timeoutCalls += 1;
        expect(input).toMatchObject({ gameId: "game_canonical_timeout" });
        const localRecord = service.getRoom(input.gameId)?.toRecord();
        if (!localRecord) {
          throw new Error("Expected local room record.");
        }
        const canonicalRoom = OnlineGameRoom.create({
          ...localRecord,
          now: () => 61_000,
        });
        const timeout = canonicalRoom.adjudicateTimeout();
        if (!timeout) {
          throw new Error("Expected canonical timeout.");
        }
        return {
          ok: true,
          event: {
            schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
            eventId: "evt-canonical-timeout",
            createdAt: "2026-05-31T12:00:01.000Z",
            rulesetVersion: "castles-beta-v1",
            type: "timeout_adjudicated",
            gameId: input.gameId,
            playerColor: timeout.playerColor,
            version: timeout.version,
            adjudicatedAt: timeout.adjudicatedAt,
            result: timeout.result,
            clock: timeout.clock,
          },
          room: canonicalRoom.toRecord(),
          snapshot: canonicalRoom.getSnapshot(),
        };
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const body = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(200);
    expect(timeoutCalls).toBe(1);
    expect(body.snapshot).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
    expect(service.getRoom(created.gameId)?.getSnapshot()).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
  });

  it("does not return a stale local snapshot when canonical timeout lookup rejects", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_canonical_timeout_missing",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      adjudicateGameTimeout: async () => ({
        ok: false,
        error: {
          code: "not_found",
          message: "Canonical game was not found.",
        },
      }),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const body = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "Canonical game was not found.",
      },
    });
  });

  it("rejects player snapshots when the canonical room no longer authenticates the token", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_canonical_token_mismatch",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      adjudicateGameTimeout: async (input) => {
        const localRecord = service.getRoom(input.gameId)?.toRecord();
        if (!localRecord) {
          throw new Error("Expected local room record.");
        }
        return {
          ok: true,
          room: {
            ...localRecord,
            whiteCredential: "canonical-white-token",
          },
          snapshot: OnlineGameRoom.create({
            ...localRecord,
            whiteCredential: "canonical-white-token",
          }).getSnapshot(),
        };
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const body = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "No online game was found for that id and token.",
      },
    });
  });

  it("rolls back timeout adjudication when timeout persistence fails", async () => {
    let now = 0;
    const service = new OnlineGameService({
      idFactory: () => "game_timeout_rollback",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type === "timeout_adjudicated") {
          throw new Error("disk unavailable");
        }
      },
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    now = 61_000;
    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );

    expect(snapshotResponse.status).toBe(503);
    expect(service.getRoom(created.gameId)?.getSnapshot()).toMatchObject({
      version: 0,
      result: undefined,
      clock: {
        remainingMs: { w: 60_000, b: 60_000 },
        activeColor: "w",
      },
    });
  });
});
