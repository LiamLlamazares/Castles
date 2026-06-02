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
import type { OnlineGameResultDTO } from "./types";
import type { ValidationResult } from "./validation";
import {
  canAccessOnlineGameSummary,
  canListOnlineGameSummary,
  canSpectateOnlineGameSummary,
  roleForOnlineSeat,
  type OnlineAccessRole,
} from "./accessPolicy";
import { stringContainsDurableSecret } from "./secretSafety";
import { PieceType, type Color, type MoveRecord, type TurnPhase } from "../Constants";
import type { CastleDTO, OnlineClockStateDTO, PieceDTO } from "./types";

export const ONLINE_GAME_SUMMARY_SCHEMA_VERSION = 3;
export const ONLINE_GAME_DIRECTORY_SCHEMA_VERSION = 1;
export const ONLINE_GAME_DIRECTORY_DEFAULT_LIMIT = 25;
export const ONLINE_GAME_DIRECTORY_MAX_LIMIT = 100;

export type { OnlineGameVisibility } from "./visibility";
export type OnlineArchiveState = "active" | "archived";
export type OnlineGameSummaryStatus = "active" | "complete";
export type OnlineGameDirectoryState = "active" | "archived" | "all";

export {
  canAccessOnlineGameSummary,
  canListOnlineGameSummary,
  canSpectateOnlineGameSummary,
  roleForOnlineSeat,
  type OnlineAccessRole,
};

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
export const ONLINE_GAME_DIRECTORY_STATES = new Set<OnlineGameDirectoryState>([
  "active",
  "archived",
  "all",
]);
const RESULT_REASONS = new Set<OnlineGameResultDTO["reason"]>([
  "monarch_captured",
  "castle_control",
  "victory_points",
  "resignation",
  "timeout",
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

function validateResult(value: unknown): ValidationResult<OnlineGameResultDTO> {
  if (!isRecord(value)) return bad("summary.result must be an object.");
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

function validateParticipant(value: unknown): ValidationResult<OnlineGameSummaryParticipant> {
  if (!isRecord(value)) return bad("summary.participants[] must be an object.");
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
  if ("serverNow" in value) return bad("summary.clock.serverNow is not allowed.");
  if (!isRecord(value.timeControl)) return bad("summary.clock.timeControl must be an object.");
  if (!isNonNegativeSafeInteger(value.timeControl.initialMs)) {
    return bad("summary.clock.timeControl.initialMs must be a non-negative integer.");
  }
  if (!isNonNegativeSafeInteger(value.timeControl.incrementMs)) {
    return bad("summary.clock.timeControl.incrementMs must be a non-negative integer.");
  }
  if (!isRecord(value.remainingMs)) return bad("summary.clock.remainingMs must be an object.");
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

  let flag: OnlineGameSummaryPreviewClock["flag"];
  if (value.flag !== undefined) {
    if (!isRecord(value.flag)) return bad("summary.clock.flag must be an object when present.");
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
  const hex = validateBoardPreviewHex(value, radius, "summary.livePreview.boardPreview.pieces[]");
  if (!hex.ok) return hex;
  if (!isRecord(value)) return bad("summary.livePreview.boardPreview.pieces[] must be an object.");
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
  const hex = validateBoardPreviewHex(value, radius, "summary.livePreview.boardPreview.castles[]");
  if (!hex.ok) return hex;
  if (!isRecord(value)) return bad("summary.livePreview.boardPreview.castles[] must be an object.");
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
      (event.type === "action_accepted" && event.action.type === "RESIGN")
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
      participants: [anonymousParticipant(record.gameId, "w"), anonymousParticipant(record.gameId, "b")],
      livePreview: createLivePreviewFromSnapshot(snapshot),
      result,
      lastEventId: metadata.lastEventId,
    };
  });
}

export function validateOnlineGameSummary(value: unknown): ValidationResult<OnlineGameSummary> {
  if (!isRecord(value)) return bad("summary must be an object.");
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
      participants: normalizedParticipants,
      livePreview: {
        sideToMove: value.livePreview.sideToMove,
        turnPhase: value.livePreview.turnPhase as TurnPhase,
        moveCount: value.livePreview.moveCount,
        lastMove,
        clock,
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
