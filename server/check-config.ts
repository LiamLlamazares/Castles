import { createOnlineGameStoreFromEnv } from "../src/online/server/createOnlineGameStore";
import {
  assertServerRuntimeFiles,
  parseServerRuntimeConfig,
} from "../src/online/server/serverRuntimeConfig";
import { loadServerEnvironmentFile } from "./envFile";

function parseArgs(argv: string[]): { envFile?: string } {
  const envFileIndex = argv.indexOf("--env-file");
  if (envFileIndex === -1) return {};
  const envFile = argv[envFileIndex + 1];
  if (!envFile) {
    throw new Error("--env-file requires a file path.");
  }
  return { envFile };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = args.envFile
    ? { ...process.env, ...loadServerEnvironmentFile(args.envFile) }
    : process.env;
  const config = parseServerRuntimeConfig(env, process.cwd());
  assertServerRuntimeFiles(config);

  const { backend, healthStorePath, store, accountStore } = createOnlineGameStoreFromEnv(env);
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
  }

  console.log(
    JSON.stringify(
      {
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
        staticDir: config.staticDir,
        staticDirRequired: config.requireStaticDir,
        onlineStore: {
          backend,
          path: healthStorePath,
          replayChecked: true,
          replayedRooms,
        },
        build: {
          buildId: config.buildId ?? "development",
          commit: config.commit ?? "unknown",
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Castles server configuration check failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
