import type {
  AcceptedOnlineTimeoutRecord,
  OnlineClockRecord,
  OnlineGameRoomRecord,
} from "./OnlineGameRoom";
import { OnlineGameRoom } from "./OnlineGameRoom";
import { Color } from "../Constants";
import { OnlineActionDTO, OnlineGameResultDTO, OnlineGameSetupDTO } from "./types";
import {
  validateOnlineAction,
  validateOnlineGameSetup,
  type ValidationResult,
} from "./validation";

export const ONLINE_EVENT_SCHEMA_VERSION = 1;
export const ONLINE_RULESET_VERSION = "castles-beta-v1";

interface OnlineGameEventEnvelope {
  schemaVersion: typeof ONLINE_EVENT_SCHEMA_VERSION;
  eventId: string;
  createdAt: string;
  rulesetVersion: typeof ONLINE_RULESET_VERSION;
}

export type OnlineGameEvent =
  | (OnlineGameEventEnvelope & {
      type: "game_created";
      gameId: string;
      setup: OnlineGameSetupDTO;
      clock?: OnlineClockRecord;
    })
  | (OnlineGameEventEnvelope & {
      type: "action_accepted";
      gameId: string;
      playerColor: Color;
      version: number;
      playedAt: number;
      clock?: OnlineClockRecord;
      action: OnlineActionDTO;
    })
  | (OnlineGameEventEnvelope & {
      type: "timeout_adjudicated";
      gameId: string;
      playerColor: Color;
      version: number;
      adjudicatedAt: number;
      result: OnlineGameResultDTO;
      clock: OnlineClockRecord;
    });

export interface OnlineGameEventReplayOptions {
  credentials?: OnlineGameCredentialMap;
  allowMissingCredentialsForProjection?: boolean;
  onEventError?: (eventIndex: number, error: unknown) => void;
}

export interface OnlineGameCredentials {
  whiteCredential: string;
  blackCredential: string;
}

export type OnlineGameCredentialMap =
  | ReadonlyMap<string, OnlineGameCredentials>
  | Readonly<Record<string, OnlineGameCredentials | undefined>>;

const MAX_ID_LENGTH = 128;
const PROJECTION_ONLY_CREDENTIAL = "";
const COLORS = new Set<Color>(["w", "b"]);
let nextEventSequence = 0;

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

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isColor(value: unknown): value is Color {
  return typeof value === "string" && COLORS.has(value as Color);
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  return new Date(timestamp).toISOString() === value;
}

function createEnvelope(
  metadata: Partial<OnlineGameEventEnvelope> = {}
): OnlineGameEventEnvelope {
  nextEventSequence += 1;
  return {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId:
      metadata.eventId ??
      `evt_${Date.now().toString(36)}_${nextEventSequence.toString(36)}`,
    createdAt: metadata.createdAt ?? new Date().toISOString(),
    rulesetVersion: ONLINE_RULESET_VERSION,
  };
}

export function createOnlineGameCreatedEvent(
  event: Omit<Extract<OnlineGameEvent, { type: "game_created" }>, keyof OnlineGameEventEnvelope>,
  metadata?: Partial<OnlineGameEventEnvelope>
): Extract<OnlineGameEvent, { type: "game_created" }> {
  return {
    ...event,
    ...createEnvelope(metadata),
  };
}

function getCredentials(
  credentials: OnlineGameCredentialMap | undefined,
  gameId: string
): OnlineGameCredentials | undefined {
  if (!credentials) return undefined;
  if (typeof (credentials as ReadonlyMap<string, OnlineGameCredentials>).get === "function") {
    return (credentials as ReadonlyMap<string, OnlineGameCredentials>).get(gameId);
  }
  return (credentials as Readonly<Record<string, OnlineGameCredentials | undefined>>)[gameId];
}

export function createOnlineActionAcceptedEvent(
  event: Omit<
    Extract<OnlineGameEvent, { type: "action_accepted" }>,
    keyof OnlineGameEventEnvelope
  >,
  metadata?: Partial<OnlineGameEventEnvelope>
): Extract<OnlineGameEvent, { type: "action_accepted" }> {
  return {
    ...event,
    ...createEnvelope(metadata),
  };
}

export function createOnlineTimeoutAdjudicatedEvent(
  event: Omit<
    Extract<OnlineGameEvent, { type: "timeout_adjudicated" }>,
    keyof OnlineGameEventEnvelope
  >,
  metadata?: Partial<OnlineGameEventEnvelope>
): Extract<OnlineGameEvent, { type: "timeout_adjudicated" }> {
  return {
    ...event,
    ...createEnvelope(metadata),
  };
}

