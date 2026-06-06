import { OnlineGameRoom } from "./OnlineGameRoom";
import {
  ONLINE_RULESET_VERSION,
  OnlineGameEvent,
  onlineGameEventsToRecords,
} from "./events";
import {
  ONLINE_GAME_VISIBILITIES,
  type OnlineGameVisibility,
} from "./visibility";
import type { OnlineGameResultDTO, OnlineRatingMode } from "./types";
import type { ValidationResult } from "./validation";
import {
  canAccessOnlineGameSummary,
  canListOnlineGameSummary,
  canSpectateOnlineGameSummary,
  roleForOnlineSeat,
  type OnlineAccessRole,
} from "./accessPolicy";
import { stringContainsDurableSecret } from "./secretSafety";
import {
  isSameOnlineIdentity,
  validateOnlineIdentity,
  type OnlineIdentity,
} from "./identity";
import { normalizeOnlineAccountDisplayNameKey } from "./accounts";
import { PieceType, type Color, type MoveRecord, type TurnPhase } from "../Constants";
import type { CastleDTO, OnlineClockStateDTO, PieceDTO } from "./types";

export const ONLINE_GAME_SUMMARY_SCHEMA_VERSION = 3;
export const ONLINE_GAME_DIRECTORY_SCHEMA_VERSION = 1;
export const ONLINE_GAME_DIRECTORY_DEFAULT_LIMIT = 25;
export const ONLINE_GAME_DIRECTORY_MAX_LIMIT = 100;
export const ONLINE_GAME_DIRECTORY_SEARCH_MAX_LENGTH = 80;

export type { OnlineGameVisibility } from "./visibility";
export type OnlineArchiveState = "active" | "archived";
export type OnlineGameSummaryStatus = "active" | "complete";
export type OnlineGameDirectoryState = "active" | "archived" | "all";
export type OnlineGameDirectoryClockFilter = "timed" | "casual";
export type OnlineGameDirectoryRatingFilter = OnlineRatingMode;
export type OnlineGameDirectoryResultFilter =
  | "white"
  | "black"
  | OnlineGameResultDTO["reason"];

export {
  canAccessOnlineGameSummary,
  canListOnlineGameSummary,
  canSpectateOnlineGameSummary,
  roleForOnlineSeat,
  type OnlineAccessRole,
};

export {
  validateOnlineIdentity,
  isSameOnlineIdentity,
  type OnlineAnonymousIdentity,
  type OnlineIdentity,
  type OnlineRegisteredIdentity,
  type OnlineSessionIdentity,
} from "./identity";

export interface OnlineGameSummaryParticipant {
  seat: Color;
  role: "white" | "black";
  identity: OnlineIdentity;
}

export interface OnlineGameSummaryPreviewClock {
  timeControl: { initialMs: number; incrementMs: number };
  remainingMs: { w: number; b: number };
  activeColor: Color | null;
  runningSince: number | null;
  serverNow?: number;
  flag?: { color: Color; at: number };
}

export interface OnlineGameSummaryBoardPreviewHex {
  q: number;
  r: number;
  s: number;
}

export interface OnlineGameSummaryBoardPreviewPiece extends OnlineGameSummaryBoardPreviewHex {
  color: Color;
  type: PieceType;
}

export interface OnlineGameSummaryBoardPreviewCastle extends OnlineGameSummaryBoardPreviewHex {
  owner: Color;
}

export interface OnlineGameSummaryBoardPreview {
  radius: number;
  pieces: OnlineGameSummaryBoardPreviewPiece[];
  castles: OnlineGameSummaryBoardPreviewCastle[];
}

export interface OnlineGameSummaryLivePreview {
  sideToMove: Color;
  turnPhase: TurnPhase;
  moveCount: number;
  lastMove?: MoveRecord;
  clock?: OnlineGameSummaryPreviewClock;
  spectatorCount?: number;
  boardPreview: OnlineGameSummaryBoardPreview;
}

export interface OnlineGameSummary {
  schemaVersion: typeof ONLINE_GAME_SUMMARY_SCHEMA_VERSION;
  gameId: string;
  rulesetVersion: typeof ONLINE_RULESET_VERSION;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  version: number;
  status: OnlineGameSummaryStatus;
  visibility: OnlineGameVisibility;
  archiveState: OnlineArchiveState;
  hasTimeControl: boolean;
  ratingMode?: OnlineRatingMode;
  participants: OnlineGameSummaryParticipant[];
  livePreview: OnlineGameSummaryLivePreview;
  result?: OnlineGameResultDTO;
  lastEventId: string;
}

export interface OnlineGameDirectoryCursor {
  updatedAt: string;
  gameId: string;
}

export interface OnlineGameDirectoryListOptions {
  visibility: "public";
  state: OnlineGameDirectoryState;
  limit: number;
  cursor?: string;
  clock?: OnlineGameDirectoryClockFilter;
  rating?: OnlineGameDirectoryRatingFilter;
  result?: OnlineGameDirectoryResultFilter;
  query?: string;
}

export interface OnlinePersonalGameDirectoryListOptions {
  identity: OnlineIdentity;
  state: OnlineGameDirectoryState;
  limit: number;
  cursor?: string;
  clock?: OnlineGameDirectoryClockFilter;
  rating?: OnlineGameDirectoryRatingFilter;
  result?: OnlineGameDirectoryResultFilter;
  query?: string;
  opponentDisplayNameKey?: string;
}

