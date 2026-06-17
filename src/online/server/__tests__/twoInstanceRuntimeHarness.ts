import { createHash } from "node:crypto";
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
import {
  projectOnlineChallengeSummaries,
  type OnlineChallengeEvent,
  type OnlineChallengeSummary,
} from "../../challenges";
import { ONLINE_PROTOCOL_VERSION } from "../../protocolVersion";
import {
  ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
  projectOnlineGameSummaries,
  type OnlineIdentity,
  type OnlineGameSummary,
} from "../../readModel";
import { serializeOnlineGameSetup } from "../../serialization";
import {
  canIdentityAcceptOpenSeek,
  createOpenSeekAcceptedEvent,
  isSameOnlineIdentity as isSameOpenSeekIdentity,
  projectOpenSeekSummaries,
  type OpenSeekEvent,
  type OpenSeekSummary,
} from "../../seeks";
import type { OnlineActionDTO } from "../../types";
import { createOnlineHttpServer } from "../createOnlineHttpServer";
import { hashOnlineToken, verifyOnlineToken } from "../onlineTokenCredentials";
import { MemoryOnlineAccountStore } from "../OnlineAccountStore";
import type {
  OnlineChallengeCredentials,
  OpenSeekAcceptInput,
  OpenSeekAcceptResult,
  OpenSeekCredentials,
  OnlineGameStoreActionInput,
  OnlineGameStoreActionResult,
  ResolvedOpenSeekCredential,
} from "../OnlineGameStore";
import {
  createPostgresCompositeRuntimeCoordinator,
  type OnlineRuntimeEventStore,
  type OnlineRuntimeOperationGateScope,
  type OnlineRuntimeOperationGateStore,
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

export interface TwoInstanceHttpResult {
  status: number;
  body: any;
}

export interface TwoInstanceRuntimeHarness {
  createGameOnNodeA(): Promise<TwoInstanceCreatedGame>;
  createOpenSeekOnNodeA(creatorSessionId: string): Promise<{ seekId: string; body: any }>;
  acceptOpenSeekOnNodeA(seekId: string, acceptorSessionId: string): Promise<TwoInstanceHttpResult>;
  acceptOpenSeekOnNodeB(seekId: string, acceptorSessionId: string): Promise<TwoInstanceHttpResult>;
  quickMatchOnNodeA(sessionId: string): Promise<TwoInstanceHttpResult>;
  quickMatchOnNodeB(sessionId: string): Promise<TwoInstanceHttpResult>;
  createChallengeAccounts(): Promise<{ challenger: any; challenged: any; challengePairGateKey: string }>;
  createTargetedChallengeOnNodeA(
    challengerToken: string,
    challengedDisplayName: string
  ): Promise<TwoInstanceHttpResult>;
  createTargetedChallengeOnNodeB(
    challengerToken: string,
    challengedDisplayName: string
  ): Promise<TwoInstanceHttpResult>;
  countOpenSeeks(): Promise<number>;
  countChallenges(): Promise<number>;
  countGames(): Promise<number>;
  expectSharedGateContention(gateKey: string, expectedEntrants?: number): void;
  sharedGateCallCount(gateKey: string): number;
  sharedGateCalls(): string[];
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
  openSeekEvents: OpenSeekEvent[];
  openSeekCredentials: Map<string, OpenSeekCredentials>;
  challengeEvents: OnlineChallengeEvent[];
  challengeCredentials: Map<string, OnlineChallengeCredentials>;
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

function publicPlayerIdentityQueueKey(identity: OnlineIdentity): string {
  return `${identity.kind}:${identity.id}`;
}

function accountChallengePairOperationGateKey(
  challengerIdentity: OnlineIdentity,
  challengedIdentity: OnlineIdentity
): string {
  const pairKeyPayload = JSON.stringify([
    publicPlayerIdentityQueueKey(challengerIdentity),
    publicPlayerIdentityQueueKey(challengedIdentity),
  ]);
  const pairKey = `account_challenge_pair:${createHash("sha256")
    .update(pairKeyPayload, "utf8")
    .digest("base64url")}`;
  return `account_challenge_pair:${pairKey}`;
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

class InMemoryOperationGateStore implements OnlineRuntimeOperationGateStore {
  readonly calls: string[] = [];
  private readonly gates = new Map<string, Promise<void>>();
  private readonly contentionBarriers = new Map<
    string,
    {
      expectedEntrants: number;
      arrived: number;
      promise: Promise<void>;
      resolve: () => void;
      reject: (error: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  expectContention(gateKey: string, expectedEntrants = 2): void {
    if (!Number.isInteger(expectedEntrants) || expectedEntrants < 2) {
      throw new Error("Expected shared gate contention requires at least two entrants.");
    }
    if (this.contentionBarriers.has(gateKey)) {
      throw new Error(`Shared gate contention is already armed for ${gateKey}.`);
    }
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    promise.catch(() => undefined);
    const timeoutId = setTimeout(() => {
      this.contentionBarriers.delete(gateKey);
      reject(new Error(`Timed out waiting for ${expectedEntrants} entrants at ${gateKey}.`));
    }, 2_000);
    this.contentionBarriers.set(gateKey, {
      expectedEntrants,
      arrived: 0,
      promise,
      resolve,
      reject,
      timeoutId,
    });
  }

  callCount(gateKey: string): number {
    return this.calls.filter((call) => call === gateKey).length;
  }

  async withOperationGate<T>(
    input: { scope: OnlineRuntimeOperationGateScope; key: string },
    operation: () => Promise<T>
  ): Promise<T> {
    const gateKey = `${input.scope}:${input.key}`;
    this.calls.push(gateKey);
    const barrier = this.contentionBarriers.get(gateKey);
    if (barrier) {
      barrier.arrived += 1;
      if (barrier.arrived >= barrier.expectedEntrants) {
        clearTimeout(barrier.timeoutId);
        this.contentionBarriers.delete(gateKey);
        barrier.resolve();
      }
      await barrier.promise;
    }
    const previous = this.gates.get(gateKey) ?? Promise.resolve();
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = previous.then(() => blocker, () => blocker);
    this.gates.set(gateKey, next);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.gates.get(gateKey) === next) {
        this.gates.delete(gateKey);
      }
    }
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
    openSeekEvents: [],
    openSeekCredentials: new Map(),
    challengeEvents: [],
    challengeCredentials: new Map(),
  };
  const operationGateStore = new InMemoryOperationGateStore();
  const durableEvents: OnlineGameEvent[] = [];
  const durableRooms = new Map<string, OnlineGameRoomRecord>();
  const sockets = new Set<WebSocket>();
  const accountStore = new MemoryOnlineAccountStore();
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
    operationGateStore,
  });
  const nodeBCoordinator = createPostgresCompositeRuntimeCoordinator({
    nodeId: "node-b",
    runtimeEventStore: new InMemoryRuntimeEventStore(sharedRuntime, "node-b"),
    spectatorPresenceStore: new InMemorySpectatorPresenceStore(sharedRuntime, "node-b"),
    operationGateStore,
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

  const loadOpenSeekSummaries = async (): Promise<OpenSeekSummary[]> =>
    projectOpenSeekSummaries(sharedRuntime.openSeekEvents);

  const appendOpenSeekCreated = async (
    event: Extract<OpenSeekEvent, { type: "seek_created" }>,
    credentials: OpenSeekCredentials
  ): Promise<OpenSeekSummary> => {
    sharedRuntime.openSeekEvents.push(event);
    sharedRuntime.openSeekCredentials.set(event.seekId, credentials);
    const summary = projectOpenSeekSummaries(sharedRuntime.openSeekEvents).find(
      (candidate) => candidate.seekId === event.seekId
    );
    if (!summary) {
      throw new Error(`Open seek summary was not refreshed for ${event.seekId}.`);
    }
    return summary;
  };

  const appendOpenSeekEvent = async (
    event: Exclude<OpenSeekEvent, { type: "seek_created" } | { type: "seek_accepted" }>
  ): Promise<OpenSeekSummary> => {
    sharedRuntime.openSeekEvents.push(event);
    const summary = projectOpenSeekSummaries(sharedRuntime.openSeekEvents).find(
      (candidate) => candidate.seekId === event.seekId
    );
    if (!summary) {
      throw new Error(`Open seek summary was not refreshed for ${event.seekId}.`);
    }
    return summary;
  };

  const resolveOpenSeekCredential = async (
    seekId: string,
    token: string
  ): Promise<ResolvedOpenSeekCredential | null> => {
    const credentials = sharedRuntime.openSeekCredentials.get(seekId);
    if (!credentials || !verifyOnlineToken(token, credentials.creatorCredential)) return null;
    return {
      seekId,
      role: "creator" as const,
      identity: credentials.creatorIdentity as ResolvedOpenSeekCredential["identity"],
    };
  };

  const acceptOpenSeekAndCreateGame = async (
    input: OpenSeekAcceptInput
  ): Promise<OpenSeekAcceptResult> => {
    const summary = projectOpenSeekSummaries(sharedRuntime.openSeekEvents).find(
      (candidate) => candidate.seekId === input.seekId
    );
    if (!summary) throw new Error(`Open seek ${input.seekId} was not found.`);
    if (summary.status !== "open") throw new Error(`Open seek ${input.seekId} is already terminal.`);
    if (!canIdentityAcceptOpenSeek(summary, input.acceptedBy, input.acceptedAt)) {
      throw new Error(`A creator cannot accept their own open seek ${input.seekId}.`);
    }
    const credentials = sharedRuntime.openSeekCredentials.get(input.seekId);
    if (!credentials) throw new Error(`Missing open seek credentials for ${input.seekId}.`);
    const creatorSeat = isSameOpenSeekIdentity(input.whiteIdentity, summary.creatorIdentity)
      ? "w"
      : "b";
    const acceptorSeat = creatorSeat === "w" ? "b" : "w";
    const gameCredentials: OnlineGameCredentials =
      creatorSeat === "w"
        ? {
            whiteCredential: credentials.creatorCredential,
            blackCredential: input.acceptorCredential,
          }
        : {
            whiteCredential: input.acceptorCredential,
            blackCredential: credentials.creatorCredential,
          };
    const seekEvent = createOpenSeekAcceptedEvent(
      {
        type: "seek_accepted",
        seekId: input.seekId,
        acceptedBy: input.acceptedBy,
        acceptedAt: input.acceptedAt,
        gameId: input.gameCreatedEvent.gameId,
        whiteIdentity: input.whiteIdentity,
        blackIdentity: input.blackIdentity,
      },
      { createdAt: input.acceptedAt }
    );
    const gameCreatedEvent = {
      ...input.gameCreatedEvent,
      whiteIdentity: input.whiteIdentity,
      blackIdentity: input.blackIdentity,
    };
    sharedRuntime.openSeekEvents.push(seekEvent);
    durableEvents.push(gameCreatedEvent);
    const seekSummary = projectOpenSeekSummaries(sharedRuntime.openSeekEvents).find(
      (candidate) => candidate.seekId === input.seekId
    );
    if (!seekSummary) {
      throw new Error(`Open seek summary was not refreshed for ${input.seekId}.`);
    }
    const [gameSummary] = projectOnlineGameSummaries([gameCreatedEvent]);
    if (!gameSummary) {
      throw new Error(`Online game summary was not refreshed for ${gameCreatedEvent.gameId}.`);
    }
    const gameRecord: OnlineGameRoomRecord = {
      gameId: gameCreatedEvent.gameId,
      setup: gameCreatedEvent.setup,
      whiteCredential: gameCredentials.whiteCredential,
      blackCredential: gameCredentials.blackCredential,
      clock: gameCreatedEvent.clock,
      acceptedActions: [],
    };
    durableRooms.set(gameCreatedEvent.gameId, gameRecord);
    return {
      seekEvent,
      seekSummary,
      gameSummary,
      gameCredentials,
      gameRecord,
      gameSeats: { creator: creatorSeat, acceptor: acceptorSeat },
    };
  };

  const loadChallengeSummaries = async (): Promise<OnlineChallengeSummary[]> =>
    projectOnlineChallengeSummaries(sharedRuntime.challengeEvents);

  const appendChallengeCreated = async (
    event: Extract<OnlineChallengeEvent, { type: "challenge_created" }>,
    credentials: OnlineChallengeCredentials
  ): Promise<OnlineChallengeSummary> => {
    sharedRuntime.challengeEvents.push(event);
    sharedRuntime.challengeCredentials.set(event.challengeId, credentials);
    const summary = projectOnlineChallengeSummaries(sharedRuntime.challengeEvents).find(
      (candidate) => candidate.challengeId === event.challengeId
    );
    if (!summary) {
      throw new Error(`Challenge summary was not refreshed for ${event.challengeId}.`);
    }
    return summary;
  };

  const nodeA = createOnlineHttpServer({
    publicBaseUrl: "https://castles.example",
    service: nodeAService,
    runtimeCoordinator: nodeACoordinator,
    accountStore,
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
    appendOpenSeekCreated,
    appendOpenSeekEvent,
    loadOpenSeekSummaries,
    resolveOpenSeekCredential,
    acceptOpenSeekAndCreateGame,
    appendChallengeCreated,
    loadChallengeSummaries,
  });
  const nodeB = createOnlineHttpServer({
    publicBaseUrl: "https://castles.example",
    service: nodeBService,
    runtimeCoordinator: nodeBCoordinator,
    accountStore,
    loadGameRoomRecord,
    loadGameSummary,
    appendOpenSeekCreated,
    appendOpenSeekEvent,
    loadOpenSeekSummaries,
    resolveOpenSeekCredential,
    acceptOpenSeekAndCreateGame,
    appendChallengeCreated,
    loadChallengeSummaries,
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

  const postJson = async (
    port: number,
    path: string,
    body: unknown,
    headers: HeadersInit = {}
  ): Promise<TwoInstanceHttpResult> => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  const putJson = async (
    port: number,
    path: string,
    headers: HeadersInit = {}
  ): Promise<TwoInstanceHttpResult> => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "PUT",
      headers,
    });
    return { status: response.status, body: await response.json() };
  };

  const createAccount = async (port: number, displayName: string): Promise<any> => {
    const result = await postJson(port, "/api/online/accounts", {
      displayName,
      password: "account-password",
    });
    if (result.status !== 201) {
      throw new Error(`Create account ${displayName} failed with ${result.status}`);
    }
    return result.body;
  };

  const quickMatch = (port: number, sessionId: string) =>
    postJson(port, "/api/online/matchmaking/quick", {
      setup: createSetup(),
      sessionId,
    });

  const acceptOpenSeek = (port: number, seekId: string, acceptorSessionId: string) =>
    postJson(port, `/api/online/seeks/${seekId}/accept`, {
      acceptorSessionId,
    });

  const createTargetedChallenge = (
    port: number,
    challengerToken: string,
    challengedDisplayName: string
  ) =>
    postJson(
      port,
      "/api/online/challenges",
      {
        setup: createSetup(),
        challengerSeat: "w",
        visibility: "unlisted",
        challengedDisplayName,
      },
      bearer(challengerToken)
    );

  return {
    async createGameOnNodeA() {
      return createGameOnNodeA();
    },
    async createOpenSeekOnNodeA(creatorSessionId) {
      const result = await postJson(nodeAPort, "/api/online/seeks", {
        setup: createSetup(),
        creatorSessionId,
        creatorSeat: "w",
      });
      if (result.status !== 201) {
        throw new Error(`Create open seek failed with ${result.status}`);
      }
      return { seekId: result.body.seekId as string, body: result.body };
    },
    acceptOpenSeekOnNodeA(seekId, acceptorSessionId) {
      return acceptOpenSeek(nodeAPort, seekId, acceptorSessionId);
    },
    acceptOpenSeekOnNodeB(seekId, acceptorSessionId) {
      return acceptOpenSeek(nodeBPort, seekId, acceptorSessionId);
    },
    quickMatchOnNodeA(sessionId) {
      return quickMatch(nodeAPort, sessionId);
    },
    quickMatchOnNodeB(sessionId) {
      return quickMatch(nodeBPort, sessionId);
    },
    async createChallengeAccounts() {
      const challenger = await createAccount(nodeAPort, "RaceLiam");
      const challenged = await createAccount(nodeBPort, "RaceSamir");
      const follow = await putJson(
        nodeAPort,
        "/api/online/account/follows/RaceLiam",
        bearer(challenged.session.token)
      );
      if (follow.status !== 200) {
        throw new Error(`Follow setup failed with ${follow.status}`);
      }
      return {
        challenger,
        challenged,
        challengePairGateKey: accountChallengePairOperationGateKey(
          challenger.account.identity,
          challenged.account.identity
        ),
      };
    },
    createTargetedChallengeOnNodeA(challengerToken, challengedDisplayName) {
      return createTargetedChallenge(nodeAPort, challengerToken, challengedDisplayName);
    },
    createTargetedChallengeOnNodeB(challengerToken, challengedDisplayName) {
      return createTargetedChallenge(nodeBPort, challengerToken, challengedDisplayName);
    },
    async countOpenSeeks() {
      return (await loadOpenSeekSummaries()).length;
    },
    async countChallenges() {
      return (await loadChallengeSummaries()).length;
    },
    async countGames() {
      return durableRooms.size;
    },
    expectSharedGateContention(gateKey, expectedEntrants = 2) {
      operationGateStore.expectContention(gateKey, expectedEntrants);
    },
    sharedGateCallCount(gateKey) {
      return operationGateStore.callCount(gateKey);
    },
    sharedGateCalls() {
      return [...operationGateStore.calls];
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
