import type { ValidationResult } from "./validation";
import {
  formatOnlineRating,
  isOnlineRatingProvisional,
  type OnlineRating,
} from "./ratings";

export const ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION = 1;
export const ONLINE_RATING_LEADERBOARD_SCHEMA_VERSION = 1;
export const ONLINE_ACCOUNT_REPORT_SCHEMA_VERSION = 1;
export const ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION = 1;

export type OnlineRatingLeaderboardScope = "global" | "following";
export type OnlineAccountReportReason = "abuse" | "cheating" | "spam" | "impersonation" | "other";
export type OnlineAccountReportStatus = "open";
export type OnlineAccountFollowPolicy = "everyone" | "nobody";
export type OnlineAccountPresencePolicy = "followed" | "everyone" | "nobody";
export type OnlineAccountChallengePolicy = "followed" | "everyone" | "nobody";
export type OnlineAccountPresenceVisibility = "visible" | "hidden";
export type OnlineAccountPresenceStatus = "online" | "recent" | "away" | "offline";

export interface OnlineAccountPresence {
  visibility: OnlineAccountPresenceVisibility;
  status: OnlineAccountPresenceStatus | null;
}

export interface OnlineAccountPublicRating {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  rating: number;
  display: string;
  provisional: boolean;
  games: number;
  updatedAt: string | null;
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
  rating?: OnlineAccountPublicRating;
  presence: OnlineAccountPresence;
  relationship: {
    self: boolean;
    following: boolean;
    followedBy: boolean;
    blocked: boolean;
  };
}

export interface OnlineRatingLeaderboardEntry {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  displayName: string;
  rating: OnlineAccountPublicRating;
}

export interface OnlineRatingLeaderboardResponse {
  protocolVersion: number;
  schemaVersion: typeof ONLINE_RATING_LEADERBOARD_SCHEMA_VERSION;
  scope: OnlineRatingLeaderboardScope;
  entries: OnlineRatingLeaderboardEntry[];
}

export interface OnlineAccountReportInput {
  reason: OnlineAccountReportReason;
  details: string;
}

export interface OnlineAccountReportSummary {
  schemaVersion: typeof ONLINE_ACCOUNT_REPORT_SCHEMA_VERSION;
  targetDisplayName: string;
  reason: OnlineAccountReportReason;
  createdAt: string;
}

export interface OnlineAccountReportResponse {
  protocolVersion: number;
  report: OnlineAccountReportSummary;
}

export interface OnlineAccountModerationReport {
  schemaVersion: typeof ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION;
  reportId: string;
  reporterDisplayName: string;
  targetDisplayName: string;
  reason: OnlineAccountReportReason;
  details: string;
  status: OnlineAccountReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OnlineAccountModerationReportQueueResponse {
  protocolVersion: number;
  schemaVersion: typeof ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION;
  reports: OnlineAccountModerationReport[];
}

export function createOnlineAccountPublicRating(rating: OnlineRating): OnlineAccountPublicRating {
  return {
    schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
    rating: Math.round(rating.rating),
    display: formatOnlineRating(rating),
    provisional: isOnlineRatingProvisional(rating),
    games: rating.games,
    updatedAt: rating.updatedAt,
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
const REPORT_REASONS = new Set<OnlineAccountReportReason>([
  "abuse",
  "cheating",
  "spam",
  "impersonation",
  "other",
]);
export const ONLINE_ACCOUNT_REPORT_DETAILS_MAX_LENGTH = 1_000;

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

export function parseOnlineAccountReportInput(value: unknown): ValidationResult<OnlineAccountReportInput> {
  if (!isRecord(value)) return bad("Account report must be an object.");

  if (typeof value.reason !== "string" || !REPORT_REASONS.has(value.reason as OnlineAccountReportReason)) {
    return bad("Report reason is invalid.");
  }

  const details = value.details === undefined ? "" : value.details;
  if (typeof details !== "string") {
    return bad("Report details are invalid.");
  }
  const normalizedDetails = details.replace(/\s+/g, " ").trim();
  if (normalizedDetails.length > ONLINE_ACCOUNT_REPORT_DETAILS_MAX_LENGTH) {
    return bad("Report details are too long.");
  }

  for (const key of Object.keys(value)) {
    if (key !== "reason" && key !== "details") {
      return bad("Account report contains an unsupported field.");
    }
  }

  return {
    ok: true,
    value: {
      reason: value.reason as OnlineAccountReportReason,
      details: normalizedDetails,
    },
  };
}