function validateClockRecord(value: unknown, path: string): ValidationResult<OnlineClockRecord> {
  if (!isRecord(value)) return bad(`${path} must be a clock object.`);
  if (!isRecord(value.remainingMs)) return bad(`${path}.remainingMs must be an object.`);
  if (
    !isNonNegativeSafeInteger(value.remainingMs.w) ||
    !isNonNegativeSafeInteger(value.remainingMs.b)
  ) {
    return bad(`${path}.remainingMs values must be non-negative integers.`);
  }
  if (value.activeColor !== null && !isColor(value.activeColor)) {
    return bad(`${path}.activeColor must be w, b, or null.`);
  }
  if (value.runningSince !== null && !isNonNegativeSafeInteger(value.runningSince)) {
    return bad(`${path}.runningSince must be a non-negative integer or null.`);
  }
  if ((value.activeColor === null) !== (value.runningSince === null)) {
    return bad(`${path}.activeColor and runningSince must both be set or both be null.`);
  }

  let flag: OnlineClockRecord["flag"];
  if (value.flag !== undefined) {
    if (!isRecord(value.flag)) return bad(`${path}.flag must be an object when present.`);
    if (!isColor(value.flag.color)) return bad(`${path}.flag.color must be w or b.`);
    if (!isNonNegativeSafeInteger(value.flag.at)) {
      return bad(`${path}.flag.at must be a non-negative integer.`);
    }
    flag = { color: value.flag.color, at: value.flag.at };
  }

  return {
    ok: true,
    value: {
      remainingMs: {
        w: value.remainingMs.w,
        b: value.remainingMs.b,
      },
      activeColor: value.activeColor,
      runningSince: value.runningSince,
      flag,
    },
  };
}

function validateTimeoutResult(value: unknown): ValidationResult<OnlineGameResultDTO> {
  if (!isRecord(value)) return bad("event.result must be an object.");
  if (!isColor(value.winner)) return bad("event.result.winner must be w or b.");
  if (value.reason !== "timeout") return bad("event.result.reason must be timeout.");
  return {
    ok: true,
    value: {
      winner: value.winner,
      reason: "timeout",
    },
  };
}

export function validateOnlineGameEvent(value: unknown): ValidationResult<OnlineGameEvent> {
  if (!isRecord(value)) return bad("event must be an object.");
  if (value.schemaVersion !== ONLINE_EVENT_SCHEMA_VERSION) {
    return bad(`event.schemaVersion must be ${ONLINE_EVENT_SCHEMA_VERSION}.`);
  }
  if (!isBoundedString(value.eventId, MAX_ID_LENGTH)) {
    return bad("event.eventId is invalid.");
  }
  if (!isIsoDateString(value.createdAt)) {
    return bad("event.createdAt must be a valid timestamp.");
  }
  if (value.rulesetVersion !== ONLINE_RULESET_VERSION) {
    return bad(`event.rulesetVersion must be ${ONLINE_RULESET_VERSION}.`);
  }
  if (typeof value.type !== "string") return bad("event.type must be a string.");
  if (!isBoundedString(value.gameId, MAX_ID_LENGTH)) return bad("event.gameId is invalid.");

  const envelope: OnlineGameEventEnvelope = {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId: value.eventId,
    createdAt: value.createdAt,
    rulesetVersion: ONLINE_RULESET_VERSION,
  };

  if (value.type === "game_created") {
    if ("whiteToken" in value || "blackToken" in value) {
      return bad("event.game_created must not contain raw player tokens.");
    }
    const setup = validateOnlineGameSetup(value.setup);
    if (!setup.ok) return setup;
    let clock: OnlineClockRecord | undefined;
    if (value.clock !== undefined) {
      if (!setup.value.timeControl) {
        return bad("event.clock requires setup.timeControl.");
      }
      const clockResult = validateClockRecord(value.clock, "event.clock");
      if (!clockResult.ok) return clockResult;
      clock = clockResult.value;
    } else if (setup.value.timeControl) {
      return bad("event.clock is required for time-controlled games.");
    }
    return {
      ok: true,
      value: {
        ...envelope,
        type: "game_created",
        gameId: value.gameId,
        setup: setup.value,
        clock,
      },
    };
  }

  if (value.type === "action_accepted") {
    if (!isColor(value.playerColor)) {
      return bad("event.playerColor must be w or b.");
    }
    if (!isPositiveSafeInteger(value.version)) {
      return bad("event.version must be a positive integer.");
    }
    const action = validateOnlineAction(value.action);
    if (!action.ok) return action;
    if (action.value.baseVersion + 1 !== value.version) {
      return bad("event.version must be one greater than action.baseVersion.");
    }
    if (!isNonNegativeSafeInteger(value.playedAt)) {
      return bad("event.playedAt must be a non-negative integer.");
    }
    let clock: OnlineClockRecord | undefined;
    if (value.clock !== undefined) {
      const clockResult = validateClockRecord(value.clock, "event.clock");
      if (!clockResult.ok) return clockResult;
      clock = clockResult.value;
    }
    return {
      ok: true,
      value: {
        ...envelope,
        type: "action_accepted",
        gameId: value.gameId,
        playerColor: value.playerColor,
        version: value.version,
        playedAt: value.playedAt,
        clock,
        action: action.value,
      },
    };
  }

  if (value.type === "timeout_adjudicated") {
    if (!isColor(value.playerColor)) {
      return bad("event.playerColor must be w or b.");
    }
    if (!isPositiveSafeInteger(value.version)) {
      return bad("event.version must be a positive integer.");
    }
    if (!isNonNegativeSafeInteger(value.adjudicatedAt)) {
      return bad("event.adjudicatedAt must be a non-negative integer.");
    }
    const result = validateTimeoutResult(value.result);
    if (!result.ok) return result;
    if (result.value.winner !== (value.playerColor === "w" ? "b" : "w")) {
      return bad("event.result.winner must be the opponent of the timed-out player.");
    }
    const clock = validateClockRecord(value.clock, "event.clock");
    if (!clock.ok) return clock;
    return {
      ok: true,
      value: {
        ...envelope,
        type: "timeout_adjudicated",
        gameId: value.gameId,
        playerColor: value.playerColor,
        version: value.version,
        adjudicatedAt: value.adjudicatedAt,
        result: result.value,
        clock: clock.value,
      },
    };
  }

  return bad("event.type is not supported.");
}

