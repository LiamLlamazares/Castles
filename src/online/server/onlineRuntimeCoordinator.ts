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

export interface OnlineRuntimeSpectatorRegistration {
  connectionId: string;
}

export interface OnlineRuntimeCoordinatorCapabilities {
  mode: OnlineRuntimeMode;
  websocketFanout: "process-local";
  spectatorPresence: "process-local" | "postgres-live-presence";
  operationGates: "process-local";
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
}

export interface OnlineRuntimeCoordinator {
  readonly nodeId: string;
  readonly capabilities: OnlineRuntimeCoordinatorCapabilities;
  publishGameSnapshotChanged(event: OnlineRuntimeGameSnapshotChangedEvent): Promise<void>;
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
  close(): Promise<void>;
}

const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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

export function createSingleNodeOnlineRuntimeCoordinator(options: {
  nodeId: string;
}): OnlineRuntimeCoordinator {
  const nodeId = normalizeRuntimeNodeId(options.nodeId);
  const handlers = new Set<
    (event: OnlineRuntimeGameSnapshotChangedEvent) => void | Promise<void>
  >();
  const spectatorConnections = new Map<string, Set<string>>();
  const gates = new Map<string, Promise<void>>();

  const removeGateIfCurrent = (gameId: string, current: Promise<void>): void => {
    if (gates.get(gameId) === current) {
      gates.delete(gameId);
    }
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
      const previous = gates.get(gameId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(operation);
      const settled = next.then(
        () => undefined,
        () => undefined
      );
      gates.set(gameId, settled);
      settled.finally(() => removeGateIfCurrent(gameId, settled));
      return next;
    },
    async close() {
      handlers.clear();
      spectatorConnections.clear();
      gates.clear();
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
  };
}
