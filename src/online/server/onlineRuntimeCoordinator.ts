import { randomBytes } from "node:crypto";

export type OnlineRuntimeMode = "single-node" | "multi-instance";

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

export interface OnlineRuntimeDrainState {
  draining: boolean;
  startedAt?: string;
  reason?: string;
}

export interface OnlineRuntimeNodeState {
  nodeId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  draining: boolean;
  drainStartedAt?: string;
  updatedAt: string;
}

export interface OnlineRuntimeStartDrainInput {
  startedAt?: string;
  reason?: string;
}

export interface OnlineRuntimeSpectatorRegistration {
  connectionId: string;
}

export interface OnlineRuntimeCoordinatorCapabilities {
  mode: OnlineRuntimeMode;
  websocketFanout: "process-local" | "postgres-runtime-events";
  spectatorPresence: "process-local" | "postgres-live-presence";
  operationGates: "process-local" | "postgres-selected-shared-gates";
  rateLimits: "process-local" | "postgres-shared-fixed-window";
  startupMaintenance: "process-local" | "postgres-once-per-run";
}

export type OnlineRuntimeRateLimitScope =
  | "account_auth"
  | "account_create"
  | "account_read"
  | "admin_read"
  | "challenge_action"
  | "create_challenge"
  | "create_game"
  | "create_open_seek"
  | "open_seek_action"
  | "public_directory"
  | "quick_match"
  | "socket_message"
  | "spectator_snapshot";

export interface OnlineRuntimeRateLimitInput {
  scope: OnlineRuntimeRateLimitScope;
  key: string;
  limit: number;
  windowMs: number;
}

export interface OnlineRuntimeRateLimitStore {
  consumeRateLimit(input: OnlineRuntimeRateLimitInput): Promise<boolean>;
}

export type OnlineRuntimeOperationGateScope =
  | "quick_match_session"
  | "account_challenge_pair"
  | "open_seek_lifecycle"
  | "challenge_lifecycle";

export interface OnlineRuntimeOperationGateStore {
  withOperationGate<T>(
    input: { scope: OnlineRuntimeOperationGateScope; key: string },
    operation: () => Promise<T>
  ): Promise<T>;
}

export type OnlineRuntimeStartupMaintenanceResult<T> =
  | { status: "completed"; value: T }
  | { status: "already_completed" };

export interface OnlineRuntimeStartupMaintenanceStore {
  runStartupMaintenance<T>(
    input: { taskKey: string; runKey: string; nodeId: string },
    operation: () => Promise<T>
  ): Promise<OnlineRuntimeStartupMaintenanceResult<T>>;
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

export interface OnlineRuntimeNodeStore {
  recordNodeStarted?(): Promise<unknown>;
  recordNodeHeartbeat?(): Promise<unknown>;
  getNodeState?(): Promise<OnlineRuntimeNodeState | null>;
  getDrainState(): Promise<OnlineRuntimeDrainState>;
  startDrain(input?: OnlineRuntimeStartDrainInput): Promise<OnlineRuntimeDrainState>;
}

export interface OnlineRuntimeCoordinator {
  readonly nodeId: string;
  readonly capabilities: OnlineRuntimeCoordinatorCapabilities;
  publishGameSnapshotChanged(event: OnlineRuntimeGameSnapshotChangedEvent): Promise<void>;
  pollRemoteGameSnapshotChangedEvents(input?: { limit?: number }): Promise<OnlineRuntimeEventPollResult>;
  getRuntimeNodeState(): Promise<OnlineRuntimeNodeState | null>;
  getDrainState(): Promise<OnlineRuntimeDrainState>;
  startDrain(input?: OnlineRuntimeStartDrainInput): Promise<OnlineRuntimeDrainState>;
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
  withAccountChallengePairGate<T>(pairKey: string, operation: () => Promise<T>): Promise<T>;
  withOpenSeekLifecycleGate<T>(seekKey: string, operation: () => Promise<T>): Promise<T>;
  withChallengeLifecycleGate<T>(challengeKey: string, operation: () => Promise<T>): Promise<T>;
  consumeRateLimit(input: OnlineRuntimeRateLimitInput): Promise<boolean>;
  runStartupMaintenance<T>(
    input: { taskKey: string; runKey: string },
    operation: () => Promise<T>
  ): Promise<OnlineRuntimeStartupMaintenanceResult<T>>;
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
  const accountChallengePairGates = new Map<string, Promise<void>>();
  const openSeekLifecycleGates = new Map<string, Promise<void>>();
  const challengeLifecycleGates = new Map<string, Promise<void>>();
  const startupMaintenanceGates = new Map<string, Promise<void>>();
  const rateLimitEntries = new Map<string, { count: number; resetAt: number }>();
  let drainState: OnlineRuntimeDrainState = { draining: false };

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

