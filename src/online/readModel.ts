import { Color } from "../Constants";
import { OnlineGameRoom } from "./OnlineGameRoom";
import {
  ONLINE_RULESET_VERSION,
  OnlineGameEvent,
  onlineGameEventsToRecords,
} from "./events";
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

export const ONLINE_GAME_SUMMARY_SCHEMA_VERSION = 1;

export type OnlineGameVisibility = "private" | "unlisted" | "public";
export type OnlineArchiveState = "active" | "archived";
export type OnlineGameSummaryStatus = "active" | "complete";

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
  result?: OnlineGameResultDTO;
  lastEventId: string;
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
const ACCESS_VISIBILITIES = new Set<OnlineGameVisibility>(["private", "unlisted", "public"]);
const ARCHIVE_STATES = new Set<OnlineArchiveState>(["active", "archived"]);
const SUMMARY_STATUSES = new Set<OnlineGameSummaryStatus>(["active", "complete"]);
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

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function timestamp(value: string): number {
  return Date.parse(value);
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
        visibility: "unlisted",
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
    metadata.version = event.version;
    metadata.lastEventId = event.eventId;

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
  if (value.endedAt !== undefined && timestamp(value.updatedAt) > timestamp(value.endedAt)) {
    return bad("summary.updatedAt must not be later than endedAt.");
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
      result,
      lastEventId: value.lastEventId,
    },
  };
}
