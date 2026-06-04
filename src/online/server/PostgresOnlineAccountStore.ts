import { Pool } from "pg";
import {
  createOnlineAccountRecord,
  normalizeOnlineAccountDisplayName,
  normalizeOnlineAccountDisplayNameKey,
  normalizeOnlineAccountPassword,
  type OnlineAccount,
} from "../accounts";
import {
  ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
  createOnlineAccountPublicRating,
  defaultOnlineAccountPrivacySettings,
  type OnlineAccountPrivacyPatch,
  type OnlineAccountPrivacySettings,
  type OnlineAccountPresenceStatus,
  type OnlineAccountPublicProfile,
  type OnlineAccountSocialActionResult,
} from "../social";
import { validateOnlineRating } from "../ratings";
import {
  CreateOnlineAccountStoreInput,
  CreateOnlineAccountPasswordSessionInput,
  DuplicateOnlineAccountDisplayNameError,
  DuplicateOnlineAccountIdError,
  DuplicateOnlineAccountSessionCredentialError,
  type OnlineAccountSessionListItem,
  type OnlineAccountChallengeTargetResult,
  type OnlineAccountStore,
  type ResolvedOnlineAccountSession,
} from "./OnlineAccountStore";
import { hashOnlineToken, isOnlineTokenCredentialHash } from "./onlineTokenCredentials";
import {
  isOnlineAccountPasswordCredentialHash,
  verifyOnlineAccountPassword,
} from "./onlinePasswordCredentials";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

export interface PostgresOnlineAccountStoreOptions {
  connectionString?: string;
  queryable?: PostgresQueryable;
  transactionClientFactory?: () => Promise<PostgresTransactionClient>;
  close?: () => Promise<void>;
}

const DEFAULT_POSTGRES_TIMEOUT_MS = 5_000;

function timestampToIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  throw new Error("PostgreSQL account timestamp is invalid.");
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "23505";
}

function accountFromRow(row: Record<string, unknown>): OnlineAccount {
  return createOnlineAccountRecord({
    accountId: String(row.account_id),
    displayName: String(row.display_name),
    createdAt: timestampToIso(row.created_at),
    updatedAt: timestampToIso(row.updated_at),
  });
}

function privacyFromRow(row: Record<string, unknown>): OnlineAccountPrivacySettings {
  return {
    schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
    followPolicy: String(row.follow_policy) as OnlineAccountPrivacySettings["followPolicy"],
    presencePolicy: String(row.presence_policy) as OnlineAccountPrivacySettings["presencePolicy"],
    challengePolicy: String(row.challenge_policy) as OnlineAccountPrivacySettings["challengePolicy"],
    updatedAt: timestampToIso(row.updated_at),
  };
}

export class PostgresOnlineAccountStore implements OnlineAccountStore {
  private readonly queryable: PostgresQueryable;
  private readonly transactionClientFactory: () => Promise<PostgresTransactionClient>;
  private readonly closeConnection?: () => Promise<void>;
  private schemaReady?: Promise<void>;

  constructor(options: PostgresOnlineAccountStoreOptions) {
    if (options.queryable) {
      if (!options.transactionClientFactory) {
        throw new Error("PostgresOnlineAccountStore requires transactionClientFactory when queryable is supplied.");
      }
      this.queryable = options.queryable;
      this.transactionClientFactory = options.transactionClientFactory;
      this.closeConnection = options.close;
      return;
    }

    if (!options.connectionString) {
      throw new Error("PostgresOnlineAccountStore requires a connectionString or queryable.");
    }

    const pool = new Pool({
      connectionString: options.connectionString,
      connectionTimeoutMillis: DEFAULT_POSTGRES_TIMEOUT_MS,
      query_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
      statement_timeout: DEFAULT_POSTGRES_TIMEOUT_MS,
    });
    this.queryable = pool;
    this.transactionClientFactory = () => pool.connect();
    this.closeConnection = () => pool.end();
  }

