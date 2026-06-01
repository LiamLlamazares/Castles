import type { Color, MoveRecord, TurnPhase } from "../Constants";
import type {
  OnlineClockStateDTO,
  OnlineGameResultDTO,
  OnlineGameSnapshotDTO,
  OnlineReject,
  OnlineRejectCode,
} from "./types";
import type { ValidationResult } from "./validation";
import {
  validateOnlineGameId,
  validateOnlineGameSetup,
  validateOnlineGameState,
} from "./validation";

export type OnlineServerMessage =
  | { type: "joined"; color: Color; snapshot: OnlineGameSnapshotDTO }
  | { type: "spectating"; snapshot: OnlineGameSnapshotDTO }
  | { type: "snapshot"; snapshot: OnlineGameSnapshotDTO }
  | { type: "rejected"; error: OnlineReject; snapshot?: OnlineGameSnapshotDTO }
  | { type: "error"; error: OnlineReject; snapshot?: OnlineGameSnapshotDTO }
  | { type: "pong"; clientTime?: unknown; serverTime?: number };

const REJECT_CODES = new Set<OnlineRejectCode>([
  "unauthorized",
  "stale_action",
  "wrong_player",
  "illegal_action",
  "duplicate_action",
  "game_over",
  "not_found",
  "bad_request",
  "bad_json",
  "not_joined",
  "unknown_message",
  "rate_limited",
  "persistence_failed",
]);
const TURN_PHASES = new Set<TurnPhase>(["Movement", "Attack", "Recruitment"]);
const RESULT_REASONS = new Set<OnlineGameResultDTO["reason"]>([
  "monarch_captured",
  "castle_control",
  "victory_points",
  "resignation",
  "timeout",
]);
const MAX_MOVE_HISTORY = 10_000;

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

function isColor(value: unknown): value is Color {
  return value === "w" || value === "b";
}

