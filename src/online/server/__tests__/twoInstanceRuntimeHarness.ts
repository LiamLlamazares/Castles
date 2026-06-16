import { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { getStartingBoard, getStartingPieces } from "../../../ConstantImports";
import { SanctuaryGenerator } from "../../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../../Constants";
import { OnlineGameRoom, type OnlineGameRoomRecord } from "../../OnlineGameRoom";
import { OnlineGameService } from "../../OnlineGameService";
import {
  createOnlineActionAcceptedEvent,
  type OnlineGameCredentials,
  type OnlineGameEvent,
} from "../../events";
import { ONLINE_PROTOCOL_VERSION } from "../../protocolVersion";
import {
  ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
  projectOnlineGameSummaries,
  type OnlineGameSummary,
} from "../../readModel";
import { serializeOnlineGameSetup } from "../../serialization";
import type { OnlineActionDTO } from "../../types";
import { createOnlineHttpServer } from "../createOnlineHttpServer";
import { hashOnlineToken, verifyOnlineToken } from "../onlineTokenCredentials";
import type {
  OnlineGameStoreActionInput,
  OnlineGameStoreActionResult,
} from "../OnlineGameStore";
import {
  createPostgresCompositeRuntimeCoordinator,
  type OnlineRuntimeEventStore,
  type OnlineRuntimeSpectatorPresenceStore,
  type OnlineRuntimeSpectatorRegistration,
  type OnlineRuntimeStoredGameSnapshotChangedEvent,
} from "../onlineRuntimeCoordinator";

type ServerHandle = ReturnType<typeof createOnlineHttpServer>;

export interface TwoInstanceCreatedGame {
  gameId: string;
  white: { token: string };
  black: { token: string };
}

export interface TwoInstanceRuntimeHarness {
  createGameOnNodeA(): Promise<TwoInstanceCreatedGame>;
  spectateOnNodeB(gameId: string): Promise<WebSocket>;
  joinWhiteOnNodeA(game: TwoInstanceCreatedGame): Promise<WebSocket>;
  sendWhiteAction(
    socket: WebSocket,
    game: TwoInstanceCreatedGame,
    action: OnlineActionDTO
  ): Promise<void>;
  pollNodeBRuntimeEvents(): Promise<void>;
  fetchPublicGameOnNodeA(gameId: string): Promise<OnlineGameSummary>;
  nextSpectatorMessage(socket: WebSocket, description: string): Promise<unknown>;
  closeSocket(socket: WebSocket): Promise<void>;
  close(): Promise<void>;
}

interface SharedRuntimeState {
  events: OnlineRuntimeStoredGameSnapshotChangedEvent[];
  nextEventId: number;
  spectatorConnections: Map<string, Map<string, { gameId: string; nodeId: string }>>;
  nextSpectatorId: number;
}

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
    timeControl: { initial: 20, increment: 20 },
    ratingMode: "casual",
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

function bearer(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

async function listen(server: ServerHandle["server"]): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return (server.address() as AddressInfo).port;
}

function nextSocketMessage(socket: WebSocket, description: string): Promise<unknown> {
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

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      socket.terminate();
      resolve();
    }, 1_000);
    socket.once("close", () => {
      clearTimeout(timeoutId);
      resolve();
    });
    socket.close();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function closeServer(server: ServerHandle["server"]): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

class InMemoryRuntimeEventStore implements OnlineRuntimeEventStore {
  constructor(
    private readonly shared: SharedRuntimeState,
    private readonly nodeId: string
  ) {}

  async recordGameSnapshotChanged(input: {
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: OnlineRuntimeStoredGameSnapshotChangedEvent["reason"];
  }): Promise<void> {
    this.shared.nextEventId += 1;
    this.shared.events.push({
      id: this.shared.nextEventId,
      type: "game_snapshot_changed",
      gameId: input.gameId,
      roomVersion: input.roomVersion,
      lastEventId: input.lastEventId,
      reason: input.reason,
      nodeId: this.nodeId,
      createdAt: "2026-06-16T12:00:00.000Z",
    });
  }

  async listGameSnapshotChangedEventsAfter(input: {
    afterId: number;
    limit: number;
    excludeNodeId?: string;
  }): Promise<{
    events: OnlineRuntimeStoredGameSnapshotChangedEvent[];
    nextAfterId: number;
  }> {
    const laterEvents = this.shared.events.filter((event) => event.id > input.afterId);
    const page = laterEvents.slice(0, input.limit);
    const events = page.filter((event) => event.nodeId !== input.excludeNodeId);
    return {
      events,
      nextAfterId: page.at(-1)?.id ?? input.afterId,
    };
  }
}

class InMemorySpectatorPresenceStore implements OnlineRuntimeSpectatorPresenceStore {
  constructor(
    private readonly shared: SharedRuntimeState,
    private readonly nodeId: string
  ) {}

