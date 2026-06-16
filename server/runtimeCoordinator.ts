import {
  createPostgresCompositeRuntimeCoordinator,
  createSingleNodeOnlineRuntimeCoordinator,
  type OnlineRuntimeCoordinator,
  type OnlineRuntimeEventStore,
  type OnlineRuntimeOperationGateStore,
  type OnlineRuntimeRateLimitStore,
  type OnlineRuntimeSpectatorPresenceStore,
  type OnlineRuntimeStartupMaintenanceStore,
} from "../src/online/server/onlineRuntimeCoordinator";
import type { ServerRuntimeConfig } from "../src/online/server/serverRuntimeConfig";

export function createConfiguredRuntimeCoordinator(
  config: Pick<ServerRuntimeConfig, "runtimeNodeId">,
  options: {
    spectatorPresenceStore?: OnlineRuntimeSpectatorPresenceStore;
    runtimeEventStore?: OnlineRuntimeEventStore;
    operationGateStore?: OnlineRuntimeOperationGateStore;
    rateLimitStore?: OnlineRuntimeRateLimitStore;
    startupMaintenanceStore?: OnlineRuntimeStartupMaintenanceStore;
  } = {}
): OnlineRuntimeCoordinator {
  if (
    options.spectatorPresenceStore ||
    options.runtimeEventStore ||
    options.operationGateStore ||
    options.rateLimitStore ||
    options.startupMaintenanceStore
  ) {
    return createPostgresCompositeRuntimeCoordinator({
      nodeId: config.runtimeNodeId,
      ...options,
    });
  }
  return createSingleNodeOnlineRuntimeCoordinator({ nodeId: config.runtimeNodeId });
}