  const validateRateLimitInput = (input: OnlineRuntimeRateLimitInput): OnlineRuntimeRateLimitInput => {
    const key = input.key.trim();
    if (!key || key.length > 256) {
      throw new Error("Rate-limit key must be non-empty and at most 256 characters.");
    }
    if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
      throw new Error("Rate-limit limit must be a positive integer.");
    }
    if (!Number.isSafeInteger(input.windowMs) || input.windowMs < 1) {
      throw new Error("Rate-limit window must be a positive integer of milliseconds.");
    }
    return { ...input, key };
  };

  const rateLimitEntryKey = (input: OnlineRuntimeRateLimitInput): string =>
    `${input.scope}\u0000${input.windowMs}\u0000${input.key}`;

  return {
    nodeId,
    capabilities: {
      mode: "single-node",
      websocketFanout: "process-local",
      spectatorPresence: "process-local",
      operationGates: "process-local",
      rateLimits: "process-local",
      startupMaintenance: "process-local",
    },
    async publishGameSnapshotChanged(event) {
      for (const handler of Array.from(handlers)) {
        await handler(event);
      }
    },
    async pollRemoteGameSnapshotChangedEvents() {
      return { afterId: 0, published: 0 };
    },
    async getRuntimeNodeState() {
      return null;
    },
    async getDrainState() {
      return { ...drainState };
    },
    async startDrain(input = {}) {
      if (!drainState.draining) {
        drainState = {
          draining: true,
          startedAt: input.startedAt ?? new Date().toISOString(),
          reason: input.reason,
        };
      }
      return { ...drainState };
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
    async withAccountChallengePairGate(pairKey, operation) {
      return runQueuedOperation(
        accountChallengePairGates,
        validateGateKey(pairKey, "Account challenge pair"),
        operation
      );
    },
    async withOpenSeekLifecycleGate(seekKey, operation) {
      return runQueuedOperation(
        openSeekLifecycleGates,
        validateGateKey(seekKey, "Open seek lifecycle"),
        operation
      );
    },
    async withChallengeLifecycleGate(challengeKey, operation) {
      return runQueuedOperation(
        challengeLifecycleGates,
        validateGateKey(challengeKey, "Challenge lifecycle"),
        operation
      );
    },
    async consumeRateLimit(input) {
      const normalized = validateRateLimitInput(input);
      const key = rateLimitEntryKey(normalized);
      const now = Date.now();
      const entry = rateLimitEntries.get(key);
      if (!entry || entry.resetAt <= now) {
        rateLimitEntries.set(key, { count: 1, resetAt: now + normalized.windowMs });
        return true;
      }
      if (entry.count >= normalized.limit) {
        return false;
      }
      entry.count += 1;
      return true;
    },
    async runStartupMaintenance({ taskKey, runKey }, operation) {
      const gateKey = `${validateGateKey(taskKey, "Startup maintenance task")}\u0000${validateGateKey(
        runKey,
        "Startup maintenance run"
      )}`;
      const value = await runQueuedOperation(startupMaintenanceGates, gateKey, operation);
      return { status: "completed", value };
    },
    async close() {
      handlers.clear();
      spectatorConnections.clear();
      gameGates.clear();
      quickMatchSessionGates.clear();
      accountChallengePairGates.clear();
      openSeekLifecycleGates.clear();
      challengeLifecycleGates.clear();
      startupMaintenanceGates.clear();
      rateLimitEntries.clear();
    },
  };
}

function withPostgresSpectatorPresenceRuntimeCoordinator(
  base: OnlineRuntimeCoordinator,
  spectatorPresenceStore: OnlineRuntimeSpectatorPresenceStore
): OnlineRuntimeCoordinator {
  return {
    ...base,
    capabilities: {
      ...base.capabilities,
      spectatorPresence: "postgres-live-presence",
    },
    async registerSpectator(input) {
      return spectatorPresenceStore.registerSpectator(input);
    },
    async refreshSpectator(input) {
      return spectatorPresenceStore.refreshSpectator(input);
    },
    async removeSpectator(input) {
      await spectatorPresenceStore.removeSpectator(input);
    },
    async countSpectators(gameId) {
      return spectatorPresenceStore.countSpectators(gameId);
    },
    async close() {
      await base.close();
      await spectatorPresenceStore.cleanupExpiredSpectators?.();
    },
  };
}

function withPostgresRuntimeEventCoordinator(
  base: OnlineRuntimeCoordinator,
  runtimeEventStore: OnlineRuntimeEventStore
): OnlineRuntimeCoordinator {
  let runtimeEventCursor = 0;
  let runtimeEventPollInFlight: Promise<OnlineRuntimeEventPollResult> | null = null;

  const pollRemoteEventsOnce = async (limit: number): Promise<OnlineRuntimeEventPollResult> => {
    const result = await runtimeEventStore.listGameSnapshotChangedEventsAfter({
      afterId: runtimeEventCursor,
      limit,
      excludeNodeId: base.nodeId,
    });
    for (const event of result.events) {
      await base.publishGameSnapshotChanged(stripRuntimeEventCursor(event));
    }
    runtimeEventCursor = result.nextAfterId;
    return { afterId: runtimeEventCursor, published: result.events.length };
  };

  return {
    ...base,
    async publishGameSnapshotChanged(event) {
      await runtimeEventStore.recordGameSnapshotChanged({
        gameId: event.gameId,
        roomVersion: event.roomVersion,
        lastEventId: event.lastEventId,
        reason: event.reason,
      });
      await base.publishGameSnapshotChanged(event);
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

function withPostgresRuntimeNodeCoordinator(
  base: OnlineRuntimeCoordinator,
  runtimeNodeStore: OnlineRuntimeNodeStore
): OnlineRuntimeCoordinator {
  return {
    ...base,
    async getRuntimeNodeState() {
      return runtimeNodeStore.getNodeState?.() ?? null;
    },
    async getDrainState() {
      return runtimeNodeStore.getDrainState();
    },
    async startDrain(input = {}) {
      return runtimeNodeStore.startDrain(input);
    },
  };
}

function withPostgresOperationGateRuntimeCoordinator(
  base: OnlineRuntimeCoordinator,
  operationGateStore: OnlineRuntimeOperationGateStore
): OnlineRuntimeCoordinator {
  return {
    ...base,
    capabilities: {
      ...base.capabilities,
      operationGates: "postgres-selected-shared-gates",
    },
    async withQuickMatchSessionGate(sessionKey, operation) {
      return operationGateStore.withOperationGate(
        { scope: "quick_match_session", key: sessionKey },
        operation
      );
    },
    async withAccountChallengePairGate(pairKey, operation) {
      return operationGateStore.withOperationGate(
        { scope: "account_challenge_pair", key: pairKey },
        operation
      );
    },
    async withOpenSeekLifecycleGate(seekKey, operation) {
      return operationGateStore.withOperationGate(
        { scope: "open_seek_lifecycle", key: seekKey },
        operation
      );
    },
    async withChallengeLifecycleGate(challengeKey, operation) {
      return operationGateStore.withOperationGate(
        { scope: "challenge_lifecycle", key: challengeKey },
        operation
      );
    },
  };
}

function withPostgresRateLimitRuntimeCoordinator(
  base: OnlineRuntimeCoordinator,
  rateLimitStore: OnlineRuntimeRateLimitStore
): OnlineRuntimeCoordinator {
  return {
    ...base,
    capabilities: {
      ...base.capabilities,
      rateLimits: "postgres-shared-fixed-window",
    },
    async consumeRateLimit(input) {
      return rateLimitStore.consumeRateLimit(input);
    },
  };
}

function withPostgresStartupMaintenanceRuntimeCoordinator(
  base: OnlineRuntimeCoordinator,
  startupMaintenanceStore: OnlineRuntimeStartupMaintenanceStore
): OnlineRuntimeCoordinator {
  return {
    ...base,
    capabilities: {
      ...base.capabilities,
      startupMaintenance: "postgres-once-per-run",
    },
    async runStartupMaintenance(input, operation) {
      return startupMaintenanceStore.runStartupMaintenance(
        {
          taskKey: input.taskKey,
          runKey: input.runKey,
          nodeId: base.nodeId,
        },
        operation
      );
    },
  };
}

export function createPostgresSpectatorPresenceRuntimeCoordinator(options: {
  nodeId: string;
  spectatorPresenceStore: OnlineRuntimeSpectatorPresenceStore;
}): OnlineRuntimeCoordinator {
  return withPostgresSpectatorPresenceRuntimeCoordinator(
    createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId }),
    options.spectatorPresenceStore
  );
}

export function createPostgresRuntimeEventCoordinator(options: {
  nodeId: string;
  runtimeEventStore: OnlineRuntimeEventStore;
}): OnlineRuntimeCoordinator {
  return withPostgresRuntimeEventCoordinator(
    createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId }),
    options.runtimeEventStore
  );
}

