import { describe, expect, it } from "vitest";
import { PostgresOnlineRateLimitStore } from "../PostgresOnlineRateLimitStore";

class FakePostgresRateLimitClient {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  releaseCount = 0;
  rollbackFails = false;
  now = "2026-06-16T12:00:00.000Z";
  selectedRows: any[] = [];
  nextRowCount = 0;

  async query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number }> {
    this.queries.push({ text, values });
    if (/rollback/i.test(text) && this.rollbackFails) {
      throw new Error("rollback unavailable");
    }
    if (/select now\(\) as now/i.test(compactSql(text))) {
      return { rows: [{ now: this.now }], rowCount: 1 };
    }
    if (/from online_rate_limits/i.test(text) && /for update/i.test(text)) {
      return { rows: this.selectedRows, rowCount: this.selectedRows.length };
    }
    return { rows: [], rowCount: this.nextRowCount };
  }

  release(): void {
    this.releaseCount += 1;
  }
}

function compactSql(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function updateValues(client: FakePostgresRateLimitClient): unknown[][] {
  return client.queries
    .filter((query) => /update online_rate_limits/i.test(query.text))
    .map((query) => query.values ?? []);
}

describe("PostgresOnlineRateLimitStore", () => {
  it("creates the shared online rate-limit table", async () => {
    const queryable = new FakePostgresRateLimitClient();
    const store = new PostgresOnlineRateLimitStore({ queryable });

    await store.ensureSchema();

    expect(queryable.queries.some((query) =>
      /create table if not exists online_rate_limits/i.test(query.text) &&
      /primary key \(scope, rate_key, window_ms\)/i.test(compactSql(query.text))
    )).toBe(true);
  });

  it("allows a first consume and stores the fixed-window row in one transaction", async () => {
    const schemaQueryable = new FakePostgresRateLimitClient();
    const transactionClient = new FakePostgresRateLimitClient();
    const store = new PostgresOnlineRateLimitStore({
      queryable: schemaQueryable,
      transactionClientFactory: async () => transactionClient,
    });

    await expect(
      store.consumeRateLimit({
        scope: "quick_match",
        key: "198.51.100.20",
        limit: 20,
        windowMs: 60_000,
      })
    ).resolves.toBe(true);

    expect(transactionClient.releaseCount).toBe(1);
    expect(transactionClient.queries.map((query) => compactSql(query.text))).toEqual([
      "BEGIN",
      "SELECT now() AS now",
      "INSERT INTO online_rate_limits (scope, rate_key, window_ms, window_started_at, count, updated_at) VALUES ($1, $2, $3, $4, 0, $4) ON CONFLICT (scope, rate_key, window_ms) DO NOTHING",
      "SELECT count, window_started_at FROM online_rate_limits WHERE scope = $1 AND rate_key = $2 AND window_ms = $3 FOR UPDATE",
      "UPDATE online_rate_limits SET count = $4, window_started_at = $5, updated_at = $5 WHERE scope = $1 AND rate_key = $2 AND window_ms = $3",
      "COMMIT",
    ]);
    expect(transactionClient.queries[2]?.values).toEqual([
      "quick_match",
      "198.51.100.20",
      60_000,
      new Date("2026-06-16T12:00:00.000Z"),
    ]);
    expect(updateValues(transactionClient)).toEqual([
      ["quick_match", "198.51.100.20", 60_000, 1, new Date("2026-06-16T12:00:00.000Z")],
    ]);
  });

  it("rejects a consume when the current fixed window is already at the limit", async () => {
    const transactionClient = new FakePostgresRateLimitClient();
    transactionClient.selectedRows = [
      { count: 20, window_started_at: "2026-06-16T12:00:00.000Z" },
    ];
    const store = new PostgresOnlineRateLimitStore({
      queryable: new FakePostgresRateLimitClient(),
      transactionClientFactory: async () => transactionClient,
    });

    await expect(
      store.consumeRateLimit({
        scope: "quick_match",
        key: "198.51.100.20",
        limit: 20,
        windowMs: 60_000,
      })
    ).resolves.toBe(false);

    expect(updateValues(transactionClient)).toEqual([]);
    expect(transactionClient.queries.map((query) => compactSql(query.text))).toContain("COMMIT");
  });

  it("resets an expired fixed window to count one", async () => {
    const transactionClient = new FakePostgresRateLimitClient();
    transactionClient.selectedRows = [
      { count: 20, window_started_at: "2026-06-16T11:58:00.000Z" },
    ];
    const store = new PostgresOnlineRateLimitStore({
      queryable: new FakePostgresRateLimitClient(),
      transactionClientFactory: async () => transactionClient,
    });

    await expect(
      store.consumeRateLimit({
        scope: "quick_match",
        key: "198.51.100.20",
        limit: 20,
        windowMs: 60_000,
      })
    ).resolves.toBe(true);

    expect(updateValues(transactionClient)).toEqual([
      ["quick_match", "198.51.100.20", 60_000, 1, new Date("2026-06-16T12:00:00.000Z")],
    ]);
  });

  it("rolls back and releases the transaction client when a consume update fails", async () => {
    const transactionClient = new FakePostgresRateLimitClient();
    transactionClient.query = async (text: string, values?: unknown[]) => {
      transactionClient.queries.push({ text, values });
      if (/select now\(\) as now/i.test(compactSql(text))) {
        return { rows: [{ now: transactionClient.now }], rowCount: 1 };
      }
      if (/from online_rate_limits/i.test(text) && /for update/i.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      if (/update online_rate_limits/i.test(text)) {
        throw new Error("rate-limit update failed");
      }
      return { rows: [], rowCount: 0 };
    };
    const store = new PostgresOnlineRateLimitStore({
      queryable: new FakePostgresRateLimitClient(),
      transactionClientFactory: async () => transactionClient,
    });

    await expect(
      store.consumeRateLimit({
        scope: "quick_match",
        key: "198.51.100.20",
        limit: 20,
        windowMs: 60_000,
      })
    ).rejects.toThrow(/rate-limit update failed/);

    expect(transactionClient.releaseCount).toBe(1);
    expect(transactionClient.queries.map((query) => compactSql(query.text))).toContain("ROLLBACK");
  });

  it("rejects invalid scopes, limits, windows, empty keys, long keys, and secrets before persistence", async () => {
    const queryable = new FakePostgresRateLimitClient();
    const store = new PostgresOnlineRateLimitStore({ queryable });
    const valid = {
      scope: "quick_match" as const,
      key: "198.51.100.20",
      limit: 20,
      windowMs: 60_000,
    };

    await expect(store.consumeRateLimit({ ...valid, scope: "unknown" as any })).rejects.toThrow(
      /Invalid PostgreSQL rate-limit scope/
    );
    await expect(store.consumeRateLimit({ ...valid, key: " " })).rejects.toThrow(
      /key must be non-empty/
    );
    await expect(store.consumeRateLimit({ ...valid, key: "x".repeat(257) })).rejects.toThrow(
      /key must be at most/
    );
    await expect(
      store.consumeRateLimit({ ...valid, key: "https://castles.example/?token=secret" })
    ).rejects.toThrow(/must not contain secrets/);
    await expect(store.consumeRateLimit({ ...valid, limit: 0 })).rejects.toThrow(
      /limit must be a positive integer/
    );
    await expect(store.consumeRateLimit({ ...valid, windowMs: 0 })).rejects.toThrow(
      /window must be a positive integer/
    );

    expect(queryable.queries).toEqual([]);
  });

  it("rejects raw online entity and session-shaped keys before persistence", async () => {
    const queryable = new FakePostgresRateLimitClient();
    const store = new PostgresOnlineRateLimitStore({ queryable });
    const valid = {
      scope: "quick_match" as const,
      key: "198.51.100.20",
      limit: 20,
      windowMs: 60_000,
    };

    await expect(
      store.consumeRateLimit({ ...valid, key: "account_session_secret" })
    ).rejects.toThrow(/online entity ids/);
    await expect(
      store.consumeRateLimit({ ...valid, key: "account_liam" })
    ).rejects.toThrow(/online entity ids/);
    await expect(
      store.consumeRateLimit({ ...valid, key: "challenge_liam_samir" })
    ).rejects.toThrow(/online entity ids/);

    expect(queryable.queries).toEqual([]);
  });

  it("requires a transaction client factory before consuming a valid rate limit", async () => {
    const queryable = new FakePostgresRateLimitClient();
    const store = new PostgresOnlineRateLimitStore({ queryable });

    await expect(
      store.consumeRateLimit({
        scope: "quick_match",
        key: "198.51.100.20",
        limit: 20,
        windowMs: 60_000,
      })
    ).rejects.toThrow(/transaction client factory/);

    expect(queryable.queries).toEqual([]);
  });

  it("deletes expired fixed-window rate-limit rows", async () => {
    const queryable = new FakePostgresRateLimitClient();
    queryable.nextRowCount = 4;
    const store = new PostgresOnlineRateLimitStore({ queryable });

    await expect(store.cleanupExpiredRateLimits()).resolves.toBe(4);

    const deleteQuery = queryable.queries.find((query) =>
      /delete from online_rate_limits/i.test(query.text)
    );
    expect(compactSql(deleteQuery?.text ?? "")).toBe(
      "DELETE FROM online_rate_limits WHERE window_started_at + (window_ms * interval '1 millisecond') <= now()"
    );
    expect(deleteQuery?.values).toEqual([]);
  });
});
