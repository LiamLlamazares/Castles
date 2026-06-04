import type { ValidationResult } from "./validation";

export const ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION = 1;

export type OnlineAccountFollowPolicy = "everyone" | "nobody";
export type OnlineAccountPresencePolicy = "followed" | "everyone" | "nobody";
export type OnlineAccountChallengePolicy = "followed" | "everyone" | "nobody";
export type OnlineAccountPresenceVisibility = "visible" | "hidden";
export type OnlineAccountPresenceStatus = "online" | "recent" | "away" | "offline";

export interface OnlineAccountPresence {
  visibility: OnlineAccountPresenceVisibility;
  status: OnlineAccountPresenceStatus | null;
}

export interface OnlineAccountPrivacySettings {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  followPolicy: OnlineAccountFollowPolicy;
  presencePolicy: OnlineAccountPresencePolicy;
  challengePolicy: OnlineAccountChallengePolicy;
  updatedAt: string | null;
}

export interface OnlineAccountPrivacyPatch {
  followPolicy?: OnlineAccountFollowPolicy;
  presencePolicy?: OnlineAccountPresencePolicy;
  challengePolicy?: OnlineAccountChallengePolicy;
}

export interface OnlineAccountPublicProfile {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  displayName: string;
  presence: OnlineAccountPresence;
  relationship: {
    self: boolean;
    following: boolean;
    blocked: boolean;
  };
}

export interface OnlineAccountProfileResponse {
  protocolVersion: number;
  profile: OnlineAccountPublicProfile;
}

export interface OnlineAccountFollowingResponse {
  protocolVersion: number;
  following: OnlineAccountPublicProfile[];
}

export interface OnlineAccountPrivacyResponse {
  protocolVersion: number;
  privacy: OnlineAccountPrivacySettings;
}

export type OnlineAccountSocialActionStatus =
  | "ok"
  | "not_found"
  | "self"
  | "blocked"
  | "not_allowed";

export interface OnlineAccountSocialActionResult {
  status: OnlineAccountSocialActionStatus;
  profile?: OnlineAccountPublicProfile;
}

const FOLLOW_POLICIES = new Set<OnlineAccountFollowPolicy>(["everyone", "nobody"]);
const PRESENCE_POLICIES = new Set<OnlineAccountPresencePolicy>(["followed", "everyone", "nobody"]);
const CHALLENGE_POLICIES = new Set<OnlineAccountChallengePolicy>(["followed", "everyone", "nobody"]);

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

export function defaultOnlineAccountPrivacySettings(
  updatedAt: string | null = null
): OnlineAccountPrivacySettings {
  return {
    schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
    followPolicy: "everyone",
    presencePolicy: "followed",
    challengePolicy: "followed",
    updatedAt,
  };
}

export function parseOnlineAccountPrivacyPatch(value: unknown): ValidationResult<OnlineAccountPrivacyPatch> {
  if (!isRecord(value)) return bad("Privacy settings must be an object.");
  const patch: OnlineAccountPrivacyPatch = {};

  if (value.followPolicy !== undefined) {
    if (typeof value.followPolicy !== "string" || !FOLLOW_POLICIES.has(value.followPolicy as OnlineAccountFollowPolicy)) {
      return bad("followPolicy is invalid.");
    }
    patch.followPolicy = value.followPolicy as OnlineAccountFollowPolicy;
  }

  if (value.presencePolicy !== undefined) {
    if (
      typeof value.presencePolicy !== "string" ||
      !PRESENCE_POLICIES.has(value.presencePolicy as OnlineAccountPresencePolicy)
    ) {
      return bad("presencePolicy is invalid.");
    }
    patch.presencePolicy = value.presencePolicy as OnlineAccountPresencePolicy;
  }

  if (value.challengePolicy !== undefined) {
    if (
      typeof value.challengePolicy !== "string" ||
      !CHALLENGE_POLICIES.has(value.challengePolicy as OnlineAccountChallengePolicy)
    ) {
      return bad("challengePolicy is invalid.");
    }
    patch.challengePolicy = value.challengePolicy as OnlineAccountChallengePolicy;
  }

  for (const key of Object.keys(value)) {
    if (key !== "followPolicy" && key !== "presencePolicy" && key !== "challengePolicy") {
      return bad("Privacy settings contain an unsupported field.");
    }
  }

  return { ok: true, value: patch };
}
