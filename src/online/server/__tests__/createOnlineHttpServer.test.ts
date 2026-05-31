import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { getStartingBoard, getStartingPieces } from "../../../ConstantImports";
import { SanctuaryGenerator } from "../../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../../Constants";
import { serializeOnlineGameSetup } from "../../serialization";
import { OnlineGameEvent } from "../../events";
import { OnlineGameService } from "../../OnlineGameService";
import { createOnlineHttpServer } from "../createOnlineHttpServer";

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

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.headers.get("cache-control")).toContain("no-store");
    expect(snapshotResponse.headers.get("vary")).toContain("Authorization");
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
        eventSchemaVersion: 1,
        store: {
          ok: true,
          backend: "postgres",
          path: "postgres",
        },
      },
    });
    expect(body.online.rulesetVersion).toEqual(expect.any(String));
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
        socket.send(JSON.stringify({ type: "ping", clientTime: 123 }));
      });
      socket.on("message", (data) => resolve(JSON.parse(data.toString("utf8"))));
      socket.on("error", reject);
    });

    await expect(pong).resolves.toMatchObject({
      type: "pong",
      clientTime: 123,
    });

    socket.close();
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
        spectatorSocket.send(JSON.stringify({ type: "spectate", gameId: created.gameId }));
      });
      await expect(nextSocketMessage(spectatorSocket, "spectator join")).resolves.toMatchObject({
        type: "spectating",
        snapshot: { version: 0 },
      });

      spectatorSocket.send(
        JSON.stringify({ type: "action", action: { type: "PASS", baseVersion: 0 } })
      );
      await expect(nextSocketMessage(spectatorSocket, "spectator action rejection")).resolves.toMatchObject({
        type: "error",
        error: { code: "not_joined" },
      });

      const playerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      whiteSocket = playerSocket;
      playerSocket.on("open", () => {
        playerSocket.send(
          JSON.stringify({ type: "join", gameId: created.gameId, token: created.white.token })
        );
      });
      await expect(nextSocketMessage(playerSocket, "white join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      const spectatorSnapshot = nextSocketMessage(spectatorSocket, "spectator broadcast");
      playerSocket.send(
        JSON.stringify({ type: "action", action: { type: "PASS", baseVersion: 0 } })
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
        whiteSocket.send(JSON.stringify({ type: "join", gameId: created.gameId, token: created.white.token }));
      });
      blackSocket.on("open", () => {
        blackSocket.send(JSON.stringify({ type: "join", gameId: created.gameId, token: created.black.token }));
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

      blackSocket.send(JSON.stringify({ type: "action", action: { type: "RESIGN", baseVersion: 0 } }));

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
        limitedSocket.send(JSON.stringify({ type: "ping", clientTime: i }));
        await expect(nextSocketMessage(limitedSocket, `limited ping ${i}`)).resolves.toMatchObject({
          type: "pong",
          clientTime: i,
        });
      }

      limitedSocket.send(JSON.stringify({ type: "ping", clientTime: 120 }));
      await expect(nextSocketMessage(limitedSocket, "limited websocket rate limit")).resolves.toMatchObject({
        type: "error",
        error: { code: "rate_limited" },
      });

      sameRealClientSocket.send(JSON.stringify({ type: "ping", clientTime: 1 }));
      await expect(nextSocketMessage(sameRealClientSocket, "same real client rate limit")).resolves.toMatchObject({
        type: "error",
        error: { code: "rate_limited" },
      });

      otherClientSocket.send(JSON.stringify({ type: "ping", clientTime: 1 }));
      await expect(nextSocketMessage(otherClientSocket, "other client ping")).resolves.toMatchObject({
        type: "pong",
        clientTime: 1,
      });

      spoofedOnlySocket.send(JSON.stringify({ type: "ping", clientTime: 1 }));
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
        JSON.stringify({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        })
      );
    });

    try {
      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify({
          type: "action",
          action: { type: "PASS", baseVersion: 0 },
        })
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
      whiteToken: "w-token",
      blackToken: "b-token",
    });

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        })
      );
    });

    try {
      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify({
          type: "action",
          action: { type: "PASS", baseVersion: 0 },
        })
      );

      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });
      expect(events).toHaveLength(2);
      expect(events[1]).toMatchObject({
        schemaVersion: 1,
        eventId: expect.any(String),
        createdAt: expect.any(String),
        rulesetVersion: "castles-beta-v1",
        type: "action_accepted",
        gameId: "game_events",
        playerColor: "w",
        version: 1,
        action: { type: "PASS", baseVersion: 0 },
      });
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
        JSON.stringify({ type: "join", gameId: created.gameId, token: created.white.token })
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

      whiteSocket.send(JSON.stringify({ type: "action", action: { type: "PASS", baseVersion: 0 } }));
      whiteSocket.send(JSON.stringify({ type: "action", action: { type: "PASS", baseVersion: 0 } }));

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
        error: { code: "stale_action" },
        snapshot: { version: 1 },
      });
      expect(persistedActionVersions).toEqual([1]);
    } finally {
      releaseFirstAction();
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
        JSON.stringify({ type: "join", gameId: created.gameId, token: created.white.token })
      );
    });

    let blackSocket: WebSocket | undefined;
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      whiteSocket.send(JSON.stringify({ type: "action", action: { type: "PASS", baseVersion: 0 } }));
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
          JSON.stringify({ type: "join", gameId: created.gameId, token: created.black.token })
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