  async createAccount(input: CreateOnlineAccountStoreInput): Promise<ResolvedOnlineAccountSession> {
    await this.ensureSchema();
    const displayName = normalizeOnlineAccountDisplayName(input.displayName);
    if (!displayName.ok) {
      throw new Error(displayName.error.message);
    }
    if (!isOnlineTokenCredentialHash(input.tokenHash)) {
      throw new Error("Account session token hash is invalid.");
    }
    if (!isOnlineAccountPasswordCredentialHash(input.passwordHash)) {
      throw new Error("Account password hash is invalid.");
    }

    try {
      return await this.withTransaction(async (queryable) => {
        const displayNameKey = normalizeOnlineAccountDisplayNameKey(displayName.value);
        await queryable.query(
          `
            INSERT INTO online_account_display_names (
              display_name_normalized,
              display_name,
              reserved_at
            )
            VALUES ($1, $2, $3)
          `,
          [displayNameKey, displayName.value, input.createdAt]
        );
        const accountResult = await queryable.query(
          `
            INSERT INTO online_accounts (
              account_id,
              display_name,
              display_name_normalized,
              password_hash,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $5)
            RETURNING account_id, display_name, created_at, updated_at
          `,
          [
            input.accountId,
            displayName.value,
            displayNameKey,
            input.passwordHash,
            input.createdAt,
          ]
        );
        await queryable.query(
          `
            INSERT INTO online_account_sessions (
              session_id,
              account_id,
              token_hash,
              created_at,
              last_used_at
            )
            VALUES ($1, $2, $3, $4, $4)
          `,
          [input.sessionId, input.accountId, input.tokenHash, input.createdAt]
        );
        const account = accountFromRow(accountResult.rows[0]);
        return {
          account,
          sessionId: input.sessionId,
          lastUsedAt: input.createdAt,
        };
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        const constraint = String((error as { constraint?: unknown }).constraint ?? "");
        if (constraint.includes("display_name")) {
          throw new DuplicateOnlineAccountDisplayNameError(displayName.value);
        }
        if (constraint.includes("session") || constraint.includes("token_hash")) {
          throw new DuplicateOnlineAccountSessionCredentialError();
        }
        throw new DuplicateOnlineAccountIdError(input.accountId);
      }
      throw error;
    }
  }

  async createSessionWithPassword(
    input: CreateOnlineAccountPasswordSessionInput
  ): Promise<ResolvedOnlineAccountSession | null> {
    await this.ensureSchema();
    const displayName = normalizeOnlineAccountDisplayName(input.displayName);
    if (!displayName.ok) return null;
    const password = normalizeOnlineAccountPassword(input.password);
    if (!password.ok) return null;
    if (!isOnlineTokenCredentialHash(input.tokenHash)) {
      throw new Error("Account session token hash is invalid.");
    }

    try {
      return await this.withTransaction(async (queryable) => {
        const accountResult = await queryable.query(
          `
            SELECT account_id, display_name, created_at, updated_at, password_hash
            FROM online_accounts
            WHERE display_name_normalized = $1
            LIMIT 1
          `,
          [normalizeOnlineAccountDisplayNameKey(displayName.value)]
        );
        if (accountResult.rows.length === 0) return null;
        const row = accountResult.rows[0];
        const passwordHash = typeof row.password_hash === "string" ? row.password_hash : "";
        if (!(await verifyOnlineAccountPassword(password.value, passwordHash))) return null;

        await queryable.query(
          `
            INSERT INTO online_account_sessions (
              session_id,
              account_id,
              token_hash,
              created_at,
              last_used_at
            )
            VALUES ($1, $2, $3, $4, $4)
          `,
          [input.sessionId, String(row.account_id), input.tokenHash, input.createdAt]
        );
        return {
          account: accountFromRow(row),
          sessionId: input.sessionId,
          lastUsedAt: input.createdAt,
        };
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new DuplicateOnlineAccountSessionCredentialError();
      }
      throw error;
    }
  }

  async resolveSessionToken(token: string, usedAt: string): Promise<ResolvedOnlineAccountSession | null> {
    await this.ensureSchema();
    if (typeof token !== "string" || token.length === 0) return null;
    const tokenHash = hashOnlineToken(token);
    const result = await this.queryable.query(
      `
        SELECT
          a.account_id,
          a.display_name,
          a.created_at,
          a.updated_at,
          s.session_id
        FROM online_account_sessions s
        INNER JOIN online_accounts a ON a.account_id = s.account_id
        WHERE s.token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    await this.queryable.query(
      "UPDATE online_account_sessions SET last_used_at = $2 WHERE session_id = $1",
      [row.session_id, usedAt]
    );
    return {
      account: accountFromRow(row),
      sessionId: String(row.session_id),
      lastUsedAt: usedAt,
    };
  }

  async revokeSessionToken(token: string): Promise<boolean> {
    await this.ensureSchema();
    if (typeof token !== "string" || token.length === 0) return false;
    const tokenHash = hashOnlineToken(token);
    const result = await this.queryable.query(
      "DELETE FROM online_account_sessions WHERE token_hash = $1 RETURNING session_id",
      [tokenHash]
    );
    return result.rows.length > 0;
  }

  async listSessionsForAccount(accountId: string): Promise<OnlineAccountSessionListItem[]> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        SELECT session_id, created_at, last_used_at
        FROM online_account_sessions
        WHERE account_id = $1
        ORDER BY last_used_at DESC, created_at DESC, session_id ASC
      `,
      [accountId]
    );
    return result.rows.map((row) => ({
      sessionId: String(row.session_id),
      createdAt: timestampToIso(row.created_at),
      lastUsedAt: timestampToIso(row.last_used_at),
    }));
  }

  async revokeSessionsForAccount(accountId: string): Promise<number> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      "DELETE FROM online_account_sessions WHERE account_id = $1 RETURNING session_id",
      [accountId]
    );
    return result.rows.length;
  }

