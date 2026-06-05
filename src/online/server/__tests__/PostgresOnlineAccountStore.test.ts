import { describe, expect, it } from "vitest";
import { PostgresOnlineAccountStore } from "../PostgresOnlineAccountStore";
import {
  DuplicateOnlineAccountDisplayNameError,
  DuplicateOnlineAccountSessionCredentialError,
} from "../OnlineAccountStore";
import { hashOnlineToken } from "../onlineTokenCredentials";
import { hashOnlineAccountPassword } from "../onlinePasswordCredentials";
import { createDefaultOnlineRating, type OnlineRating } from "../../ratings";

const TEST_PASSWORD_HASH =
  "scrypt:v1:16384:8:1:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

class FakeAccountQueryable {
  readonly accounts = new Map<string, any>();
  readonly accountsByDisplayName = new Map<string, string>();
  readonly displayNameRegistry = new Map<string, string>();
  readonly sessionsByTokenHash = new Map<string, any>();
  readonly externalLogins = new Map<string, any>();
  readonly privacySettings = new Map<string, any>();
  readonly follows = new Set<string>();
  readonly blocks = new Set<string>();
  readonly ratingRows = new Map<string, OnlineRating>();
  readonly reports: any[] = [];
  readonly reportAudits: any[] = [];
  readonly advisoryLocks: string[] = [];
  private transactionSnapshot?: {
    accounts: Map<string, any>;
    accountsByDisplayName: Map<string, string>;
    displayNameRegistry: Map<string, string>;
    sessionsByTokenHash: Map<string, any>;
    externalLogins: Map<string, any>;
    privacySettings: Map<string, any>;
    follows: Set<string>;
    blocks: Set<string>;
    ratingRows: Map<string, OnlineRating>;
    reports: any[];
    reportAudits: any[];
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
        externalLogins: new Map(
          Array.from(this.externalLogins.entries()).map(([key, value]) => [key, { ...value }])
        ),
        privacySettings: new Map(
          Array.from(this.privacySettings.entries()).map(([key, value]) => [key, { ...value }])
        ),
        follows: new Set(this.follows),
        blocks: new Set(this.blocks),
        ratingRows: new Map(Array.from(this.ratingRows.entries()).map(([key, value]) => [key, { ...value }])),
        reports: this.reports.map((report) => ({ ...report })),
        reportAudits: this.reportAudits.map((audit) => ({ ...audit })),
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
        this.externalLogins.clear();
        this.privacySettings.clear();
        this.follows.clear();
        this.blocks.clear();
        this.ratingRows.clear();
        this.reports.splice(0);
        this.reportAudits.splice(0);
        for (const [key, value] of this.transactionSnapshot.accounts) this.accounts.set(key, value);
        for (const [key, value] of this.transactionSnapshot.accountsByDisplayName) this.accountsByDisplayName.set(key, value);
        for (const [key, value] of this.transactionSnapshot.displayNameRegistry) this.displayNameRegistry.set(key, value);
        for (const [key, value] of this.transactionSnapshot.sessionsByTokenHash) this.sessionsByTokenHash.set(key, value);
        for (const [key, value] of this.transactionSnapshot.externalLogins) this.externalLogins.set(key, value);
        for (const [key, value] of this.transactionSnapshot.privacySettings) this.privacySettings.set(key, value);
        for (const key of this.transactionSnapshot.follows) this.follows.add(key);
        for (const key of this.transactionSnapshot.blocks) this.blocks.add(key);
        for (const [key, value] of this.transactionSnapshot.ratingRows) this.ratingRows.set(key, value);
        this.reports.push(...this.transactionSnapshot.reports.map((report) => ({ ...report })));
        this.reportAudits.push(...this.transactionSnapshot.reportAudits.map((audit) => ({ ...audit })));
        this.transactionSnapshot = undefined;
      }
      return { rows: [] };
    }
    if (
      normalizedText === "SELECT 1" ||
      normalizedText.startsWith("CREATE TABLE") ||
      normalizedText.startsWith("ALTER TABLE") ||
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

    if (normalizedText.startsWith("SELECT payload FROM online_account_ratings WHERE account_id")) {
      const [accountId] = values as string[];
      const rating = this.ratingRows.get(accountId);
      return { rows: rating ? [{ payload: rating }] : [] };
    }

    if (normalizedText.startsWith("SELECT a.display_name, r.payload FROM online_account_ratings r INNER JOIN online_accounts a")) {
      const [limit] = values as number[];
      const rows = Array.from(this.ratingRows.entries())
        .flatMap(([accountId, rating]) => {
          const account = this.accounts.get(accountId);
          return account ? [{ display_name: account.display_name, payload: rating }] : [];
        })
        .sort((left, right) => {
          if (left.payload.rating !== right.payload.rating) return right.payload.rating - left.payload.rating;
          if (left.payload.games !== right.payload.games) return right.payload.games - left.payload.games;
          return String(left.display_name).localeCompare(String(right.display_name));
        })
        .slice(0, limit);
      return { rows };
    }

    if (normalizedText.startsWith("WITH visible_accounts AS")) {
      const [viewerAccountId, limit] = values as [string, number];
      const visibleAccountIds = new Set([viewerAccountId]);
      for (const key of this.follows) {
        const [followerAccountId, followedAccountId] = splitSocialKey(key);
        if (
          followerAccountId === viewerAccountId &&
          !this.blocks.has(socialKey(followedAccountId, viewerAccountId)) &&
          !this.blocks.has(socialKey(viewerAccountId, followedAccountId))
        ) {
          visibleAccountIds.add(followedAccountId);
        }
      }
      const rows = Array.from(visibleAccountIds)
        .flatMap((accountId) => {
          const account = this.accounts.get(accountId);
          const rating = this.ratingRows.get(accountId);
          return account && rating ? [{ display_name: account.display_name, payload: rating }] : [];
        })
        .sort((left, right) => {
          if (left.payload.rating !== right.payload.rating) return right.payload.rating - left.payload.rating;
          if (left.payload.games !== right.payload.games) return right.payload.games - left.payload.games;
          return String(left.display_name).localeCompare(String(right.display_name));
        })
        .slice(0, limit);
      return { rows };
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
        if (normalizedText.includes("ON CONFLICT")) {
          return { rows: [] };
        }
        const error = new Error("duplicate key value") as Error & { code: string; constraint: string };
        error.code = "23505";
        error.constraint = "online_account_display_names_pkey";
        throw error;
      }
      this.displayNameRegistry.set(displayNameNormalized, displayName);
      return { rows: normalizedText.includes("RETURNING display_name") ? [{ display_name: displayName }] : [] };
    }

    if (normalizedText.startsWith("INSERT INTO online_accounts")) {
      const [accountId, displayName, displayNameNormalized] = values as string[];
      const passwordHash = values.length === 5 ? values[3] as string : null;
      const createdAt = values.length === 5 ? values[4] as string : values[3] as string;
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
        password_hash: passwordHash,
        created_at: createdAt,
        updated_at: createdAt,
      };
      this.accounts.set(accountId, row);
      this.accountsByDisplayName.set(displayNameNormalized, accountId);
      return { rows: [row] };
    }

    if (normalizedText.startsWith("SELECT a.account_id, a.display_name, a.created_at, a.updated_at FROM online_account_external_logins")) {
      const [provider, providerSubject] = values as string[];
      const login = this.externalLogins.get(externalLoginKey(provider, providerSubject));
      const account = login ? this.accounts.get(login.account_id) : undefined;
      return { rows: account ? [account] : [] };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_external_logins")) {
      const [provider, providerSubject, accountId, createdAt] = values as string[];
      const key = externalLoginKey(provider, providerSubject);
      if (this.externalLogins.has(key)) {
        const error = new Error("duplicate key value") as Error & { code: string; constraint: string };
        error.code = "23505";
        error.constraint = "online_account_external_logins_pkey";
        throw error;
      }
      this.externalLogins.set(key, {
        provider,
        provider_subject: providerSubject,
        account_id: accountId,
        created_at: createdAt,
        last_used_at: createdAt,
      });
      return { rows: [] };
    }

    if (normalizedText.startsWith("UPDATE online_account_external_logins")) {
      const [provider, providerSubject, lastUsedAt] = values as string[];
      const login = this.externalLogins.get(externalLoginKey(provider, providerSubject));
      if (login) login.last_used_at = lastUsedAt;
      return { rows: [] };
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

    if (normalizedText.startsWith("SELECT max(last_used_at) AS last_seen_at FROM online_account_sessions")) {
      const [accountId] = values as string[];
      const lastSeenAt = Array.from(this.sessionsByTokenHash.values())
        .filter((session) => session.account_id === accountId)
        .map((session) => session.last_used_at)
        .sort()
        .at(-1) ?? null;
      return { rows: [{ last_seen_at: lastSeenAt }] };
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

    if (normalizedText.startsWith("SELECT account_id, display_name, created_at, updated_at, password_hash FROM online_accounts WHERE display_name_normalized")) {
      const [displayNameNormalized] = values as string[];
      const accountId = this.accountsByDisplayName.get(displayNameNormalized);
      const account = accountId ? this.accounts.get(accountId) : undefined;
      return { rows: account ? [account] : [] };
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

    if (normalizedText.startsWith("INSERT INTO online_account_reports")) {
      const [
        reportId,
        reporterAccountId,
        reporterDisplayName,
        targetAccountId,
        targetDisplayName,
        reason,
        details,
        createdAt,
      ] = values as string[];
      this.reports.push({
        report_id: reportId,
        reporter_account_id: reporterAccountId,
        reporter_display_name: reporterDisplayName,
        target_account_id: targetAccountId,
        target_display_name: targetDisplayName,
        reason,
        details,
        status: "open",
        moderator_note: "",
        created_at: createdAt,
        updated_at: createdAt,
        reviewed_at: null,
      });
      return { rows: [] };
    }

    if (normalizedText.startsWith("SELECT report_id, reporter_display_name, target_display_name, reason, details, moderator_note, status, created_at, updated_at, reviewed_at FROM online_account_reports WHERE status")) {
      const [status] = values as [string];
      const hasReasonFilter = normalizedText.includes("AND reason =");
      const hasReporterFilter = normalizedText.includes("LOWER(reporter_display_name)");
      const hasTargetFilter = normalizedText.includes("LOWER(target_display_name)");
      const hasCursorFilter = normalizedText.includes("created_at <");
      let index = 1;
      const reason = hasReasonFilter ? (values[index++] as string) : undefined;
      const reporterDisplayName = hasReporterFilter ? String(values[index++]).toLowerCase() : undefined;
      const targetDisplayName = hasTargetFilter ? String(values[index++]).toLowerCase() : undefined;
      const cursorCreatedAt = hasCursorFilter ? String(values[index++]) : undefined;
      const cursorReportId = hasCursorFilter ? String(values[index++]) : undefined;
      const limit = values[index] as number;
      const rows = this.reports
        .filter((report) => report.status === status)
        .filter((report) => !reason || report.reason === reason)
        .filter((report) => !reporterDisplayName || String(report.reporter_display_name).toLowerCase() === reporterDisplayName)
        .filter((report) => !targetDisplayName || String(report.target_display_name).toLowerCase() === targetDisplayName)
        .filter(
          (report) =>
            !cursorCreatedAt ||
            String(report.created_at) < cursorCreatedAt ||
            (String(report.created_at) === cursorCreatedAt && String(report.report_id) < String(cursorReportId))
        )
        .sort((left, right) => {
          if (left.created_at !== right.created_at) return String(right.created_at).localeCompare(String(left.created_at));
          return String(right.report_id).localeCompare(String(left.report_id));
        })
        .slice(0, limit)
        .map((report) => ({
          report_id: report.report_id,
          reporter_display_name: report.reporter_display_name,
          target_display_name: report.target_display_name,
          reason: report.reason,
          details: report.details,
          moderator_note: report.moderator_note,
          status: report.status,
          created_at: report.created_at,
          updated_at: report.updated_at,
          reviewed_at: report.reviewed_at,
        }));
      return { rows };
    }

    if (normalizedText.startsWith("SELECT report_id, reporter_display_name, target_display_name, reason, details, moderator_note, status, created_at, updated_at, reviewed_at FROM online_account_reports WHERE report_id")) {
      const [reportId] = values as string[];
      const report = this.reports.find((candidate) => candidate.report_id === reportId);
      return { rows: report ? [{ ...report }] : [] };
    }

    if (normalizedText.startsWith("SELECT report_id FROM online_account_reports WHERE report_id")) {
      const [reportId] = values as string[];
      const report = this.reports.find((candidate) => candidate.report_id === reportId);
      return { rows: report ? [{ report_id: report.report_id }] : [] };
    }

    if (normalizedText.startsWith("UPDATE online_account_reports SET status")) {
      const [reportId, status, moderatorNote, reviewedAt, updatedAt] = values as [string, string, string, string | null, string];
      const report = this.reports.find((candidate) => candidate.report_id === reportId);
      if (!report) return { rows: [] };
      report.status = status;
      report.moderator_note = moderatorNote;
      report.reviewed_at = reviewedAt;
      report.updated_at = updatedAt;
      return { rows: [{ ...report }] };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_report_audit")) {
      const [
        auditId,
        reportId,
        action,
        actor,
        previousStatus,
        nextStatus,
        note,
        createdAt,
      ] = values as string[];
      this.reportAudits.push({
        audit_id: auditId,
        report_id: reportId,
        action,
        actor,
        previous_status: previousStatus,
        next_status: nextStatus,
        note,
        created_at: createdAt,
      });
      return { rows: [] };
    }

    if (normalizedText.startsWith("SELECT audit_id, report_id, action, actor, previous_status, next_status, note, created_at FROM online_account_report_audit WHERE report_id")) {
      const [reportId, limit] = values as [string, number];
      const rows = this.reportAudits
        .filter((audit) => audit.report_id === reportId)
        .sort((left, right) => {
          if (left.created_at !== right.created_at) return String(right.created_at).localeCompare(String(left.created_at));
          return String(right.audit_id).localeCompare(String(left.audit_id));
        })
        .slice(0, limit)
        .map((audit) => ({ ...audit }));
      return { rows };
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
      for (const [key, login] of Array.from(this.externalLogins.entries())) {
        if (login.account_id === accountId) this.externalLogins.delete(key);
      }
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
      for (const report of this.reports) {
        if (report.reporter_account_id === accountId) report.reporter_account_id = null;
        if (report.target_account_id === accountId) report.target_account_id = null;
      }
      return { rows: [{ account_id: accountId }] };
    }

    throw new Error(`Unexpected query: ${normalizedText}`);
  }
}

function socialKey(left: string, right: string): string {
  return `${left}\u0000${right}`;
}

function externalLoginKey(provider: string, providerSubject: string): string {
  return `${provider}\u0000${providerSubject}`;
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
      passwordHash: TEST_PASSWORD_HASH,
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

  it("creates new sessions after verifying account passwords", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_liam",
      displayName: "Liam",
      passwordHash: await hashOnlineAccountPassword("correct-horse-battery-staple"),
      tokenHash: hashOnlineToken("first-device-token"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    await expect(
      store.createSessionWithPassword({
        sessionId: "account_session_wrong",
        displayName: "liam",
        password: "wrong-password",
        tokenHash: hashOnlineToken("wrong-device-token"),
        createdAt: "2026-06-03T12:05:00.000Z",
      })
    ).resolves.toBeNull();

    const signedIn = await store.createSessionWithPassword({
      sessionId: "account_session_second",
      displayName: "liam",
      password: "correct-horse-battery-staple",
      tokenHash: hashOnlineToken("second-device-token"),
      createdAt: "2026-06-03T12:06:00.000Z",
    });

    expect(signedIn).toMatchObject({
      sessionId: "account_session_second",
      account: {
        accountId: "account_liam",
        displayName: "Liam",
      },
    });
    await expect(store.resolveSessionToken("first-device-token", "2026-06-03T12:07:00.000Z")).resolves.toMatchObject({
      sessionId: "account_session_liam",
    });
    await expect(store.resolveSessionToken("second-device-token", "2026-06-03T12:08:00.000Z")).resolves.toMatchObject({
      sessionId: "account_session_second",
    });
  });

  it("creates and reuses sessions for Google external logins without enabling password sign-in", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    const first = await store.createSessionWithExternalLogin({
      provider: "google",
      providerSubject: "google-subject-123",
      accountId: "account_google",
      sessionId: "account_session_google_first",
      displayNameCandidates: ["Liam", "Google Player"],
      tokenHash: hashOnlineToken("google-token-one"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    expect(first).toMatchObject({
      sessionId: "account_session_google_first",
      account: {
        accountId: "account_google",
        displayName: "Liam",
      },
    });
    expect(queryable.externalLogins.get(externalLoginKey("google", "google-subject-123"))).toMatchObject({
      account_id: "account_google",
    });
    expect(queryable.accounts.get("account_google").password_hash).toBeNull();

    const second = await store.createSessionWithExternalLogin({
      provider: "google",
      providerSubject: "google-subject-123",
      accountId: "account_unused",
      sessionId: "account_session_google_second",
      displayNameCandidates: ["Different Name"],
      tokenHash: hashOnlineToken("google-token-two"),
      createdAt: "2026-06-03T12:05:00.000Z",
    });

    expect(second).toMatchObject({
      sessionId: "account_session_google_second",
      account: {
        accountId: "account_google",
        displayName: "Liam",
      },
    });
    await expect(
      store.createSessionWithPassword({
        sessionId: "account_session_password",
        displayName: "liam",
        password: "correct-horse-battery-staple",
        tokenHash: hashOnlineToken("password-token"),
        createdAt: "2026-06-03T12:06:00.000Z",
      })
    ).resolves.toBeNull();
    await expect(store.resolveSessionToken("google-token-one", "2026-06-03T12:07:00.000Z")).resolves.toMatchObject({
      sessionId: "account_session_google_first",
    });
    await expect(store.resolveSessionToken("google-token-two", "2026-06-03T12:08:00.000Z")).resolves.toMatchObject({
      sessionId: "account_session_google_second",
    });
    expect(queryable.advisoryLocks).toContain("google|google-subject-123");
  });

  it("falls through taken Google display-name candidates", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_liam",
      displayName: "Liam",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-liam"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    const google = await store.createSessionWithExternalLogin({
      provider: "google",
      providerSubject: "google-subject-456",
      accountId: "account_google",
      sessionId: "account_session_google",
      displayNameCandidates: ["liam", "Liam G123", "Google Player"],
      tokenHash: hashOnlineToken("google-token"),
      createdAt: "2026-06-03T12:05:00.000Z",
    });

    expect(google.account.displayName).toBe("Liam G123");
    expect(queryable.displayNameRegistry.get("liam g123")).toBe("Liam G123");
  });

  it("revokes account sessions without deleting the account", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);
    const token = "account-session-token";

    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_liam",
      displayName: "Liam",
      passwordHash: TEST_PASSWORD_HASH,
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
      passwordHash: TEST_PASSWORD_HASH,
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
      passwordHash: TEST_PASSWORD_HASH,
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
        passwordHash: TEST_PASSWORD_HASH,
        tokenHash: hashOnlineToken("token-new"),
        createdAt: "2026-06-03T12:11:00.000Z",
      })
    ).rejects.toBeInstanceOf(DuplicateOnlineAccountDisplayNameError);
  });

  it("deletes social state while retaining moderation snapshots and rating rows", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_liam",
      displayName: "Liam",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-liam"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });
    await store.createAccount({
      accountId: "account_samir",
      sessionId: "account_session_samir",
      displayName: "Samir",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-samir"),
      createdAt: "2026-06-03T12:01:00.000Z",
    });
    queryable.privacySettings.set("account_liam", {
      account_id: "account_liam",
      follow_policy: "nobody",
      presence_policy: "nobody",
      challenge_policy: "nobody",
      updated_at: "2026-06-03T12:02:00.000Z",
    });
    queryable.follows.add(socialKey("account_liam", "account_samir"));
    queryable.follows.add(socialKey("account_samir", "account_liam"));
    queryable.blocks.add(socialKey("account_liam", "account_samir"));
    queryable.ratingRows.set("account_liam", {
      ...createDefaultOnlineRating("2026-06-03T12:03:00.000Z"),
      rating: 1610,
      deviation: 90,
      games: 4,
    });

    await store.submitAccountReport({
      reportId: "report_liam_samir",
      reporterAccountId: "account_liam",
      targetDisplayName: "Samir",
      reason: "abuse",
      details: "Hostile challenge notes.",
      createdAt: "2026-06-03T12:04:00.000Z",
    });

    await expect(store.deleteAccount("account_liam")).resolves.toBe(true);

    expect(queryable.privacySettings.has("account_liam")).toBe(false);
    expect(queryable.follows).toEqual(new Set());
    expect(queryable.blocks).toEqual(new Set());
    expect(queryable.ratingRows.get("account_liam")).toMatchObject({
      rating: 1610,
      games: 4,
    });
    expect(queryable.reports).toEqual([
      expect.objectContaining({
        report_id: "report_liam_samir",
        reporter_account_id: null,
        reporter_display_name: "Liam",
        target_account_id: "account_samir",
        target_display_name: "Samir",
        details: "Hostile challenge notes.",
      }),
    ]);
    await expect(store.listAccountReports({ status: "open", limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        reportId: "report_liam_samir",
        reporterDisplayName: "Liam",
        targetDisplayName: "Samir",
        details: "Hostile challenge notes.",
      }),
    ]);

    await expect(store.deleteAccount("account_samir")).resolves.toBe(true);
    expect(queryable.reports).toEqual([
      expect.objectContaining({
        reporter_account_id: null,
        reporter_display_name: "Liam",
        target_account_id: null,
        target_display_name: "Samir",
      }),
    ]);
  });

  it("rejects duplicate display names case-insensitively", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    await store.createAccount({
      accountId: "account_one",
      sessionId: "account_session_one",
      displayName: "Liam",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-one"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    await expect(
      store.createAccount({
        accountId: "account_two",
        sessionId: "account_session_two",
        displayName: "liam",
        passwordHash: TEST_PASSWORD_HASH,
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
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash,
      createdAt: "2026-06-03T12:00:00.000Z",
    });

    await expect(
      store.createAccount({
        accountId: "account_two",
        sessionId: "account_session_two",
        displayName: "Samir",
        passwordHash: TEST_PASSWORD_HASH,
        tokenHash,
        createdAt: "2026-06-03T12:01:00.000Z",
      })
    ).rejects.toBeInstanceOf(DuplicateOnlineAccountSessionCredentialError);

    await expect(
      store.createAccount({
        accountId: "account_three",
        sessionId: "account_session_three",
        displayName: "Samir",
        passwordHash: TEST_PASSWORD_HASH,
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
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-liam"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });
    await store.createAccount({
      accountId: "account_samir",
      sessionId: "account_session_samir",
      displayName: "Samir",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-samir"),
      createdAt: "2026-06-03T12:01:00.000Z",
    });
    await store.createAccount({
      accountId: "account_dani",
      sessionId: "account_session_dani",
      displayName: "Dani",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-dani"),
      createdAt: "2026-06-03T12:02:00.000Z",
    });
    queryable.ratingRows.set("account_samir", createDefaultOnlineRating("2026-06-03T12:03:00.000Z"));

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
        rating: {
          schemaVersion: 1,
          rating: 1500,
          display: "1500?",
          provisional: true,
          games: 0,
          updatedAt: "2026-06-03T12:03:00.000Z",
        },
        presence: { visibility: "hidden", status: null },
        relationship: { self: false, following: true, followedBy: false, blocked: false },
      },
    });
    expect(JSON.stringify(follow)).not.toContain("account_samir");
    expect(JSON.stringify(follow)).not.toContain("glicko2-beta-v1");
    expect(JSON.stringify(follow)).not.toContain("deviation");
    expect(JSON.stringify(follow)).not.toContain("volatility");
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

    await expect(store.listFollowingProfiles("account_liam", "2026-06-03T12:04:00.000Z")).resolves.toEqual([
      expect.objectContaining({
        displayName: "Samir",
        rating: {
          schemaVersion: 1,
          rating: 1500,
          display: "1500?",
          provisional: true,
          games: 0,
          updatedAt: "2026-06-03T12:03:00.000Z",
        },
        presence: { visibility: "visible", status: "online" },
        relationship: { self: false, following: true, followedBy: true, blocked: false },
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
        relationship: { self: false, following: true, followedBy: true, blocked: false },
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
        relationship: { self: false, following: false, followedBy: false, blocked: true },
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
        relationship: { self: false, following: false, followedBy: false, blocked: false },
      },
    });
    await expect(store.getProfileForDisplayName("account_liam", "Samir")).resolves.toMatchObject({
      displayName: "Samir",
      relationship: { self: false, following: false, followedBy: false, blocked: false },
    });
    expect(queryable.advisoryLocks).toContain("account_liam|account_samir");
  });

  it("submits account reports without exposing account ids", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    await store.createAccount({
      accountId: "account_liam",
      sessionId: "account_session_liam",
      displayName: "Liam",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-liam"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });
    await store.createAccount({
      accountId: "account_samir",
      sessionId: "account_session_samir",
      displayName: "Samir",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-samir"),
      createdAt: "2026-06-03T12:01:00.000Z",
    });
    await store.createAccount({
      accountId: "account_ben",
      sessionId: "account_session_ben",
      displayName: "Ben",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-ben"),
      createdAt: "2026-06-03T12:02:00.000Z",
    });

    await expect(
      store.submitAccountReport({
        reportId: "report_liam_samir",
        reporterAccountId: "account_liam",
        targetDisplayName: "samir",
        reason: "abuse",
        details: "Repeated hostile chat in challenge notes.",
        createdAt: "2026-06-03T12:03:00.000Z",
      })
    ).resolves.toEqual({
      status: "ok",
      report: {
        schemaVersion: 1,
        targetDisplayName: "Samir",
        reason: "abuse",
        createdAt: "2026-06-03T12:03:00.000Z",
      },
    });
    expect(queryable.reports).toEqual([
      expect.objectContaining({
        report_id: "report_liam_samir",
        reporter_account_id: "account_liam",
        reporter_display_name: "Liam",
        target_account_id: "account_samir",
        target_display_name: "Samir",
        reason: "abuse",
        details: "Repeated hostile chat in challenge notes.",
        status: "open",
      }),
    ]);
    const secondReport = await store.submitAccountReport({
      reportId: "report_liam_ben",
      reporterAccountId: "account_liam",
      targetDisplayName: "Ben",
      reason: "spam",
      details: "",
      createdAt: "2026-06-03T12:04:00.000Z",
    });
    expect(secondReport.status).toBe("ok");
    expect(JSON.stringify(secondReport)).not.toContain("account_");
    await expect(store.listAccountReports({ status: "open", limit: 1 })).resolves.toEqual([
      {
        schemaVersion: 2,
        reportId: "report_liam_ben",
        reporterDisplayName: "Liam",
        targetDisplayName: "Ben",
        reason: "spam",
        details: "",
        status: "open",
        moderatorNote: "",
        createdAt: "2026-06-03T12:04:00.000Z",
        updatedAt: "2026-06-03T12:04:00.000Z",
        reviewedAt: null,
      },
    ]);
    await expect(store.listAccountReports({ status: "open", limit: 10 })).resolves.toMatchObject([
      { reportId: "report_liam_ben" },
      { reportId: "report_liam_samir" },
    ]);
    await expect(store.listAccountReports({ status: "open", reason: "spam", limit: 10 })).resolves.toMatchObject([
      { reportId: "report_liam_ben", reason: "spam" },
    ]);
    const queue = await store.listAccountReports({ status: "open", limit: 10 });
    expect(JSON.stringify(queue)).not.toContain("account_");
    expect(JSON.stringify(queue)).not.toContain("token-");

    const thirdReport = await store.submitAccountReport({
      reportId: "report_samir_ben",
      reporterAccountId: "account_samir",
      targetDisplayName: "Ben",
      reason: "cheating",
      details: "Suspicious repeated timeout pattern.",
      createdAt: "2026-06-03T12:04:30.000Z",
    });
    expect(thirdReport.status).toBe("ok");
    await expect(store.listAccountReports({ status: "open", reporterDisplayName: "samir", limit: 10 })).resolves.toMatchObject([
      { reportId: "report_samir_ben", reporterDisplayName: "Samir" },
    ]);
    await expect(store.listAccountReports({ status: "open", targetDisplayName: "ben", limit: 10 })).resolves.toMatchObject([
      { reportId: "report_samir_ben", targetDisplayName: "Ben" },
      { reportId: "report_liam_ben", targetDisplayName: "Ben" },
    ]);
    await expect(store.listAccountReports({ status: "open", targetDisplayName: "  Ben  ", limit: 10 })).resolves.toMatchObject([
      { reportId: "report_samir_ben", targetDisplayName: "Ben" },
      { reportId: "report_liam_ben", targetDisplayName: "Ben" },
    ]);
    await expect(
      store.listAccountReports({
        status: "open",
        cursor: {
          createdAt: "2026-06-03T12:04:30.000Z",
          reportId: "report_samir_ben",
        },
        limit: 10,
      })
    ).resolves.toMatchObject([
      { reportId: "report_liam_ben" },
      { reportId: "report_liam_samir" },
    ]);

    await expect(
      store.updateAccountReportStatus({
        reportId: "missing_report",
        auditId: "report_audit_missing",
        status: "resolved",
        note: "",
        updatedAt: "2026-06-03T12:05:00.000Z",
      })
    ).resolves.toEqual({ status: "not_found" });
    await expect(
      store.updateAccountReportStatus({
        reportId: "report_liam_samir",
        auditId: "report_audit_same",
        status: "open",
        note: "",
        updatedAt: "2026-06-03T12:05:00.000Z",
      })
    ).resolves.toEqual({ status: "unchanged" });
    await expect(
      store.updateAccountReportStatus({
        reportId: "report_liam_samir",
        auditId: "report_audit_resolved",
        status: "resolved",
        note: "Reviewed challenge evidence.",
        updatedAt: "2026-06-03T12:05:00.000Z",
      })
    ).resolves.toEqual({
      status: "ok",
      report: {
        schemaVersion: 2,
        reportId: "report_liam_samir",
        reporterDisplayName: "Liam",
        targetDisplayName: "Samir",
        reason: "abuse",
        details: "Repeated hostile chat in challenge notes.",
        status: "resolved",
        moderatorNote: "Reviewed challenge evidence.",
        createdAt: "2026-06-03T12:03:00.000Z",
        updatedAt: "2026-06-03T12:05:00.000Z",
        reviewedAt: "2026-06-03T12:05:00.000Z",
      },
      audit: {
        schemaVersion: 2,
        auditId: "report_audit_resolved",
        reportId: "report_liam_samir",
        action: "status_changed",
        actor: "admin",
        previousStatus: "open",
        nextStatus: "resolved",
        note: "Reviewed challenge evidence.",
        createdAt: "2026-06-03T12:05:00.000Z",
      },
    });
    await expect(store.listAccountReports({ status: "open", limit: 10 })).resolves.toMatchObject([
      { reportId: "report_samir_ben" },
      { reportId: "report_liam_ben" },
    ]);
    await expect(store.listAccountReports({ status: "resolved", limit: 10 })).resolves.toMatchObject([
      { reportId: "report_liam_samir", status: "resolved", moderatorNote: "Reviewed challenge evidence." },
    ]);
    await expect(store.listAccountReportAudits({ reportId: "missing_report", limit: 10 })).resolves.toEqual({
      status: "not_found",
    });
    await expect(store.listAccountReportAudits({ reportId: "report_liam_ben", limit: 10 })).resolves.toEqual({
      status: "ok",
      reportId: "report_liam_ben",
      audits: [],
    });
    await expect(store.listAccountReportAudits({ reportId: "report_liam_samir", limit: 1 })).resolves.toEqual({
      status: "ok",
      reportId: "report_liam_samir",
      audits: [
        {
          schemaVersion: 2,
          auditId: "report_audit_resolved",
          reportId: "report_liam_samir",
          action: "status_changed",
          actor: "admin",
          previousStatus: "open",
          nextStatus: "resolved",
          note: "Reviewed challenge evidence.",
          createdAt: "2026-06-03T12:05:00.000Z",
        },
      ],
    });
    expect(queryable.reportAudits).toEqual([
      expect.objectContaining({
        audit_id: "report_audit_resolved",
        report_id: "report_liam_samir",
        previous_status: "open",
        next_status: "resolved",
        note: "Reviewed challenge evidence.",
      }),
    ]);

    await expect(
      store.submitAccountReport({
        reportId: "report_self",
        reporterAccountId: "account_liam",
        targetDisplayName: "Liam",
        reason: "other",
        details: "",
        createdAt: "2026-06-03T12:05:00.000Z",
      })
    ).resolves.toEqual({ status: "self" });

    await store.blockAccount("account_samir", "Liam", "2026-06-03T12:06:00.000Z");
    await expect(
      store.submitAccountReport({
        reportId: "report_hidden",
        reporterAccountId: "account_liam",
        targetDisplayName: "Samir",
        reason: "cheating",
        details: "",
        createdAt: "2026-06-03T12:07:00.000Z",
      })
    ).resolves.toEqual({ status: "not_found" });
  });

  it("lists a sanitized public rating leaderboard without deleted accounts or engine internals", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    await store.createAccount({
      accountId: "account_ada",
      sessionId: "account_session_ada",
      displayName: "Ada",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-ada"),
      createdAt: "2026-06-03T12:00:00.000Z",
    });
    await store.createAccount({
      accountId: "account_ben",
      sessionId: "account_session_ben",
      displayName: "Ben",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-ben"),
      createdAt: "2026-06-03T12:01:00.000Z",
    });
    await store.createAccount({
      accountId: "account_cleo",
      sessionId: "account_session_cleo",
      displayName: "Cleo",
      passwordHash: TEST_PASSWORD_HASH,
      tokenHash: hashOnlineToken("token-cleo"),
      createdAt: "2026-06-03T12:02:00.000Z",
    });
    queryable.ratingRows.set("account_ada", {
      ...createDefaultOnlineRating("2026-06-03T12:03:00.000Z"),
      rating: 1520.4,
      deviation: 90,
      games: 8,
    });
    queryable.ratingRows.set("account_ben", {
      ...createDefaultOnlineRating("2026-06-03T12:04:00.000Z"),
      rating: 1611.8,
      deviation: 140,
      games: 3,
    });
    queryable.ratingRows.set("account_cleo", {
      ...createDefaultOnlineRating("2026-06-03T12:05:00.000Z"),
      rating: 1611.2,
      deviation: 80,
      games: 12,
    });
    queryable.ratingRows.set("account_deleted", {
      ...createDefaultOnlineRating("2026-06-03T12:06:00.000Z"),
      rating: 1900,
      deviation: 80,
      games: 2,
    });

    const leaderboard = await store.listRatingLeaderboard(2);

    expect(leaderboard).toEqual([
      {
        schemaVersion: 1,
        displayName: "Ben",
        rating: {
          schemaVersion: 1,
          rating: 1612,
          display: "1612?",
          provisional: true,
          games: 3,
          updatedAt: "2026-06-03T12:04:00.000Z",
        },
      },
      {
        schemaVersion: 1,
        displayName: "Cleo",
        rating: {
          schemaVersion: 1,
          rating: 1611,
          display: "1611",
          provisional: false,
          games: 12,
          updatedAt: "2026-06-03T12:05:00.000Z",
        },
      },
    ]);
    expect(JSON.stringify(leaderboard)).not.toContain("account_");
    expect(JSON.stringify(leaderboard)).not.toContain("glicko2-beta-v1");
    expect(JSON.stringify(leaderboard)).not.toContain("deviation");
    expect(JSON.stringify(leaderboard)).not.toContain("volatility");
  });

  it("lists a sanitized following rating leaderboard for the viewer and visible followed accounts", async () => {
    const queryable = new FakeAccountQueryable();
    const store = createStore(queryable);

    for (const [accountId, displayName, createdAt] of [
      ["account_liam", "Liam", "2026-06-03T12:00:00.000Z"],
      ["account_ada", "Ada", "2026-06-03T12:01:00.000Z"],
      ["account_ben", "Ben", "2026-06-03T12:02:00.000Z"],
      ["account_cleo", "Cleo", "2026-06-03T12:03:00.000Z"],
      ["account_dana", "Dana", "2026-06-03T12:04:00.000Z"],
    ] as const) {
      await store.createAccount({
        accountId,
        sessionId: `account_session_${accountId}`,
        displayName,
        passwordHash: TEST_PASSWORD_HASH,
        tokenHash: hashOnlineToken(`token-${accountId}`),
        createdAt,
      });
    }
    await store.followAccount("account_liam", "Ada", "2026-06-03T12:05:00.000Z");
    await store.followAccount("account_liam", "Ben", "2026-06-03T12:06:00.000Z");
    await store.followAccount("account_liam", "Dana", "2026-06-03T12:07:00.000Z");
    queryable.blocks.add(socialKey("account_ben", "account_liam"));
    queryable.ratingRows.set("account_liam", {
      ...createDefaultOnlineRating("2026-06-03T12:08:00.000Z"),
      rating: 1550,
      deviation: 90,
      games: 10,
    });
    queryable.ratingRows.set("account_ada", {
      ...createDefaultOnlineRating("2026-06-03T12:09:00.000Z"),
      rating: 1620,
      deviation: 80,
      games: 5,
    });
    queryable.ratingRows.set("account_ben", {
      ...createDefaultOnlineRating("2026-06-03T12:10:00.000Z"),
      rating: 1800,
      deviation: 80,
      games: 20,
    });
    queryable.ratingRows.set("account_cleo", {
      ...createDefaultOnlineRating("2026-06-03T12:11:00.000Z"),
      rating: 1900,
      deviation: 80,
      games: 30,
    });

    const leaderboard = await store.listFollowingRatingLeaderboard("account_liam", 10);

    expect(leaderboard).toEqual([
      {
        schemaVersion: 1,
        displayName: "Ada",
        rating: {
          schemaVersion: 1,
          rating: 1620,
          display: "1620",
          provisional: false,
          games: 5,
          updatedAt: "2026-06-03T12:09:00.000Z",
        },
      },
      {
        schemaVersion: 1,
        displayName: "Liam",
        rating: {
          schemaVersion: 1,
          rating: 1550,
          display: "1550",
          provisional: false,
          games: 10,
          updatedAt: "2026-06-03T12:08:00.000Z",
        },
      },
    ]);
    expect(JSON.stringify(leaderboard)).not.toContain("account_");
    expect(JSON.stringify(leaderboard)).not.toContain("glicko2-beta-v1");
    expect(JSON.stringify(leaderboard)).not.toContain("deviation");
    expect(JSON.stringify(leaderboard)).not.toContain("volatility");
    expect(JSON.stringify(leaderboard)).not.toContain("Ben");
    expect(JSON.stringify(leaderboard)).not.toContain("Cleo");
    expect(JSON.stringify(leaderboard)).not.toContain("Dana");
  });
});
