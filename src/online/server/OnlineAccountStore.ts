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
  defaultOnlineAccountPrivacySettings,
  type OnlineAccountModerationReport,
  type OnlineAccountPrivacyPatch,
  type OnlineAccountPrivacySettings,
  type OnlineAccountPresenceStatus,
  type OnlineAccountPublicProfile,
  type OnlineAccountReportInput,
  type OnlineAccountReportSummary,
  type OnlineAccountReportStatus,
  type OnlineRatingLeaderboardEntry,
  type OnlineAccountSocialActionResult,
} from "../social";
import { hashOnlineToken, isOnlineTokenCredentialHash, verifyOnlineToken } from "./onlineTokenCredentials";
import {
  isOnlineAccountPasswordCredentialHash,
  verifyOnlineAccountPassword,
} from "./onlinePasswordCredentials";

export interface CreateOnlineAccountStoreInput {
  accountId: string;
  sessionId: string;
  displayName: string;
  passwordHash: string;
  tokenHash: string;
  createdAt: string;
}

export interface CreateOnlineAccountPasswordSessionInput {
  sessionId: string;
  displayName: string;
  password: string;
  tokenHash: string;
  createdAt: string;
}

export type OnlineAccountExternalLoginProvider = "google";

export interface CreateOnlineAccountExternalSessionInput {
  provider: OnlineAccountExternalLoginProvider;
  providerSubject: string;
  accountId: string;
  sessionId: string;
  displayNameCandidates: string[];
  tokenHash: string;
  createdAt: string;
}

export interface ResolvedOnlineAccountSession {
  account: OnlineAccount;
  sessionId: string;
  lastUsedAt: string;
}

export interface OnlineAccountSessionListItem {
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
}

export type OnlineAccountChallengeTargetResult =
  | {
      status: "ok";
      account: OnlineAccount;
    }
  | {
      status: "not_found" | "self" | "blocked" | "not_allowed";
    };

export interface SubmitOnlineAccountReportStoreInput extends OnlineAccountReportInput {
  reportId: string;
  reporterAccountId: string;
  targetDisplayName: string;
  createdAt: string;
}

export type OnlineAccountReportSubmissionResult =
  | {
      status: "ok";
      report: OnlineAccountReportSummary;
    }
  | {
      status: "not_found" | "self";
    };

export interface ListOnlineAccountReportsOptions {
  status: OnlineAccountReportStatus;
  limit: number;
}

