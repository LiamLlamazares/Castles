import { randomBytes } from "node:crypto";

export type OnlineRuntimeMode = "single-node";

export type OnlineRuntimeSnapshotReason =
  | "action"
  | "timeout"
  | "visibility"
  | "challenge"
  | "open_seek"
  | "snapshot";

export interface OnlineRuntimeGameSnapshotChangedEvent {
  type: "game_snapshot_changed";
  gameId: string;
  roomVersion: number;
  lastEventId?: string;
  reason: OnlineRuntimeSnapshotReason;
  nodeId: string;
  createdAt: string;
}

export interface OnlineRuntimeStoredGameSnapshotChangedEvent
  extends OnlineRuntimeGameSnapshotChangedEvent {
  id: number;
}

export interface OnlineRuntimeEventPollResult {
  afterId: number;
  published: number;
}

export interface OnlineRuntimeSpectatorRegistration {
  connectionId: string;
}

export interface OnlineRuntimeCoordinatorCapabilities {
  mode: OnlineRuntimeMode;
  websocketFanout: "process-local";
  spectatorPresence: "process-local" | "postgres-live-presence";
  operationGates: "process-local" | "postgres-quick-match-session";
}

export type OnlineRuntimeOperationGateScope = "quick_match_session";

export interface OnlineRuntimeOperationGateStore {
  withOperationGate<T>(
    input: { scope: OnlineRuntimeOperationGateScope; key: string },
    operation: () => Promise<T>
  ): Promise<T>;
}

export interface OnlineRuntimeSpectatorPresenceStore {
  registerSpectator(input: { gameId: string }): Promise<OnlineRuntimeSpectatorRegistration>;
  refreshSpectator(input: {
    gameId: string;
    connectionId: string;
  }): Promise<OnlineRuntimeSpectatorRegistration | null>;
  removeSpectator(input: { gameId: string; connectionId: string }): Promise<void>;
  countSpectators(gameId: string): Promise<number>;
  cleanupExpiredSpectators?(): Promise<number>;
}

export interface OnlineRuntimeEventStore {
  recordGameSnapshotChanged(input: {
    gameId: string;
    roomVersion: number;
    lastEventId?: string;
    reason: OnlineRuntimeSnapshotReason;
  }): Promise<unknown>;
  listGameSnapshotChangedEventsAfter(input: {
    afterId: number;
    limit: number;
    excludeNodeId?: string;
  }): Promise<{
    events: OnlineRuntimeStoredGameSnapshotChangedEvent[];
    nextAfterId: number;
  }>;
}

export interface OnlineRuntimeCoordinator {
  readonly nodeId: string;
  readonly capabilities: OnlineRuntimeCoordinatorCapabilities;
  publishGameSnapshotChanged(event: OnlineRuntimeGameSnapshotChangedEvent): Promise<void>;
  pollRemoteGameSnapshotChangedEvents(input?: { limit?: number }): Promise<OnlineRuntimeEventPollResult>;
  subscribeGameSnapshotChanged(
    handler: (event: OnlineRuntimeGameSnapshotChangedEvent) => void | Promise<void>
  ): () => void;
  registerSpectator(input: { gameId: string }): Promise<OnlineRuntimeSpectatorRegistration>;
  refreshSpectator(input: {
    gameId: string;
    connectionId: string;
  }): Promise<OnlineRuntimeSpectatorRegistration | null>;
  removeSpectator(input: { gameId: string; connectionId: string }): Promise<void>;
  countSpectators(gameId: string): Promise<number>;
  withGameOperationGate<T>(gameId: string, operation: () => Promise<T>): Promise<T>;
  withQuickMatchSessionGate<T>(sessionKey: string, operation: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_RUNTIME_EVENT_POLL_LIMIT = 100;
const MAX_RUNTIME_EVENT_POLL_LIMIT = 500;

export function normalizeRuntimeNodeId(raw: string): string {
  const value = raw.trim();
  if (!NODE_ID_PATTERN.test(value)) {
    throw new Error(
      "CASTLES_NODE_ID must be 1-64 characters using only letters, numbers, underscores, or hyphens."
    );
  }
  return value;
}

export function createGeneratedRuntimeNodeId(): string {
  return `node_${randomBytes(6).toString("base64url")}`;
}

function normalizeRuntimeEventPollLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_RUNTIME_EVENT_POLL_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_RUNTIME_EVENT_POLL_LIMIT) {
    throw new Error("Runtime event poll limit must be an integer from 1 through 500.");
  }
  return value;
}

function stripRuntimeEventCursor(
  event: OnlineRuntimeStoredGameSnapshotChangedEvent
): OnlineRuntimeGameSnapshotChangedEvent {
  return {
    type: event.type,
    gameId: event.gameId,
    roomVersion: event.roomVersion,
    lastEventId: event.lastEventId,
    reason: event.reason,
    nodeId: event.nodeId,
    createdAt: event.createdAt,
  };
}