function isBoundedString(value: unknown, maxLength = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validateReject(value: unknown): ValidationResult<OnlineReject> {
  if (!isRecord(value)) return bad("message.error must be an object.");
  if (typeof value.code !== "string" || !REJECT_CODES.has(value.code as OnlineRejectCode)) {
    return bad("message.error.code is invalid.");
  }
  if (!isBoundedString(value.message, 1_000)) {
    return bad("message.error.message is invalid.");
  }
  return {
    ok: true,
    value: {
      code: value.code as OnlineRejectCode,
      message: value.message,
    },
  };
}

function validateMoveRecord(value: unknown, path: string): ValidationResult<MoveRecord> {
  if (!isRecord(value)) return bad(`${path} must be a move record object.`);
  if (!isBoundedString(value.notation, 256)) {
    return bad(`${path}.notation is invalid.`);
  }
  if (!isNonNegativeSafeInteger(value.turnNumber)) {
    return bad(`${path}.turnNumber must be a non-negative integer.`);
  }
  if (!isColor(value.color)) return bad(`${path}.color must be w or b.`);
  if (typeof value.phase !== "string" || !TURN_PHASES.has(value.phase as TurnPhase)) {
    return bad(`${path}.phase is invalid.`);
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

function validateMoveHistory(value: unknown): ValidationResult<MoveRecord[]> {
  if (!Array.isArray(value)) return bad("message.snapshot.moveHistory must be an array.");
  if (value.length > MAX_MOVE_HISTORY) return bad("message.snapshot.moveHistory is too long.");

  const moveHistory: MoveRecord[] = [];
  for (let index = 0; index < value.length; index++) {
    const move = validateMoveRecord(value[index], `message.snapshot.moveHistory[${index}]`);
    if (!move.ok) return move;
    moveHistory.push(move.value);
  }
  return { ok: true, value: moveHistory };
}

function validateResult(value: unknown): ValidationResult<OnlineGameResultDTO> {
  if (!isRecord(value)) return bad("message.snapshot.result must be an object.");
  if (!isColor(value.winner)) return bad("message.snapshot.result.winner must be w or b.");
  if (typeof value.reason !== "string" || !RESULT_REASONS.has(value.reason as OnlineGameResultDTO["reason"])) {
    return bad("message.snapshot.result.reason is invalid.");
  }
  return {
    ok: true,
    value: {
      winner: value.winner,
      reason: value.reason as OnlineGameResultDTO["reason"],
    },
  };
}

function validateClock(value: unknown): ValidationResult<OnlineClockStateDTO> {
  if (!isRecord(value)) return bad("message.snapshot.clock must be an object.");
  if (!isRecord(value.timeControl)) {
    return bad("message.snapshot.clock.timeControl must be an object.");
  }
  if (!isNonNegativeSafeInteger(value.timeControl.initialMs)) {
    return bad("message.snapshot.clock.timeControl.initialMs must be a non-negative integer.");
  }
  if (!isNonNegativeSafeInteger(value.timeControl.incrementMs)) {
    return bad("message.snapshot.clock.timeControl.incrementMs must be a non-negative integer.");
  }
  if (!isRecord(value.remainingMs)) {
    return bad("message.snapshot.clock.remainingMs must be an object.");
  }
  if (!isNonNegativeSafeInteger(value.remainingMs.w) || !isNonNegativeSafeInteger(value.remainingMs.b)) {
    return bad("message.snapshot.clock.remainingMs must contain non-negative w and b values.");
  }
  if (value.activeColor !== null && !isColor(value.activeColor)) {
    return bad("message.snapshot.clock.activeColor must be w, b, or null.");
  }
  if (value.runningSince !== null && !isNonNegativeSafeInteger(value.runningSince)) {
    return bad("message.snapshot.clock.runningSince must be a non-negative integer or null.");
  }
  if (!isNonNegativeSafeInteger(value.serverNow)) {
    return bad("message.snapshot.clock.serverNow must be a non-negative integer.");
  }

  let flag: OnlineClockStateDTO["flag"];
  if (value.flag !== undefined) {
    if (!isRecord(value.flag)) return bad("message.snapshot.clock.flag must be an object.");
    if (!isColor(value.flag.color)) return bad("message.snapshot.clock.flag.color must be w or b.");
    if (!isNonNegativeSafeInteger(value.flag.at)) {
      return bad("message.snapshot.clock.flag.at must be a non-negative integer.");
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
      serverNow: value.serverNow,
      flag,
    },
  };
}

function validateSnapshot(value: unknown): ValidationResult<OnlineGameSnapshotDTO> {
  if (!isRecord(value)) return bad("message.snapshot must be an object.");
  const gameId = validateOnlineGameId(value.gameId, "message.snapshot.gameId");
  if (!gameId.ok) return gameId;
  if (!isNonNegativeSafeInteger(value.version)) {
    return bad("message.snapshot.version must be a non-negative integer.");
  }
  const setup = validateOnlineGameSetup(value.setup);
  if (!setup.ok) return setup;
  const state = validateOnlineGameState(value.state);
  if (!state.ok) return state;
  const moveHistory = validateMoveHistory(value.moveHistory);
  if (!moveHistory.ok) return moveHistory;
  if (!isColor(value.playerToMove)) return bad("message.snapshot.playerToMove must be w or b.");
  if (typeof value.turnPhase !== "string" || !TURN_PHASES.has(value.turnPhase as TurnPhase)) {
    return bad("message.snapshot.turnPhase is invalid.");
  }

  let result: OnlineGameResultDTO | undefined;
  if (value.result !== undefined) {
    const resultValidation = validateResult(value.result);
    if (!resultValidation.ok) return resultValidation;
    result = resultValidation.value;
  }

  let clock: OnlineClockStateDTO | undefined;
  if (value.clock !== undefined) {
    const clockValidation = validateClock(value.clock);
    if (!clockValidation.ok) return clockValidation;
    clock = clockValidation.value;
  }

  return {
    ok: true,
    value: {
      gameId: gameId.value,
      version: value.version,
      setup: setup.value,
      state: state.value,
      moveHistory: moveHistory.value,
      playerToMove: value.playerToMove,
      turnPhase: value.turnPhase as TurnPhase,
      result,
      clock,
    },
  };
}

export function validateOnlineGameSnapshot(
  value: unknown
): ValidationResult<OnlineGameSnapshotDTO> {
  return validateSnapshot(value);
}

export function validateOnlineServerMessage(
  value: unknown
): ValidationResult<OnlineServerMessage> {
  if (!isRecord(value)) return bad("message must be an object.");
  if (typeof value.type !== "string") return bad("message.type must be a string.");

  if (value.type === "joined") {
    if (!isColor(value.color)) return bad("message.color must be w or b.");
    const snapshot = validateSnapshot(value.snapshot);
    if (!snapshot.ok) return snapshot;
    return {
      ok: true,
      value: {
        type: "joined",
        color: value.color,
        snapshot: snapshot.value,
      },
    };
  }

  if (value.type === "spectating") {
    const snapshot = validateSnapshot(value.snapshot);
    if (!snapshot.ok) return snapshot;
    return { ok: true, value: { type: "spectating", snapshot: snapshot.value } };
  }

  if (value.type === "snapshot") {
    const snapshot = validateSnapshot(value.snapshot);
    if (!snapshot.ok) return snapshot;
    return { ok: true, value: { type: "snapshot", snapshot: snapshot.value } };
  }

  if (value.type === "rejected" || value.type === "error") {
    const error = validateReject(value.error);
    if (!error.ok) return error;
    let snapshot: OnlineGameSnapshotDTO | undefined;
    if (value.snapshot !== undefined) {
      const snapshotResult = validateSnapshot(value.snapshot);
      if (!snapshotResult.ok) return snapshotResult;
      snapshot = snapshotResult.value;
    }
    return {
      ok: true,
      value: {
        type: value.type,
        error: error.value,
        snapshot,
      },
    };
  }

  if (value.type === "pong") {
    if (value.serverTime !== undefined && !isNonNegativeSafeInteger(value.serverTime)) {
      return bad("message.serverTime must be a non-negative integer when present.");
    }
    return {
      ok: true,
      value: {
        type: "pong",
        clientTime: value.clientTime,
        serverTime: value.serverTime,
      },
    };
  }

  return bad("message.type is not supported.");
}
