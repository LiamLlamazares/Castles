import type { OnlineGameStore } from "./OnlineGameStore";
import type { OnlineAccountStore } from "./OnlineAccountStore";
import { PostgresOnlineAccountStore } from "./PostgresOnlineAccountStore";
import { PostgresOnlineGameStore } from "./PostgresOnlineGameStore";
import { PostgresOnlineOperationGateStore } from "./PostgresOnlineOperationGateStore";
import { PostgresOnlineRateLimitStore } from "./PostgresOnlineRateLimitStore";
import { PostgresOnlineRuntimeEventStore } from "./PostgresOnlineRuntimeEventStore";
import { PostgresOnlineSpectatorPresenceStore } from "./PostgresOnlineSpectatorPresenceStore";
import { PostgresOnlineStartupMaintenanceStore } from "./PostgresOnlineStartupMaintenanceStore";
import { normalizeRuntimeNodeId } from "./onlineRuntimeCoordinator";
import { parsePostgresPoolMaxPerStore } from "./postgresPoolConfig";

export { DEFAULT_POSTGRES_POOL_MAX_PER_STORE } from "./postgresPoolConfig";

export type OnlineStoreBackend = "postgres";

export interface ConfiguredOnlineGameStore {
  backend: OnlineStoreBackend;
  healthStorePath: string;
  postgresPoolMaxPerStore: number;
  store: OnlineGameStore;
  accountStore: OnlineAccountStore;
  spectatorPresenceStore: PostgresOnlineSpectatorPresenceStore;
  runtimeEventStore: PostgresOnlineRuntimeEventStore;
  operationGateStore: PostgresOnlineOperationGateStore;
  rateLimitStore: PostgresOnlineRateLimitStore;
  startupMaintenanceStore: PostgresOnlineStartupMaintenanceStore;
}

export interface CreateOnlineGameStoreOptions {
  runtimeNodeId?: string;
}

function validatePostgresConnectionString(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (!url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error("DATABASE_URL must include a PostgreSQL host and database name.");
  }
  if (!url.username || !url.password) {
    throw new Error("DATABASE_URL must include a PostgreSQL user and password.");
  }
  if (decodeURIComponent(url.password) === "replace-with-password") {
    throw new Error("DATABASE_URL still contains the placeholder database password.");
  }

  return connectionString;
}

function resolveRuntimeNodeId(
  options: CreateOnlineGameStoreOptions
): string {
  const raw = options.runtimeNodeId;
  if (!raw) {
    throw new Error("A runtimeNodeId is required when ONLINE_STORE_BACKEND=postgres.");
  }
  return normalizeRuntimeNodeId(raw);
}

export function createOnlineGameStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: CreateOnlineGameStoreOptions = {}
): ConfiguredOnlineGameStore {
  const backend = env.ONLINE_STORE_BACKEND;

  if (backend === "postgres") {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when ONLINE_STORE_BACKEND=postgres.");
    }
    const connectionString = validatePostgresConnectionString(env.DATABASE_URL);
    const postgresPoolMaxPerStore = parsePostgresPoolMaxPerStore(env);
    const runtimeNodeId = resolveRuntimeNodeId(options);
    return {
      backend,
      healthStorePath: "postgres",
      postgresPoolMaxPerStore,
      store: new PostgresOnlineGameStore({ connectionString, poolMaxPerStore: postgresPoolMaxPerStore }),
      accountStore: new PostgresOnlineAccountStore({ connectionString, poolMaxPerStore: postgresPoolMaxPerStore }),
      spectatorPresenceStore: new PostgresOnlineSpectatorPresenceStore({
        connectionString,
        nodeId: runtimeNodeId,
        poolMaxPerStore: postgresPoolMaxPerStore,
      }),
      runtimeEventStore: new PostgresOnlineRuntimeEventStore({
        connectionString,
        nodeId: runtimeNodeId,
        poolMaxPerStore: postgresPoolMaxPerStore,
      }),
      operationGateStore: new PostgresOnlineOperationGateStore({
        connectionString,
        poolMaxPerStore: postgresPoolMaxPerStore,
      }),
      rateLimitStore: new PostgresOnlineRateLimitStore({
        connectionString,
        poolMaxPerStore: postgresPoolMaxPerStore,
      }),
      startupMaintenanceStore: new PostgresOnlineStartupMaintenanceStore({
        connectionString,
        poolMaxPerStore: postgresPoolMaxPerStore,
      }),
    };
  }

  throw new Error('ONLINE_STORE_BACKEND must be set to "postgres".');
}