  async registerSpectator(input: {
    gameId: string;
  }): Promise<OnlineRuntimeSpectatorRegistration> {
    this.shared.nextSpectatorId += 1;
    const connectionId = `${this.nodeId}_spectator_${this.shared.nextSpectatorId}`;
    const gameConnections =
      this.shared.spectatorConnections.get(input.gameId) ?? new Map();
    gameConnections.set(connectionId, { gameId: input.gameId, nodeId: this.nodeId });
    this.shared.spectatorConnections.set(input.gameId, gameConnections);
    return { connectionId };
  }

  async refreshSpectator(input: {
    gameId: string;
    connectionId: string;
  }): Promise<OnlineRuntimeSpectatorRegistration | null> {
    return this.shared.spectatorConnections.get(input.gameId)?.has(input.connectionId)
      ? { connectionId: input.connectionId }
      : null;
  }

  async removeSpectator(input: { gameId: string; connectionId: string }): Promise<void> {
    const gameConnections = this.shared.spectatorConnections.get(input.gameId);
    if (!gameConnections) return;
    gameConnections.delete(input.connectionId);
    if (gameConnections.size === 0) {
      this.shared.spectatorConnections.delete(input.gameId);
    }
  }

  async countSpectators(gameId: string): Promise<number> {
    return this.shared.spectatorConnections.get(gameId)?.size ?? 0;
  }
}

