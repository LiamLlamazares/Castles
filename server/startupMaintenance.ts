import type { OnlineGameStore, OnlineGameStoreLoadOptions } from "../src/online/server/OnlineGameStore";
import type {
  OnlineRuntimeCoordinator,
  OnlineRuntimeStartupMaintenanceResult,
} from "../src/online/server/onlineRuntimeCoordinator";
import type { ServerRuntimeConfig } from "../src/online/server/serverRuntimeConfig";

export const ONLINE_STARTUP_SUMMARY_REBUILD_TASK_KEY = "startup_summary_rebuilds";
export const ONLINE_STARTUP_RUNTIME_CLEANUP_TASK_KEY = "startup_runtime_table_cleanup";
const DEFAULT_RUNTIME_EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OPERATION_LOCK_RETENTION_MS = 24 * 60 * 60 * 1000;

type StartupMaintenanceConfig = Pick<
  ServerRuntimeConfig,
  "runtimeNodeId" | "buildId" | "commit"
>;

interface RunOnlineStartupMaintenanceOptions {
  config: StartupMaintenanceConfig;
  runtimeCoordinator: Pick<OnlineRuntimeCoordinator, "runStartupMaintenance">;
  store: Pick<
    OnlineGameStore,
    "rebuildSummaries" | "rebuildChallengeSummaries" | "rebuildOpenSeekSummaries"
  >;
  onGameEventError?: OnlineGameStoreLoadOptions["onEventError"];
  onChallengeEventError?: OnlineGameStoreLoadOptions["onEventError"];
  onOpenSeekEventError?: OnlineGameStoreLoadOptions["onEventError"];
}

interface RuntimeTableCleanupStores {
  spectatorPresenceStore: {
    cleanupExpiredSpectators(): Promise<number>;
  };
  runtimeEventStore: {
    cleanupRuntimeEventsOlderThan(retentionMs: number): Promise<number>;
  };
  operationGateStore: {
    cleanupOperationLocksOlderThan(retentionMs: number): Promise<number>;
  };
  rateLimitStore: {
    cleanupExpiredRateLimits(): Promise<number>;
  };
}

interface RunOnlineRuntimeTableCleanupOptions {
  config: StartupMaintenanceConfig;
  runtimeCoordinator: Pick<OnlineRuntimeCoordinator, "runStartupMaintenance">;
  stores: RuntimeTableCleanupStores;
  now?: Date;
  runtimeEventRetentionMs?: number;
  operationLockRetentionMs?: number;
}

export interface OnlineRuntimeTableCleanupResult {
  expiredSpectators: number;
  runtimeEvents: number;
  operationLocks: number;
  rateLimits: number;
  runtimeEventRetentionMs: number;
  operationLockRetentionMs: number;
}

export function createStartupMaintenanceRunKey(config: StartupMaintenanceConfig): string {
  if (config.commit) return `commit:${config.commit}`;
  if (config.buildId) return `build:${config.buildId}`;
  return `node:${config.runtimeNodeId}`;
}

export async function runOnlineStartupMaintenance(
  options: RunOnlineStartupMaintenanceOptions
): Promise<OnlineRuntimeStartupMaintenanceResult<void>> {
  return options.runtimeCoordinator.runStartupMaintenance(
    {
      taskKey: ONLINE_STARTUP_SUMMARY_REBUILD_TASK_KEY,
      runKey: createStartupMaintenanceRunKey(options.config),
    },
    async () => {
      await options.store.rebuildSummaries({
        onEventError: options.onGameEventError,
      });
      await options.store.rebuildChallengeSummaries({
        onEventError: options.onChallengeEventError,
      });
      await options.store.rebuildOpenSeekSummaries({
        onEventError: options.onOpenSeekEventError,
      });
    }
  );
}

function normalizeCleanupRetentionMs(retentionMs: number, label: string): number {
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 1) {
    throw new Error(`${label} retention must be a positive integer of milliseconds.`);
  }
  return retentionMs;
}

export function runOnlineRuntimeTableCleanup(
  options: RunOnlineRuntimeTableCleanupOptions
): Promise<OnlineRuntimeStartupMaintenanceResult<OnlineRuntimeTableCleanupResult>> {
  return options.runtimeCoordinator.runStartupMaintenance(
    {
      taskKey: ONLINE_STARTUP_RUNTIME_CLEANUP_TASK_KEY,
      runKey: createStartupMaintenanceRunKey(options.config),
    },
    async () => {
      if (options.now && Number.isNaN(options.now.getTime())) {
        throw new Error("Runtime cleanup current time must be a valid Date.");
      }
      const runtimeEventRetentionMs = normalizeCleanupRetentionMs(
        options.runtimeEventRetentionMs ?? DEFAULT_RUNTIME_EVENT_RETENTION_MS,
        "Runtime event"
      );
      const operationLockRetentionMs = normalizeCleanupRetentionMs(
        options.operationLockRetentionMs ?? DEFAULT_OPERATION_LOCK_RETENTION_MS,
        "Operation lock"
      );
      const expiredSpectators =
        await options.stores.spectatorPresenceStore.cleanupExpiredSpectators();
      const runtimeEvents =
        await options.stores.runtimeEventStore.cleanupRuntimeEventsOlderThan(
          runtimeEventRetentionMs
        );
      const operationLocks =
        await options.stores.operationGateStore.cleanupOperationLocksOlderThan(
          operationLockRetentionMs
        );
      const rateLimits = await options.stores.rateLimitStore.cleanupExpiredRateLimits();
      return {
        expiredSpectators,
        runtimeEvents,
        operationLocks,
        rateLimits,
        runtimeEventRetentionMs,
        operationLockRetentionMs,
      };
    }
  );
}