export interface OnlineGameDirectoryResponse {
  schemaVersion: typeof ONLINE_GAME_DIRECTORY_SCHEMA_VERSION;
  games: OnlineGameSummary[];
  nextCursor?: string;
}

interface SummaryMetadata {
  gameId: string;
  rulesetVersion: typeof ONLINE_RULESET_VERSION;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  version: number;
  visibility: OnlineGameVisibility;
  hasTimeControl: boolean;
  ratingMode?: OnlineRatingMode;
  whiteIdentity?: OnlineIdentity;
  blackIdentity?: OnlineIdentity;
  lastEventId: string;
}

const SUMMARY_ROLES = new Set(["white", "black"]);
const ACCESS_VISIBILITIES = ONLINE_GAME_VISIBILITIES;
const ARCHIVE_STATES = new Set<OnlineArchiveState>(["active", "archived"]);
const SUMMARY_STATUSES = new Set<OnlineGameSummaryStatus>(["active", "complete"]);
const TURN_PHASES = new Set<TurnPhase>(["Movement", "Attack", "Recruitment"]);
const PIECE_TYPES = new Set<PieceType>(Object.values(PieceType));
const BOARD_PREVIEW_MAX_RADIUS = 12;
const BOARD_PREVIEW_MAX_PIECES = 300;
const BOARD_PREVIEW_MAX_CASTLES = 40;
const ONLINE_GAME_DIRECTORY_RESPONSE_KEYS = new Set(["schemaVersion", "games", "nextCursor"]);
const ONLINE_GAME_SUMMARY_KEYS = new Set([
  "schemaVersion",
  "gameId",
  "rulesetVersion",
  "createdAt",
  "updatedAt",
  "endedAt",
  "version",
  "status",
  "visibility",
  "archiveState",
  "hasTimeControl",
  "ratingMode",
  "participants",
  "livePreview",
  "result",
  "lastEventId",
]);
const SUMMARY_PARTICIPANT_KEYS = new Set(["seat", "role", "identity"]);
const SUMMARY_RESULT_KEYS = new Set(["winner", "reason"]);
const SUMMARY_LIVE_PREVIEW_KEYS = new Set([
  "sideToMove",
  "turnPhase",
  "moveCount",
  "lastMove",
  "clock",
  "spectatorCount",
  "boardPreview",
]);
const SUMMARY_MOVE_RECORD_KEYS = new Set(["notation", "turnNumber", "color", "phase"]);
const SUMMARY_CLOCK_KEYS = new Set([
  "timeControl",
  "remainingMs",
  "activeColor",
  "runningSince",
  "serverNow",
  "flag",
]);
const SUMMARY_CLOCK_TIME_CONTROL_KEYS = new Set(["initialMs", "incrementMs"]);
const SUMMARY_CLOCK_REMAINING_KEYS = new Set(["w", "b"]);
const SUMMARY_CLOCK_FLAG_KEYS = new Set(["color", "at"]);
const SUMMARY_BOARD_PREVIEW_KEYS = new Set(["radius", "pieces", "castles"]);
const SUMMARY_BOARD_PREVIEW_PIECE_KEYS = new Set(["q", "r", "s", "color", "type"]);
const SUMMARY_BOARD_PREVIEW_CASTLE_KEYS = new Set(["q", "r", "s", "owner"]);
export const ONLINE_GAME_DIRECTORY_STATES = new Set<OnlineGameDirectoryState>([
  "active",
  "archived",
  "all",
]);
export const ONLINE_GAME_DIRECTORY_CLOCK_FILTERS = new Set<OnlineGameDirectoryClockFilter>([
  "timed",
  "casual",
]);
export const ONLINE_GAME_DIRECTORY_RATING_FILTERS = new Set<OnlineGameDirectoryRatingFilter>([
  "casual",
  "rated",
]);
const RESULT_REASONS = new Set<OnlineGameResultDTO["reason"]>([
  "monarch_captured",
  "castle_control",
  "victory_points",
  "resignation",
  "timeout",
]);
export const ONLINE_GAME_DIRECTORY_RESULT_FILTERS = new Set<OnlineGameDirectoryResultFilter>([
  "white",
  "black",
  ...RESULT_REASONS,
]);

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

function validateAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  label: string
): ValidationResult<void> {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return bad(`${label} contains unsupported data.`);
    }
  }
  return { ok: true, value: undefined };
}

export function stripOnlineGameSummaryResponseOnlyFields(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.livePreview)) return value;
  const hasSpectatorCount = "spectatorCount" in value.livePreview;
  const clock = value.livePreview.clock;
  const hasClockServerNow = isRecord(clock) && "serverNow" in clock;
  if (!hasSpectatorCount && !hasClockServerNow) return value;
  const { spectatorCount: _spectatorCount, ...livePreview } = value.livePreview;
  if (hasClockServerNow && isRecord(clock)) {
    const { serverNow: _serverNow, ...clockWithoutServerNow } = clock;
    livePreview.clock = clockWithoutServerNow;
  }
  return {
    ...value,
    livePreview,
  };
}

export function stripOnlineGameDirectoryResponseOnlyFields(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.games)) return value;
  return {
    ...value,
    games: value.games.map(stripOnlineGameSummaryResponseOnlyFields),
  };
}

