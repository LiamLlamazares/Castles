import type { OnlineGameStore } from "./OnlineGameStore";
import { PostgresOnlineGameStore } from "./PostgresOnlineGameStore";

export type OnlineStoreBackend = "postgres";

export interface ConfiguredOnlineGameStore {
  backend: OnlineStoreBackend;
  healthStorePath: string;
  store: OnlineGameStore;
}

export function createOnlineGameStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ConfiguredOnlineGameStore {
  const backend = env.ONLINE_STORE_BACKEND;

  if (backend === "postgres") {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when ONLINE_STORE_BACKEND=postgres.");
    }
    return {
      backend,
      healthStorePath: "postgres",
      store: new PostgresOnlineGameStore({ connectionString: env.DATABASE_URL }),
    };
  }

  throw new Error('ONLINE_STORE_BACKEND must be set to "postgres".');
}
