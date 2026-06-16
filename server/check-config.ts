import { createOnlineGameStoreFromEnv } from "../src/online/server/createOnlineGameStore";
import {
  assertServerRuntimeFiles,
  parseServerRuntimeConfig,
} from "../src/online/server/serverRuntimeConfig";
import { createServerConfigurationReport } from "./configReport";
import { loadServerEnvironmentFile } from "./envFile";

interface CheckServerConfigurationOptions {
  createStore?: typeof createOnlineGameStoreFromEnv;
}

async function closeAllStores(
  stores: Array<{ label: string; close?: () => void | Promise<void> }>
) {
  const closeErrors: Array<{ label: string; error: unknown }> = [];
  for (const store of stores) {
    try {
      await store.close?.();
    } catch (error) {
      closeErrors.push({ label: store.label, error });
    }
  }
  if (closeErrors.length > 0) {
    throw new AggregateError(
      closeErrors.map((entry) => entry.error),
      `Failed to close configured online stores: ${closeErrors
        .map((entry) => entry.label)
        .join(", ")}`
    );
  }
}

function parseArgs(argv: string[]): { envFile?: string } {
  const envFileIndex = argv.indexOf("--env-file");
  if (envFileIndex === -1) return {};
  const envFile = argv[envFileIndex + 1];
  if (!envFile) {
    throw new Error("--env-file requires a file path.");
  }
  return { envFile };
}

export async function checkServerConfiguration(
  env: NodeJS.ProcessEnv,
  cwd: string,
  options: CheckServerConfigurationOptions = {}
) {
  const config = parseServerRuntimeConfig(env, cwd);
  assertServerRuntimeFiles(config);

  const createStore = options.createStore ?? createOnlineGameStoreFromEnv;
  const {
    backend,
    healthStorePath,
    postgresPoolMaxPerStore,
    store,
    accountStore,
    spectatorPresenceStore,
    runtimeEventStore,
    operationGateStore,
    rateLimitStore,
    startupMaintenanceStore,
  } = createStore(env, { runtimeNodeId: config.runtimeNodeId });
  let replayedRooms = 0;
  try {
    await store.checkReady();
    await accountStore.checkReady?.();
    replayedRooms = (
      await store.load({
        onEventError: (line, error) => {
          console.error(`Invalid online event store entry ${line}`, error);
        },
      })
    ).length;
  } finally {
    await closeAllStores([
      { label: "game", close: () => store.close() },
      { label: "account", close: accountStore.close?.bind(accountStore) },
      { label: "spectator-presence", close: () => spectatorPresenceStore.close() },
      { label: "runtime-event", close: () => runtimeEventStore.close() },
      { label: "operation-gate", close: () => operationGateStore.close() },
      { label: "rate-limit", close: () => rateLimitStore.close() },
      { label: "startup-maintenance", close: () => startupMaintenanceStore.close() },
    ]);
  }

  return createServerConfigurationReport({
    config: {
      ...config,
      deployment: {
        ...config.deployment,
        spectatorPresence: "postgres-live-presence",
      },
    },
    onlineStore: {
      backend,
      path: healthStorePath,
      postgresPoolMaxPerStore,
    },
    replayedRooms,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = args.envFile
    ? { ...process.env, ...loadServerEnvironmentFile(args.envFile) }
    : process.env;
  console.log(JSON.stringify(await checkServerConfiguration(env, process.cwd()), null, 2));
}

if (process.argv.some((arg) => /server[\\/]check-config\.ts$/.test(arg))) {
  main().catch((error) => {
    console.error("Castles server configuration check failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
