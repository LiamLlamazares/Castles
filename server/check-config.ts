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
    startupMaintenanceStore,
  } = createStore(env);
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
    await store.close();
    await accountStore.close?.();
    await startupMaintenanceStore.close();
  }

  return createServerConfigurationReport({
    config,
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
