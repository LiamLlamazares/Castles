import {
  createPostgresCompositeRuntimeCoordinator,
  createSingleNodeOnlineRuntimeCoordinator,
  type OnlineRuntimeCoordinator,
  type OnlineRuntimeEventStore,
  type OnlineRuntimeNodeStore,
  type OnlineRuntimeOperationGateStore,
  type OnlineRuntimeRateLimitStore,
  type OnlineRuntimeSpectatorPresenceStore,
  type OnlineRuntimeStartupMaintenanceStore,
} from "../src/online/server/onlineRuntimeCoordinator";
import type { ServerRuntimeConfig } from "../src/online/server/serverRuntimeConfig";

export function createConfiguredRuntimeCoordinator(
  config: Pick<ServerRuntimeConfig, "runtimeNodeId">,
  options: {
    runtimeNodeStore?: OnlineRuntimeNodeStore;
    spectatorPresenceStore?: OnlineRuntimeSpectatorPresenceStore;
    runtimeEventStore?: OnlineRuntimeEventStore;
    operationGateStore?: OnlineRuntimeOperationGateStore;
    rateLimitStore?: OnlineRuntimeRateLimitStore;
    startupMaintenanceStore?: OnlineRuntimeStartupMaintenanceStore;
  } = {}
): OnlineRuntimeCoordinator {
  if (
    options.runtimeNodeStore ||
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
