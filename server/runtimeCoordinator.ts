import {
  createPostgresStartupMaintenanceRuntimeCoordinator,
  createSingleNodeOnlineRuntimeCoordinator,
  type OnlineRuntimeCoordinator,
  type OnlineRuntimeStartupMaintenanceStore,
} from "../src/online/server/onlineRuntimeCoordinator";
import type { ServerRuntimeConfig } from "../src/online/server/serverRuntimeConfig";

export function createConfiguredRuntimeCoordinator(
  config: Pick<ServerRuntimeConfig, "runtimeNodeId">,
  options: { startupMaintenanceStore?: OnlineRuntimeStartupMaintenanceStore } = {}
): OnlineRuntimeCoordinator {
  if (options.startupMaintenanceStore) {
    return createPostgresStartupMaintenanceRuntimeCoordinator({
      nodeId: config.runtimeNodeId,
      startupMaintenanceStore: options.startupMaintenanceStore,
    });
  }
  return createSingleNodeOnlineRuntimeCoordinator({ nodeId: config.runtimeNodeId });
}
