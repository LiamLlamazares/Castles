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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listen(server: { listen: (port: number, callback: () => void) => void; address: () => AddressInfo | string | null }) {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return (server.address() as AddressInfo).port;
}

function nextSocketMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString("utf8"))));
    socket.once("error", reject);
  });
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
      expect(events[1]).toEqual({
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
});