export function onlineGameEventsToRecords(
  events: OnlineGameEvent[],
  options: OnlineGameEventReplayOptions = {}
): OnlineGameRoomRecord[] {
  const rooms = new Map<string, OnlineGameRoomRecord>();
  const roomVersion = (room: OnlineGameRoomRecord): number =>
    room.timeout?.version ?? room.acceptedActions.at(-1)?.version ?? room.acceptedActions.length;

  events.forEach((event, eventIndex) => {
    try {
      if (event.type === "game_created") {
        if (rooms.has(event.gameId)) {
          throw new Error(`Duplicate online game creation event for ${event.gameId}.`);
        }
        if (event.setup.timeControl && !event.clock) {
          throw new Error(`Clocked creation event for ${event.gameId} is missing persisted clock.`);
        }
        const credentials = getCredentials(options.credentials, event.gameId);
        if (!credentials && !options.allowMissingCredentialsForProjection) {
          throw new Error(`Missing online game credentials for ${event.gameId}.`);
        }
        rooms.set(event.gameId, {
          gameId: event.gameId,
          whiteCredential: credentials?.whiteCredential ?? PROJECTION_ONLY_CREDENTIAL,
          blackCredential: credentials?.blackCredential ?? PROJECTION_ONLY_CREDENTIAL,
          setup: event.setup,
          clock: event.clock,
          acceptedActions: [],
        });
        return;
      }

      const room = rooms.get(event.gameId);
      if (!room) {
        throw new Error(`Online event references missing game ${event.gameId}.`);
      }
      if (room.timeout) {
        throw new Error(`Online event references already-finished game ${event.gameId}.`);
      }
      if (room.result) {
        throw new Error(`Online event references already-finished game ${event.gameId}.`);
      }
      if (event.type === "action_accepted" && event.clock && !room.setup.timeControl) {
        throw new Error(`Clocked action event references no-clock game ${event.gameId}.`);
      }
      if (event.type === "action_accepted" && room.setup.timeControl && !event.clock) {
        throw new Error(`Clocked action event for ${event.gameId} is missing persisted clock.`);
      }
      if (event.type === "timeout_adjudicated") {
        if (!room.setup.timeControl) {
          throw new Error(`Timeout event references no-clock game ${event.gameId}.`);
        }
        if (
          event.clock.activeColor !== null ||
          event.clock.runningSince !== null ||
          event.clock.remainingMs[event.playerColor] !== 0 ||
          event.clock.flag?.color !== event.playerColor
        ) {
          throw new Error(`Timeout event for ${event.gameId} has inconsistent clock state.`);
        }
      }
      const expectedVersion = roomVersion(room) + 1;
      if (event.version !== expectedVersion) {
        throw new Error(
          `Online event for ${event.gameId} has non-contiguous version ${event.version}.`
        );
      }

      if (event.type === "action_accepted") {
        room.acceptedActions.push({
          playerColor: event.playerColor,
          action: event.action,
          version: event.version,
          playedAt: event.playedAt,
          clock: event.clock,
        });
        if (event.action.type === "RESIGN") {
          room.result = { winner: opposite(event.playerColor), reason: "resignation" };
        } else {
          room.result = OnlineGameRoom.create(room).getSnapshot().result;
        }
        return;
      }

      if (event.type === "timeout_adjudicated") {
        const timeout: AcceptedOnlineTimeoutRecord = {
          playerColor: event.playerColor,
          version: event.version,
          adjudicatedAt: event.adjudicatedAt,
          result: event.result,
          clock: event.clock,
        };
        room.timeout = timeout;
        room.result = event.result;
      }
    } catch (error) {
      options.onEventError?.(eventIndex, error);
      throw error;
    }
  });

  return Array.from(rooms.values());
}
