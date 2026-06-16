import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresOnlineAccountStore } from "../PostgresOnlineAccountStore";
import { PostgresOnlineGameStore } from "../PostgresOnlineGameStore";
import { PostgresOnlineOperationGateStore } from "../PostgresOnlineOperationGateStore";
import { PostgresOnlineRateLimitStore } from "../PostgresOnlineRateLimitStore";
import { PostgresOnlineRuntimeEventStore } from "../PostgresOnlineRuntimeEventStore";
import { PostgresOnlineSpectatorPresenceStore } from "../PostgresOnlineSpectatorPresenceStore";
import { PostgresOnlineStartupMaintenanceStore } from "../PostgresOnlineStartupMaintenanceStore";
import { createOnlineGameStoreFromEnv } from "../createOnlineGameStore";

const postgresPoolOptions = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("pg", () => ({
  Pool: vi.fn(function MockPool(options: Record<string, unknown>) {
    postgresPoolOptions.push(options);
    return {
      connect: vi.fn(),
      end: vi.fn(),
      query: vi.fn(),
    };
  }),
}));

describe("createOnlineGameStoreFromEnv", () => {
  beforeEach(() => {
    postgresPoolOptions.length = 0;
  });

  it("creates a PostgreSQL store without exposing the database URL in health metadata", () => {
    const configured = createOnlineGameStoreFromEnv({
      ONLINE_STORE_BACKEND: "postgres",
      DATABASE_URL: "postgresql://castles:secret@localhost:5432/castles",
    }, {
      runtimeNodeId: "prod-node-a",
    });

    expect(configured.backend).toBe("postgres");
    expect(configured.healthStorePath).toBe("postgres");
    expect(configured.postgresPoolMaxPerStore).toBe(5);
    expect(configured.store).toBeInstanceOf(PostgresOnlineGameStore);
    expect(configured.accountStore).toBeInstanceOf(PostgresOnlineAccountStore);
    expect(configured.spectatorPresenceStore).toBeInstanceOf(PostgresOnlineSpectatorPresenceStore);
    expect(configured.runtimeEventStore).toBeInstanceOf(PostgresOnlineRuntimeEventStore);
    expect(configured.operationGateStore).toBeInstanceOf(PostgresOnlineOperationGateStore);
    expect(configured.rateLimitStore).toBeInstanceOf(PostgresOnlineRateLimitStore);
    expect(configured.startupMaintenanceStore).toBeInstanceOf(PostgresOnlineStartupMaintenanceStore);
  });

  it("uses the bounded default pool max when PostgreSQL stores are constructed directly", () => {
    const connectionString = "postgresql://castles:secret@localhost:5432/castles";

    const gameStore = new PostgresOnlineGameStore({ connectionString });
    const accountStore = new PostgresOnlineAccountStore({ connectionString });
    const spectatorPresenceStore = new PostgresOnlineSpectatorPresenceStore({
      connectionString,
      nodeId: "prod-node-a",
    });
    const runtimeEventStore = new PostgresOnlineRuntimeEventStore({
      connectionString,
      nodeId: "prod-node-a",
    });
    const operationGateStore = new PostgresOnlineOperationGateStore({ connectionString });
    const rateLimitStore = new PostgresOnlineRateLimitStore({ connectionString });
    const startupMaintenanceStore = new PostgresOnlineStartupMaintenanceStore({ connectionString });

    expect(gameStore).toBeInstanceOf(PostgresOnlineGameStore);
    expect(accountStore).toBeInstanceOf(PostgresOnlineAccountStore);
    expect(spectatorPresenceStore).toBeInstanceOf(PostgresOnlineSpectatorPresenceStore);
    expect(runtimeEventStore).toBeInstanceOf(PostgresOnlineRuntimeEventStore);
    expect(operationGateStore).toBeInstanceOf(PostgresOnlineOperationGateStore);
    expect(rateLimitStore).toBeInstanceOf(PostgresOnlineRateLimitStore);
    expect(startupMaintenanceStore).toBeInstanceOf(PostgresOnlineStartupMaintenanceStore);
    expect(postgresPoolOptions).toHaveLength(7);
    expect(postgresPoolOptions.map((options) => options.max)).toEqual([5, 5, 5, 5, 5, 5, 5]);
  });

  it("rejects unsafe direct PostgreSQL store pool max values", () => {
    const connectionString = "postgresql://castles:secret@localhost:5432/castles";

    for (const poolMaxPerStore of [0, 51, 1.5, Number.NaN]) {
      expect(() => new PostgresOnlineGameStore({ connectionString, poolMaxPerStore })).toThrow(
        /poolMaxPerStore/
      );
      expect(() => new PostgresOnlineAccountStore({ connectionString, poolMaxPerStore })).toThrow(
        /poolMaxPerStore/
      );
      expect(() =>
        new PostgresOnlineSpectatorPresenceStore({
          connectionString,
          nodeId: "prod-node-a",
          poolMaxPerStore,
        })
      ).toThrow(/poolMaxPerStore/);
      expect(() =>
        new PostgresOnlineRuntimeEventStore({
          connectionString,
          nodeId: "prod-node-a",
          poolMaxPerStore,
        })
      ).toThrow(/poolMaxPerStore/);
      expect(() =>
        new PostgresOnlineOperationGateStore({ connectionString, poolMaxPerStore })
      ).toThrow(/poolMaxPerStore/);
      expect(() =>
        new PostgresOnlineRateLimitStore({ connectionString, poolMaxPerStore })
      ).toThrow(/poolMaxPerStore/);
      expect(() =>
        new PostgresOnlineStartupMaintenanceStore({ connectionString, poolMaxPerStore })
      ).toThrow(/poolMaxPerStore/);
    }
  });

  it("accepts a bounded PostgreSQL pool max per store", () => {
    const configured = createOnlineGameStoreFromEnv({
      ONLINE_STORE_BACKEND: "postgres",
      DATABASE_URL: "postgresql://castles:secret@localhost:5432/castles",
      POSTGRES_POOL_MAX_PER_STORE: "7",
    }, {
      runtimeNodeId: "prod-node-a",
    });

    expect(configured.postgresPoolMaxPerStore).toBe(7);
    expect(postgresPoolOptions.map((options) => options.max)).toEqual([7, 7, 7, 7, 7, 7, 7]);
  });

  it("requires the configured runtime node id before creating runtime stores", () => {
    expect(() =>
      createOnlineGameStoreFromEnv({
        ONLINE_STORE_BACKEND: "postgres",
        DATABASE_URL: "postgresql://castles:secret@localhost:5432/castles",
      })
    ).toThrow(/runtimeNodeId/);
  });

  it("rejects unsafe PostgreSQL pool max values before creating stores", () => {
    for (const value of ["0", "51", "1.5", "abc"]) {
      expect(() =>
        createOnlineGameStoreFromEnv({
          ONLINE_STORE_BACKEND: "postgres",
          DATABASE_URL: "postgresql://castles:secret@localhost:5432/castles",
          POSTGRES_POOL_MAX_PER_STORE: value,
        })
      ).toThrow(/POSTGRES_POOL_MAX_PER_STORE/);
    }
  });

  it("requires DATABASE_URL when PostgreSQL persistence is selected", () => {
    expect(() =>
      createOnlineGameStoreFromEnv({
        ONLINE_STORE_BACKEND: "postgres",
      })
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects malformed or placeholder PostgreSQL connection URLs", () => {
    expect(() =>
      createOnlineGameStoreFromEnv({
        ONLINE_STORE_BACKEND: "postgres",
        DATABASE_URL: "not-a-url",
      })
    ).toThrow(/DATABASE_URL/);

    expect(() =>
      createOnlineGameStoreFromEnv({
        ONLINE_STORE_BACKEND: "postgres",
        DATABASE_URL: "mysql://castles:secret@localhost:5432/castles",
      })
    ).toThrow(/PostgreSQL/);

    expect(() =>
      createOnlineGameStoreFromEnv({
        ONLINE_STORE_BACKEND: "postgres",
        DATABASE_URL: "postgresql://castles:replace-with-password@localhost:5432/castles",
      })
    ).toThrow(/placeholder/);
  });

  it("requires explicit PostgreSQL persistence", () => {
    expect(() => createOnlineGameStoreFromEnv({})).toThrow(/ONLINE_STORE_BACKEND/);
  });

  it("rejects unknown online store backends", () => {
    expect(() =>
      createOnlineGameStoreFromEnv({
        ONLINE_STORE_BACKEND: "jsonl",
      })
    ).toThrow(/ONLINE_STORE_BACKEND/);
  });
});
