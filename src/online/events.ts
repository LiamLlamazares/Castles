import type { OnlineGameRoomRecord } from "./OnlineGameRoom";
import { Color } from "../Constants";
import { OnlineActionDTO, OnlineGameSetupDTO } from "./types";
import {
  validateOnlineAction,
  validateOnlineGameSetup,
  type ValidationResult,
} from "./validation";

export type OnlineGameEvent =
  | {
      type: "game_created";
      gameId: string;
      whiteToken: string;
      blackToken: string;
      setup: OnlineGameSetupDTO;
    }
  | {
      type: "action_accepted";
      gameId: string;
      playerColor: Color;
      version: number;
      action: OnlineActionDTO;
    };

export interface OnlineGameEventReplayOptions {
  onEventError?: (eventIndex: number, error: unknown) => void;
}

const MAX_ID_LENGTH = 128;
const MAX_TOKEN_LENGTH = 256;
const COLORS = new Set<Color>(["w", "b"]);

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

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function validateOnlineGameEvent(value: unknown): ValidationResult<OnlineGameEvent> {
  if (!isRecord(value)) return bad("event must be an object.");
  if (typeof value.type !== "string") return bad("event.type must be a string.");
  if (!isBoundedString(value.gameId, MAX_ID_LENGTH)) return bad("event.gameId is invalid.");

  if (value.type === "game_created") {
    if (!isBoundedString(value.whiteToken, MAX_TOKEN_LENGTH)) {
      return bad("event.whiteToken is invalid.");
    }
    if (!isBoundedString(value.blackToken, MAX_TOKEN_LENGTH)) {
      return bad("event.blackToken is invalid.");
    }
    const setup = validateOnlineGameSetup(value.setup);
    if (!setup.ok) return setup;
    return {
      ok: true,
      value: {
        type: "game_created",
        gameId: value.gameId,
        whiteToken: value.whiteToken,
        blackToken: value.blackToken,
        setup: setup.value,
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
    return {
      ok: true,
      value: {
        type: "action_accepted",
        gameId: value.gameId,
        playerColor: value.playerColor,
        version: value.version,
        action: action.value,
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

  events.forEach((event, eventIndex) => {
    try {
      if (event.type === "game_created") {
        if (rooms.has(event.gameId)) {
          throw new Error(`Duplicate online game creation event for ${event.gameId}.`);
        }
        rooms.set(event.gameId, {
          gameId: event.gameId,
          whiteToken: event.whiteToken,
          blackToken: event.blackToken,
          setup: event.setup,
          acceptedActions: [],
        });
        return;
      }

      const room = rooms.get(event.gameId);
      if (!room) {
        throw new Error(`Accepted action event references missing game ${event.gameId}.`);
      }
      if (event.version !== room.acceptedActions.length + 1) {
        throw new Error(
          `Accepted action event for ${event.gameId} has non-contiguous version ${event.version}.`
        );
      }

      room.acceptedActions.push({
        playerColor: event.playerColor,
        action: event.action,
      });
    } catch (error) {
      options.onEventError?.(eventIndex, error);
    }
  });

  return Array.from(rooms.values());
}
