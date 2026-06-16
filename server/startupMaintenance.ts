import type { OnlineGameStore, OnlineGameStoreLoadOptions } from "../src/online/server/OnlineGameStore";
import type {
  OnlineRuntimeCoordinator,
  OnlineRuntimeStartupMaintenanceResult,
} from "../src/online/server/onlineRuntimeCoordinator";
import type { ServerRuntimeConfig } from "../src/online/server/serverRuntimeConfig";

export const ONLINE_STARTUP_SUMMARY_REBUILD_TASK_KEY = "startup_summary_rebuilds";

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
