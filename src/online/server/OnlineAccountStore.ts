import {
  createOnlineAccountRecord,
  normalizeOnlineAccountDisplayName,
  normalizeOnlineAccountDisplayNameKey,
  type OnlineAccount,
} from "../accounts";
import {
  defaultOnlineAccountPrivacySettings,
  type OnlineAccountPrivacyPatch,
  type OnlineAccountPrivacySettings,
  type OnlineAccountPublicProfile,
  type OnlineAccountSocialActionResult,
} from "../social";
import { hashOnlineToken, isOnlineTokenCredentialHash, verifyOnlineToken } from "./onlineTokenCredentials";

export interface CreateOnlineAccountStoreInput {
  accountId: string;
  sessionId: string;
  displayName: string;
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

export interface OnlineAccountStore {
  createAccount(input: CreateOnlineAccountStoreInput): Promise<ResolvedOnlineAccountSession>;
  resolveSessionToken(token: string, usedAt: string): Promise<ResolvedOnlineAccountSession | null>;
  revokeSessionToken(token: string): Promise<boolean>;
  listSessionsForAccount(accountId: string): Promise<OnlineAccountSessionListItem[]>;
  revokeSessionsForAccount(accountId: string): Promise<number>;
  deleteAccount(accountId: string): Promise<boolean>;
  getProfileForDisplayName(viewerAccountId: string, displayName: string): Promise<OnlineAccountPublicProfile | null>;
  listFollowingProfiles(accountId: string): Promise<OnlineAccountPublicProfile[]>;
  followAccount(followerAccountId: string, targetDisplayName: string, createdAt: string): Promise<OnlineAccountSocialActionResult>;
  unfollowAccount(followerAccountId: string, targetDisplayName: string): Promise<OnlineAccountSocialActionResult>;
  blockAccount(blockerAccountId: string, targetDisplayName: string, createdAt: string): Promise<OnlineAccountSocialActionResult>;
  unblockAccount(blockerAccountId: string, targetDisplayName: string): Promise<OnlineAccountSocialActionResult>;
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

export class MemoryOnlineAccountStore implements OnlineAccountStore {
  private readonly accounts = new Map<string, OnlineAccount>();
  private readonly displayNameKeys = new Map<string, string>();
  private readonly sessionsById = new Map<string, MemorySessionRecord>();
  private readonly sessionsByTokenHash = new Map<string, MemorySessionRecord>();
  private readonly following = new Map<string, Set<string>>();
  private readonly blocks = new Map<string, Set<string>>();
  private readonly privacySettings = new Map<string, OnlineAccountPrivacySettings>();

  async createAccount(input: CreateOnlineAccountStoreInput): Promise<ResolvedOnlineAccountSession> {
    const displayName = normalizeOnlineAccountDisplayName(input.displayName);
    if (!displayName.ok) {
      throw new Error(displayName.error.message);
    }
    if (!isOnlineTokenCredentialHash(input.tokenHash)) {
      throw new Error("Account session token hash is invalid.");
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
    this.sessionsById.set(input.sessionId, session);
    this.sessionsByTokenHash.set(input.tokenHash, session);

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
    this.privacySettings.delete(accountId);
    this.following.delete(accountId);
    this.blocks.delete(accountId);
    for (const followed of this.following.values()) followed.delete(accountId);
    for (const blocked of this.blocks.values()) blocked.delete(accountId);
    return true;
  }

  async getProfileForDisplayName(
    viewerAccountId: string,
    displayName: string
  ): Promise<OnlineAccountPublicProfile | null> {
    const target = this.getAccountByDisplayName(displayName);
    if (!target) return null;
    if (target.accountId !== viewerAccountId && this.hasBlock(target.accountId, viewerAccountId)) {
      return null;
    }
    return this.createProfile(viewerAccountId, target);
  }

  async listFollowingProfiles(accountId: string): Promise<OnlineAccountPublicProfile[]> {
    const followedAccountIds = Array.from(this.following.get(accountId) ?? []);
    return followedAccountIds
      .map((targetAccountId) => this.accounts.get(targetAccountId))
      .filter((account): account is OnlineAccount => !!account)
      .filter((account) => !this.hasBlock(account.accountId, accountId) && !this.hasBlock(accountId, account.accountId))
      .map((account) => this.createProfile(accountId, account))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
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
        profile: this.createProfile(followerAccountId, target),
      };
    }
    const privacy = await this.getPrivacySettings(target.accountId);
    if (privacy.followPolicy === "nobody") return { status: "not_allowed" };
    this.getOrCreateSet(this.following, followerAccountId).add(target.accountId);
    return {
      status: "ok",
      profile: this.createProfile(followerAccountId, target),
    };
  }

  async unfollowAccount(
    followerAccountId: string,
    targetDisplayName: string
  ): Promise<OnlineAccountSocialActionResult> {
    const target = this.getAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === followerAccountId) return { status: "self" };
    this.following.get(followerAccountId)?.delete(target.accountId);
    if (this.hasBlock(target.accountId, followerAccountId)) return { status: "blocked" };
    return { status: "ok", profile: this.createProfile(followerAccountId, target) };
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
      profile: this.createProfile(blockerAccountId, target),
    };
  }

  async unblockAccount(
    blockerAccountId: string,
    targetDisplayName: string
  ): Promise<OnlineAccountSocialActionResult> {
    const target = this.getAccountByDisplayName(targetDisplayName);
    if (!target) return { status: "not_found" };
    if (target.accountId === blockerAccountId) return { status: "self" };
    this.blocks.get(blockerAccountId)?.delete(target.accountId);
    if (this.hasBlock(target.accountId, blockerAccountId)) return { status: "blocked" };
    return { status: "ok", profile: this.createProfile(blockerAccountId, target) };
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

  private createProfile(viewerAccountId: string, target: OnlineAccount): OnlineAccountPublicProfile {
    return {
      schemaVersion: 1,
      displayName: target.displayName,
      relationship: {
        self: target.accountId === viewerAccountId,
        following: this.hasFollow(viewerAccountId, target.accountId),
        blocked: this.hasBlock(viewerAccountId, target.accountId),
      },
    };
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
