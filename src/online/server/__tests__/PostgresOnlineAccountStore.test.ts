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
  readonly displayNameRegistry = new Map<string, string>();
  readonly sessionsByTokenHash = new Map<string, any>();
  readonly privacySettings = new Map<string, any>();
  readonly follows = new Set<string>();
  readonly blocks = new Set<string>();
  readonly advisoryLocks: string[] = [];
  private transactionSnapshot?: {
    accounts: Map<string, any>;
    accountsByDisplayName: Map<string, string>;
    displayNameRegistry: Map<string, string>;
    sessionsByTokenHash: Map<string, any>;
    privacySettings: Map<string, any>;
    follows: Set<string>;
    blocks: Set<string>;
  };

  release(): void {}

  async query(text: string, values: unknown[] = []): Promise<{ rows: any[] }> {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    if (normalizedText === "BEGIN") {
      this.transactionSnapshot = {
        accounts: new Map(Array.from(this.accounts.entries()).map(([key, value]) => [key, { ...value }])),
        accountsByDisplayName: new Map(this.accountsByDisplayName),
        displayNameRegistry: new Map(this.displayNameRegistry),
        sessionsByTokenHash: new Map(
          Array.from(this.sessionsByTokenHash.entries()).map(([key, value]) => [key, { ...value }])
        ),
        privacySettings: new Map(
          Array.from(this.privacySettings.entries()).map(([key, value]) => [key, { ...value }])
        ),
        follows: new Set(this.follows),
        blocks: new Set(this.blocks),
      };
      return { rows: [] };
    }
    if (normalizedText === "COMMIT") {
      this.transactionSnapshot = undefined;
      return { rows: [] };
    }
    if (normalizedText === "ROLLBACK") {
      if (this.transactionSnapshot) {
        this.accounts.clear();
        this.accountsByDisplayName.clear();
        this.displayNameRegistry.clear();
        this.sessionsByTokenHash.clear();
        this.privacySettings.clear();
        this.follows.clear();
        this.blocks.clear();
        for (const [key, value] of this.transactionSnapshot.accounts) this.accounts.set(key, value);
        for (const [key, value] of this.transactionSnapshot.accountsByDisplayName) this.accountsByDisplayName.set(key, value);
        for (const [key, value] of this.transactionSnapshot.displayNameRegistry) this.displayNameRegistry.set(key, value);
        for (const [key, value] of this.transactionSnapshot.sessionsByTokenHash) this.sessionsByTokenHash.set(key, value);
        for (const [key, value] of this.transactionSnapshot.privacySettings) this.privacySettings.set(key, value);
        for (const key of this.transactionSnapshot.follows) this.follows.add(key);
        for (const key of this.transactionSnapshot.blocks) this.blocks.add(key);
        this.transactionSnapshot = undefined;
      }
      return { rows: [] };
    }
    if (
      normalizedText === "SELECT 1" ||
      normalizedText.startsWith("CREATE TABLE") ||
      normalizedText.startsWith("CREATE INDEX") ||
      normalizedText.startsWith("CREATE UNIQUE INDEX") ||
      normalizedText.startsWith("DO $$")
    ) {
      return { rows: [] };
    }
    if (normalizedText.startsWith("SELECT pg_advisory_xact_lock")) {
      const [left, right] = values as string[];
      this.advisoryLocks.push(`${left}|${right}`);
      return { rows: [] };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_display_names")) {
      if (values.length === 0) {
        for (const account of this.accounts.values()) {
          if (!this.displayNameRegistry.has(account.display_name_normalized)) {
            this.displayNameRegistry.set(account.display_name_normalized, account.display_name);
          }
        }
        return { rows: [] };
      }
      const [displayNameNormalized, displayName] = values as string[];
      if (this.displayNameRegistry.has(displayNameNormalized)) {
        const error = new Error("duplicate key value") as Error & { code: string; constraint: string };
        error.code = "23505";
        error.constraint = "online_account_display_names_pkey";
        throw error;
      }
      this.displayNameRegistry.set(displayNameNormalized, displayName);
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

    if (normalizedText.startsWith("SELECT session_id, created_at, last_used_at FROM online_account_sessions")) {
      const [accountId] = values as string[];
      const rows = Array.from(this.sessionsByTokenHash.values())
        .filter((session) => session.account_id === accountId)
        .sort((left, right) => {
          if (left.last_used_at !== right.last_used_at) return right.last_used_at.localeCompare(left.last_used_at);
          if (left.created_at !== right.created_at) return right.created_at.localeCompare(left.created_at);
          return left.session_id.localeCompare(right.session_id);
        })
        .map((session) => ({
          session_id: session.session_id,
          created_at: session.created_at,
          last_used_at: session.last_used_at,
        }));
      return { rows };
    }

    if (normalizedText.startsWith("SELECT account_id, display_name, created_at, updated_at FROM online_accounts WHERE display_name_normalized")) {
      const [displayNameNormalized] = values as string[];
      const accountId = this.accountsByDisplayName.get(displayNameNormalized);
      const account = accountId ? this.accounts.get(accountId) : undefined;
      return { rows: account ? [account] : [] };
    }

    if (normalizedText.startsWith("SELECT account_id, display_name, created_at, updated_at FROM online_accounts WHERE account_id")) {
      const [accountId] = values as string[];
      const account = this.accounts.get(accountId);
      return { rows: account ? [account] : [] };
    }

    if (normalizedText.startsWith("SELECT 1 FROM online_account_follows")) {
      const [followerAccountId, followedAccountId] = values as string[];
      return { rows: this.follows.has(socialKey(followerAccountId, followedAccountId)) ? [{ "?column?": 1 }] : [] };
    }

    if (normalizedText.startsWith("SELECT 1 FROM online_account_blocks")) {
      const [blockerAccountId, blockedAccountId] = values as string[];
      return { rows: this.blocks.has(socialKey(blockerAccountId, blockedAccountId)) ? [{ "?column?": 1 }] : [] };
    }

    if (normalizedText.startsWith("SELECT follow_policy, presence_policy, challenge_policy, updated_at FROM online_account_privacy_settings")) {
      const [accountId] = values as string[];
      const privacy = this.privacySettings.get(accountId);
      return { rows: privacy ? [privacy] : [] };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_privacy_settings")) {
      const [accountId, followPolicy, presencePolicy, challengePolicy, updatedAt] = values as string[];
      const row = {
        account_id: accountId,
        follow_policy: followPolicy,
        presence_policy: presencePolicy,
        challenge_policy: challengePolicy,
        updated_at: updatedAt,
      };
      this.privacySettings.set(accountId, row);
      return { rows: [row] };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_follows")) {
      const [followerAccountId, followedAccountId] = values as string[];
      this.follows.add(socialKey(followerAccountId, followedAccountId));
      return { rows: [] };
    }

    if (normalizedText.startsWith("DELETE FROM online_account_follows WHERE (follower_account_id")) {
      const [leftAccountId, rightAccountId] = values as string[];
      this.follows.delete(socialKey(leftAccountId, rightAccountId));
      this.follows.delete(socialKey(rightAccountId, leftAccountId));
      return { rows: [] };
    }

    if (normalizedText.startsWith("DELETE FROM online_account_follows WHERE follower_account_id")) {
      const [followerAccountId, followedAccountId] = values as string[];
      this.follows.delete(socialKey(followerAccountId, followedAccountId));
      return { rows: [] };
    }

    if (normalizedText.startsWith("SELECT a.account_id, a.display_name, a.created_at, a.updated_at FROM online_account_follows")) {
      const [followerAccountId] = values as string[];
      const rows = Array.from(this.follows)
        .map(splitSocialKey)
        .filter(([left]) => left === followerAccountId)
        .map(([, followed]) => this.accounts.get(followed))
        .filter((account): account is any => !!account)
        .filter((account) => !this.blocks.has(socialKey(account.account_id, followerAccountId)))
        .filter((account) => !this.blocks.has(socialKey(followerAccountId, account.account_id)))
        .sort((left, right) => String(left.display_name).localeCompare(String(right.display_name)));
      return { rows };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_blocks")) {
      const [blockerAccountId, blockedAccountId] = values as string[];
      this.blocks.add(socialKey(blockerAccountId, blockedAccountId));
      return { rows: [] };
    }

    if (normalizedText.startsWith("DELETE FROM online_account_blocks")) {
      const [blockerAccountId, blockedAccountId] = values as string[];
      this.blocks.delete(socialKey(blockerAccountId, blockedAccountId));
      return { rows: [] };
    }

    if (normalizedText.startsWith("DELETE FROM online_account_sessions WHERE account_id")) {
      const [accountId] = values as string[];
      const rows: Array<{ session_id: string }> = [];
      for (const [tokenHash, session] of Array.from(this.sessionsByTokenHash.entries())) {
        if (session.account_id === accountId) {
          this.sessionsByTokenHash.delete(tokenHash);
          rows.push({ session_id: session.session_id });
        }
      }
      return { rows };
    }

    if (normalizedText.startsWith("DELETE FROM online_account_sessions")) {
      const [tokenHash] = values as string[];
      const session = this.sessionsByTokenHash.get(tokenHash);
      if (!session) return { rows: [] };
      this.sessionsByTokenHash.delete(tokenHash);
      return { rows: [{ session_id: session.session_id }] };
    }

    if (normalizedText.startsWith("DELETE FROM online_accounts")) {
      const [accountId] = values as string[];
      const account = this.accounts.get(accountId);
      if (!account) return { rows: [] };
      this.accounts.delete(accountId);
      this.accountsByDisplayName.delete(account.display_name_normalized);
      this.privacySettings.delete(accountId);
      for (const key of Array.from(this.follows)) {
        const [follower, followed] = splitSocialKey(key);
        if (follower === accountId || followed === accountId) this.follows.delete(key);
      }
      for (const key of Array.from(this.blocks)) {
        const [blocker, blocked] = splitSocialKey(key);
        if (blocker === accountId || blocked === accountId) this.blocks.delete(key);
      }
      for (const [tokenHash, session] of Array.from(this.sessionsByTokenHash.entries())) {
        if (session.account_id === accountId) {
          this.sessionsByTokenHash.delete(tokenHash);
        }
      }
      return { rows: [{ account_id: accountId }] };
    }

    throw new Error(`Unexpected query: ${normalizedText}`);
  }
}

