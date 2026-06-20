import { Pool } from "pg";
import {
  createOnlineAccountRecord,
  normalizeOnlineAccountDisplayName,
  normalizeOnlineAccountDisplayNameKey,
  normalizeOnlineAccountPassword,
  type OnlineAccount,
} from "../accounts";
import {
  ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION,
  ONLINE_ACCOUNT_REPORT_SCHEMA_VERSION,
  ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
  createOnlineAccountPublicRating,
  defaultOnlineAccountAvatar,
  defaultOnlineAccountPrivacySettings,
  parseOnlineAccountAvatar,
  type OnlineAccountAvatar,
  type OnlineAccountModerationAuditEntry,
  type OnlineAccountModerationReport,
  type OnlineAccountProfilePatch,
  type OnlineAccountPrivacyPatch,
  type OnlineAccountPrivacySettings,
  type OnlineAccountPresenceStatus,
  type OnlineAccountPublicProfile,
  type OnlineAccountReportSummary,
  type OnlineRatingLeaderboardEntry,
  type OnlineAccountSocialActionResult,
} from "../social";
import { createDefaultOnlineRating, validateOnlineRating } from "../ratings";
import {
  CreateOnlineAccountStoreInput,
  CreateOnlineAccountExternalSessionInput,
  CreateOnlineAccountPasswordSessionInput,
  DuplicateOnlineAccountDisplayNameError,
  DuplicateOnlineAccountIdError,
  DuplicateOnlineAccountSessionCredentialError,
  type ListOnlineAccountReportAuditsOptions,
  type ListOnlineAccountReportsOptions,
  type OnlineAccountSessionListItem,
  type OnlineAccountExternalLoginProvider,
  type OnlineAccountChallengeTargetResult,
  type OnlineAccountReportAuditListResult,
  type OnlineAccountReportStatusUpdateResult,
  type OnlineAccountStore,
  type OnlineAccountReportSubmissionResult,
  type ResolvedOnlineAccountSession,
  type SubmitOnlineAccountReportStoreInput,
  type UpdateOnlineAccountPasswordInput,
  type UpdateOnlineAccountReportStatusInput,
  type OnlineAccountPasswordUpdateResult,
} from "./OnlineAccountStore";
import { hashOnlineToken, isOnlineTokenCredentialHash } from "./onlineTokenCredentials";
import {
  isOnlineAccountPasswordCredentialHash,
  verifyOnlineAccountPassword,
} from "./onlinePasswordCredentials";
import { resolvePostgresPoolMaxPerStore } from "./postgresPoolConfig";

interface PostgresQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

export interface PostgresOnlineAccountStoreOptions {
  connectionString?: string;
  poolMaxPerStore?: number;
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
      max: resolvePostgresPoolMaxPerStore(options.poolMaxPerStore),
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