interface MemoryOnlineAccountReportRecord {
  reportId: string;
  reporterAccountId: string;
  reporterDisplayName: string;
  targetAccountId: string;
  targetDisplayName: string;
  reason: OnlineAccountReportSummary["reason"];
  details: string;
  status: OnlineAccountReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OnlineAccountStore {
  createAccount(input: CreateOnlineAccountStoreInput): Promise<ResolvedOnlineAccountSession>;
  createSessionWithPassword(input: CreateOnlineAccountPasswordSessionInput): Promise<ResolvedOnlineAccountSession | null>;
  createSessionWithExternalLogin(input: CreateOnlineAccountExternalSessionInput): Promise<ResolvedOnlineAccountSession>;
  resolveSessionToken(token: string, usedAt: string): Promise<ResolvedOnlineAccountSession | null>;
  revokeSessionToken(token: string): Promise<boolean>;
  listSessionsForAccount(accountId: string): Promise<OnlineAccountSessionListItem[]>;
  revokeSessionsForAccount(accountId: string): Promise<number>;
  deleteAccount(accountId: string): Promise<boolean>;
  listRatingLeaderboard(limit?: number): Promise<OnlineRatingLeaderboardEntry[]>;
  listFollowingRatingLeaderboard(accountId: string, limit?: number): Promise<OnlineRatingLeaderboardEntry[]>;
  getProfileForDisplayName(viewerAccountId: string, displayName: string, viewedAt?: string): Promise<OnlineAccountPublicProfile | null>;
  listFollowingProfiles(accountId: string, viewedAt?: string): Promise<OnlineAccountPublicProfile[]>;
  followAccount(followerAccountId: string, targetDisplayName: string, createdAt: string): Promise<OnlineAccountSocialActionResult>;
  unfollowAccount(followerAccountId: string, targetDisplayName: string, viewedAt?: string): Promise<OnlineAccountSocialActionResult>;
  blockAccount(blockerAccountId: string, targetDisplayName: string, createdAt: string): Promise<OnlineAccountSocialActionResult>;
  unblockAccount(blockerAccountId: string, targetDisplayName: string, viewedAt?: string): Promise<OnlineAccountSocialActionResult>;
  submitAccountReport(input: SubmitOnlineAccountReportStoreInput): Promise<OnlineAccountReportSubmissionResult>;
  listAccountReports(options: ListOnlineAccountReportsOptions): Promise<OnlineAccountModerationReport[]>;
  resolveChallengeTarget(challengerAccountId: string, targetDisplayName: string): Promise<OnlineAccountChallengeTargetResult>;
  getPrivacySettings(accountId: string): Promise<OnlineAccountPrivacySettings>;
  updatePrivacySettings(accountId: string, patch: OnlineAccountPrivacyPatch, updatedAt: string): Promise<OnlineAccountPrivacySettings | null>;
  checkReady?(): Promise<boolean> | boolean;
  close?(): Promise<void> | void;
}

export class DuplicateOnlineAccountDisplayNameError extends Error {
  constructor(displayName: string) {
    super(`Display name is already taken: ${displayName}`);
  }
}

export class DuplicateOnlineAccountIdError extends Error {
  constructor(accountId: string) {
    super(`Account id is already taken: ${accountId}`);
  }
}

export class DuplicateOnlineAccountSessionCredentialError extends Error {
  constructor() {
    super("Account session credential is already in use.");
  }
}

interface MemorySessionRecord {
  sessionId: string;
  accountId: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt: string;
}

interface MemoryExternalLoginRecord {
  provider: OnlineAccountExternalLoginProvider;
  providerSubject: string;
  accountId: string;
  createdAt: string;
  lastUsedAt: string;
}

export class MemoryOnlineAccountStore implements OnlineAccountStore {
  private readonly accounts = new Map<string, OnlineAccount>();
  private readonly displayNameKeys = new Map<string, string>();
  private readonly passwordHashesByAccountId = new Map<string, string>();
  private readonly sessionsById = new Map<string, MemorySessionRecord>();
  private readonly sessionsByTokenHash = new Map<string, MemorySessionRecord>();
  private readonly externalLoginsByKey = new Map<string, MemoryExternalLoginRecord>();
  private readonly following = new Map<string, Set<string>>();
  private readonly blocks = new Map<string, Set<string>>();
  private readonly privacySettings = new Map<string, OnlineAccountPrivacySettings>();
  private readonly reports: MemoryOnlineAccountReportRecord[] = [];

  async createAccount(input: CreateOnlineAccountStoreInput): Promise<ResolvedOnlineAccountSession> {
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
    if (this.accounts.has(input.accountId)) {
      throw new DuplicateOnlineAccountIdError(input.accountId);
    }
    const displayNameKey = normalizeOnlineAccountDisplayNameKey(displayName.value);
    if (this.displayNameKeys.has(displayNameKey)) {
      throw new DuplicateOnlineAccountDisplayNameError(displayName.value);
    }
    if (this.sessionsById.has(input.sessionId) || this.sessionsByTokenHash.has(input.tokenHash)) {
      throw new DuplicateOnlineAccountSessionCredentialError();
    }

    const account = createOnlineAccountRecord({
      accountId: input.accountId,
      displayName: displayName.value,
      createdAt: input.createdAt,
    });
    const session: MemorySessionRecord = {
      sessionId: input.sessionId,
      accountId: input.accountId,
      tokenHash: input.tokenHash,
      createdAt: input.createdAt,
      lastUsedAt: input.createdAt,
    };
    this.accounts.set(account.accountId, account);
    this.displayNameKeys.set(displayNameKey, account.accountId);
    this.passwordHashesByAccountId.set(account.accountId, input.passwordHash);
    this.sessionsById.set(input.sessionId, session);
    this.sessionsByTokenHash.set(input.tokenHash, session);

    return {
      account,
      sessionId: input.sessionId,
      lastUsedAt: input.createdAt,
    };
  }

