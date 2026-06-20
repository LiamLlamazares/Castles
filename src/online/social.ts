import type { ValidationResult } from "./validation";
import {
  formatOnlineRating,
  isOnlineRatingProvisional,
  type OnlineRating,
} from "./ratings";

export const ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION = 1;
export const ONLINE_RATING_LEADERBOARD_SCHEMA_VERSION = 1;
export const ONLINE_ACCOUNT_RATING_HISTORY_SCHEMA_VERSION = 1;
export const ONLINE_ACCOUNT_REPORT_SCHEMA_VERSION = 1;
export const ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION = 2;

export type OnlineRatingLeaderboardScope = "global" | "following";
export type OnlineAccountReportReason = "abuse" | "cheating" | "spam" | "impersonation" | "other";
export type OnlineAccountReportStatus = "open" | "resolved" | "dismissed";
export type OnlineAccountFollowPolicy = "everyone" | "nobody";
export type OnlineAccountPresencePolicy = "followed" | "everyone" | "nobody";
export type OnlineAccountChallengePolicy = "followed" | "everyone" | "nobody";
export type OnlineAccountPresenceVisibility = "visible" | "hidden";
export type OnlineAccountPresenceStatus = "online" | "recent" | "away" | "offline";
export type OnlineAccountAvatarPreset =
  | "monarch"
  | "dragon"
  | "knight"
  | "archer"
  | "eagle"
  | "trebuchet"
  | "swordsman"
  | "assassin";
export type OnlineAccountAvatarColor = "green" | "amber" | "blue" | "violet" | "red" | "slate";
export type OnlineAccountAvatarImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface OnlineAccountPresetAvatar {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  preset: OnlineAccountAvatarPreset;
  color: OnlineAccountAvatarColor;
}

export interface OnlineAccountUploadedAvatar {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  imageDataUrl: string;
}

export type OnlineAccountAvatar = OnlineAccountPresetAvatar | OnlineAccountUploadedAvatar;

export const ONLINE_ACCOUNT_AVATAR_IMAGE_DATA_URL_MAX_LENGTH = 96_000;
export const ONLINE_ACCOUNT_AVATAR_UPLOAD_SOURCE_MAX_BYTES = 2_000_000;

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

export interface OnlineAccountProfilePatch {
  avatar?: OnlineAccountAvatar;
}

export interface OnlineAccountPublicProfile {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  displayName: string;
  avatar: OnlineAccountAvatar;
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
  avatar: OnlineAccountAvatar;
  rating: OnlineAccountPublicRating;
}

export interface OnlineRatingLeaderboardResponse {
  protocolVersion: number;
  schemaVersion: typeof ONLINE_RATING_LEADERBOARD_SCHEMA_VERSION;
  scope: OnlineRatingLeaderboardScope;
  entries: OnlineRatingLeaderboardEntry[];
}

export interface OnlineAccountRatingHistoryEntry {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  gameId: string;
  side: "w" | "b";
  opponentDisplayName: string;
  result: "win" | "loss";
  reason: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  games: number;
  provisional: boolean;
  appliedAt: string;
}

export interface OnlineAccountRatingHistoryResponse {
  protocolVersion: number;
  schemaVersion: typeof ONLINE_ACCOUNT_RATING_HISTORY_SCHEMA_VERSION;
  entries: OnlineAccountRatingHistoryEntry[];
}

export interface OnlineAccountPublicRatingHistoryPoint {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  rating: number;
  display: string;
  provisional: boolean;
  games: number;
  appliedAt: string;
}

