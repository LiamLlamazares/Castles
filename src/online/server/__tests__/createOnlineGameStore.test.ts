import { describe, expect, it } from "vitest";
import { PostgresOnlineGameStore } from "../PostgresOnlineGameStore";
import { createOnlineGameStoreFromEnv } from "../createOnlineGameStore";

describe("createOnlineGameStoreFromEnv", () => {
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