  async createSessionWithPassword(
    input: CreateOnlineAccountPasswordSessionInput
  ): Promise<ResolvedOnlineAccountSession | null> {
    const displayName = normalizeOnlineAccountDisplayName(input.displayName);
    if (!displayName.ok) return null;
    const password = normalizeOnlineAccountPassword(input.password);
    if (!password.ok) return null;
    if (!isOnlineTokenCredentialHash(input.tokenHash)) {
      throw new Error("Account session token hash is invalid.");
    }
    const accountId = this.displayNameKeys.get(normalizeOnlineAccountDisplayNameKey(displayName.value));
    if (!accountId) return null;
    const account = this.accounts.get(accountId);
    const passwordHash = this.passwordHashesByAccountId.get(accountId);
    if (!account || !passwordHash) return null;
    if (!(await verifyOnlineAccountPassword(password.value, passwordHash))) return null;
    if (this.sessionsById.has(input.sessionId) || this.sessionsByTokenHash.has(input.tokenHash)) {
      throw new DuplicateOnlineAccountSessionCredentialError();
    }

    const session: MemorySessionRecord = {
      sessionId: input.sessionId,
      accountId,
      tokenHash: input.tokenHash,
      createdAt: input.createdAt,
      lastUsedAt: input.createdAt,
    };
    this.sessionsById.set(input.sessionId, session);
    this.sessionsByTokenHash.set(input.tokenHash, session);
    return {
      account,
      sessionId: input.sessionId,
      lastUsedAt: input.createdAt,
    };
  }

  async createSessionWithExternalLogin(
    input: CreateOnlineAccountExternalSessionInput
  ): Promise<ResolvedOnlineAccountSession> {
    this.validateExternalLoginInput(input);
    const externalLoginKey = this.externalLoginKey(input.provider, input.providerSubject);
    const existingLogin = this.externalLoginsByKey.get(externalLoginKey);
    const existingAccount = existingLogin ? this.accounts.get(existingLogin.accountId) : null;
    if (existingLogin && existingAccount) {
      return this.createSessionForAccount(existingAccount, input.sessionId, input.tokenHash, input.createdAt, () => {
        existingLogin.lastUsedAt = input.createdAt;
      });
    }

    if (this.accounts.has(input.accountId)) {
      throw new DuplicateOnlineAccountIdError(input.accountId);
    }
    const displayName = this.firstAvailableDisplayName(input.displayNameCandidates);
    if (!displayName) {
      throw new DuplicateOnlineAccountDisplayNameError(input.displayNameCandidates[0] ?? "Google account");
    }
    if (this.sessionsById.has(input.sessionId) || this.sessionsByTokenHash.has(input.tokenHash)) {
      throw new DuplicateOnlineAccountSessionCredentialError();
    }

    const account = createOnlineAccountRecord({
      accountId: input.accountId,
      displayName,
      createdAt: input.createdAt,
    });
    const session: MemorySessionRecord = {
      sessionId: input.sessionId,
      accountId: input.accountId,
      tokenHash: input.tokenHash,
      createdAt: input.createdAt,
      lastUsedAt: input.createdAt,
    };
    this.accounts.set(account.accountId, account);
    this.displayNameKeys.set(normalizeOnlineAccountDisplayNameKey(displayName), account.accountId);
    this.sessionsById.set(input.sessionId, session);
    this.sessionsByTokenHash.set(input.tokenHash, session);
    this.externalLoginsByKey.set(externalLoginKey, {
      provider: input.provider,
      providerSubject: input.providerSubject,
      accountId: input.accountId,
      createdAt: input.createdAt,
      lastUsedAt: input.createdAt,
    });
    return {
      account,
      sessionId: input.sessionId,
      lastUsedAt: input.createdAt,
    };
  }

  async resolveSessionToken(token: string, usedAt: string): Promise<ResolvedOnlineAccountSession | null> {
    if (typeof token !== "string" || token.length === 0) return null;
    const tokenHash = hashOnlineToken(token);
    const session = this.sessionsByTokenHash.get(tokenHash);
    if (!session || !verifyOnlineToken(token, session.tokenHash)) return null;
    const account = this.accounts.get(session.accountId);
    if (!account) return null;
    session.lastUsedAt = usedAt;
    return {
      account,
      sessionId: session.sessionId,
      lastUsedAt: usedAt,
    };
  }

  async revokeSessionToken(token: string): Promise<boolean> {
    if (typeof token !== "string" || token.length === 0) return false;
    const tokenHash = hashOnlineToken(token);
    const session = this.sessionsByTokenHash.get(tokenHash);
    if (!session || !verifyOnlineToken(token, session.tokenHash)) return false;
    this.sessionsByTokenHash.delete(session.tokenHash);
    this.sessionsById.delete(session.sessionId);
    return true;
  }

