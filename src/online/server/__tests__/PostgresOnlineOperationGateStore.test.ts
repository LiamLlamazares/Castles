import { describe, expect, it } from "vitest";
import { PostgresOnlineOperationGateStore } from "../PostgresOnlineOperationGateStore";

const HASHED_ACCOUNT_CHALLENGE_PAIR_KEY =
  "account_challenge_pair:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

class FakePostgresClient {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  releaseCount = 0;
  rollbackFails = false;

  async query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number }> {
    this.queries.push({ text, values });
    if (/rollback/i.test(text) && this.rollbackFails) {
      throw new Error("rollback unavailable");
    }
    return { rows: [], rowCount: 0 };
  }

  release(): void {
    this.releaseCount += 1;
  }
}

function compactSql(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

describe("PostgresOnlineOperationGateStore", () => {
  it("creates the operational operation locks table", async () => {
    const queryable = new FakePostgresClient();
    const store = new PostgresOnlineOperationGateStore({ queryable });

    await store.ensureSchema();

    expect(queryable.queries.some((query) =>
      /create table if not exists online_operation_locks/i.test(query.text) &&
      /primary key \(scope, lock_key\)/i.test(compactSql(query.text))
    )).toBe(true);
  });

  it("holds a row lock on one transaction client while running the operation", async () => {
    const schemaQueryable = new FakePostgresClient();
    const transactionClient = new FakePostgresClient();
    const store = new PostgresOnlineOperationGateStore({
      queryable: schemaQueryable,
      transactionClientFactory: async () => transactionClient,
    });
    const operationOrder: string[] = [];

    const result = await store.withOperationGate(
      { scope: "quick_match_session", key: "session:player-a" },
      async () => {
        operationOrder.push("operation");
        return "matched";
      }
    );

    expect(result).toBe("matched");
    expect(operationOrder).toEqual(["operation"]);
    expect(transactionClient.releaseCount).toBe(1);
    expect(transactionClient.queries.map((query) => compactSql(query.text))).toEqual([
      "BEGIN",
      "INSERT INTO online_operation_locks (scope, lock_key, updated_at) VALUES ($1, $2, now()) ON CONFLICT (scope, lock_key) DO UPDATE SET updated_at = now()",
      "SELECT scope, lock_key FROM online_operation_locks WHERE scope = $1 AND lock_key = $2 FOR UPDATE",
      "COMMIT",
    ]);
    expect(transactionClient.queries[1]?.values).toEqual([
      "quick_match_session",
      "session:player-a",
    ]);
    expect(transactionClient.queries[2]?.values).toEqual([
      "quick_match_session",
      "session:player-a",
    ]);
  });

  it("holds a row lock for account challenge pair gates using the account_challenge_pair scope", async () => {
    const schemaQueryable = new FakePostgresClient();
    const transactionClient = new FakePostgresClient();
    const store = new PostgresOnlineOperationGateStore({
      queryable: schemaQueryable,
      transactionClientFactory: async () => transactionClient,
    });

    const result = await store.withOperationGate(
      {
        scope: "account_challenge_pair",
        key: HASHED_ACCOUNT_CHALLENGE_PAIR_KEY,
      },
      async () => "created"
    );

    expect(result).toBe("created");
    expect(transactionClient.releaseCount).toBe(1);
    expect(transactionClient.queries.map((query) => compactSql(query.text))).toEqual([
      "BEGIN",
      "INSERT INTO online_operation_locks (scope, lock_key, updated_at) VALUES ($1, $2, now()) ON CONFLICT (scope, lock_key) DO UPDATE SET updated_at = now()",
      "SELECT scope, lock_key FROM online_operation_locks WHERE scope = $1 AND lock_key = $2 FOR UPDATE",
      "COMMIT",
    ]);
    expect(transactionClient.queries[1]?.values).toEqual([
      "account_challenge_pair",
      HASHED_ACCOUNT_CHALLENGE_PAIR_KEY,
    ]);
    expect(transactionClient.queries[2]?.values).toEqual([
      "account_challenge_pair",
      HASHED_ACCOUNT_CHALLENGE_PAIR_KEY,
    ]);
  });

  it("holds row locks for open seek and challenge lifecycle gates using entity-scoped keys", async () => {
    const schemaQueryable = new FakePostgresClient();
    const transactionClient = new FakePostgresClient();
    const store = new PostgresOnlineOperationGateStore({
      queryable: schemaQueryable,
      transactionClientFactory: async () => transactionClient,
    });

    await expect(
      store.withOperationGate(
        { scope: "open_seek_lifecycle", key: "open_seek_lifecycle:seek_123" },
        async () => "cancelled"
      )
    ).resolves.toBe("cancelled");
    await expect(
      store.withOperationGate(
        { scope: "challenge_lifecycle", key: "challenge_lifecycle:challenge_123" },
        async () => "declined"
      )
    ).resolves.toBe("declined");

    const lockValues = transactionClient.queries
      .filter((query) => /online_operation_locks/i.test(query.text))
      .map((query) => query.values);
    expect(lockValues).toEqual([
      ["open_seek_lifecycle", "open_seek_lifecycle:seek_123"],
      ["open_seek_lifecycle", "open_seek_lifecycle:seek_123"],
      ["challenge_lifecycle", "challenge_lifecycle:challenge_123"],
      ["challenge_lifecycle", "challenge_lifecycle:challenge_123"],
    ]);
  });

  it("rejects malformed lifecycle gate keys before persistence", async () => {
    const queryable = new FakePostgresClient();
    const store = new PostgresOnlineOperationGateStore({ queryable });

    await expect(
      store.withOperationGate(
        { scope: "open_seek_lifecycle", key: "seek_123" },
        async () => undefined
      )
    ).rejects.toThrow(/open seek lifecycle key/);
    await expect(
      store.withOperationGate(
        { scope: "open_seek_lifecycle", key: "open_seek_lifecycle:challenge_123" },
        async () => undefined
      )
    ).rejects.toThrow(/open seek lifecycle key/);
    await expect(
      store.withOperationGate(
        { scope: "challenge_lifecycle", key: "challenge_123" },
        async () => undefined
      )
    ).rejects.toThrow(/challenge lifecycle key/);
    await expect(
      store.withOperationGate(
        { scope: "challenge_lifecycle", key: "challenge_lifecycle:seek_123" },
        async () => undefined
      )
    ).rejects.toThrow(/challenge lifecycle key/);
    await expect(
      store.withOperationGate(
        { scope: "open_seek_lifecycle", key: "open_seek_lifecycle:seek_123?token=secret" },
        async () => undefined
      )
    ).rejects.toThrow(/must not contain secrets/);
    await expect(
      store.withOperationGate(
        { scope: "challenge_lifecycle", key: "challenge_lifecycle:challenge_123#challengeToken=secret" },
        async () => undefined
      )
    ).rejects.toThrow(/must not contain secrets/);
    await expect(
      store.withOperationGate(
        { scope: "open_seek_lifecycle", key: "Authorization: Bearer open_seek_lifecycle_seek_123" },
        async () => undefined
      )
    ).rejects.toThrow(/must not contain secrets/);
    await expect(
      store.withOperationGate(
        { scope: "challenge_lifecycle", key: "https://castles.example/?token=challenge_123" },
        async () => undefined
      )
    ).rejects.toThrow(/must not contain secrets/);

    expect(queryable.queries).toEqual([]);
  });

  it("rejects raw account challenge pair keys before persistence", async () => {
    const queryable = new FakePostgresClient();
    const store = new PostgresOnlineOperationGateStore({ queryable });

    await expect(
      store.withOperationGate(
        {
          scope: "account_challenge_pair",
          key: "account_challenge_pair:liam-to-samir",
        },
        async () => undefined
      )
    ).rejects.toThrow(/account challenge pair key must be a hashed operation key/);

    expect(queryable.queries).toEqual([]);
  });

  it("rolls back and releases the transaction client when the operation fails", async () => {
    const transactionClient = new FakePostgresClient();
    const store = new PostgresOnlineOperationGateStore({
      queryable: new FakePostgresClient(),
      transactionClientFactory: async () => transactionClient,
    });

    await expect(
      store.withOperationGate({ scope: "quick_match_session", key: "account:acct_123" }, async () => {
        throw new Error("quick match failed");
      })
    ).rejects.toThrow(/quick match failed/);

    expect(transactionClient.releaseCount).toBe(1);
    expect(transactionClient.queries.map((query) => compactSql(query.text))).toContain("ROLLBACK");
    expect(transactionClient.queries.map((query) => compactSql(query.text))).not.toContain("COMMIT");
  });

  it("throws an aggregate error when rollback also fails", async () => {
    const transactionClient = new FakePostgresClient();
    transactionClient.rollbackFails = true;
    const store = new PostgresOnlineOperationGateStore({
      queryable: new FakePostgresClient(),
      transactionClientFactory: async () => transactionClient,
    });

    await expect(
      store.withOperationGate({ scope: "quick_match_session", key: "session:player-b" }, async () => {
        throw new Error("operation failed");
      })
    ).rejects.toThrow(/operation gate transaction failed and rollback also failed/);

    expect(transactionClient.releaseCount).toBe(1);
  });

  it("rejects invalid scopes, empty keys, long keys, and secret-looking keys before persistence", async () => {
    const queryable = new FakePostgresClient();
    const store = new PostgresOnlineOperationGateStore({ queryable });

    await expect(
      store.withOperationGate({ scope: "game_action" as any, key: "session:player-a" }, async () => undefined)
    ).rejects.toThrow(/Invalid PostgreSQL operation gate scope/);
    await expect(
      store.withOperationGate({ scope: "quick_match_session", key: " " }, async () => undefined)
    ).rejects.toThrow(/key must be non-empty/);
    await expect(
      store.withOperationGate({
        scope: "quick_match_session",
        key: `session:${"x".repeat(260)}`,
      }, async () => undefined)
    ).rejects.toThrow(/key must be at most/);
    await expect(
      store.withOperationGate({
        scope: "quick_match_session",
        key: "https://castles.example/?token=secret",
      }, async () => undefined)
    ).rejects.toThrow(/must not contain secrets/);

    expect(queryable.queries).toEqual([]);
  });
});