function isBoundedString(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isColor(value: unknown): value is Color {
  return value === "w" || value === "b";
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isBoardPreviewCoordinate(value: unknown): value is number {
  return Number.isInteger(value) && Math.abs(value as number) <= BOARD_PREVIEW_MAX_RADIUS;
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function timestamp(value: string): number {
  return Date.parse(value);
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

export function encodeOnlineGameDirectoryCursor(
  value: OnlineGameDirectoryCursor
): string {
  return encodeBase64Url(JSON.stringify([value.updatedAt, value.gameId]));
}

export function decodeOnlineGameDirectoryCursor(
  value: unknown
): ValidationResult<OnlineGameDirectoryCursor> {
  if (!isBoundedString(value, 512)) return bad("directory cursor is invalid.");
  const decoded = decodeBase64Url(value);
  if (!decoded) return bad("directory cursor is invalid.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return bad("directory cursor is invalid.");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    !isIsoDateString(parsed[0]) ||
    !isBoundedString(parsed[1], 128) ||
    !/^[A-Za-z0-9_-]+$/.test(parsed[1]) ||
    stringContainsDurableSecret(parsed[1])
  ) {
    return bad("directory cursor is invalid.");
  }
  return {
    ok: true,
    value: {
      updatedAt: parsed[0],
      gameId: parsed[1],
    },
  };
}

export function onlineGameSummaryMatchesDirectoryFilters(
  summary: OnlineGameSummary,
  options: OnlineGameDirectoryListOptions
): boolean {
  if (summary.visibility !== options.visibility) return false;
  if (options.state === "active" && summary.status !== "active") return false;
  if (
    options.state === "archived" &&
    (summary.status !== "complete" || summary.archiveState !== "archived")
  ) {
    return false;
  }
  if (options.clock === "timed" && !summary.hasTimeControl) return false;
  if (options.clock === "casual" && summary.hasTimeControl) return false;
  if (options.rating && (summary.ratingMode ?? "casual") !== options.rating) return false;
  if (options.result) {
    if (!summary.result) return false;
    if (options.result === "white" && summary.result.winner !== "w") return false;
    if (options.result === "black" && summary.result.winner !== "b") return false;
    if (
      options.result !== "white" &&
      options.result !== "black" &&
      summary.result.reason !== options.result
    ) {
      return false;
    }
  }
  if (
    options.query &&
    !onlineGameSummaryDirectorySearchText(summary).includes(options.query.toLowerCase())
  ) {
    return false;
  }
  return true;
}

export function onlineGameSummaryMatchesPersonalDirectoryFilters(
  summary: OnlineGameSummary,
  options: OnlinePersonalGameDirectoryListOptions
): boolean {
  if (options.state === "active" && summary.status !== "active") return false;
  if (
    options.state === "archived" &&
    (summary.status !== "complete" || summary.archiveState !== "archived")
  ) {
    return false;
  }
  const accountParticipant = summary.participants.find((participant) =>
    isSameOnlineIdentity(participant.identity, options.identity)
  );
  if (!accountParticipant) return false;
  if (options.clock === "timed" && !summary.hasTimeControl) return false;
  if (options.clock === "casual" && summary.hasTimeControl) return false;
  if (options.rating && (summary.ratingMode ?? "casual") !== options.rating) return false;
  if (options.result) {
    if (!summary.result) return false;
    if (options.result === "white" && summary.result.winner !== "w") return false;
    if (options.result === "black" && summary.result.winner !== "b") return false;
    if (
      options.result !== "white" &&
      options.result !== "black" &&
      summary.result.reason !== options.result
    ) {
      return false;
    }
  }
  if (
    options.query &&
    !onlineGameSummaryDirectorySearchText(summary).includes(options.query.toLowerCase())
  ) {
    return false;
  }
  if (options.opponentDisplayNameKey) {
    return summary.participants.some((participant) => {
      if (participant.seat === accountParticipant.seat) return false;
      const identity = participant.identity;
      return (
        identity.kind === "registered" &&
        typeof identity.displayName === "string" &&
        normalizeOnlineAccountDisplayNameKey(identity.displayName) === options.opponentDisplayNameKey
      );
    });
  }
  return true;
}

export function normalizeOnlineGameDirectorySearchQuery(value: string): string | null {
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > ONLINE_GAME_DIRECTORY_SEARCH_MAX_LENGTH) {
    return null;
  }
  return normalized.toLowerCase();
}

function resultSearchTerms(result: OnlineGameResultDTO | undefined): string[] {
  if (!result) return [];
  const winner = result.winner === "w" ? "white" : "black";
  const reason = result.reason.replace(/_/g, " ");
  const displayedReason = result.reason === "timeout" ? "on time" : `by ${reason}`;
  return [
    result.winner,
    winner,
    result.reason,
    reason,
    `${winner} wins`,
    `${winner} wins by ${reason}`,
    `${winner} wins ${displayedReason}`,
  ];
}

function participantSearchTerms(participant: OnlineGameSummaryParticipant): string[] {
  const displayName =
    participant.identity.kind === "registered" ? participant.identity.displayName ?? "" : "";
  return [
    participant.seat,
    participant.role,
    participant.role === "white" ? "White" : "Black",
    displayName,
  ];
}

export function onlineGameSummaryDirectorySearchText(summary: OnlineGameSummary): string {
  const ratingMode = summary.ratingMode ?? "casual";
  return [
    summary.gameId,
    summary.status,
    summary.archiveState,
    summary.hasTimeControl ? "timed clock timed" : "casual no clock",
    ratingMode,
    ratingMode === "rated" ? "rated game" : "casual game",
    summary.livePreview.sideToMove === "w" ? "white to move" : "black to move",
    summary.livePreview.turnPhase,
    summary.livePreview.lastMove?.notation ?? "",
    ...summary.participants.flatMap(participantSearchTerms),
    ...resultSearchTerms(summary.result),
  ].join(" ").toLowerCase();
}

function validateResult(value: unknown): ValidationResult<OnlineGameResultDTO> {
  if (!isRecord(value)) return bad("summary.result must be an object.");
  const allowedKeys = validateAllowedKeys(value, SUMMARY_RESULT_KEYS, "summary.result");
  if (!allowedKeys.ok) return allowedKeys;
  if (!isColor(value.winner)) return bad("summary.result.winner must be w or b.");
  if (typeof value.reason !== "string" || !RESULT_REASONS.has(value.reason as OnlineGameResultDTO["reason"])) {
    return bad("summary.result.reason is not supported.");
  }
  return {
    ok: true,
    value: {
      winner: value.winner,
      reason: value.reason as OnlineGameResultDTO["reason"],
    },
  };
}

function validateParticipant(value: unknown): ValidationResult<OnlineGameSummaryParticipant> {
  if (!isRecord(value)) return bad("summary.participants[] must be an object.");
  const allowedKeys = validateAllowedKeys(value, SUMMARY_PARTICIPANT_KEYS, "summary.participants[]");
  if (!allowedKeys.ok) return allowedKeys;
  if (!isColor(value.seat)) return bad("summary.participants[].seat must be w or b.");
  if (typeof value.role !== "string" || !SUMMARY_ROLES.has(value.role)) {
    return bad("summary.participants[].role is invalid.");
  }
  if (value.role !== roleForOnlineSeat(value.seat)) {
    return bad("summary.participants[].role must match its seat.");
  }
  const identity = validateOnlineIdentity(value.identity, "summary.participants[].identity");
  if (!identity.ok) return identity;
  return {
    ok: true,
    value: {
      seat: value.seat,
      role: value.role as "white" | "black",
      identity: identity.value,
    },
  };
}

function validateSummaryMoveRecord(
  value: unknown,
  label = "summary.lastMove"
): ValidationResult<MoveRecord> {
  if (!isRecord(value)) return bad(`${label} must be an object.`);
  const allowedKeys = validateAllowedKeys(value, SUMMARY_MOVE_RECORD_KEYS, label);
  if (!allowedKeys.ok) return allowedKeys;
  if (!isBoundedString(value.notation, 128)) return bad(`${label}.notation is invalid.`);
  if (!isPositiveSafeInteger(value.turnNumber)) {
    return bad(`${label}.turnNumber must be a positive integer.`);
  }
  if (!isColor(value.color)) return bad(`${label}.color must be w or b.`);
  if (typeof value.phase !== "string" || !TURN_PHASES.has(value.phase as TurnPhase)) {
    return bad(`${label}.phase is invalid.`);
  }
  return {
    ok: true,
    value: {
      notation: value.notation,
      turnNumber: value.turnNumber,
      color: value.color,
      phase: value.phase as TurnPhase,
    },
  };
}

function validateSummaryClock(value: unknown): ValidationResult<OnlineGameSummaryPreviewClock> {
  if (!isRecord(value)) return bad("summary.clock must be an object.");
  const allowedKeys = validateAllowedKeys(value, SUMMARY_CLOCK_KEYS, "summary.clock");
  if (!allowedKeys.ok) return allowedKeys;
  if (!isRecord(value.timeControl)) return bad("summary.clock.timeControl must be an object.");
  const timeControlKeys = validateAllowedKeys(
    value.timeControl,
    SUMMARY_CLOCK_TIME_CONTROL_KEYS,
    "summary.clock.timeControl"
  );
  if (!timeControlKeys.ok) return timeControlKeys;
  if (!isNonNegativeSafeInteger(value.timeControl.initialMs)) {
    return bad("summary.clock.timeControl.initialMs must be a non-negative integer.");
  }
  if (!isNonNegativeSafeInteger(value.timeControl.incrementMs)) {
    return bad("summary.clock.timeControl.incrementMs must be a non-negative integer.");
  }
  if (!isRecord(value.remainingMs)) return bad("summary.clock.remainingMs must be an object.");
  const remainingKeys = validateAllowedKeys(
    value.remainingMs,
    SUMMARY_CLOCK_REMAINING_KEYS,
    "summary.clock.remainingMs"
  );
  if (!remainingKeys.ok) return remainingKeys;
  if (
    !isNonNegativeSafeInteger(value.remainingMs.w) ||
    !isNonNegativeSafeInteger(value.remainingMs.b)
  ) {
    return bad("summary.clock.remainingMs must contain non-negative w and b values.");
  }
  if (value.activeColor !== null && !isColor(value.activeColor)) {
    return bad("summary.clock.activeColor must be w, b, or null.");
  }
  if (value.runningSince !== null && !isNonNegativeSafeInteger(value.runningSince)) {
    return bad("summary.clock.runningSince must be a non-negative integer or null.");
  }
  if ((value.activeColor === null) !== (value.runningSince === null)) {
    return bad("summary.clock.activeColor and runningSince must both be set or both be null.");
  }
  let serverNow: number | undefined;
  if (value.serverNow !== undefined) {
    if (!isNonNegativeSafeInteger(value.serverNow)) {
      return bad("summary.clock.serverNow must be a non-negative integer when present.");
    }
    serverNow = value.serverNow;
  }

  let flag: OnlineGameSummaryPreviewClock["flag"];
  if (value.flag !== undefined) {
    if (!isRecord(value.flag)) return bad("summary.clock.flag must be an object when present.");
    const flagKeys = validateAllowedKeys(value.flag, SUMMARY_CLOCK_FLAG_KEYS, "summary.clock.flag");
    if (!flagKeys.ok) return flagKeys;
    if (!isColor(value.flag.color)) return bad("summary.clock.flag.color must be w or b.");
    if (!isNonNegativeSafeInteger(value.flag.at)) {
      return bad("summary.clock.flag.at must be a non-negative integer.");
    }
    flag = { color: value.flag.color, at: value.flag.at };
  }

  return {
    ok: true,
    value: {
      timeControl: {
        initialMs: value.timeControl.initialMs,
        incrementMs: value.timeControl.incrementMs,
      },
      remainingMs: { w: value.remainingMs.w, b: value.remainingMs.b },
      activeColor: value.activeColor,
      runningSince: value.runningSince,
      serverNow,
      flag,
    },
  };
}

function validateBoardPreviewHex(
  value: unknown,
  radius: number,
  label: string
): ValidationResult<OnlineGameSummaryBoardPreviewHex> {
  if (!isRecord(value)) return bad(`${label} must be an object.`);
  if (
    !isBoardPreviewCoordinate(value.q) ||
    !isBoardPreviewCoordinate(value.r) ||
    !isBoardPreviewCoordinate(value.s)
  ) {
    return bad(`${label} coordinates are invalid.`);
  }
  if (value.q + value.r + value.s !== 0) {
    return bad(`${label} coordinates must sum to zero.`);
  }
  if (Math.max(Math.abs(value.q), Math.abs(value.r), Math.abs(value.s)) > radius) {
    return bad(`${label} must be inside the preview radius.`);
  }
  return {
    ok: true,
    value: { q: value.q, r: value.r, s: value.s },
  };
}

function validateBoardPreviewPiece(
  value: unknown,
  radius: number
): ValidationResult<OnlineGameSummaryBoardPreviewPiece> {
  if (!isRecord(value)) return bad("summary.livePreview.boardPreview.pieces[] must be an object.");
  const allowedKeys = validateAllowedKeys(
    value,
    SUMMARY_BOARD_PREVIEW_PIECE_KEYS,
    "summary.livePreview.boardPreview.pieces[]"
  );
  if (!allowedKeys.ok) return allowedKeys;
  const hex = validateBoardPreviewHex(value, radius, "summary.livePreview.boardPreview.pieces[]");
  if (!hex.ok) return hex;
  if (!isColor(value.color)) return bad("summary.livePreview.boardPreview.pieces[].color must be w or b.");
  if (typeof value.type !== "string" || !PIECE_TYPES.has(value.type as PieceType)) {
    return bad("summary.livePreview.boardPreview.pieces[].type is invalid.");
  }
  return {
    ok: true,
    value: {
      ...hex.value,
      color: value.color,
      type: value.type as PieceType,
    },
  };
}

function validateBoardPreviewCastle(
  value: unknown,
  radius: number
): ValidationResult<OnlineGameSummaryBoardPreviewCastle> {
  if (!isRecord(value)) return bad("summary.livePreview.boardPreview.castles[] must be an object.");
  const allowedKeys = validateAllowedKeys(
    value,
    SUMMARY_BOARD_PREVIEW_CASTLE_KEYS,
    "summary.livePreview.boardPreview.castles[]"
  );
  if (!allowedKeys.ok) return allowedKeys;
  const hex = validateBoardPreviewHex(value, radius, "summary.livePreview.boardPreview.castles[]");
  if (!hex.ok) return hex;
  if (!isColor(value.owner)) return bad("summary.livePreview.boardPreview.castles[].owner must be w or b.");
  return {
    ok: true,
    value: {
      ...hex.value,
      owner: value.owner,
    },
  };
}

function validateBoardPreview(value: unknown): ValidationResult<OnlineGameSummaryBoardPreview> {
  if (!isRecord(value)) return bad("summary.livePreview.boardPreview must be an object.");
  const allowedKeys = validateAllowedKeys(value, SUMMARY_BOARD_PREVIEW_KEYS, "summary.livePreview.boardPreview");
  if (!allowedKeys.ok) return allowedKeys;
  if (!isPositiveSafeInteger(value.radius) || value.radius > BOARD_PREVIEW_MAX_RADIUS) {
    return bad("summary.livePreview.boardPreview.radius is invalid.");
  }
  if (!Array.isArray(value.pieces) || value.pieces.length > BOARD_PREVIEW_MAX_PIECES) {
    return bad("summary.livePreview.boardPreview.pieces is invalid.");
  }
  if (!Array.isArray(value.castles) || value.castles.length > BOARD_PREVIEW_MAX_CASTLES) {
    return bad("summary.livePreview.boardPreview.castles is invalid.");
  }

  const pieces = value.pieces.map((piece) => validateBoardPreviewPiece(piece, value.radius as number));
  const invalidPiece = pieces.find((piece) => !piece.ok);
  if (invalidPiece && !invalidPiece.ok) return invalidPiece;
  const castles = value.castles.map((castle) => validateBoardPreviewCastle(castle, value.radius as number));
  const invalidCastle = castles.find((castle) => !castle.ok);
  if (invalidCastle && !invalidCastle.ok) return invalidCastle;

  const pieceHexes = new Set<string>();
  for (const piece of pieces) {
    if (!piece.ok) throw new Error("unreachable invalid board preview piece.");
    const key = `${piece.value.q},${piece.value.r},${piece.value.s}`;
    if (pieceHexes.has(key)) {
      return bad("summary.livePreview.boardPreview.pieces must not contain duplicate coordinates.");
    }
    pieceHexes.add(key);
  }

  const castleHexes = new Set<string>();
  for (const castle of castles) {
    if (!castle.ok) throw new Error("unreachable invalid board preview castle.");
    const key = `${castle.value.q},${castle.value.r},${castle.value.s}`;
    if (castleHexes.has(key)) {
      return bad("summary.livePreview.boardPreview.castles must not contain duplicate coordinates.");
    }
    castleHexes.add(key);
  }

  return {
    ok: true,
    value: {
      radius: value.radius as number,
      pieces: pieces.map((piece) => {
        if (!piece.ok) throw new Error("unreachable invalid board preview piece.");
        return piece.value;
      }),
      castles: castles.map((castle) => {
        if (!castle.ok) throw new Error("unreachable invalid board preview castle.");
        return castle.value;
      }),
    },
  };
}

function anonymousParticipant(gameId: string, seat: Color): OnlineGameSummaryParticipant {
  return {
    seat,
    role: roleForOnlineSeat(seat),
    identity: {
      kind: "anonymous",
      id: `anon_${gameId}_${seat}`,
    },
  };
}

function participantForGameSeat(
  gameId: string,
  seat: Color,
  identity: OnlineIdentity | undefined
): OnlineGameSummaryParticipant {
  if (!identity) return anonymousParticipant(gameId, seat);
  return {
    seat,
    role: roleForOnlineSeat(seat),
    identity,
  };
}

function summaryClockFromSnapshot(clock: OnlineClockStateDTO | undefined): OnlineGameSummaryPreviewClock | undefined {
  if (!clock) return undefined;
  return {
    timeControl: { ...clock.timeControl },
    remainingMs: { ...clock.remainingMs },
    activeColor: clock.activeColor,
    runningSince: clock.runningSince,
    flag: clock.flag ? { ...clock.flag } : undefined,
  };
}

function comparePreviewHexes(
  left: OnlineGameSummaryBoardPreviewHex,
  right: OnlineGameSummaryBoardPreviewHex
): number {
  if (left.q !== right.q) return left.q - right.q;
  if (left.r !== right.r) return left.r - right.r;
  return left.s - right.s;
}

function previewHexFromDto(value: PieceDTO["hex"]): OnlineGameSummaryBoardPreviewHex {
  return { q: value.q, r: value.r, s: value.s };
}

function previewPieceFromDto(piece: PieceDTO): OnlineGameSummaryBoardPreviewPiece {
  return {
    ...previewHexFromDto(piece.hex),
    color: piece.color,
    type: piece.type,
  };
}

function previewCastleFromDto(castle: CastleDTO): OnlineGameSummaryBoardPreviewCastle {
  return {
    ...previewHexFromDto(castle.hex),
    owner: castle.owner,
  };
}

function createBoardPreviewFromSnapshot(
  snapshot: ReturnType<OnlineGameRoom["getSnapshot"]>
): OnlineGameSummaryBoardPreview {
  return {
    radius: snapshot.setup.board.config.nSquares,
    pieces: snapshot.state.pieces
      .map(previewPieceFromDto)
      .sort((left, right) => comparePreviewHexes(left, right) || left.color.localeCompare(right.color) || left.type.localeCompare(right.type)),
    castles: snapshot.state.castles
      .map(previewCastleFromDto)
      .sort((left, right) => comparePreviewHexes(left, right) || left.owner.localeCompare(right.owner)),
  };
}

function createLivePreviewFromSnapshot(
  snapshot: ReturnType<OnlineGameRoom["getSnapshot"]>
): OnlineGameSummaryLivePreview {
  const lastMove = snapshot.moveHistory.at(-1);
  return {
    sideToMove: snapshot.playerToMove,
    turnPhase: snapshot.turnPhase,
    moveCount: snapshot.moveHistory.length,
    lastMove,
    clock: summaryClockFromSnapshot(snapshot.clock),
    boardPreview: createBoardPreviewFromSnapshot(snapshot),
  };
}

export function projectOnlineGameSummaries(events: OnlineGameEvent[]): OnlineGameSummary[] {
  const records = onlineGameEventsToRecords(events, {
    allowMissingCredentialsForProjection: true,
  });
  const metadataByGame = new Map<string, SummaryMetadata>();
  const terminalVersionByGame = new Map<string, number>();

  for (const record of records) {
    const terminalVersion = record.timeout?.version ?? (
      record.result ? record.acceptedActions.at(-1)?.version : undefined
    );
    if (typeof terminalVersion === "number" && Number.isSafeInteger(terminalVersion)) {
      terminalVersionByGame.set(record.gameId, terminalVersion);
    }
  }

  for (const event of events) {
    if (event.type === "game_created") {
      metadataByGame.set(event.gameId, {
        gameId: event.gameId,
        rulesetVersion: event.rulesetVersion,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        version: 0,
        visibility: event.initialVisibility ?? "unlisted",
        hasTimeControl: !!event.setup.timeControl,
        ratingMode: event.setup.ratingMode ?? "casual",
        whiteIdentity: event.whiteIdentity,
        blackIdentity: event.blackIdentity,
        lastEventId: event.eventId,
      });
      continue;
    }

    const metadata = metadataByGame.get(event.gameId);
    if (!metadata) {
      throw new Error(`Online summary event references missing game ${event.gameId}.`);
    }
    metadata.updatedAt = event.createdAt;
    metadata.lastEventId = event.eventId;

    if (event.type === "visibility_changed") {
      metadata.visibility = event.visibility;
      continue;
    }

    metadata.version = event.version;

    if (
      event.type === "timeout_adjudicated" ||
      (event.type === "action_accepted" && terminalVersionByGame.get(event.gameId) === event.version)
    ) {
      metadata.endedAt = event.createdAt;
    }
  }

  return records.map((record) => {
    const metadata = metadataByGame.get(record.gameId);
    if (!metadata) {
      throw new Error(`Online summary is missing metadata for ${record.gameId}.`);
    }

    const snapshot = OnlineGameRoom.create(record).getSnapshot();
    const result = snapshot.result;
    const status: OnlineGameSummaryStatus = result ? "complete" : "active";
    const endedAt = result ? metadata.endedAt ?? metadata.updatedAt : undefined;

    return {
      schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
      gameId: metadata.gameId,
      rulesetVersion: metadata.rulesetVersion,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      endedAt,
      version: metadata.version,
      status,
      visibility: metadata.visibility,
      archiveState: result ? "archived" : "active",
      hasTimeControl: metadata.hasTimeControl,
      ratingMode: metadata.ratingMode,
      participants: [
        participantForGameSeat(record.gameId, "w", metadata.whiteIdentity),
        participantForGameSeat(record.gameId, "b", metadata.blackIdentity),
      ],
      livePreview: createLivePreviewFromSnapshot(snapshot),
      result,
      lastEventId: metadata.lastEventId,
    };
  });
}

export function validateOnlineGameSummary(value: unknown): ValidationResult<OnlineGameSummary> {
  if (!isRecord(value)) return bad("summary must be an object.");
  const allowedKeys = validateAllowedKeys(value, ONLINE_GAME_SUMMARY_KEYS, "summary");
  if (!allowedKeys.ok) return allowedKeys;
  if (value.schemaVersion !== ONLINE_GAME_SUMMARY_SCHEMA_VERSION) {
    return bad(`summary.schemaVersion must be ${ONLINE_GAME_SUMMARY_SCHEMA_VERSION}.`);
  }
  if (!isBoundedString(value.gameId, 128)) return bad("summary.gameId is invalid.");
  if (value.rulesetVersion !== ONLINE_RULESET_VERSION) {
    return bad(`summary.rulesetVersion must be ${ONLINE_RULESET_VERSION}.`);
  }
  if (!isIsoDateString(value.createdAt)) return bad("summary.createdAt must be a valid timestamp.");
  if (!isIsoDateString(value.updatedAt)) return bad("summary.updatedAt must be a valid timestamp.");
  if (value.endedAt !== undefined && !isIsoDateString(value.endedAt)) {
    return bad("summary.endedAt must be a valid timestamp when present.");
  }
  if (timestamp(value.createdAt) > timestamp(value.updatedAt)) {
    return bad("summary.createdAt must not be later than updatedAt.");
  }
  if (value.endedAt !== undefined && timestamp(value.createdAt) > timestamp(value.endedAt)) {
    return bad("summary.createdAt must not be later than endedAt.");
  }
  if (value.endedAt !== undefined && timestamp(value.endedAt) > timestamp(value.updatedAt)) {
    return bad("summary.endedAt must not be later than updatedAt.");
  }
  if (!isNonNegativeSafeInteger(value.version)) return bad("summary.version must be a non-negative integer.");
  if (typeof value.status !== "string" || !SUMMARY_STATUSES.has(value.status as OnlineGameSummaryStatus)) {
    return bad("summary.status is invalid.");
  }
  if (typeof value.visibility !== "string" || !ACCESS_VISIBILITIES.has(value.visibility as OnlineGameVisibility)) {
    return bad("summary.visibility is invalid.");
  }
  if (typeof value.archiveState !== "string" || !ARCHIVE_STATES.has(value.archiveState as OnlineArchiveState)) {
    return bad("summary.archiveState is invalid.");
  }
  if (typeof value.hasTimeControl !== "boolean") {
    return bad("summary.hasTimeControl must be a boolean.");
  }
  let ratingMode: OnlineRatingMode | undefined;
  if (value.ratingMode !== undefined) {
    if (value.ratingMode !== "casual" && value.ratingMode !== "rated") {
      return bad("summary.ratingMode must be either casual or rated.");
    }
    ratingMode = value.ratingMode;
  }
  if (!Array.isArray(value.participants) || value.participants.length !== 2) {
    return bad("summary.participants must contain both seats.");
  }
  const participants = value.participants.map(validateParticipant);
  const invalidParticipant = participants.find((participant) => !participant.ok);
  if (invalidParticipant && !invalidParticipant.ok) return invalidParticipant;
  const normalizedParticipants = participants.map((participant) => {
    if (!participant.ok) throw new Error("unreachable invalid participant.");
    return participant.value;
  });
  const seats = new Set(normalizedParticipants.map((participant) => participant.seat));
  if (!seats.has("w") || !seats.has("b")) {
    return bad("summary.participants must contain white and black seats.");
  }
  if (!isRecord(value.livePreview)) return bad("summary.livePreview must be an object.");
  const livePreviewKeys = validateAllowedKeys(
    value.livePreview,
    SUMMARY_LIVE_PREVIEW_KEYS,
    "summary.livePreview"
  );
  if (!livePreviewKeys.ok) return livePreviewKeys;
  if (!isColor(value.livePreview.sideToMove)) {
    return bad("summary.livePreview.sideToMove must be w or b.");
  }
  if (
    typeof value.livePreview.turnPhase !== "string" ||
    !TURN_PHASES.has(value.livePreview.turnPhase as TurnPhase)
  ) {
    return bad("summary.livePreview.turnPhase is invalid.");
  }
  if (!isNonNegativeSafeInteger(value.livePreview.moveCount)) {
    return bad("summary.livePreview.moveCount must be a non-negative integer.");
  }

  let lastMove: MoveRecord | undefined;
  if (value.livePreview.lastMove !== undefined) {
    const lastMoveValidation = validateSummaryMoveRecord(
      value.livePreview.lastMove,
      "summary.livePreview.lastMove"
    );
    if (!lastMoveValidation.ok) return lastMoveValidation;
    lastMove = lastMoveValidation.value;
  }
  if (value.livePreview.moveCount === 0 && lastMove) {
    return bad("summary.livePreview.lastMove is not allowed when moveCount is zero.");
  }
  if (value.livePreview.moveCount > 0 && !lastMove) {
    return bad("summary.livePreview.lastMove is required when moveCount is positive.");
  }

  let clock: OnlineGameSummaryPreviewClock | undefined;
  if (value.livePreview.clock !== undefined) {
    const clockValidation = validateSummaryClock(value.livePreview.clock);
    if (!clockValidation.ok) return clockValidation;
    clock = clockValidation.value;
  }
  if (value.hasTimeControl && !clock) {
    return bad("summary.livePreview.clock is required for timed games.");
  }
  if (!value.hasTimeControl && clock) {
    return bad("summary.livePreview.clock is not allowed for casual games.");
  }

  let spectatorCount: number | undefined;
  if (value.livePreview.spectatorCount !== undefined) {
    if (!isNonNegativeSafeInteger(value.livePreview.spectatorCount)) {
      return bad("summary.livePreview.spectatorCount must be a non-negative integer.");
    }
    spectatorCount = value.livePreview.spectatorCount;
  }
  if (spectatorCount !== undefined && value.status !== "active") {
    return bad("summary.livePreview.spectatorCount is only allowed for active games.");
  }
  if (clock?.serverNow !== undefined && value.status !== "active") {
    return bad("summary.livePreview.clock.serverNow is only allowed for active games.");
  }

  const boardPreview = validateBoardPreview(value.livePreview.boardPreview);
  if (!boardPreview.ok) return boardPreview;

  let result: OnlineGameResultDTO | undefined;
  if (value.result !== undefined) {
    const resultValidation = validateResult(value.result);
    if (!resultValidation.ok) return resultValidation;
    result = resultValidation.value;
  }
  if (value.status === "complete" && !result) {
    return bad("summary.result is required for completed games.");
  }
  if (value.status === "complete" && value.endedAt === undefined) {
    return bad("summary.endedAt is required for completed games.");
  }
  if (value.status === "complete" && value.archiveState !== "archived") {
    return bad("summary.archiveState must be archived for completed games.");
  }
  if (value.status === "active" && result) {
    return bad("summary.result is not allowed for active games.");
  }
  if (value.status === "active" && value.endedAt !== undefined) {
    return bad("summary.endedAt is not allowed for active games.");
  }
  if (value.archiveState === "archived" && value.status !== "complete") {
    return bad("summary.archiveState can only be archived for completed games.");
  }
  if (!isBoundedString(value.lastEventId, 128)) return bad("summary.lastEventId is invalid.");

  return {
    ok: true,
    value: {
      schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
      gameId: value.gameId,
      rulesetVersion: ONLINE_RULESET_VERSION,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      endedAt: value.endedAt,
      version: value.version,
      status: value.status as OnlineGameSummaryStatus,
      visibility: value.visibility as OnlineGameVisibility,
      archiveState: value.archiveState as OnlineArchiveState,
      hasTimeControl: value.hasTimeControl,
      ratingMode,
      participants: normalizedParticipants,
      livePreview: {
        sideToMove: value.livePreview.sideToMove,
        turnPhase: value.livePreview.turnPhase as TurnPhase,
        moveCount: value.livePreview.moveCount,
        lastMove,
        clock,
        ...(spectatorCount !== undefined ? { spectatorCount } : {}),
        boardPreview: boardPreview.value,
      },
      result,
      lastEventId: value.lastEventId,
    },
  };
}

export function validateOnlineGameDirectoryResponse(
  value: unknown
): ValidationResult<OnlineGameDirectoryResponse> {
  if (!isRecord(value)) return bad("directory response must be an object.");
  const allowedKeys = validateAllowedKeys(
    value,
    ONLINE_GAME_DIRECTORY_RESPONSE_KEYS,
    "directory response"
  );
  if (!allowedKeys.ok) return allowedKeys;
  if (value.schemaVersion !== ONLINE_GAME_DIRECTORY_SCHEMA_VERSION) {
    return bad(`directory.schemaVersion must be ${ONLINE_GAME_DIRECTORY_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(value.games)) {
    return bad("directory.games must be an array.");
  }
  const games = value.games.map(validateOnlineGameSummary);
  const invalidGame = games.find((game) => !game.ok);
  if (invalidGame && !invalidGame.ok) return invalidGame;
  const normalizedGames = games.map((game) => {
    if (!game.ok) throw new Error("unreachable invalid game summary.");
    return game.value;
  });

  let nextCursor: string | undefined;
  if (value.nextCursor !== undefined) {
    const cursor = decodeOnlineGameDirectoryCursor(value.nextCursor);
    if (!cursor.ok) return cursor;
    nextCursor = value.nextCursor as string;
  }

  return {
    ok: true,
    value: {
      schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
      games: normalizedGames,
      nextCursor,
    },
  };
}
