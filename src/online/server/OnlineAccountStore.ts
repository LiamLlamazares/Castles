import {
  createOnlineAccountRecord,
  normalizeOnlineAccountDisplayName,
  normalizeOnlineAccountDisplayNameKey,
  type OnlineAccount,
} from "../accounts";
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

export interface OnlineAccountStore {
  createAccount(input: CreateOnlineAccountStoreInput): Promise<ResolvedOnlineAccountSession>;
  resolveSessionToken(token: string, usedAt: string): Promise<ResolvedOnlineAccountSession | null>;
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
  lastUsedAt: string;
}

export class MemoryOnlineAccountStore implements OnlineAccountStore {
  private readonly accounts = new Map<string, OnlineAccount>();
  private readonly displayNameKeys = new Map<string, string>();
  private readonly sessionsById = new Map<string, MemorySessionRecord>();
  private readonly sessionsByTokenHash = new Map<string, MemorySessionRecord>();

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

  async checkReady(): Promise<boolean> {
    return true;
  }
}