export function createPostgresRuntimeNodeCoordinator(options: {
  nodeId: string;
  runtimeNodeStore: OnlineRuntimeNodeStore;
}): OnlineRuntimeCoordinator {
  return withPostgresRuntimeNodeCoordinator(
    createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId }),
    options.runtimeNodeStore
  );
}

export function createPostgresOperationGateRuntimeCoordinator(options: {
  nodeId: string;
  operationGateStore: OnlineRuntimeOperationGateStore;
}): OnlineRuntimeCoordinator {
  return withPostgresOperationGateRuntimeCoordinator(
    createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId }),
    options.operationGateStore
  );
}

export function createPostgresRateLimitRuntimeCoordinator(options: {
  nodeId: string;
  rateLimitStore: OnlineRuntimeRateLimitStore;
}): OnlineRuntimeCoordinator {
  return withPostgresRateLimitRuntimeCoordinator(
    createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId }),
    options.rateLimitStore
  );
}

export function createPostgresStartupMaintenanceRuntimeCoordinator(options: {
  nodeId: string;
  startupMaintenanceStore: OnlineRuntimeStartupMaintenanceStore;
}): OnlineRuntimeCoordinator {
  return withPostgresStartupMaintenanceRuntimeCoordinator(
    createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId }),
    options.startupMaintenanceStore
  );
}

