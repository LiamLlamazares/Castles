import type { OnlineRegisteredIdentity } from "./identity";
import { validateOnlineIdentity } from "./identity";
import { stringContainsDurableSecret } from "./secretSafety";
import type { ValidationResult } from "./validation";

export const ONLINE_ACCOUNT_SCHEMA_VERSION = 1;
export const ONLINE_ACCOUNT_DISPLAY_NAME_MIN_LENGTH = 2;
export const ONLINE_ACCOUNT_DISPLAY_NAME_MAX_LENGTH = 32;

export interface OnlineAccount {
  schemaVersion: typeof ONLINE_ACCOUNT_SCHEMA_VERSION;
  accountId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  identity: OnlineRegisteredIdentity;
}

export interface OnlineAccountSessionPublic {
  sessionId: string;
  token: string;
}

export interface OnlineAccountCreateResponse {
  protocolVersion: number;
  account: OnlineAccount;
  session: OnlineAccountSessionPublic;
}

export interface OnlineAccountMeResponse {
  protocolVersion: number;
  account: OnlineAccount;
}

function bad(message: string): ValidationResult<never> {
  return {
    ok: false,
    error: {
      code: "bad_request",
      message,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeVisibleWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOnlineAccountDisplayName(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return bad("Display name must be text.");
  }
  const displayName = normalizeVisibleWhitespace(value);
  if (
    displayName.length < ONLINE_ACCOUNT_DISPLAY_NAME_MIN_LENGTH ||
    displayName.length > ONLINE_ACCOUNT_DISPLAY_NAME_MAX_LENGTH
  ) {
    return bad(
      `Display name must be ${ONLINE_ACCOUNT_DISPLAY_NAME_MIN_LENGTH}-${ONLINE_ACCOUNT_DISPLAY_NAME_MAX_LENGTH} characters.`
    );
  }
  if (/[\u0000-\u001f\u007f]/.test(displayName)) {
    return bad("Display name must not contain control characters.");
  }
  if (stringContainsDurableSecret(displayName)) {
    return bad("Display name must not contain secrets.");
  }
  return { ok: true, value: displayName };
}

export function normalizeOnlineAccountDisplayNameKey(displayName: string): string {
  return normalizeVisibleWhitespace(displayName).toLowerCase();
}

export function onlineAccountIdentity(account: Pick<OnlineAccount, "accountId" | "displayName">): OnlineRegisteredIdentity {
  return {
    kind: "registered",
    id: account.accountId,
    displayName: account.displayName,
  };
}

export function createOnlineAccountRecord(input: {
  accountId: string;
  displayName: string;
  createdAt: string;
  updatedAt?: string;
}): OnlineAccount {
  const displayName = normalizeOnlineAccountDisplayName(input.displayName);
  if (!displayName.ok) {
    throw new Error(displayName.error.message);
  }
  const identity = onlineAccountIdentity({
    accountId: input.accountId,
    displayName: displayName.value,
  });
  const identityValidation = validateOnlineIdentity(identity, "account.identity");
  if (!identityValidation.ok || identityValidation.value.kind !== "registered") {
    throw new Error(identityValidation.ok ? "Account identity must be registered." : identityValidation.error.message);
  }
  return {
    schemaVersion: ONLINE_ACCOUNT_SCHEMA_VERSION,
    accountId: input.accountId,
    displayName: displayName.value,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    identity: identityValidation.value,
  };
}

export function validateOnlineAccount(value: unknown, label = "account"): ValidationResult<OnlineAccount> {
  if (!isRecord(value)) return bad(`${label} must be an object.`);
  if (value.schemaVersion !== ONLINE_ACCOUNT_SCHEMA_VERSION) {
    return bad(`${label}.schemaVersion is invalid.`);
  }
  if (typeof value.accountId !== "string" || value.accountId.length === 0 || value.accountId.length > 256) {
    return bad(`${label}.accountId is invalid.`);
  }
  if (stringContainsDurableSecret(value.accountId)) {
    return bad(`${label}.accountId must be public.`);
  }
  const displayName = normalizeOnlineAccountDisplayName(value.displayName);
  if (!displayName.ok) return displayName;
  if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) {
    return bad(`${label}.createdAt is invalid.`);
  }
  if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) {
    return bad(`${label}.updatedAt is invalid.`);
  }
  const identity = validateOnlineIdentity(value.identity, `${label}.identity`);
  if (!identity.ok || identity.value.kind !== "registered") {
    return bad(`${label}.identity must be registered.`);
  }
  if (identity.value.id !== value.accountId) {
    return bad(`${label}.identity.id must match accountId.`);
  }
  return {
    ok: true,
    value: {
      schemaVersion: ONLINE_ACCOUNT_SCHEMA_VERSION,
      accountId: value.accountId,
      displayName: displayName.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      identity: {
        kind: "registered",
        id: value.accountId,
        displayName: displayName.value,
      },
    },
  };
}