  async listSessionsForAccount(accountId: string): Promise<OnlineAccountSessionListItem[]> {
    return Array.from(this.sessionsById.values())
      .filter((session) => session.accountId === accountId)
      .sort((left, right) => {
        if (left.lastUsedAt !== right.lastUsedAt) return right.lastUsedAt.localeCompare(left.lastUsedAt);
        if (left.createdAt !== right.createdAt) return right.createdAt.localeCompare(left.createdAt);
        return left.sessionId.localeCompare(right.sessionId);
      })
      .map((session) => ({
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
      }));
  }

  async revokeSessionsForAccount(accountId: string): Promise<number> {
    const sessions = Array.from(this.sessionsById.values()).filter(
      (session) => session.accountId === accountId
    );
    for (const session of sessions) {
      this.sessionsById.delete(session.sessionId);
      this.sessionsByTokenHash.delete(session.tokenHash);
    }
    return sessions.length;
  }

  async deleteAccount(accountId: string): Promise<boolean> {
    const account = this.accounts.get(accountId);
    if (!account) return false;
    this.accounts.delete(accountId);
    await this.revokeSessionsForAccount(accountId);
    this.passwordHashesByAccountId.delete(accountId);
    for (const [key, login] of Array.from(this.externalLoginsByKey.entries())) {
      if (login.accountId === accountId) this.externalLoginsByKey.delete(key);
    }
    this.privacySettings.delete(accountId);
    this.following.delete(accountId);
    this.blocks.delete(accountId);
    for (const followed of this.following.values()) followed.delete(accountId);
    for (const blocked of this.blocks.values()) blocked.delete(accountId);
    return true;
  }

  async listRatingLeaderboard(_limit = 20): Promise<OnlineRatingLeaderboardEntry[]> {
    return [];
  }

  async listFollowingRatingLeaderboard(_accountId: string, _limit = 20): Promise<OnlineRatingLeaderboardEntry[]> {
    return [];
  }

  async getProfileForDisplayName(
    viewerAccountId: string,
    displayName: string,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountPublicProfile | null> {
    const target = this.getAccountByDisplayName(displayName);
    if (!target) return null;
    if (target.accountId !== viewerAccountId && this.hasBlock(target.accountId, viewerAccountId)) {
      return null;
    }
    return this.createProfile(viewerAccountId, target, viewedAt);
  }

  async listFollowingProfiles(accountId: string, viewedAt = new Date().toISOString()): Promise<OnlineAccountPublicProfile[]> {
    const followedAccountIds = Array.from(this.following.get(accountId) ?? []);
    const profiles = await Promise.all(followedAccountIds
      .map((targetAccountId) => this.accounts.get(targetAccountId))
      .filter((account): account is OnlineAccount => !!account)
      .filter((account) => !this.hasBlock(account.accountId, accountId) && !this.hasBlock(accountId, account.accountId))
      .map((account) => this.createProfile(accountId, account, viewedAt)));
    return profiles.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async followAccount(
    followerAccountId: string,
    targetDisplayName: string,
    _createdAt: string
  ): Promise<OnlineAccountSocialActionResult> {
    const target = this.getAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === followerAccountId) return { status: "self" };
    if (this.hasBlock(followerAccountId, target.accountId) || this.hasBlock(target.accountId, followerAccountId)) {
      return { status: "blocked" };
    }
    if (this.hasFollow(followerAccountId, target.accountId)) {
      return {
        status: "ok",
        profile: await this.createProfile(followerAccountId, target, _createdAt),
      };
    }
    const privacy = await this.getPrivacySettings(target.accountId);
    if (privacy.followPolicy === "nobody") return { status: "not_allowed" };
    this.getOrCreateSet(this.following, followerAccountId).add(target.accountId);
    return {
      status: "ok",
      profile: await this.createProfile(followerAccountId, target, _createdAt),
    };
  }

  async unfollowAccount(
    followerAccountId: string,
    targetDisplayName: string,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountSocialActionResult> {
    const target = this.getAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === followerAccountId) return { status: "self" };
    this.following.get(followerAccountId)?.delete(target.accountId);
    if (this.hasBlock(target.accountId, followerAccountId)) return { status: "blocked" };
    return { status: "ok", profile: await this.createProfile(followerAccountId, target, viewedAt) };
  }

  async blockAccount(
    blockerAccountId: string,
    targetDisplayName: string,
    _createdAt: string
  ): Promise<OnlineAccountSocialActionResult> {
    const target = this.getAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === blockerAccountId) return { status: "self" };
    this.getOrCreateSet(this.blocks, blockerAccountId).add(target.accountId);
    this.following.get(blockerAccountId)?.delete(target.accountId);
    this.following.get(target.accountId)?.delete(blockerAccountId);
    if (this.hasBlock(target.accountId, blockerAccountId)) return { status: "blocked" };
    return {
      status: "ok",
      profile: await this.createProfile(blockerAccountId, target, _createdAt),
    };
  }

