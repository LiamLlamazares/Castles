import { describe, expect, it } from "vitest";
import { PostgresOnlineAccountStore } from "../PostgresOnlineAccountStore";
import {
  DuplicateOnlineAccountDisplayNameError,
  DuplicateOnlineAccountSessionCredentialError,
} from "../OnlineAccountStore";
import { hashOnlineToken } from "../onlineTokenCredentials";

class FakeAccountQueryable {
  readonly accounts = new Map<string, any>();
  readonly accountsByDisplayName = new Map<string, string>();
  readonly sessionsByTokenHash = new Map<string, any>();

  async query(text: string, values: unknown[] = []): Promise<{ rows: any[] }> {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    if (
      normalizedText === "BEGIN" ||
      normalizedText === "COMMIT" ||
      normalizedText === "ROLLBACK" ||
      normalizedText === "SELECT 1" ||
      normalizedText.startsWith("CREATE TABLE") ||
      normalizedText.startsWith("CREATE INDEX") ||
      normalizedText.startsWith("CREATE UNIQUE INDEX") ||
      normalizedText.startsWith("DO $$")
    ) {
      return { rows: [] };
    }

    if (normalizedText.startsWith("INSERT INTO online_accounts")) {
      const [accountId, displayName, displayNameNormalized, createdAt] = values as string[];
      if (this.accounts.has(accountId) || this.accountsByDisplayName.has(displayNameNormalized)) {
        const error = new Error("duplicate key value") as Error & { code: string; constraint: string };
        error.code = "23505";
        error.constraint = this.accountsByDisplayName.has(displayNameNormalized)
          ? "online_accounts_display_name_normalized_key"
          : "online_accounts_pkey";
        throw error;
      }
      const row = {
        account_id: accountId,
        display_name: displayName,
        display_name_normalized: displayNameNormalized,
        created_at: createdAt,
        updated_at: createdAt,
      };
      this.accounts.set(accountId, row);
      this.accountsByDisplayName.set(displayNameNormalized, accountId);
      return { rows: [row] };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_sessions")) {
      const [sessionId, accountId, tokenHash, createdAt] = values as string[];
      for (const session of this.sessionsByTokenHash.values()) {
        if (session.session_id === sessionId) {
          const error = new Error("duplicate key value") as Error & { code: string; constraint: string };
          error.code = "23505";
          error.constraint = "online_account_sessions_pkey";
          throw error;
        }
      }
      if (this.sessionsByTokenHash.has(tokenHash)) {
        const error = new Error("duplicate key value") as Error & { code: string; constraint: string };
        error.code = "23505";
        error.constraint = "online_account_sessions_token_hash_unique_idx";
        throw error;
      }
      this.sessionsByTokenHash.set(tokenHash, {
        session_id: sessionId,
        account_id: accountId,
        token_hash: tokenHash,
        created_at: createdAt,
        last_used_at: createdAt,
      });
      return { rows: [] };
    }

    if (normalizedText.includes("FROM online_account_sessions s INNER JOIN online_accounts a")) {
      const [tokenHash] = values as string[];
      const session = this.sessionsByTokenHash.get(tokenHash);
      if (!session) return { rows: [] };
      const account = this.accounts.get(session.account_id);
      return {
        rows: [
          {
            ...account,
            session_id: session.session_id,
          },
        ],
      };
    }

    if (normalizedText.startsWith("UPDATE online_account_sessions")) {
      const [sessionId, usedAt] = values as string[];
      for (const session of this.sessionsByTokenHash.values()) {
        if (session.session_id === sessionId) {
          session.last_used_at = usedAt;
        }
      }
      return { rows: [] };
    }

    throw new Error(`Unexpected query: ${normalizedText}`);
  }
}

describe("PostgresOnlineAccountStore", () => {
  it("creates accounts and resolves account sessions by token", async () => {
    const queryable = new FakeAccountQueryable();
    const store = new PostgresOnlineAccountStore({ queryable });
    const token = "account-session-token";

    const created = await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_liam",
      displayName: "  Liam   Castles ",
      tokenHash: hashOnlineToken(token),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    expect(created.account).toMatchObject({
      accountId: "account_liam",
      displayName: "Liam Castles",
      identity: {
        kind: "registered",
        id: "account_liam",
        displayName: "Liam Castles",
      },
    });

    const resolved = await store.resolveSessionToken(token, "2026-06-03T12:05:00.000Z");
    expect(resolved).toMatchObject({
      sessionId: "account_session_liam",
      lastUsedAt: "2026-06-03T12:05:00.000Z",
      account: {
        accountId: "account_liam",
        displayName: "Liam Castles",
      },
    });
    expect(await store.resolveSessionToken("wrong-token", "2026-06-03T12:06:00.000Z")).toBeNull();
  });

  it("rejects duplicate display names case-insensitively", async () => {
    const queryable = new FakeAccountQueryable();
    const store = new PostgresOnlineAccountStore({ queryable });

    await store.createAccount({
      accountId: "account_one",
      sessionId: "account_session_one",
      displayName: "Liam",
      tokenHash: hashOnlineToken("token-one"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    await expect(
      store.createAccount({
        accountId: "account_two",
        sessionId: "account_session_two",
        displayName: "liam",
        tokenHash: hashOnlineToken("token-two"),
        createdAt: "2026-06-03T12:01:00.000Z",
      })
    ).rejects.toBeInstanceOf(DuplicateOnlineAccountDisplayNameError);
  });

  it("rejects duplicate session token hashes", async () => {
    const queryable = new FakeAccountQueryable();
    const store = new PostgresOnlineAccountStore({ queryable });
    const tokenHash = hashOnlineToken("shared-token");

    await store.createAccount({
      accountId: "account_one",
      sessionId: "account_session_one",
      displayName: "Liam",
      tokenHash,
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    await expect(
      store.createAccount({
        accountId: "account_two",
        sessionId: "account_session_two",
        displayName: "Samir",
        tokenHash,
        createdAt: "2026-06-03T12:01:00.000Z",
      })
    ).rejects.toBeInstanceOf(DuplicateOnlineAccountSessionCredentialError);
  });
});