  async createSessionWithExternalLogin(
    input: CreateOnlineAccountExternalSessionInput
  ): Promise<ResolvedOnlineAccountSession> {
    await this.ensureSchema();
    this.validateExternalLoginInput(input);
    try {
      return await this.withTransaction(async (queryable) => {
        await queryable.query(
          "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
          [input.provider, input.providerSubject]
        );
        const existing = await this.loadAccountByExternalLogin(
          queryable,
          input.provider,
          input.providerSubject
        );
        if (existing) {
          await this.insertSession(queryable, input.sessionId, existing.accountId, input.tokenHash, input.createdAt);
          await queryable.query(
            `
              UPDATE online_account_external_logins
              SET last_used_at = $3
              WHERE provider = $1 AND provider_subject = $2
            `,
            [input.provider, input.providerSubject, input.createdAt]
          );
          return {
            account: existing,
            sessionId: input.sessionId,
            lastUsedAt: input.createdAt,
          };
        }

        const displayName = await this.reserveFirstAvailableDisplayName(
          queryable,
          input.displayNameCandidates,
          input.createdAt
        );
        if (!displayName) {
          throw new DuplicateOnlineAccountDisplayNameError(input.displayNameCandidates[0] ?? "Google account");
        }

        const displayNameKey = normalizeOnlineAccountDisplayNameKey(displayName);
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
            VALUES ($1, $2, $3, NULL, $4, $4)
            RETURNING account_id, display_name, created_at, updated_at
          `,
          [input.accountId, displayName, displayNameKey, input.createdAt]
        );
        await queryable.query(
          `
            INSERT INTO online_account_external_logins (
              provider,
              provider_subject,
              account_id,
              created_at,
              last_used_at
            )
            VALUES ($1, $2, $3, $4, $4)
          `,
          [input.provider, input.providerSubject, input.accountId, input.createdAt]
        );
        await this.insertSession(queryable, input.sessionId, input.accountId, input.tokenHash, input.createdAt);
        return {
          account: accountFromRow(accountResult.rows[0]),
          sessionId: input.sessionId,
          lastUsedAt: input.createdAt,
        };
      });
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        const constraint = String((error as { constraint?: unknown }).constraint ?? "");
        if (constraint.includes("session") || constraint.includes("token_hash")) {
          throw new DuplicateOnlineAccountSessionCredentialError();
        }
        if (constraint.includes("display_name")) {
          throw new DuplicateOnlineAccountDisplayNameError(input.displayNameCandidates[0] ?? "Google account");
        }
        throw new DuplicateOnlineAccountIdError(input.accountId);
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

  async updateAccountPassword(
    input: UpdateOnlineAccountPasswordInput
  ): Promise<OnlineAccountPasswordUpdateResult> {
    await this.ensureSchema();
    if (!isOnlineAccountPasswordCredentialHash(input.passwordHash)) {
      throw new Error("Account password hash is invalid.");
    }
    return this.withTransaction(async (queryable) => {
      const result = await queryable.query(
        `
          SELECT account_id, password_hash
          FROM online_accounts
          WHERE account_id = $1
          LIMIT 1
        `,
        [input.accountId]
      );
      if (result.rows.length === 0) return { status: "not_found" };
      const currentHash = typeof result.rows[0].password_hash === "string"
        ? String(result.rows[0].password_hash)
        : null;
      if (currentHash) {
        if (!input.currentPassword) return { status: "current_password_required" };
        if (!(await verifyOnlineAccountPassword(input.currentPassword, currentHash))) {
          return { status: "bad_current_password" };
        }
      }
      await queryable.query(
        `
          UPDATE online_accounts
          SET password_hash = $2, updated_at = $3
          WHERE account_id = $1
        `,
        [input.accountId, input.passwordHash, input.updatedAt]
      );
      return { status: "ok" };
    });
  }

  async listRatingLeaderboard(limit = 20): Promise<OnlineRatingLeaderboardEntry[]> {
    await this.ensureSchema();
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const result = await this.queryable.query(
      `
        SELECT a.display_name, a.profile_payload, r.payload
        FROM online_account_ratings r
        INNER JOIN online_accounts a ON a.account_id = r.account_id
        ORDER BY
          (r.payload->>'rating')::double precision DESC,
          (r.payload->>'games')::integer DESC,
          lower(a.display_name) ASC,
          a.display_name ASC
        LIMIT $1
      `,
      [boundedLimit]
    );
    return this.ratingLeaderboardRows(result.rows);
  }

  async listFollowingRatingLeaderboard(accountId: string, limit = 20): Promise<OnlineRatingLeaderboardEntry[]> {
    await this.ensureSchema();
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const result = await this.queryable.query(
      `
        WITH visible_accounts AS (
          SELECT $1::text AS account_id
          UNION
          SELECT f.followed_account_id AS account_id
          FROM online_account_follows f
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
        )
        SELECT a.display_name, a.profile_payload, r.payload
        FROM visible_accounts v
        INNER JOIN online_accounts a ON a.account_id = v.account_id
        INNER JOIN online_account_ratings r ON r.account_id = v.account_id
        ORDER BY
          (r.payload->>'rating')::double precision DESC,
          (r.payload->>'games')::integer DESC,
          lower(a.display_name) ASC,
          a.display_name ASC
        LIMIT $2
      `,
      [accountId, boundedLimit]
    );
    return this.ratingLeaderboardRows(result.rows);
  }

  async getProfileForDisplayName(
    viewerAccountId: string | null,
    displayName: string,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountPublicProfile | null> {
    await this.ensureSchema();
    const target = await this.loadAccountByDisplayName(displayName);
    if (!target) return null;
    if (viewerAccountId !== null && target.accountId !== viewerAccountId && await this.hasBlock(target.accountId, viewerAccountId)) {
      return null;
    }
    return this.createProfile(viewerAccountId, target, this.queryable, viewedAt);
  }

  async resolveAccountIdForDisplayName(displayName: string): Promise<string | null> {
    await this.ensureSchema();
    return (await this.loadAccountByDisplayName(displayName))?.accountId ?? null;
  }

  async searchProfiles(
    viewerAccountId: string | null,
    query: string,
    limit = 10,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountPublicProfile[]> {
    await this.ensureSchema();
    const queryKey = normalizeOnlineAccountDisplayNameKey(query.trim());
    if (!queryKey) return [];
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
    const result = await this.queryable.query(
      `
        SELECT a.account_id, a.display_name, a.created_at, a.updated_at
        FROM online_accounts a
        WHERE POSITION($1 IN a.display_name_normalized) > 0
          AND (
            $2::text IS NULL
            OR a.account_id = $2
            OR (
              NOT EXISTS (
                SELECT 1 FROM online_account_blocks b
                WHERE b.blocker_account_id = a.account_id
                  AND b.blocked_account_id = $2
              )
              AND NOT EXISTS (
                SELECT 1 FROM online_account_blocks b
                WHERE b.blocker_account_id = $2
                  AND b.blocked_account_id = a.account_id
              )
            )
          )
        ORDER BY
          CASE WHEN LEFT(a.display_name_normalized, LENGTH($1)) = $1 THEN 0 ELSE 1 END ASC,
          lower(a.display_name) ASC,
          a.display_name ASC
        LIMIT $3
      `,
      [queryKey, viewerAccountId, boundedLimit]
    );
    return Promise.all(
      result.rows.map((row) => this.createProfile(viewerAccountId, accountFromRow(row), this.queryable, viewedAt))
    );
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

  async submitAccountReport(
    input: SubmitOnlineAccountReportStoreInput
  ): Promise<OnlineAccountReportSubmissionResult> {
    await this.ensureSchema();
    return this.withTransaction(async (queryable) => {
      const reporter = await this.loadAccountById(input.reporterAccountId, queryable);
      const target = await this.loadAccountByDisplayName(input.targetDisplayName, queryable);
      if (!reporter || !target) return { status: "not_found" };
      if (target.accountId === reporter.accountId) return { status: "self" };
      if (await this.hasBlock(target.accountId, reporter.accountId, queryable)) {
        return { status: "not_found" };
      }
      await queryable.query(
        `
          INSERT INTO online_account_reports (
            report_id,
            reporter_account_id,
            reporter_display_name,
            target_account_id,
            target_display_name,
            reason,
            details,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        `,
        [
          input.reportId,
          reporter.accountId,
          reporter.displayName,
          target.accountId,
          target.displayName,
          input.reason,
          input.details,
          input.createdAt,
        ]
      );
      return {
        status: "ok",
        report: this.accountReportSummary(target.displayName, input.reason, input.createdAt),
      };
    });
  }

  async listAccountReports(options: ListOnlineAccountReportsOptions): Promise<OnlineAccountModerationReport[]> {
    await this.ensureSchema();
    const reporterDisplayName = options.reporterDisplayName
      ? normalizeOnlineAccountDisplayName(options.reporterDisplayName)
      : undefined;
    const targetDisplayName = options.targetDisplayName
      ? normalizeOnlineAccountDisplayName(options.targetDisplayName)
      : undefined;
    if ((reporterDisplayName && !reporterDisplayName.ok) || (targetDisplayName && !targetDisplayName.ok)) {
      return [];
    }
    const where = ["status = $1"];
    const values: unknown[] = [options.status];
    if (options.reason) {
      values.push(options.reason);
      where.push(`reason = $${values.length}`);
    }
    if (reporterDisplayName) {
      values.push(reporterDisplayName.value);
      where.push(`LOWER(reporter_display_name) = LOWER($${values.length})`);
    }
    if (targetDisplayName) {
      values.push(targetDisplayName.value);
      where.push(`LOWER(target_display_name) = LOWER($${values.length})`);
    }
    if (options.cursor) {
      values.push(options.cursor.createdAt, options.cursor.reportId);
      where.push(
        `(created_at < $${values.length - 1} OR (created_at = $${values.length - 1} AND report_id < $${values.length}))`
      );
    }
    values.push(options.limit);
    const result = await this.queryable.query(
      `
        SELECT
          report_id,
          reporter_display_name,
          target_display_name,
          reason,
          details,
          moderator_note,
          status,
          created_at,
          updated_at,
          reviewed_at
        FROM online_account_reports
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC, report_id DESC
        LIMIT $${values.length}
      `,
      values
    );
    return result.rows.map((row) => this.moderationReportFromRow(row));
  }

  async updateAccountReportStatus(
    input: UpdateOnlineAccountReportStatusInput
  ): Promise<OnlineAccountReportStatusUpdateResult> {
    await this.ensureSchema();
    return this.withTransaction(async (queryable) => {
      const currentResult = await queryable.query(
        `
          SELECT
            report_id,
            reporter_display_name,
            target_display_name,
            reason,
            details,
            moderator_note,
            status,
            created_at,
            updated_at,
            reviewed_at
          FROM online_account_reports
          WHERE report_id = $1
          FOR UPDATE
        `,
        [input.reportId]
      );
      if (currentResult.rows.length === 0) return { status: "not_found" };
      const current = currentResult.rows[0];
      const previousStatus = String(current.status) as OnlineAccountModerationReport["status"];
      if (previousStatus === input.status) return { status: "unchanged" };
      const reviewedAt = input.status === "open" ? null : input.updatedAt;
      const updatedResult = await queryable.query(
        `
          UPDATE online_account_reports
          SET
            status = $2,
            moderator_note = $3,
            reviewed_at = $4,
            updated_at = $5
          WHERE report_id = $1
          RETURNING
            report_id,
            reporter_display_name,
            target_display_name,
            reason,
            details,
            moderator_note,
            status,
            created_at,
            updated_at,
            reviewed_at
        `,
        [input.reportId, input.status, input.note, reviewedAt, input.updatedAt]
      );
      const audit: OnlineAccountModerationAuditEntry = {
        schemaVersion: ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION,
        auditId: input.auditId,
        reportId: input.reportId,
        action: "status_changed",
        actor: "admin",
        previousStatus,
        nextStatus: input.status,
        note: input.note,
        createdAt: input.updatedAt,
      };
      await queryable.query(
        `
          INSERT INTO online_account_report_audit (
            audit_id,
            report_id,
            action,
            actor,
            previous_status,
            next_status,
            note,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          audit.auditId,
          audit.reportId,
          audit.action,
          audit.actor,
          audit.previousStatus,
          audit.nextStatus,
          audit.note,
          audit.createdAt,
        ]
      );
      return {
        status: "ok",
        report: this.moderationReportFromRow(updatedResult.rows[0]),
        audit,
      };
    });
  }

  async listAccountReportAudits(
    options: ListOnlineAccountReportAuditsOptions
  ): Promise<OnlineAccountReportAuditListResult> {
    await this.ensureSchema();
    const reportResult = await this.queryable.query(
      `
        SELECT report_id
        FROM online_account_reports
        WHERE report_id = $1
      `,
      [options.reportId]
    );
    if (reportResult.rows.length === 0) return { status: "not_found" };

    const auditResult = await this.queryable.query(
      `
        SELECT
          audit_id,
          report_id,
          action,
          actor,
          previous_status,
          next_status,
          note,
          created_at
        FROM online_account_report_audit
        WHERE report_id = $1
        ORDER BY created_at DESC, audit_id DESC
        LIMIT $2
      `,
      [options.reportId, options.limit]
    );
    return {
      status: "ok",
      reportId: options.reportId,
      audits: auditResult.rows.map((row) => this.moderationAuditFromRow(row)),
    };
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

  async updateProfileSettings(
    accountId: string,
    patch: OnlineAccountProfilePatch,
    updatedAt: string
  ): Promise<OnlineAccountPublicProfile | null> {
    await this.ensureSchema();
    const account = await this.loadAccountById(accountId);
    if (!account) return null;
    const currentPayload = await this.loadProfilePayload(accountId);
    const nextPayload = {
      ...currentPayload,
      ...(patch.avatar ? { avatar: patch.avatar } : {}),
    };
    await this.queryable.query(
      `
        UPDATE online_accounts
        SET profile_payload = $2::jsonb, updated_at = $3
        WHERE account_id = $1
      `,
      [accountId, JSON.stringify(nextPayload), updatedAt]
    );
    return this.createProfile(accountId, { ...account, updatedAt }, this.queryable, updatedAt);
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
      ALTER TABLE online_accounts
        ADD COLUMN IF NOT EXISTS profile_payload JSONB NOT NULL DEFAULT '{}'::jsonb
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
      CREATE TABLE IF NOT EXISTS online_account_external_logins (
        provider TEXT NOT NULL,
        provider_subject TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES online_accounts(account_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL,
        last_used_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (provider, provider_subject),
        UNIQUE (account_id, provider),
        CHECK (provider IN ('google')),
        CHECK (provider_subject <> '')
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_account_external_logins_account_idx
        ON online_account_external_logins (account_id)
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
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_account_reports (
        report_id TEXT PRIMARY KEY,
        reporter_account_id TEXT REFERENCES online_accounts(account_id) ON DELETE SET NULL,
        reporter_display_name TEXT NOT NULL,
        target_account_id TEXT REFERENCES online_accounts(account_id) ON DELETE SET NULL,
        target_display_name TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('abuse', 'cheating', 'spam', 'impersonation', 'other')),
        details TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        moderator_note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        reviewed_at TIMESTAMPTZ
      )
    `);
    await this.queryable.query(`
      ALTER TABLE online_account_reports
        ADD COLUMN IF NOT EXISTS moderator_note TEXT NOT NULL DEFAULT ''
    `);
    await this.queryable.query(`
      ALTER TABLE online_account_reports
        ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ
    `);
    await this.queryable.query(`
      DO $$
      BEGIN
        ALTER TABLE online_account_reports
          DROP CONSTRAINT IF EXISTS online_account_reports_status_check;
        ALTER TABLE online_account_reports
          ADD CONSTRAINT online_account_reports_status_check
          CHECK (status IN ('open', 'resolved', 'dismissed'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_account_reports_target_idx
        ON online_account_reports (target_account_id, created_at DESC)
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_account_reports_reporter_idx
        ON online_account_reports (reporter_account_id, created_at DESC)
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_account_reports_status_created_idx
        ON online_account_reports (status, created_at DESC, report_id DESC)
    `);
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS online_account_report_audit (
        audit_id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL REFERENCES online_account_reports(report_id) ON DELETE CASCADE,
        action TEXT NOT NULL CHECK (action IN ('status_changed')),
        actor TEXT NOT NULL CHECK (actor IN ('admin')),
        previous_status TEXT NOT NULL CHECK (previous_status IN ('open', 'resolved', 'dismissed')),
        next_status TEXT NOT NULL CHECK (next_status IN ('open', 'resolved', 'dismissed')),
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.queryable.query(`
      CREATE INDEX IF NOT EXISTS online_account_report_audit_report_idx
        ON online_account_report_audit (report_id, created_at DESC, audit_id DESC)
    `);
  }

  private async loadAccountByDisplayName(
    displayName: string,
    queryable: PostgresQueryable = this.queryable
  ): Promise<OnlineAccount | null> {
    const normalized = normalizeOnlineAccountDisplayName(displayName);
    if (!normalized.ok) return null;
    const result = await queryable.query(
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

  private async loadAccountByExternalLogin(
    queryable: PostgresQueryable,
    provider: OnlineAccountExternalLoginProvider,
    providerSubject: string
  ): Promise<OnlineAccount | null> {
    const result = await queryable.query(
      `
        SELECT a.account_id, a.display_name, a.created_at, a.updated_at
        FROM online_account_external_logins l
        INNER JOIN online_accounts a ON a.account_id = l.account_id
        WHERE l.provider = $1 AND l.provider_subject = $2
        LIMIT 1
      `,
      [provider, providerSubject]
    );
    return result.rows.length > 0 ? accountFromRow(result.rows[0]) : null;
  }

  private async reserveFirstAvailableDisplayName(
    queryable: PostgresQueryable,
    candidates: string[],
    reservedAt: string
  ): Promise<string | null> {
    for (const candidate of candidates) {
      const displayName = normalizeOnlineAccountDisplayName(candidate);
      if (!displayName.ok) continue;
      const displayNameKey = normalizeOnlineAccountDisplayNameKey(displayName.value);
      const result = await queryable.query(
        `
          INSERT INTO online_account_display_names (
            display_name_normalized,
            display_name,
            reserved_at
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (display_name_normalized) DO NOTHING
          RETURNING display_name
        `,
        [displayNameKey, displayName.value, reservedAt]
      );
      if (result.rows.length > 0) return displayName.value;
    }
    return null;
  }

  private async insertSession(
    queryable: PostgresQueryable,
    sessionId: string,
    accountId: string,
    tokenHash: string,
    createdAt: string
  ): Promise<void> {
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
      [sessionId, accountId, tokenHash, createdAt]
    );
  }

  private validateExternalLoginInput(input: CreateOnlineAccountExternalSessionInput): void {
    if (input.provider !== "google") {
      throw new Error("External login provider is invalid.");
    }
    if (
      typeof input.providerSubject !== "string" ||
      input.providerSubject.length === 0 ||
      input.providerSubject.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(input.providerSubject)
    ) {
      throw new Error("External login subject is invalid.");
    }
    if (!isOnlineTokenCredentialHash(input.tokenHash)) {
      throw new Error("Account session token hash is invalid.");
    }
    if (!Array.isArray(input.displayNameCandidates) || input.displayNameCandidates.length === 0) {
      throw new Error("External login display name candidates are required.");
    }
  }

  private async loadAccountById(
    accountId: string,
    queryable: PostgresQueryable = this.queryable
  ): Promise<OnlineAccount | null> {
    const result = await queryable.query(
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

  private ratingLeaderboardRows(
    rows: Array<{ display_name: unknown; profile_payload?: unknown; payload: unknown }>
  ): OnlineRatingLeaderboardEntry[] {
    return rows.map((row) => {
      const rating = validateOnlineRating(row.payload, `online account leaderboard rating ${row.display_name}`);
      return {
        schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
        displayName: String(row.display_name),
        avatar: this.avatarFromProfilePayload(row.profile_payload),
        rating: createOnlineAccountPublicRating(rating),
      };
    });
  }

  private moderationReportFromRow(row: Record<string, unknown>): OnlineAccountModerationReport {
    return {
      schemaVersion: ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION,
      reportId: String(row.report_id),
      reporterDisplayName: String(row.reporter_display_name),
      targetDisplayName: String(row.target_display_name),
      reason: row.reason as OnlineAccountModerationReport["reason"],
      details: String(row.details ?? ""),
      status: row.status as OnlineAccountModerationReport["status"],
      moderatorNote: String(row.moderator_note ?? ""),
      createdAt: timestampToIso(row.created_at),
      updatedAt: timestampToIso(row.updated_at),
      reviewedAt: row.reviewed_at == null ? null : timestampToIso(row.reviewed_at),
    };
  }

  private moderationAuditFromRow(row: Record<string, unknown>): OnlineAccountModerationAuditEntry {
    return {
      schemaVersion: ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION,
      auditId: String(row.audit_id),
      reportId: String(row.report_id),
      action: "status_changed",
      actor: "admin",
      previousStatus: row.previous_status as OnlineAccountModerationReport["status"],
      nextStatus: row.next_status as OnlineAccountModerationReport["status"],
      note: String(row.note ?? ""),
      createdAt: timestampToIso(row.created_at),
    };
  }

  private accountReportSummary(
    targetDisplayName: string,
    reason: OnlineAccountReportSummary["reason"],
    createdAt: string
  ): OnlineAccountReportSummary {
    return {
      schemaVersion: ONLINE_ACCOUNT_REPORT_SCHEMA_VERSION,
      targetDisplayName,
      reason,
      createdAt,
    };
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
    viewerAccountId: string | null,
    target: OnlineAccount,
    queryable: PostgresQueryable = this.queryable,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountPublicProfile> {
    return {
      schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
      displayName: target.displayName,
      avatar: await this.loadAccountAvatar(target.accountId, queryable),
      ...(await this.createPublicRating(target.accountId, queryable)),
      presence: await this.createPresence(viewerAccountId, target, queryable, viewedAt),
      relationship: {
        self: viewerAccountId !== null && viewerAccountId === target.accountId,
        following: viewerAccountId !== null && await this.hasFollow(viewerAccountId, target.accountId, queryable),
        followedBy:
          viewerAccountId !== null &&
          viewerAccountId !== target.accountId &&
          await this.hasFollow(target.accountId, viewerAccountId, queryable),
        blocked: viewerAccountId !== null && await this.hasBlock(viewerAccountId, target.accountId, queryable),
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
    const rating = result.rows.length === 0
      ? createDefaultOnlineRating(null)
      : validateOnlineRating(result.rows[0].payload, `online account rating ${accountId}`);
    return { rating: createOnlineAccountPublicRating(rating) };
  }

  private async loadProfilePayload(
    accountId: string,
    queryable: PostgresQueryable = this.queryable
  ): Promise<Record<string, unknown>> {
    const result = await queryable.query(
      "SELECT profile_payload FROM online_accounts WHERE account_id = $1 LIMIT 1",
      [accountId]
    );
    const payload = result.rows[0]?.profile_payload;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>) }
      : {};
  }

  private async loadAccountAvatar(
    accountId: string,
    queryable: PostgresQueryable
  ): Promise<OnlineAccountAvatar> {
    return this.avatarFromProfilePayload(await this.loadProfilePayload(accountId, queryable));
  }

  private avatarFromProfilePayload(value: unknown): OnlineAccountAvatar {
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaultOnlineAccountAvatar();
    const avatar = (value as Record<string, unknown>).avatar;
    if (avatar === undefined) return defaultOnlineAccountAvatar();
    const parsed = parseOnlineAccountAvatar(avatar);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    return parsed.value;
  }

  private async createPresence(
    viewerAccountId: string | null,
    target: OnlineAccount,
    queryable: PostgresQueryable,
    viewedAt: string
  ): Promise<OnlineAccountPublicProfile["presence"]> {
    const isSelf = viewerAccountId !== null && viewerAccountId === target.accountId;
    const blockedEitherWay =
      viewerAccountId !== null &&
      (await this.hasBlock(viewerAccountId, target.accountId, queryable) ||
        await this.hasBlock(target.accountId, viewerAccountId, queryable));
    const privacy = await this.getPrivacySettingsForAccount(target.accountId, queryable);
    const canView =
      !blockedEitherWay &&
      (isSelf ||
        privacy.presencePolicy === "everyone" ||
        (viewerAccountId !== null &&
          privacy.presencePolicy === "followed" &&
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