  async unblockAccount(
    blockerAccountId: string,
    targetDisplayName: string,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountSocialActionResult> {
    const target = this.getAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === blockerAccountId) return { status: "self" };
    this.blocks.get(blockerAccountId)?.delete(target.accountId);
    if (this.hasBlock(target.accountId, blockerAccountId)) return { status: "blocked" };
    return { status: "ok", profile: await this.createProfile(blockerAccountId, target, viewedAt) };
  }

  async submitAccountReport(
    input: SubmitOnlineAccountReportStoreInput
  ): Promise<OnlineAccountReportSubmissionResult> {
    const reporter = this.accounts.get(input.reporterAccountId);
    const target = this.getAccountByDisplayName(input.targetDisplayName);
    if (!reporter || !target) return { status: "not_found" };
    if (target.accountId === reporter.accountId) return { status: "self" };
    if (this.hasBlock(target.accountId, reporter.accountId)) return { status: "not_found" };
    this.reports.push({
      reportId: input.reportId,
      reporterAccountId: reporter.accountId,
      reporterDisplayName: reporter.displayName,
      targetAccountId: target.accountId,
      targetDisplayName: target.displayName,
      reason: input.reason,
      details: input.details,
      status: "open",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
    return {
      status: "ok",
      report: {
        schemaVersion: ONLINE_ACCOUNT_REPORT_SCHEMA_VERSION,
        targetDisplayName: target.displayName,
        reason: input.reason,
        createdAt: input.createdAt,
      },
    };
  }

  async listAccountReports(options: ListOnlineAccountReportsOptions): Promise<OnlineAccountModerationReport[]> {
    return this.reports
      .filter((report) => report.status === options.status)
      .sort((left, right) => {
        const createdOrder = right.createdAt.localeCompare(left.createdAt);
        return createdOrder !== 0 ? createdOrder : right.reportId.localeCompare(left.reportId);
      })
      .slice(0, options.limit)
      .map((report) => this.moderationReportFromRecord(report));
  }

  async resolveChallengeTarget(
    challengerAccountId: string,
    targetDisplayName: string
  ): Promise<OnlineAccountChallengeTargetResult> {
    const target = this.getAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === challengerAccountId) return { status: "self" };
    if (this.hasBlock(challengerAccountId, target.accountId) || this.hasBlock(target.accountId, challengerAccountId)) {
      return { status: "blocked" };
    }
    const privacy = await this.getPrivacySettings(target.accountId);
    if (privacy.challengePolicy === "nobody") return { status: "not_allowed" };
    if (privacy.challengePolicy === "followed" && !this.hasFollow(target.accountId, challengerAccountId)) {
      return { status: "not_allowed" };
    }
    return { status: "ok", account: target };
  }

  async getPrivacySettings(accountId: string): Promise<OnlineAccountPrivacySettings> {
    return this.privacySettings.get(accountId) ?? defaultOnlineAccountPrivacySettings();
  }

  async updatePrivacySettings(
    accountId: string,
    patch: OnlineAccountPrivacyPatch,
    updatedAt: string
  ): Promise<OnlineAccountPrivacySettings | null> {
    if (!this.accounts.has(accountId)) return null;
    const current = await this.getPrivacySettings(accountId);
    const updated: OnlineAccountPrivacySettings = {
      ...current,
      ...patch,
      updatedAt,
    };
    this.privacySettings.set(accountId, updated);
    return updated;
  }

  async checkReady(): Promise<boolean> {
    return true;
  }

  private getAccountByDisplayName(displayName: string): OnlineAccount | null {
    const normalized = normalizeOnlineAccountDisplayName(displayName);
    if (!normalized.ok) return null;
    const accountId = this.displayNameKeys.get(normalizeOnlineAccountDisplayNameKey(normalized.value));
    return accountId ? this.accounts.get(accountId) ?? null : null;
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

  private firstAvailableDisplayName(candidates: string[]): string | null {
    for (const candidate of candidates) {
      const displayName = normalizeOnlineAccountDisplayName(candidate);
      if (!displayName.ok) continue;
      const key = normalizeOnlineAccountDisplayNameKey(displayName.value);
      if (!this.displayNameKeys.has(key)) return displayName.value;
    }
    return null;
  }

  private createSessionForAccount(
    account: OnlineAccount,
    sessionId: string,
    tokenHash: string,
    createdAt: string,
    onCreated?: () => void
  ): ResolvedOnlineAccountSession {
    if (!isOnlineTokenCredentialHash(tokenHash)) {
      throw new Error("Account session token hash is invalid.");
    }
    if (this.sessionsById.has(sessionId) || this.sessionsByTokenHash.has(tokenHash)) {
      throw new DuplicateOnlineAccountSessionCredentialError();
    }
    const session: MemorySessionRecord = {
      sessionId,
      accountId: account.accountId,
      tokenHash,
      createdAt,
      lastUsedAt: createdAt,
    };
    this.sessionsById.set(sessionId, session);
    this.sessionsByTokenHash.set(tokenHash, session);
    onCreated?.();
    return {
      account,
      sessionId,
      lastUsedAt: createdAt,
    };
  }

  private externalLoginKey(provider: OnlineAccountExternalLoginProvider, providerSubject: string): string {
    return `${provider}\u0000${providerSubject}`;
  }

  private moderationReportFromRecord(report: MemoryOnlineAccountReportRecord): OnlineAccountModerationReport {
    return {
      schemaVersion: ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION,
      reportId: report.reportId,
      reporterDisplayName: report.reporterDisplayName,
      targetDisplayName: report.targetDisplayName,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private async createProfile(
    viewerAccountId: string,
    target: OnlineAccount,
    viewedAt = new Date().toISOString()
  ): Promise<OnlineAccountPublicProfile> {
    return {
      schemaVersion: 1,
      displayName: target.displayName,
      presence: await this.createPresence(viewerAccountId, target, viewedAt),
      relationship: {
        self: target.accountId === viewerAccountId,
        following: this.hasFollow(viewerAccountId, target.accountId),
        followedBy: target.accountId !== viewerAccountId && this.hasFollow(target.accountId, viewerAccountId),
        blocked: this.hasBlock(viewerAccountId, target.accountId),
      },
    };
  }

  private async createPresence(
    viewerAccountId: string,
    target: OnlineAccount,
    viewedAt: string
  ): Promise<OnlineAccountPublicProfile["presence"]> {
    const isSelf = viewerAccountId === target.accountId;
    const blockedEitherWay =
      this.hasBlock(viewerAccountId, target.accountId) || this.hasBlock(target.accountId, viewerAccountId);
    const privacy = await this.getPrivacySettings(target.accountId);
    const canView =
      !blockedEitherWay &&
      (isSelf ||
        privacy.presencePolicy === "everyone" ||
        (privacy.presencePolicy === "followed" && this.hasFollow(target.accountId, viewerAccountId)));
    if (!canView) {
      return { visibility: "hidden", status: null };
    }
    return {
      visibility: "visible",
      status: this.presenceStatusFromLatestSession(this.latestSessionUseForAccount(target.accountId), viewedAt),
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

  private latestSessionUseForAccount(accountId: string): string | null {
    let latest: string | null = null;
    for (const session of this.sessionsById.values()) {
      if (session.accountId !== accountId) continue;
      if (latest === null || session.lastUsedAt > latest) {
        latest = session.lastUsedAt;
      }
    }
    return latest;
  }

  private hasFollow(followerAccountId: string, followedAccountId: string): boolean {
    return this.following.get(followerAccountId)?.has(followedAccountId) ?? false;
  }

  private hasBlock(blockerAccountId: string, blockedAccountId: string): boolean {
    return this.blocks.get(blockerAccountId)?.has(blockedAccountId) ?? false;
  }

  private getOrCreateSet(map: Map<string, Set<string>>, key: string): Set<string> {
    const current = map.get(key);
    if (current) return current;
    const created = new Set<string>();
    map.set(key, created);
    return created;
  }
}
