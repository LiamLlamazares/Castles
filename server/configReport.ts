import type { ServerRuntimeConfig } from "../src/online/server/serverRuntimeConfig";
import type { OnlineStoreBackend } from "../src/online/server/createOnlineGameStore";

export interface ServerConfigurationReportInput {
  config: ServerRuntimeConfig;
  onlineStore: {
    backend: OnlineStoreBackend;
    path: string;
    postgresPoolMaxPerStore: number;
  };
  replayedRooms: number;
}

export function createServerConfigurationReport({
  config,
  onlineStore,
  replayedRooms,
}: ServerConfigurationReportInput) {
  return {
    ok: true,
    port: config.port,
    bindHost: config.bindHost,
    publicBaseUrl: config.publicBaseUrl,
    oauth: {
      google: {
        enabled: Boolean(config.googleOAuth),
        redirectUri:
          config.googleOAuth?.redirectUri ??
          `${config.publicBaseUrl}/api/online/account/oauth/google/callback`,
      },
    },
    moderation: {
      adminReportsEnabled: Boolean(config.adminBearerToken),
    },
    staticDir: config.staticDir,
    staticDirRequired: config.requireStaticDir,
    onlineDeployment: config.deployment,
    runtime: {
      nodeId: config.runtimeNodeId,
    },
    onlineStore: {
      backend: onlineStore.backend,
      path: onlineStore.path,
      postgresPoolMaxPerStore: onlineStore.postgresPoolMaxPerStore,
      replayChecked: true,
      replayedRooms,
    },
    build: {
      buildId: config.buildId ?? "development",
      commit: config.commit ?? "unknown",
    },
  };
}