export interface OnlineAccountPublicRatingHistoryResponse {
  protocolVersion: number;
  schemaVersion: typeof ONLINE_ACCOUNT_RATING_HISTORY_SCHEMA_VERSION;
  points: OnlineAccountPublicRatingHistoryPoint[];
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
  moderatorNote: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

export interface OnlineAccountModerationAuditEntry {
  schemaVersion: typeof ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION;
  auditId: string;
  reportId: string;
  action: "status_changed";
  actor: "admin";
  previousStatus: OnlineAccountReportStatus;
  nextStatus: OnlineAccountReportStatus;
  note: string;
  createdAt: string;
}

export interface OnlineAccountModerationReportQueueResponse {
  protocolVersion: number;
  schemaVersion: typeof ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION;
  reports: OnlineAccountModerationReport[];
  nextCursor?: string;
}

export interface OnlineAccountModerationReportStatusResponse {
  protocolVersion: number;
  schemaVersion: typeof ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION;
  report: OnlineAccountModerationReport;
  audit: OnlineAccountModerationAuditEntry;
}

export interface OnlineAccountModerationAuditListResponse {
  protocolVersion: number;
  schemaVersion: typeof ONLINE_ACCOUNT_MODERATION_SCHEMA_VERSION;
  reportId: string;
  audits: OnlineAccountModerationAuditEntry[];
}

export interface OnlineAccountModerationReportStatusPatch {
  status: OnlineAccountReportStatus;
  note: string;
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

export interface OnlineAccountSearchProfile {
  schemaVersion: typeof ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION;
  displayName: string;
  avatar: OnlineAccountAvatar;
  rating?: OnlineAccountPublicRating;
}

export interface OnlineAccountSearchResponse {
  protocolVersion: number;
  profiles: OnlineAccountSearchProfile[];
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
const AVATAR_PRESETS = new Set<OnlineAccountAvatarPreset>([
  "monarch",
  "dragon",
  "knight",
  "archer",
  "eagle",
  "trebuchet",
  "swordsman",
  "assassin",
]);
const AVATAR_COLORS = new Set<OnlineAccountAvatarColor>(["green", "amber", "blue", "violet", "red", "slate"]);
export const ONLINE_ACCOUNT_AVATAR_IMAGE_MIME_TYPES = new Set<OnlineAccountAvatarImageMimeType>([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export const ONLINE_ACCOUNT_REPORT_REASONS = new Set<OnlineAccountReportReason>([
  "abuse",
  "cheating",
  "spam",
  "impersonation",
  "other",
]);
export const ONLINE_ACCOUNT_REPORT_STATUSES = new Set<OnlineAccountReportStatus>([
  "open",
  "resolved",
  "dismissed",
]);
export const ONLINE_ACCOUNT_REPORT_DETAILS_MAX_LENGTH = 1_000;
export const ONLINE_ACCOUNT_MODERATION_NOTE_MAX_LENGTH = 1_000;

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

export function defaultOnlineAccountAvatar(): OnlineAccountAvatar {
  return {
    schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
    preset: "monarch",
    color: "green",
  };
}

export function parseOnlineAccountAvatar(value: unknown): ValidationResult<OnlineAccountAvatar> {
  if (!isRecord(value)) return bad("Avatar must be an object.");
  if (value.schemaVersion !== ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION) {
    return bad("avatar.schemaVersion is invalid.");
  }

  if (typeof value.imageDataUrl === "string") {
    if (!isValidAvatarImageDataUrl(value.imageDataUrl)) {
      return bad("avatar.imageDataUrl is invalid.");
    }
    for (const key of Object.keys(value)) {
      if (key !== "schemaVersion" && key !== "imageDataUrl") {
        return bad("Avatar contains an unsupported field.");
      }
    }
    return {
      ok: true,
      value: {
        schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
        imageDataUrl: value.imageDataUrl,
      },
    };
  }

  if (typeof value.preset !== "string" || !AVATAR_PRESETS.has(value.preset as OnlineAccountAvatarPreset)) {
    return bad("avatar.preset is invalid.");
  }
  if (typeof value.color !== "string" || !AVATAR_COLORS.has(value.color as OnlineAccountAvatarColor)) {
    return bad("avatar.color is invalid.");
  }
  for (const key of Object.keys(value)) {
    if (key !== "schemaVersion" && key !== "preset" && key !== "color") {
      return bad("Avatar contains an unsupported field.");
    }
  }
  return {
    ok: true,
    value: {
      schemaVersion: ONLINE_ACCOUNT_SOCIAL_SCHEMA_VERSION,
      preset: value.preset as OnlineAccountAvatarPreset,
      color: value.color as OnlineAccountAvatarColor,
    },
  };
}

export function isValidAvatarImageDataUrl(value: string): boolean {
  if (value.length === 0 || value.length > ONLINE_ACCOUNT_AVATAR_IMAGE_DATA_URL_MAX_LENGTH) return false;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  if (!ONLINE_ACCOUNT_AVATAR_IMAGE_MIME_TYPES.has(match[1] as OnlineAccountAvatarImageMimeType)) return false;
  return match[2].length % 4 === 0;
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

export function parseOnlineAccountProfilePatch(value: unknown): ValidationResult<OnlineAccountProfilePatch> {
  if (!isRecord(value)) return bad("Profile settings must be an object.");
  const patch: OnlineAccountProfilePatch = {};

  if (value.avatar !== undefined) {
    const avatar = parseOnlineAccountAvatar(value.avatar);
    if (!avatar.ok) return avatar;
    patch.avatar = avatar.value;
  }

  for (const key of Object.keys(value)) {
    if (key !== "avatar") {
      return bad("Profile settings contain an unsupported field.");
    }
  }

  return { ok: true, value: patch };
}

export function parseOnlineAccountReportInput(value: unknown): ValidationResult<OnlineAccountReportInput> {
  if (!isRecord(value)) return bad("Account report must be an object.");

  if (typeof value.reason !== "string" || !ONLINE_ACCOUNT_REPORT_REASONS.has(value.reason as OnlineAccountReportReason)) {
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

export function parseOnlineAccountModerationReportStatusPatch(
  value: unknown
): ValidationResult<OnlineAccountModerationReportStatusPatch> {
  if (!isRecord(value)) return bad("Moderation report status update must be an object.");

  if (typeof value.status !== "string" || !ONLINE_ACCOUNT_REPORT_STATUSES.has(value.status as OnlineAccountReportStatus)) {
    return bad("Moderation report status is invalid.");
  }

  const note = value.note === undefined ? "" : value.note;
  if (typeof note !== "string") {
    return bad("Moderation report note is invalid.");
  }
  const normalizedNote = note.replace(/\s+/g, " ").trim();
  if (normalizedNote.length > ONLINE_ACCOUNT_MODERATION_NOTE_MAX_LENGTH) {
    return bad("Moderation report note is too long.");
  }

  for (const key of Object.keys(value)) {
    if (key !== "status" && key !== "note") {
      return bad("Moderation report status update contains an unsupported field.");
    }
  }

  return {
    ok: true,
    value: {
      status: value.status as OnlineAccountReportStatus,
      note: normalizedNote,
    },
  };
}