export function createSingleNodeOnlineRuntimeCoordinator(options: {
  nodeId: string;
}): OnlineRuntimeCoordinator {
  const nodeId = normalizeRuntimeNodeId(options.nodeId);
  const handlers = new Set<
    (event: OnlineRuntimeGameSnapshotChangedEvent) => void | Promise<void>
  >();
  const spectatorConnections = new Map<string, Set<string>>();
  const gameGates = new Map<string, Promise<void>>();
  const quickMatchSessionGates = new Map<string, Promise<void>>();

  const runQueuedOperation = async <T>(
    gates: Map<string, Promise<void>>,
    key: string,
    operation: () => Promise<T>
  ): Promise<T> => {
    const previous = gates.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const settled = next.then(
      () => undefined,
      () => undefined
    );
    gates.set(key, settled);
    settled.finally(() => {
      if (gates.get(key) === settled) {
        gates.delete(key);
      }
    });
    return next;
  };

  const validateGateKey = (key: string, label: string): string => {
    const value = key.trim();
    if (!value || value.length > 256) {
      throw new Error(`${label} key must be non-empty and at most 256 characters.`);
    }
    return value;
  };

  return {
    nodeId,
    capabilities: {
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
    },
    async publishGameSnapshotChanged(event) {
      for (const handler of Array.from(handlers)) {
        await handler(event);
      }
    },
    async pollRemoteGameSnapshotChangedEvents() {
      return { afterId: 0, published: 0 };
    },
    subscribeGameSnapshotChanged(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    async registerSpectator({ gameId }) {
      const connectionId = `spectator_${randomBytes(9).toString("base64url")}`;
      const connections = spectatorConnections.get(gameId) ?? new Set<string>();
      connections.add(connectionId);
      spectatorConnections.set(gameId, connections);
      return { connectionId };
    },
    async refreshSpectator({ gameId, connectionId }) {
      return spectatorConnections.get(gameId)?.has(connectionId) ? { connectionId } : null;
    },
    async removeSpectator({ gameId, connectionId }) {
      const connections = spectatorConnections.get(gameId);
      if (!connections) return;
      connections.delete(connectionId);
      if (connections.size === 0) {
        spectatorConnections.delete(gameId);
      }
    },
    async countSpectators(gameId) {
      return spectatorConnections.get(gameId)?.size ?? 0;
    },
    async withGameOperationGate(gameId, operation) {
      return runQueuedOperation(gameGates, validateGateKey(gameId, "Game operation"), operation);
    },
    async withQuickMatchSessionGate(sessionKey, operation) {
      return runQueuedOperation(
        quickMatchSessionGates,
        validateGateKey(sessionKey, "Quick Match session"),
        operation
      );
    },
    async close() {
      handlers.clear();
      spectatorConnections.clear();
      gameGates.clear();
      quickMatchSessionGates.clear();
    },
  };
}

export function createPostgresSpectatorPresenceRuntimeCoordinator(options: {
  nodeId: string;
  spectatorPresenceStore: OnlineRuntimeSpectatorPresenceStore;
}): OnlineRuntimeCoordinator {
  const local = createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId });

  return {
    ...local,
    capabilities: {
      ...local.capabilities,
      spectatorPresence: "postgres-live-presence",
    },
    async registerSpectator(input) {
      return options.spectatorPresenceStore.registerSpectator(input);
    },
    async refreshSpectator(input) {
      return options.spectatorPresenceStore.refreshSpectator(input);
    },
    async removeSpectator(input) {
      await options.spectatorPresenceStore.removeSpectator(input);
    },
    async countSpectators(gameId) {
      return options.spectatorPresenceStore.countSpectators(gameId);
    },
    async close() {
      await local.close();
      await options.spectatorPresenceStore.cleanupExpiredSpectators?.();
    },
  };
}

export function createPostgresRuntimeEventCoordinator(options: {
  nodeId: string;
  runtimeEventStore: OnlineRuntimeEventStore;
}): OnlineRuntimeCoordinator {
  const local = createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId });
  let runtimeEventCursor = 0;
  let runtimeEventPollInFlight: Promise<OnlineRuntimeEventPollResult> | null = null;

  const pollRemoteEventsOnce = async (limit: number): Promise<OnlineRuntimeEventPollResult> => {
    const result = await options.runtimeEventStore.listGameSnapshotChangedEventsAfter({
      afterId: runtimeEventCursor,
      limit,
      excludeNodeId: local.nodeId,
    });
    for (const event of result.events) {
      await local.publishGameSnapshotChanged(stripRuntimeEventCursor(event));
    }
    runtimeEventCursor = result.nextAfterId;
    return { afterId: runtimeEventCursor, published: result.events.length };
  };

  return {
    ...local,
    async publishGameSnapshotChanged(event) {
      await options.runtimeEventStore.recordGameSnapshotChanged({
        gameId: event.gameId,
        roomVersion: event.roomVersion,
        lastEventId: event.lastEventId,
        reason: event.reason,
      });
      await local.publishGameSnapshotChanged(event);
    },
    async pollRemoteGameSnapshotChangedEvents(input = {}) {
      const limit = normalizeRuntimeEventPollLimit(input.limit);
      if (runtimeEventPollInFlight) {
        return runtimeEventPollInFlight;
      }
      const poll = pollRemoteEventsOnce(limit);
      runtimeEventPollInFlight = poll;
      try {
        return await poll;
      } finally {
        if (runtimeEventPollInFlight === poll) {
          runtimeEventPollInFlight = null;
        }
      }
    },
  };
}

export function createPostgresOperationGateRuntimeCoordinator(options: {
  nodeId: string;
  operationGateStore: OnlineRuntimeOperationGateStore;
}): OnlineRuntimeCoordinator {
  const local = createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId });

  return {
    ...local,
    capabilities: {
      ...local.capabilities,
      operationGates: "postgres-quick-match-session",
    },
    async withQuickMatchSessionGate(sessionKey, operation) {
      return options.operationGateStore.withOperationGate(
        { scope: "quick_match_session", key: sessionKey },
        operation
      );
    },
  };
}