export async function createTwoInstanceRuntimeHarness(input: {
  gameId: string;
}): Promise<TwoInstanceRuntimeHarness> {
  const sharedRuntime: SharedRuntimeState = {
    events: [],
    nextEventId: 0,
    spectatorConnections: new Map(),
    nextSpectatorId: 0,
  };
  const durableEvents: OnlineGameEvent[] = [];
  const durableRooms = new Map<string, OnlineGameRoomRecord>();
  const sockets = new Set<WebSocket>();
  const nodeAService = new OnlineGameService({
    idFactory: () => input.gameId,
    tokenFactory: (seat) => `node-a-${seat}-token`,
    credentialFactory: hashOnlineToken,
    verifyToken: verifyOnlineToken,
  });
  const nodeBService = new OnlineGameService({
    verifyToken: verifyOnlineToken,
  });
  const nodeACoordinator = createPostgresCompositeRuntimeCoordinator({
    nodeId: "node-a",
    runtimeEventStore: new InMemoryRuntimeEventStore(sharedRuntime, "node-a"),
    spectatorPresenceStore: new InMemorySpectatorPresenceStore(sharedRuntime, "node-a"),
  });
  const nodeBCoordinator = createPostgresCompositeRuntimeCoordinator({
    nodeId: "node-b",
    runtimeEventStore: new InMemoryRuntimeEventStore(sharedRuntime, "node-b"),
    spectatorPresenceStore: new InMemorySpectatorPresenceStore(sharedRuntime, "node-b"),
  });

  const loadGameRoomRecord = async (gameId: string) => durableRooms.get(gameId) ?? null;
  const loadGameSummary = async (gameId: string) =>
    projectOnlineGameSummaries(durableEvents).find((summary) => summary.gameId === gameId) ??
    null;

  const appendGameVisibilityChanged = async (
    event: Extract<OnlineGameEvent, { type: "visibility_changed" }>
  ): Promise<OnlineGameSummary> => {
    durableEvents.push(event);
    const summary = await loadGameSummary(event.gameId);
    if (!summary) {
      throw new Error(`Expected visibility summary for ${event.gameId}.`);
    }
    return summary;
  };

  const applyGameAction = async (
    actionInput: OnlineGameStoreActionInput
  ): Promise<OnlineGameStoreActionResult> => {
    const record = durableRooms.get(actionInput.gameId);
    if (!record) {
      return {
        ok: false,
        error: { code: "not_found", message: "Online game no longer exists." },
      };
    }
    const room = OnlineGameRoom.create({ ...record, verifyToken: verifyOnlineToken });
    const result = room.submitAction(
      actionInput.token,
      actionInput.action,
      actionInput.clientActionId
    );
    if (!result.ok) {
      return result;
    }
    const accepted = room.toRecord().acceptedActions.at(-1);
    if (!accepted) {
      throw new Error("Accepted action was not recorded.");
    }
    const event = createOnlineActionAcceptedEvent({
      type: "action_accepted",
      gameId: actionInput.gameId,
      playerColor: accepted.playerColor,
      clientActionId: accepted.clientActionId,
      version: result.snapshot.version,
      playedAt: accepted.playedAt,
      action: accepted.action,
      clock: accepted.clock,
    });
    durableRooms.set(actionInput.gameId, room.toRecord());
    durableEvents.push(event);
    return {
      ok: true,
      event,
      snapshotChange: event,
      playerColor: accepted.playerColor,
      room: room.toRecord(),
      snapshot: result.snapshot,
    };
  };

  const nodeA = createOnlineHttpServer({
    publicBaseUrl: "https://castles.example",
    service: nodeAService,
    runtimeCoordinator: nodeACoordinator,
    onGameCreated: async (event, credentials: OnlineGameCredentials) => {
      durableEvents.push(event);
      const room = OnlineGameRoom.create({
        setup: event.setup,
        gameId: event.gameId,
        whiteCredential: credentials.whiteCredential,
        blackCredential: credentials.blackCredential,
        clock: event.clock,
      });
      durableRooms.set(event.gameId, room.toRecord());
    },
    appendGameVisibilityChanged,
    applyGameAction,
    loadGameRoomRecord,
    loadGameSummary,
  });
  const nodeB = createOnlineHttpServer({
    publicBaseUrl: "https://castles.example",
    service: nodeBService,
    runtimeCoordinator: nodeBCoordinator,
    loadGameRoomRecord,
    loadGameSummary,
  });
  const nodeAPort = await listen(nodeA.server);
  const nodeBPort = await listen(nodeB.server);

  const totalSpectatorConnections = () =>
    Array.from(sharedRuntime.spectatorConnections.values()).reduce(
      (total, connections) => total + connections.size,
      0
    );

  const closeTrackedSocket = async (socket: WebSocket) => {
    const previousSpectatorConnections = totalSpectatorConnections();
    await closeSocket(socket);
    if (previousSpectatorConnections === 0) return;
    const deadline = Date.now() + 1_000;
    while (Date.now() < deadline) {
      if (totalSpectatorConnections() < previousSpectatorConnections) return;
      await delay(5);
    }
  };

  const trackSocket = async (socket: WebSocket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    await waitForSocketOpen(socket);
    return socket;
  };

  const createGameOnNodeA = async (): Promise<TwoInstanceCreatedGame> => {
    const createResponse = await fetch(`http://127.0.0.1:${nodeAPort}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    if (createResponse.status !== 201) {
      throw new Error(`Create game failed with ${createResponse.status}`);
    }
    const game = (await createResponse.json()) as TwoInstanceCreatedGame;
    const visibilityResponse = await fetch(
      `http://127.0.0.1:${nodeAPort}/api/online/games/${game.gameId}/visibility`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...bearer(game.white.token) },
        body: JSON.stringify({ visibility: "public" }),
      }
    );
    if (visibilityResponse.status !== 200) {
      throw new Error(`Make game public failed with ${visibilityResponse.status}`);
    }
    return game;
  };

  return {
    async createGameOnNodeA() {
      return createGameOnNodeA();
    },
    async spectateOnNodeB(gameId) {
      const socket = await trackSocket(new WebSocket(`ws://127.0.0.1:${nodeBPort}/ws`));
      socket.send(JSON.stringify(versionedMessage({ type: "spectate", gameId })));
      const message = await nextSocketMessage(socket, "node B spectator join");
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "spectating"
      ) {
        throw new Error(`Unexpected spectator join message: ${JSON.stringify(message)}`);
      }
      return socket;
    },
    async joinWhiteOnNodeA(game) {
      const socket = await trackSocket(new WebSocket(`ws://127.0.0.1:${nodeAPort}/ws`));
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "join",
            gameId: game.gameId,
            token: game.white.token,
          })
        )
      );
      const message = await nextSocketMessage(socket, "node A white join");
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "joined"
      ) {
        throw new Error(`Unexpected player join message: ${JSON.stringify(message)}`);
      }
      return socket;
    },
    async sendWhiteAction(socket, game, action) {
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "action",
            clientActionId: `client-${game.gameId}-${action.type.toLowerCase()}`,
            action,
          })
        )
      );
      const message = await nextSocketMessage(socket, "node A white action acknowledgement");
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "snapshot"
      ) {
        throw new Error(`Unexpected player action message: ${JSON.stringify(message)}`);
      }
    },
    async pollNodeBRuntimeEvents() {
      await nodeBCoordinator.pollRemoteGameSnapshotChangedEvents({ limit: 25 });
    },
    async fetchPublicGameOnNodeA(gameId) {
      const response = await fetch(
        `http://127.0.0.1:${nodeAPort}/api/online/games/${gameId}/summary`
      );
      if (response.status !== 200) {
        throw new Error(`Fetch public summary failed with ${response.status}`);
      }
      const body = (await response.json()) as {
        schemaVersion: typeof ONLINE_GAME_DIRECTORY_SCHEMA_VERSION;
        summary: OnlineGameSummary;
      };
      if (body.schemaVersion !== ONLINE_GAME_DIRECTORY_SCHEMA_VERSION) {
        throw new Error("Unexpected summary response schema.");
      }
      return body.summary;
    },
    nextSpectatorMessage: nextSocketMessage,
    closeSocket: closeTrackedSocket,
    async close() {
      await Promise.all(Array.from(sockets).map((socket) => closeTrackedSocket(socket)));
      await Promise.all([closeServer(nodeA.server), closeServer(nodeB.server)]);
      await Promise.all([nodeACoordinator.close(), nodeBCoordinator.close()]);
    },
  };
}