function socialKey(left: string, right: string): string {
  return `${left}\u0000${right}`;
}

function splitSocialKey(key: string): [string, string] {
  const [left, right] = key.split("\u0000");
  return [left, right];
}

function createStore(queryable: FakeAccountQueryable): PostgresOnlineAccountStore {
  return new PostgresOnlineAccountStore({
    queryable,
    transactionClientFactory: async () => queryable,
  });
}

describe("PostgresOnlineAccountStore", () => {
  it("requires an explicit transaction client factory for custom queryables", () => {
    expect(() => new PostgresOnlineAccountStore({ queryable: new FakeAccountQueryable() })).toThrow(
      /transactionClientFactory/
    );
  });

  it("creates accounts and resolves account sessions by token", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);
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

  it("revokes account sessions without deleting the account", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);
    const token = "account-session-token";

    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_liam",
      displayName: "Liam",
      tokenHash: hashOnlineToken(token),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    expect(await store.resolveSessionToken(token, "2026-06-03T12:01:00.000Z")).toMatchObject({
      sessionId: "account_session_liam",
    });
    await expect(store.revokeSessionToken(token)).resolves.toBe(true);
    await expect(store.resolveSessionToken(token, "2026-06-03T12:02:00.000Z")).resolves.toBeNull();
    await expect(store.revokeSessionToken(token)).resolves.toBe(false);
    expect(queryable.accounts.get("account_liam")).toMatchObject({ account_id: "account_liam" });
  });

  it("lists and revokes all account sessions without returning token hashes", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_one",
      displayName: "Liam",
      tokenHash: hashOnlineToken("token-one"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });
    queryable.sessionsByTokenHash.set(hashOnlineToken("token-two"), {
      session_id: "account_session_two",
      account_id: "account_liam",
      token_hash: hashOnlineToken("token-two"),
      created_at: "2026-06-03T12:01:00.000Z",
      last_used_at: "2026-06-03T12:05:00.000Z",
    });
    queryable.sessionsByTokenHash.set(hashOnlineToken("other-token"), {
      session_id: "account_session_other",
      account_id: "account_other",
      token_hash: hashOnlineToken("other-token"),
      created_at: "2026-06-03T12:02:00.000Z",
      last_used_at: "2026-06-03T12:06:00.000Z",
    });

    await expect(store.listSessionsForAccount("account_liam")).resolves.toEqual([
      {
        sessionId: "account_session_two",
        createdAt: "2026-06-03T12:01:00.000Z",
        lastUsedAt: "2026-06-03T12:05:00.000Z",
      },
      {
        sessionId: "account_session_one",
        createdAt: "2026-06-03T12:00:00.000Z",
        lastUsedAt: "2026-06-03T12:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(await store.listSessionsForAccount("account_liam"))).not.toContain("sha256:");

    await expect(store.revokeSessionsForAccount("account_liam")).resolves.toBe(2);
    await expect(store.listSessionsForAccount("account_liam")).resolves.toEqual([]);
    expect(queryable.accounts.get("account_liam")).toMatchObject({ account_id: "account_liam" });
    expect(queryable.sessionsByTokenHash.get(hashOnlineToken("other-token"))).toMatchObject({
      session_id: "account_session_other",
    });
  });

  it("deletes accounts, clears their sessions, and keeps their display names reserved", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_one",
      displayName: "Liam",
      tokenHash: hashOnlineToken("token-one"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });
    queryable.sessionsByTokenHash.set(hashOnlineToken("token-two"), {
      session_id: "account_session_two",
      account_id: "account_liam",
      token_hash: hashOnlineToken("token-two"),
      created_at: "2026-06-03T12:01:00.000Z",
      last_used_at: "2026-06-03T12:05:00.000Z",
    });

    await expect(store.deleteAccount("account_liam")).resolves.toBe(true);
    await expect(store.resolveSessionToken("token-one", "2026-06-03T12:10:00.000Z")).resolves.toBeNull();
    await expect(store.resolveSessionToken("token-two", "2026-06-03T12:10:00.000Z")).resolves.toBeNull();
    expect(queryable.accounts.has("account_liam")).toBe(false);
    expect(queryable.sessionsByTokenHash.size).toBe(0);
    await expect(store.deleteAccount("account_liam")).resolves.toBe(false);

    await expect(
      store.createAccount({
        accountId: "account_liam_new",
        sessionId: "account_session_new",
        displayName: "liam",
        tokenHash: hashOnlineToken("token-new"),
        createdAt: "2026-06-03T12:11:00.000Z",
      })
    ).rejects.toBeInstanceOf(DuplicateOnlineAccountDisplayNameError);
  });

  it("rejects duplicate display names case-insensitively", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

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
    const store = createStore(queryable);
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

    await expect(
      store.createAccount({
        accountId: "account_three",
        sessionId: "account_session_three",
        displayName: "Samir",
        tokenHash: hashOnlineToken("fresh-token"),
        createdAt: "2026-06-03T12:02:00.000Z",
      })
    ).resolves.toMatchObject({
      account: {
        accountId: "account_three",
        displayName: "Samir",
      },
    });
  });

  it("persists profiles, follows, privacy settings, and blocks without exposing account ids", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_liam",
      displayName: "Liam",
      tokenHash: hashOnlineToken("token-liam"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });
    await store.createAccount({
      accountId: "account_samir",
      sessionId: "account_session_samir",
      displayName: "Samir",
      tokenHash: hashOnlineToken("token-samir"),
      createdAt: "2026-06-03T12:01:00.000Z",
    });
    await store.createAccount({
      accountId: "account_dani",
      sessionId: "account_session_dani",
      displayName: "Dani",
      tokenHash: hashOnlineToken("token-dani"),
      createdAt: "2026-06-03T12:02:00.000Z",
    });

    await expect(store.getPrivacySettings("account_samir")).resolves.toMatchObject({
      followPolicy: "everyone",
      presencePolicy: "followed",
      challengePolicy: "followed",
      updatedAt: null,
    });
    await expect(store.resolveChallengeTarget("account_liam", "Samir")).resolves.toEqual({
      status: "not_allowed",
    });

    const follow = await store.followAccount("account_liam", "samir", "2026-06-03T12:03:00.000Z");
    expect(follow).toMatchObject({
      status: "ok",
      profile: {
        displayName: "Samir",
        relationship: { self: false, following: true, blocked: false },
      },
    });
    expect(JSON.stringify(follow)).not.toContain("account_samir");
    await expect(store.resolveChallengeTarget("account_liam", "Samir")).resolves.toEqual({
      status: "not_allowed",
    });
    await store.followAccount("account_samir", "Liam", "2026-06-03T12:03:30.000Z");
    await expect(store.resolveChallengeTarget("account_liam", "Samir")).resolves.toMatchObject({
      status: "ok",
      account: {
        accountId: "account_samir",
        displayName: "Samir",
      },
    });

    await expect(store.listFollowingProfiles("account_liam")).resolves.toEqual([
      expect.objectContaining({
        displayName: "Samir",
        relationship: { self: false, following: true, blocked: false },
      }),
    ]);

    await expect(
      store.updatePrivacySettings(
        "account_samir",
        { followPolicy: "nobody", presencePolicy: "nobody" },
        "2026-06-03T12:04:00.000Z"
      )
    ).resolves.toMatchObject({
      followPolicy: "nobody",
      presencePolicy: "nobody",
      challengePolicy: "followed",
      updatedAt: "2026-06-03T12:04:00.000Z",
    });
    await expect(
      store.followAccount("account_liam", "Samir", "2026-06-03T12:04:30.000Z")
    ).resolves.toMatchObject({
      status: "ok",
      profile: {
        displayName: "Samir",
        relationship: { self: false, following: true, blocked: false },
      },
    });
    await expect(
      store.followAccount("account_dani", "Samir", "2026-06-03T12:05:00.000Z")
    ).resolves.toEqual({ status: "not_allowed" });

    await expect(
      store.blockAccount("account_samir", "Liam", "2026-06-03T12:06:00.000Z")
    ).resolves.toMatchObject({
      status: "ok",
      profile: {
        displayName: "Liam",
        relationship: { self: false, following: false, blocked: true },
      },
    });
    await expect(store.getProfileForDisplayName("account_liam", "Samir")).resolves.toBeNull();
    await expect(store.listFollowingProfiles("account_liam")).resolves.toEqual([]);
    await expect(store.followAccount("account_liam", "Samir", "2026-06-03T12:07:00.000Z")).resolves.toEqual({
      status: "blocked",
    });
    await expect(store.resolveChallengeTarget("account_liam", "Samir")).resolves.toEqual({
      status: "blocked",
    });
    await expect(store.unfollowAccount("account_liam", "Samir")).resolves.toEqual({
      status: "blocked",
    });

    await expect(
      store.blockAccount("account_liam", "Samir", "2026-06-03T12:08:00.000Z")
    ).resolves.toEqual({
      status: "blocked",
    });
    await expect(store.unblockAccount("account_samir", "Liam")).resolves.toEqual({
      status: "blocked",
    });
    await expect(store.getProfileForDisplayName("account_samir", "Liam")).resolves.toBeNull();
    await expect(store.unblockAccount("account_liam", "Samir")).resolves.toMatchObject({
      status: "ok",
      profile: {
        displayName: "Samir",
        relationship: { self: false, following: false, blocked: false },
      },
    });
    await expect(store.getProfileForDisplayName("account_liam", "Samir")).resolves.toMatchObject({
      displayName: "Samir",
      relationship: { self: false, following: false, blocked: false },
    });
    expect(queryable.advisoryLocks).toContain("account_liam|account_samir");
  });
});
