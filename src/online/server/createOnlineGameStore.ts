import path from "node:path";
import { JsonOnlineGameStore } from "./JsonOnlineGameStore";
import type { OnlineGameStore } from "./OnlineGameStore";
import { PostgresOnlineGameStore } from "./PostgresOnlineGameStore";

export type OnlineStoreBackend = "jsonl" | "postgres";

export interface ConfiguredOnlineGameStore {
  backend: OnlineStoreBackend;
  healthStorePath: string;
  store: OnlineGameStore;
}

export function createOnlineGameStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ConfiguredOnlineGameStore {
  const backend = env.ONLINE_STORE_BACKEND ?? "jsonl";

  if (backend === "jsonl") {
    const storePath =
      env.ONLINE_STORE_PATH ??
      path.resolve(process.cwd(), "server-data", "online-game-events.jsonl");
    return {
      backend,
      healthStorePath: storePath,
      store: new JsonOnlineGameStore(storePath),
    };
  }

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

  throw new Error(`Unsupported ONLINE_STORE_BACKEND "${backend}". Use "jsonl" or "postgres".`);
}
