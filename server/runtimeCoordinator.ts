import {
  createPostgresCompositeRuntimeCoordinator,
  createSingleNodeOnlineRuntimeCoordinator,
  markRuntimeCoordinatorMultiInstanceReady,
  type OnlineRuntimeCoordinator,
  type OnlineRuntimeEventStore,
  type OnlineRuntimeNodeStore,
  type OnlineRuntimeOperationGateStore,
  type OnlineRuntimeRateLimitStore,
  type OnlineRuntimeSpectatorPresenceStore,
  type OnlineRuntimeStartupMaintenanceStore,
} from "../src/online/server/onlineRuntimeCoordinator";
import type { ServerRuntimeConfig } from "../src/online/server/serverRuntimeConfig";

interface RuntimeCoordinatorStores {
  runtimeNodeStore?: OnlineRuntimeNodeStore;
  spectatorPresenceStore?: OnlineRuntimeSpectatorPresenceStore;
  runtimeEventStore?: OnlineRuntimeEventStore;
  operationGateStore?: OnlineRuntimeOperationGateStore;
  rateLimitStore?: OnlineRuntimeRateLimitStore;
  startupMaintenanceStore?: OnlineRuntimeStartupMaintenanceStore;
}

function hasAnyPostgresRuntimeStore(options: RuntimeCoordinatorStores): boolean {
  return Boolean(
    options.runtimeNodeStore ||
      options.spectatorPresenceStore ||
      options.runtimeEventStore ||
      options.operationGateStore ||
      options.rateLimitStore ||
      options.startupMaintenanceStore
  );
}

function hasFullPostgresRuntimeStack(options: RuntimeCoordinatorStores): boolean {
  return Boolean(
    options.runtimeNodeStore &&
      options.spectatorPresenceStore &&
      options.runtimeEventStore &&
      options.operationGateStore &&
      options.rateLimitStore &&
      options.startupMaintenanceStore
  );
}

export function createConfiguredRuntimeCoordinator(
  config: Pick<ServerRuntimeConfig, "runtimeNodeId"> &
    Partial<Pick<ServerRuntimeConfig, "deployment">>,
  options: RuntimeCoordinatorStores = {}
): OnlineRuntimeCoordinator {
  if (config.deployment?.mode === "multi-instance") {
    if (!hasFullPostgresRuntimeStack(options)) {
      throw new Error(
        "CASTLES_DEPLOYMENT_MODE=multi-instance requires the full PostgreSQL online runtime stack."
      );
    }
    return markRuntimeCoordinatorMultiInstanceReady(
      createPostgresCompositeRuntimeCoordinator({
        nodeId: config.runtimeNodeId,
        ...options,
      })
    );
  }

  if (hasAnyPostgresRuntimeStore(options)) {
    return createPostgresCompositeRuntimeCoordinator({
      nodeId: config.runtimeNodeId,
      ...options,
    });
  }
  return createSingleNodeOnlineRuntimeCoordinator({ nodeId: config.runtimeNodeId });
}