export function createPostgresCompositeRuntimeCoordinator(options: {
  nodeId: string;
  runtimeNodeStore?: OnlineRuntimeNodeStore;
  spectatorPresenceStore?: OnlineRuntimeSpectatorPresenceStore;
  runtimeEventStore?: OnlineRuntimeEventStore;
  operationGateStore?: OnlineRuntimeOperationGateStore;
  rateLimitStore?: OnlineRuntimeRateLimitStore;
  startupMaintenanceStore?: OnlineRuntimeStartupMaintenanceStore;
}): OnlineRuntimeCoordinator {
  let coordinator = createSingleNodeOnlineRuntimeCoordinator({ nodeId: options.nodeId });
  if (options.runtimeNodeStore) {
    coordinator = withPostgresRuntimeNodeCoordinator(coordinator, options.runtimeNodeStore);
  }
  if (options.runtimeEventStore) {
    coordinator = withPostgresRuntimeEventCoordinator(coordinator, options.runtimeEventStore);
  }
  if (options.spectatorPresenceStore) {
    coordinator = withPostgresSpectatorPresenceRuntimeCoordinator(
      coordinator,
      options.spectatorPresenceStore
    );
  }
  if (options.operationGateStore) {
    coordinator = withPostgresOperationGateRuntimeCoordinator(
      coordinator,
      options.operationGateStore
    );
  }
  if (options.rateLimitStore) {
    coordinator = withPostgresRateLimitRuntimeCoordinator(coordinator, options.rateLimitStore);
  }
  if (options.startupMaintenanceStore) {
    coordinator = withPostgresStartupMaintenanceRuntimeCoordinator(
      coordinator,
      options.startupMaintenanceStore
    );
  }
  return coordinator;
}

export function markRuntimeCoordinatorMultiInstanceReady(
  base: OnlineRuntimeCoordinator
): OnlineRuntimeCoordinator {
  return {
    ...base,
    capabilities: {
      ...base.capabilities,
      mode: "multi-instance",
      websocketFanout: "postgres-runtime-events",
    },
  };
}
