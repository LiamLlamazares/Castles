import {
  createSingleNodeOnlineRuntimeCoordinator,
  type OnlineRuntimeCoordinator,
} from "../src/online/server/onlineRuntimeCoordinator";
import type { ServerRuntimeConfig } from "../src/online/server/serverRuntimeConfig";

export function createConfiguredRuntimeCoordinator(
  config: Pick<ServerRuntimeConfig, "runtimeNodeId">
): OnlineRuntimeCoordinator {
  return createSingleNodeOnlineRuntimeCoordinator({ nodeId: config.runtimeNodeId });
}