  async deleteAccount(accountId: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      "DELETE FROM online_accounts WHERE account_id = $1 RETURNING account_id",
      [accountId]
    );
    return result.rows.length > 0;
  }

  async getProfileForDisplayName(
    viewerAccountId: string,
    displayName: string,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountPublicProfile | null> {
    await this.ensureSchema();
    const target = await this.loadAccountByDisplayName(displayName);
    if (!target) return null;
    if (target.accountId !== viewerAccountId && await this.hasBlock(target.accountId, viewerAccountId)) {
      return null;
    }
    return this.createProfile(viewerAccountId, target, this.queryable, viewedAt);
  }

  async listFollowingProfiles(accountId: string, viewedAt = new Date().toISOString()): Promise<OnlineAccountPublicProfile[]> {
    await this.ensureSchema();
    const result = await this.queryable.query(
      `
        SELECT a.account_id, a.display_name, a.created_at, a.updated_at
        FROM online_account_follows f
        INNER JOIN online_accounts a ON a.account_id = f.followed_account_id
        WHERE f.follower_account_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM online_account_blocks b
            WHERE b.blocker_account_id = f.followed_account_id
              AND b.blocked_account_id = $1
          )
          AND NOT EXISTS (
            SELECT 1 FROM online_account_blocks b
            WHERE b.blocker_account_id = $1
              AND b.blocked_account_id = f.followed_account_id
          )
        ORDER BY lower(a.display_name) ASC, a.display_name ASC
      `,
      [accountId]
    );
    return Promise.all(result.rows.map((row) => this.createProfile(accountId, accountFromRow(row), this.queryable, viewedAt)));
  }

  async followAccount(
    followerAccountId: string,
    targetDisplayName: string,
    createdAt: string
  ): Promise<OnlineAccountSocialActionResult> {
    await this.ensureSchema();
    const target = await this.loadAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === followerAccountId) return { status: "self" };
    return this.withTransaction(async (queryable) => {
      await this.lockSocialPair(queryable, followerAccountId, target.accountId);
      if (await this.hasBlock(followerAccountId, target.accountId, queryable) || await this.hasBlock(target.accountId, followerAccountId, queryable)) {
        return { status: "blocked" };
      }
      if (await this.hasFollow(followerAccountId, target.accountId, queryable)) {
        return {
          status: "ok",
          profile: await this.createProfile(followerAccountId, target, queryable, createdAt),
        };
      }
      const privacy = await this.getPrivacySettingsForAccount(target.accountId, queryable);
      if (privacy.followPolicy === "nobody") return { status: "not_allowed" };
      await queryable.query(
        `
          INSERT INTO online_account_follows (
            follower_account_id,
            followed_account_id,
            created_at
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (follower_account_id, followed_account_id) DO NOTHING
        `,
        [followerAccountId, target.accountId, createdAt]
      );
      return {
        status: "ok",
        profile: await this.createProfile(followerAccountId, target, queryable, createdAt),
      };
    });
  }

  async unfollowAccount(
    followerAccountId: string,
    targetDisplayName: string,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountSocialActionResult> {
    await this.ensureSchema();
    const target = await this.loadAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === followerAccountId) return { status: "self" };
    return this.withTransaction(async (queryable) => {
      await this.lockSocialPair(queryable, followerAccountId, target.accountId);
      await queryable.query(
        "DELETE FROM online_account_follows WHERE follower_account_id = $1 AND followed_account_id = $2",
        [followerAccountId, target.accountId]
      );
      if (await this.hasBlock(target.accountId, followerAccountId, queryable)) {
        return { status: "blocked" };
      }
      return {
        status: "ok",
        profile: await this.createProfile(followerAccountId, target, queryable, viewedAt),
      };
    });
  }

  async blockAccount(
    blockerAccountId: string,
    targetDisplayName: string,
    createdAt: string
  ): Promise<OnlineAccountSocialActionResult> {
    await this.ensureSchema();
    const target = await this.loadAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === blockerAccountId) return { status: "self" };
    return this.withTransaction(async (queryable) => {
      await this.lockSocialPair(queryable, blockerAccountId, target.accountId);
      await queryable.query(
        `
          INSERT INTO online_account_blocks (
            blocker_account_id,
            blocked_account_id,
            created_at
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (blocker_account_id, blocked_account_id) DO NOTHING
        `,
        [blockerAccountId, target.accountId, createdAt]
      );
      await queryable.query(
        `
          DELETE FROM online_account_follows
          WHERE (follower_account_id = $1 AND followed_account_id = $2)
             OR (follower_account_id = $2 AND followed_account_id = $1)
        `,
        [blockerAccountId, target.accountId]
      );
      if (await this.hasBlock(target.accountId, blockerAccountId, queryable)) {
        return { status: "blocked" };
      }
      return {
        status: "ok",
        profile: await this.createProfile(blockerAccountId, target, queryable, createdAt),
      };
    });
  }

  async unblockAccount(
    blockerAccountId: string,
    targetDisplayName: string,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountSocialActionResult> {
    await this.ensureSchema();
    const target = await this.loadAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === blockerAccountId) return { status: "self" };
    return this.withTransaction(async (queryable) => {
      await this.lockSocialPair(queryable, blockerAccountId, target.accountId);
      await queryable.query(
        "DELETE FROM online_account_blocks WHERE blocker_account_id = $1 AND blocked_account_id = $2",
        [blockerAccountId, target.accountId]
      );
      if (await this.hasBlock(target.accountId, blockerAccountId, queryable)) {
        return { status: "blocked" };
      }
      return {
        status: "ok",
        profile: await this.createProfile(blockerAccountId, target, queryable, viewedAt),
      };
    });
  }

  async resolveChallengeTarget(
    challengerAccountId: string,
    targetDisplayName: string
  ): Promise<OnlineAccountChallengeTargetResult> {
    await this.ensureSchema();
    const target = await this.loadAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === challengerAccountId) return { status: "self" };
    return this.withTransaction(async (queryable) => {
      await this.lockSocialPair(queryable, challengerAccountId, target.accountId);
      if (
        await this.hasBlock(challengerAccountId, target.accountId, queryable) ||
        await this.hasBlock(target.accountId, challengerAccountId, queryable)
      ) {
        return { status: "blocked" };
      }
      const privacy = await this.getPrivacySettingsForAccount(target.accountId, queryable);
      if (privacy.challengePolicy === "nobody") return { status: "not_allowed" };
      if (
        privacy.challengePolicy === "followed" &&
        !(await this.hasFollow(target.accountId, challengerAccountId, queryable))
      ) {
        return { status: "not_allowed" };
      }
      return { status: "ok", account: target };
    });
  }

  async getPrivacySettings(accountId: string): Promise<OnlineAccountPrivacySettings> {
    await this.ensureSchema();
    return this.getPrivacySettingsForAccount(accountId, this.queryable);
  }

  private async getPrivacySettingsForAccount(
    accountId: string,
    queryable: PostgresQueryable
  ): Promise<OnlineAccountPrivacySettings> {
    const result = await queryable.query(
      `
        SELECT follow_policy, presence_policy, challenge_policy, updated_at
        FROM online_account_privacy_settings
        WHERE account_id = $1
        LIMIT 1
      `,
      [accountId]
    );
    return result.rows.length > 0 ? privacyFromRow(result.rows[0]) : defaultOnlineAccountPrivacySettings();
  }

  async updatePrivacySettings(
    accountId: string,
    patch: OnlineAccountPrivacyPatch,
    updatedAt: string
  ): Promise<OnlineAccountPrivacySettings | null> {
    await this.ensureSchema();
    const account = await this.loadAccountById(accountId);
    if (!account) return null;
    const current = await this.getPrivacySettings(accountId);
    const next = {
      ...current,
      ...patch,
      updatedAt,
    };
    const result = await this.queryable.query(
      `
        INSERT INTO online_account_privacy_settings (
          account_id,
          follow_policy,
          presence_policy,
          challenge_policy,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (account_id) DO UPDATE SET
          follow_policy = EXCLUDED.follow_policy,
          presence_policy = EXCLUDED.presence_policy,
          challenge_policy = EXCLUDED.challenge_policy,
          updated_at = EXCLUDED.updated_at
        RETURNING follow_policy, presence_policy, challenge_policy, updated_at
      `,
      [accountId, next.followPolicy, next.presencePolicy, next.challengePolicy, updatedAt]
    );
    return privacyFromRow(result.rows[0]);
  }

  async checkReady(): Promise<boolean> {
    await this.ensureSchema();
    await this.queryable.query("SELECT 1");
    return true;
  }

  async close(): Promise<void> {
    await this.closeConnection?.();
  }

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.createSchema().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });
    return this.schemaReady;
  }

  private async createSchema(): Promise<void> {
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_accounts (
        account_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        display_name_normalized TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.queryable.query(`
      ALTER TABLE online_accounts
        ADD COLUMN IF NOT EXISTS password_hash TEXT
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_account_display_names (
        display_name_normalized TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        reserved_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.queryable.query(`
      INSERT INTO online_account_display_names (
        display_name_normalized,
        display_name,
        reserved_at
      )
      SELECT display_name_normalized, display_name, created_at
      FROM online_accounts
      ON CONFLICT (display_name_normalized) DO NOTHING
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_account_sessions (
        session_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES online_accounts(account_id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL CONSTRAINT online_account_sessions_token_hash_shape CHECK (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
        created_at TIMESTAMPTZ NOT NULL,
        last_used_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.queryable.query(`
      DO $$
      BEGIN
        ALTER TABLE online_account_sessions
          ADD CONSTRAINT online_account_sessions_token_hash_shape
          CHECK (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_account_sessions_account_idx
        ON online_account_sessions (account_id)
    `);
    await this.queryable.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS online_account_sessions_token_hash_unique_idx
        ON online_account_sessions (token_hash)
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_account_privacy_settings (
        account_id TEXT PRIMARY KEY REFERENCES online_accounts(account_id) ON DELETE CASCADE,
        follow_policy TEXT NOT NULL CHECK (follow_policy IN ('everyone', 'nobody')),
        presence_policy TEXT NOT NULL CHECK (presence_policy IN ('followed', 'everyone', 'nobody')),
        challenge_policy TEXT NOT NULL CHECK (challenge_policy IN ('followed', 'everyone', 'nobody')),
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_account_follows (
        follower_account_id TEXT NOT NULL REFERENCES online_accounts(account_id) ON DELETE CASCADE,
        followed_account_id TEXT NOT NULL REFERENCES online_accounts(account_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (follower_account_id, followed_account_id),
        CHECK (follower_account_id <> followed_account_id)
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_account_follows_followed_idx
        ON online_account_follows (followed_account_id)
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_account_blocks (
        blocker_account_id TEXT NOT NULL REFERENCES online_accounts(account_id) ON DELETE CASCADE,
        blocked_account_id TEXT NOT NULL REFERENCES online_accounts(account_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (blocker_account_id, blocked_account_id),
        CHECK (blocker_account_id <> blocked_account_id)
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_account_blocks_blocked_idx
        ON online_account_blocks (blocked_account_id)
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_account_ratings (
        account_id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ
      )
    `);
  }

  private async loadAccountByDisplayName(displayName: string): Promise<OnlineAccount | null> {
    const normalized = normalizeOnlineAccountDisplayName(displayName);
    if (!normalized.ok) return null;
    const result = await this.queryable.query(
      `
        SELECT account_id, display_name, created_at, updated_at
        FROM online_accounts
        WHERE display_name_normalized = $1
        LIMIT 1
      `,
      [normalizeOnlineAccountDisplayNameKey(normalized.value)]
    );
    return result.rows.length > 0 ? accountFromRow(result.rows[0]) : null;
  }

  private async loadAccountById(accountId: string): Promise<OnlineAccount | null> {
    const result = await this.queryable.query(
      `
        SELECT account_id, display_name, created_at, updated_at
        FROM online_accounts
        WHERE account_id = $1
        LIMIT 1
      `,
      [accountId]
    );
    return result.rows.length > 0 ? accountFromRow(result.rows[0]) : null;
  }

  private async hasFollow(
    followerAccountId: string,
    followedAccountId: string,
    queryable: PostgresQueryable = this.queryable
  ): Promise<boolean> {
    const result = await queryable.query(
      `
        SELECT 1
        FROM online_account_follows
        WHERE follower_account_id = $1 AND followed_account_id = $2
        LIMIT 1
      `,
      [followerAccountId, followedAccountId]
    );
    return result.rows.length > 0;
  }

  private async lockSocialPair(
    queryable: PostgresQueryable,
    leftAccountId: string,
    rightAccountId: string
  ): Promise<void> {
    const [first, second] = [leftAccountId, rightAccountId].sort();
    await queryable.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [first, second]
    );
  }

  private async hasBlock(
    blockerAccountId: string,
    blockedAccountId: string,
    queryable: PostgresQueryable = this.queryable
  ): Promise<boolean> {
    const result = await queryable.query(
      `
        SELECT 1
        FROM online_account_blocks
        WHERE blocker_account_id = $1 AND blocked_account_id = $2
        LIMIT 1
      `,
      [blockerAccountId, blockedAccountId]
    );
    return result.rows.length > 0;
  }

  private async createProfile(
    viewerAccountId: string,
    target: OnlineAccount,
    queryable: PostgresQueryable = this.queryable,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountPublicProfile> {
    return {
      schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
      displayName: target.displayName,
      ...(await this.createPublicRating(target.accountId, queryable)),
      presence: await this.createPresence(viewerAccountId, target, queryable, viewedAt),
      relationship: {
        self: viewerAccountId === target.accountId,
        following: await this.hasFollow(viewerAccountId, target.accountId, queryable),
        followedBy:
          viewerAccountId !== target.accountId && await this.hasFollow(target.accountId, viewerAccountId, queryable),
        blocked: await this.hasBlock(viewerAccountId, target.accountId, queryable),
      },
    };
  }

  private async createPublicRating(
    accountId: string,
    queryable: PostgresQueryable
  ): Promise<Pick<OnlineAccountPublicProfile, "rating">> {
    const result = await queryable.query(
      "SELECT payload FROM online_account_ratings WHERE account_id = $1",
      [accountId]
    );
    if (result.rows.length === 0) return {};
    const rating = validateOnlineRating(result.rows[0].payload, `online account rating ${accountId}`);
    return { rating: createOnlineAccountPublicRating(rating) };
  }

  private async createPresence(
    viewerAccountId: string,
    target: OnlineAccount,
    queryable: PostgresQueryable,
    viewedAt: string
  ): Promise<OnlineAccountPublicProfile["presence"]> {
    const isSelf = viewerAccountId === target.accountId;
    const blockedEitherWay =
      await this.hasBlock(viewerAccountId, target.accountId, queryable) ||
      await this.hasBlock(target.accountId, viewerAccountId, queryable);
    const privacy = await this.getPrivacySettingsForAccount(target.accountId, queryable);
    const canView =
      !blockedEitherWay &&
      (isSelf ||
        privacy.presencePolicy === "everyone" ||
        (privacy.presencePolicy === "followed" &&
          await this.hasFollow(target.accountId, viewerAccountId, queryable)));
    if (!canView) {
      return { visibility: "hidden", status: null };
    }
    const result = await queryable.query(
      `
        SELECT max(last_used_at) AS last_seen_at
        FROM online_account_sessions
        WHERE account_id = $1
      `,
      [target.accountId]
    );
    const lastSeenAt = result.rows[0]?.last_seen_at;
    return {
      visibility: "visible",
      status: this.presenceStatusFromLatestSession(lastSeenAt == null ? null : timestampToIso(lastSeenAt), viewedAt),
    };
  }

  private presenceStatusFromLatestSession(lastSeenAt: string | null, viewedAt: string): OnlineAccountPresenceStatus {
    if (!lastSeenAt) return "offline";
    const lastSeenTime = Date.parse(lastSeenAt);
    const viewedTime = Date.parse(viewedAt);
    if (Number.isNaN(lastSeenTime) || Number.isNaN(viewedTime)) return "offline";
    const elapsedMs = Math.max(0, viewedTime - lastSeenTime);
    if (elapsedMs <= 5 * 60 * 1_000) return "online";
    if (elapsedMs <= 60 * 60 * 1_000) return "recent";
    if (elapsedMs <= 7 * 24 * 60 * 60 * 1_000) return "away";
    return "offline";
  }

  private async withTransaction<T>(operation: (queryable: PostgresQueryable) => Promise<T>): Promise<T> {
    const client = await this.transactionClientFactory();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Postgres account transaction failed and rollback also failed."
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
