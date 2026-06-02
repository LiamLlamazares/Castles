import { stringContainsDurableSecret } from "./secretSafety";
import type { ValidationResult } from "./validation";

export interface OnlineAnonymousIdentity {
  kind: "anonymous";
  id: string;
}

export interface OnlineSessionIdentity {
  kind: "session";
  /**
   * Public, non-secret session surrogate. Never store browser cookies,
   * bearer tokens, or auth session secrets in summary identities.
   */
  id: string;
}

export interface OnlineRegisteredIdentity {
  kind: "registered";
  id: string;
  displayName?: string;
}

export type OnlineIdentity =
  | OnlineAnonymousIdentity
  | OnlineSessionIdentity
  | OnlineRegisteredIdentity;

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

function isBoundedString(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

export function validateOnlineIdentity(
  value: unknown,
  label = "identity"
): ValidationResult<OnlineIdentity> {
  if (!isRecord(value)) return bad(`${label} must be an object.`);
  if (
    value.kind !== "anonymous" &&
    value.kind !== "session" &&
    value.kind !== "registered"
  ) {
    return bad(`${label}.kind is invalid.`);
  }
  if (!isBoundedString(value.id)) {
    return bad(`${label}.id is invalid.`);
  }
  if (stringContainsDurableSecret(value.id)) {
    return bad(`${label}.id must be a public non-secret surrogate.`);
  }
  if (
    value.kind === "registered" &&
    value.displayName !== undefined &&
    !isBoundedString(value.displayName, 64)
  ) {
    return bad(`${label}.displayName is invalid.`);
  }
  const identity: OnlineIdentity =
    value.kind === "registered"
      ? {
          kind: "registered",
          id: value.id,
          displayName:
            typeof value.displayName === "string"
              ? value.displayName
              : undefined,
        }
      : {
          kind: value.kind,
          id: value.id,
        };
  return { ok: true, value: identity };
}

export function isSameOnlineIdentity(a: OnlineIdentity, b: OnlineIdentity): boolean {
  return a.kind === b.kind && a.id === b.id;
}
