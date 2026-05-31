import { describe, expect, it } from "vitest";
import { JsonOnlineGameStore } from "../JsonOnlineGameStore";
import { PostgresOnlineGameStore } from "../PostgresOnlineGameStore";
import { createOnlineGameStoreFromEnv } from "../createOnlineGameStore";

describe("createOnlineGameStoreFromEnv", () => {
  it("defaults to JSONL persistence with the configured path", () => {
    const configured = createOnlineGameStoreFromEnv({
      ONLINE_STORE_PATH: "C:/castles/online-game-events.jsonl",
    });

    expect(configured.backend).toBe("jsonl");
    expect(configured.healthStorePath).toBe("C:/castles/online-game-events.jsonl");
    expect(configured.store).toBeInstanceOf(JsonOnlineGameStore);
  });

  it("creates a PostgreSQL store without exposing the database URL in health metadata", () => {
    const configured = createOnlineGameStoreFromEnv({
      ONLINE_STORE_BACKEND: "postgres",
      DATABASE_URL: "postgresql://castles:secret@localhost:5432/castles",
    });

    expect(configured.backend).toBe("postgres");
    expect(configured.healthStorePath).toBe("postgres");
    expect(configured.store).toBeInstanceOf(PostgresOnlineGameStore);
  });

  it("requires DATABASE_URL when PostgreSQL persistence is selected", () => {
    expect(() =>
      createOnlineGameStoreFromEnv({
        ONLINE_STORE_BACKEND: "postgres",
      })
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects unknown online store backends", () => {
    expect(() =>
      createOnlineGameStoreFromEnv({
        ONLINE_STORE_BACKEND: "redis",
      })
    ).toThrow(/ONLINE_STORE_BACKEND/);
  });
});
