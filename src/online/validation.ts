import {
  AbilityType,
  Color,
  PieceTheme,
  PieceType,
  SanctuaryType,
} from "../Constants";
import {
  BoardDTO,
  CastleDTO,
  GameStateDTO,
  HexDTO,
  OnlineActionDTO,
  OnlineGameSetupDTO,
  OnlineReject,
  PieceDTO,
  SanctuaryDTO,
} from "./types";
import { isValidClientActionId } from "./actionIdempotency";
import {
  ONLINE_PROTOCOL_VERSION,
  type OnlineProtocolVersion,
  isSupportedOnlineProtocolVersion,
} from "./protocolVersion";

type ValidationErrorCode = "bad_request";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: OnlineReject & { code: ValidationErrorCode } };

export type OnlineClientMessage =
  | {
      protocolVersion: OnlineProtocolVersion;
      type: "join";
      gameId: string;
      token: string;
    }
  | {
      protocolVersion: OnlineProtocolVersion;
      type: "spectate";
      gameId: string;
    }
  | {
      protocolVersion: OnlineProtocolVersion;
      type: "action";
      clientActionId: string;
      action: OnlineActionDTO;
    }
  | { protocolVersion: OnlineProtocolVersion; type: "ping"; clientTime?: unknown };

const MAX_BOARD_SIZE = 12;
const MAX_HEX_ABS = 32;
const MAX_PIECES = 300;
const MAX_CASTLES = 40;
const MAX_SANCTUARIES = 24;
const MAX_ID_LENGTH = 128;
const MAX_TOKEN_LENGTH = 256;
const MAX_INITIAL_TIME_MINUTES = 24 * 60;
const MAX_INCREMENT_SECONDS = 60 * 60;

const COLORS = new Set<Color>(["w", "b"]);
const PIECE_TYPES = new Set(Object.values(PieceType));
const SANCTUARY_TYPES = new Set(Object.values(SanctuaryType));
const ABILITY_TYPES = new Set(Object.values(AbilityType));
const PIECE_THEMES = new Set<PieceTheme>(["Chess", "Castles"]);

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

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isColor(value: unknown): value is Color {
  return typeof value === "string" && COLORS.has(value as Color);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

export function validateOnlineGameId(value: unknown, label = "gameId"): ValidationResult<string> {
  if (!isBoundedString(value, MAX_ID_LENGTH)) return bad(`${label} is invalid.`);
  return { ok: true, value };
}

function validateHex(value: unknown, path: string): ValidationResult<HexDTO> {
  if (!isRecord(value)) return bad(`${path} must be a hex object.`);
  const { q, r, s, colorIndex } = value;
  if (!isSafeInteger(q) || !isSafeInteger(r) || !isSafeInteger(s)) {
    return bad(`${path} hex coordinates must be integers.`);
  }
  if (Math.abs(q) > MAX_HEX_ABS || Math.abs(r) > MAX_HEX_ABS || Math.abs(s) > MAX_HEX_ABS) {
    return bad(`${path} hex coordinates are outside the accepted range.`);
  }
  if (q + r + s !== 0) {
    return bad(`${path} hex coordinates must satisfy q + r + s = 0.`);
  }
  if (colorIndex !== undefined && !isSafeInteger(colorIndex)) {
    return bad(`${path}.colorIndex must be an integer when present.`);
  }
  return {
    ok: true,
    value: {
      q,
      r,
      s,
      colorIndex,
    },
  };
}

function validatePiece(value: unknown, path: string): ValidationResult<PieceDTO> {
  if (!isRecord(value)) return bad(`${path} must be a piece object.`);
  const hex = validateHex(value.hex, `${path}.hex`);
  if (!hex.ok) return hex;
  if (!isColor(value.color)) return bad(`${path}.color must be w or b.`);
  if (typeof value.type !== "string" || !PIECE_TYPES.has(value.type as PieceType)) {
    return bad(`${path}.type is not a known piece type.`);
  }
  if (!isBoolean(value.canMove)) return bad(`${path}.canMove must be a boolean.`);
  if (!isBoolean(value.canAttack)) return bad(`${path}.canAttack must be a boolean.`);
  if (!isNonNegativeInteger(value.damage)) return bad(`${path}.damage must be a non-negative integer.`);
  if (!isBoolean(value.abilityUsed)) return bad(`${path}.abilityUsed must be a boolean.`);
  if (!isNonNegativeInteger(value.souls)) return bad(`${path}.souls must be a non-negative integer.`);
  if (!isBoolean(value.isRevived)) return bad(`${path}.isRevived must be a boolean.`);

  return {
    ok: true,
    value: {
      hex: hex.value,
      color: value.color,
      type: value.type as PieceType,
      canMove: value.canMove,
      canAttack: value.canAttack,
      damage: value.damage,
      abilityUsed: value.abilityUsed,
      souls: value.souls,
      isRevived: value.isRevived,
    },
  };
}

function validateCastle(value: unknown, path: string): ValidationResult<CastleDTO> {
  if (!isRecord(value)) return bad(`${path} must be a castle object.`);
  const hex = validateHex(value.hex, `${path}.hex`);
  if (!hex.ok) return hex;
  if (!isColor(value.color)) return bad(`${path}.color must be w or b.`);
  if (!isColor(value.owner)) return bad(`${path}.owner must be w or b.`);
  if (!isNonNegativeInteger(value.turnsControlled)) {
    return bad(`${path}.turnsControlled must be a non-negative integer.`);
  }
  if (!isBoolean(value.usedThisTurn)) return bad(`${path}.usedThisTurn must be a boolean.`);
  if (!isNonNegativeInteger(value.recruitmentCooldown)) {
    return bad(`${path}.recruitmentCooldown must be a non-negative integer.`);
  }

  return {
    ok: true,
    value: {
      hex: hex.value,
      color: value.color,
      owner: value.owner,
      turnsControlled: value.turnsControlled,
      usedThisTurn: value.usedThisTurn,
      recruitmentCooldown: value.recruitmentCooldown,
    },
  };
}

function validateSanctuary(value: unknown, path: string): ValidationResult<SanctuaryDTO> {
  if (!isRecord(value)) return bad(`${path} must be a sanctuary object.`);
  const hex = validateHex(value.hex, `${path}.hex`);
  if (!hex.ok) return hex;
  if (typeof value.type !== "string" || !SANCTUARY_TYPES.has(value.type as SanctuaryType)) {
    return bad(`${path}.type is not a known sanctuary type.`);
  }
  if (!isColor(value.territorySide)) return bad(`${path}.territorySide must be w or b.`);
  if (value.controller !== null && !isColor(value.controller)) {
    return bad(`${path}.controller must be w, b, or null.`);
  }
  if (!isNonNegativeInteger(value.cooldown)) {
    return bad(`${path}.cooldown must be a non-negative integer.`);
  }
  if (!isBoolean(value.hasPledgedThisGame)) {
    return bad(`${path}.hasPledgedThisGame must be a boolean.`);
  }

  return {
    ok: true,
    value: {
      hex: hex.value,
      type: value.type as SanctuaryType,
      territorySide: value.territorySide,
      controller: value.controller,
      cooldown: value.cooldown,
      hasPledgedThisGame: value.hasPledgedThisGame,
    },
  };
}

function validateArray<T>(
  value: unknown,
  path: string,
  maxLength: number,
  itemValidator: (item: unknown, itemPath: string) => ValidationResult<T>
): ValidationResult<T[]> {
  if (!Array.isArray(value)) return bad(`${path} must be an array.`);
  if (value.length > maxLength) return bad(`${path} has too many entries.`);

  const result: T[] = [];
  for (let index = 0; index < value.length; index++) {
    const item = itemValidator(value[index], `${path}[${index}]`);
    if (!item.ok) return item;
    result.push(item.value);
  }
  return { ok: true, value: result };
}

function validateBoard(value: unknown): ValidationResult<BoardDTO> {
  if (!isRecord(value)) return bad("setup.board must be an object.");
  if (!isRecord(value.config)) return bad("setup.board.config must be an object.");
  if (!isSafeInteger(value.config.nSquares)) {
    return bad("setup.board.config.nSquares must be an integer.");
  }
  if (value.config.nSquares < 3 || value.config.nSquares > MAX_BOARD_SIZE) {
    return bad(`setup.board.config.nSquares must be between 3 and ${MAX_BOARD_SIZE}.`);
  }
  for (const key of ["riverCrossingLength", "riverSegmentLength"] as const) {
    const setting = value.config[key];
    if (setting !== undefined && (!isSafeInteger(setting) || setting < 0 || setting > MAX_BOARD_SIZE)) {
      return bad(`setup.board.config.${key} must be a small non-negative integer when present.`);
    }
  }
  if (value.config.hasHighGround !== undefined && !isBoolean(value.config.hasHighGround)) {
    return bad("setup.board.config.hasHighGround must be a boolean when present.");
  }

  const castles = validateArray(value.castles, "setup.board.castles", MAX_CASTLES, validateCastle);
  if (!castles.ok) return castles;

  return {
    ok: true,
    value: {
      config: {
        nSquares: value.config.nSquares,
        riverCrossingLength: value.config.riverCrossingLength as number | undefined,
        riverSegmentLength: value.config.riverSegmentLength as number | undefined,
        hasHighGround: value.config.hasHighGround as boolean | undefined,
      },
      castles: castles.value,
    },
  };
}

export function validateOnlineGameSetup(value: unknown): ValidationResult<OnlineGameSetupDTO> {
  if (!isRecord(value)) return bad("setup must be an object.");

  const board = validateBoard(value.board);
  if (!board.ok) return board;
  const pieces = validateArray(value.pieces, "setup.pieces", MAX_PIECES, validatePiece);
  if (!pieces.ok) return pieces;
  const sanctuaries = validateArray(
    value.sanctuaries,
    "setup.sanctuaries",
    MAX_SANCTUARIES,
    validateSanctuary
  );
  if (!sanctuaries.ok) return sanctuaries;

  let sanctuarySettings: OnlineGameSetupDTO["sanctuarySettings"];
  if (value.sanctuarySettings !== undefined) {
    if (!isRecord(value.sanctuarySettings)) return bad("setup.sanctuarySettings must be an object.");
    if (
      !isNonNegativeInteger(value.sanctuarySettings.unlockTurn) ||
      !isNonNegativeInteger(value.sanctuarySettings.cooldown)
    ) {
      return bad("setup.sanctuarySettings values must be non-negative integers.");
    }
    sanctuarySettings = {
      unlockTurn: value.sanctuarySettings.unlockTurn,
      cooldown: value.sanctuarySettings.cooldown,
    };
  }

  let gameRules: OnlineGameSetupDTO["gameRules"];
  if (value.gameRules !== undefined) {
    if (!isRecord(value.gameRules)) return bad("setup.gameRules must be an object.");
    if (!isBoolean(value.gameRules.vpModeEnabled)) {
      return bad("setup.gameRules.vpModeEnabled must be a boolean.");
    }
    gameRules = { vpModeEnabled: value.gameRules.vpModeEnabled };
  }

  let initialPoolTypes: OnlineGameSetupDTO["initialPoolTypes"];
  if (value.initialPoolTypes !== undefined) {
    if (!Array.isArray(value.initialPoolTypes) || value.initialPoolTypes.length > MAX_SANCTUARIES) {
      return bad("setup.initialPoolTypes must be a small array.");
    }
    for (const type of value.initialPoolTypes) {
      if (typeof type !== "string" || !SANCTUARY_TYPES.has(type as SanctuaryType)) {
        return bad("setup.initialPoolTypes contains an unknown sanctuary type.");
      }
    }
    initialPoolTypes = value.initialPoolTypes as SanctuaryType[];
  }

  let pieceTheme: OnlineGameSetupDTO["pieceTheme"];
  if (value.pieceTheme !== undefined) {
    if (typeof value.pieceTheme !== "string" || !PIECE_THEMES.has(value.pieceTheme as PieceTheme)) {
      return bad("setup.pieceTheme must be a known piece theme.");
    }
    pieceTheme = value.pieceTheme as PieceTheme;
  }

  let timeControl: OnlineGameSetupDTO["timeControl"];
  if (value.timeControl !== undefined) {
    if (!isRecord(value.timeControl)) return bad("setup.timeControl must be an object.");
    if (
      !isSafeInteger(value.timeControl.initial) ||
      value.timeControl.initial < 1 ||
      value.timeControl.initial > MAX_INITIAL_TIME_MINUTES
    ) {
      return bad(
        `setup.timeControl.initial must be an integer between 1 and ${MAX_INITIAL_TIME_MINUTES}.`
      );
    }
    if (
      !isNonNegativeInteger(value.timeControl.increment) ||
      value.timeControl.increment > MAX_INCREMENT_SECONDS
    ) {
      return bad(
        `setup.timeControl.increment must be an integer between 0 and ${MAX_INCREMENT_SECONDS}.`
      );
    }
    timeControl = {
      initial: value.timeControl.initial,
      increment: value.timeControl.increment,
    };
  }

  return {
    ok: true,
    value: {
      board: board.value,
      pieces: pieces.value,
      sanctuaries: sanctuaries.value,
      sanctuarySettings,
      gameRules,
      initialPoolTypes,
      pieceTheme,
      timeControl,
    },
  };
}

function validatePhoenixRecord(value: unknown, path: string): ValidationResult<GameStateDTO["phoenixRecords"][number]> {
  if (!isRecord(value)) return bad(`${path} must be a phoenix record object.`);
  if (!isNonNegativeInteger(value.respawnTurn)) {
    return bad(`${path}.respawnTurn must be a non-negative integer.`);
  }
  if (!isColor(value.owner)) return bad(`${path}.owner must be w or b.`);
  return {
    ok: true,
    value: {
      respawnTurn: value.respawnTurn,
      owner: value.owner,
    },
  };
}

export function validateOnlineGameState(value: unknown): ValidationResult<GameStateDTO> {
  if (!isRecord(value)) return bad("state must be an object.");

  const pieces = validateArray(value.pieces, "state.pieces", MAX_PIECES, validatePiece);
  if (!pieces.ok) return pieces;
  const castles = validateArray(value.castles, "state.castles", MAX_CASTLES, validateCastle);
  if (!castles.ok) return castles;
  const sanctuaries = validateArray(
    value.sanctuaries,
    "state.sanctuaries",
    MAX_SANCTUARIES,
    validateSanctuary
  );
  if (!sanctuaries.ok) return sanctuaries;
  if (!isNonNegativeInteger(value.turnCounter)) {
    return bad("state.turnCounter must be a non-negative integer.");
  }

  if (!Array.isArray(value.sanctuaryPool) || value.sanctuaryPool.length > MAX_SANCTUARIES) {
    return bad("state.sanctuaryPool must be a small array.");
  }
  const sanctuaryPool: SanctuaryType[] = [];
  for (const type of value.sanctuaryPool) {
    if (typeof type !== "string" || !SANCTUARY_TYPES.has(type as SanctuaryType)) {
      return bad("state.sanctuaryPool contains an unknown sanctuary type.");
    }
    sanctuaryPool.push(type as SanctuaryType);
  }

  const graveyard = validateArray(value.graveyard, "state.graveyard", MAX_PIECES, validatePiece);
  if (!graveyard.ok) return graveyard;
  const phoenixRecords = validateArray(
    value.phoenixRecords,
    "state.phoenixRecords",
    MAX_PIECES,
    validatePhoenixRecord
  );
  if (!phoenixRecords.ok) return phoenixRecords;

  let promotionPending: GameStateDTO["promotionPending"];
  if (value.promotionPending === null) {
    promotionPending = null;
  } else if (value.promotionPending === undefined) {
    return bad("state.promotionPending must be null or a piece object.");
  } else {
    const pending = validatePiece(value.promotionPending, "state.promotionPending");
    if (!pending.ok) return pending;
    promotionPending = pending.value;
  }

  let victoryPoints: GameStateDTO["victoryPoints"];
  if (value.victoryPoints !== undefined) {
    if (!isRecord(value.victoryPoints)) return bad("state.victoryPoints must be an object.");
    if (
      !isNonNegativeInteger(value.victoryPoints.w) ||
      !isNonNegativeInteger(value.victoryPoints.b)
    ) {
      return bad("state.victoryPoints must contain non-negative w and b scores.");
    }
    victoryPoints = { w: value.victoryPoints.w, b: value.victoryPoints.b };
  }

  return {
    ok: true,
    value: {
      pieces: pieces.value,
      castles: castles.value,
      sanctuaries: sanctuaries.value,
      turnCounter: value.turnCounter,
      sanctuaryPool,
      graveyard: graveyard.value,
      phoenixRecords: phoenixRecords.value,
      promotionPending,
      victoryPoints,
    },
  };
}

export function validateOnlineAction(value: unknown): ValidationResult<OnlineActionDTO> {
  if (!isRecord(value)) return bad("action must be an object.");
  if (!isNonNegativeInteger(value.baseVersion)) {
    return bad("action.baseVersion must be a non-negative integer.");
  }
  if (typeof value.type !== "string") return bad("action.type must be a string.");

  const baseVersion = value.baseVersion;
  switch (value.type) {
    case "MOVE": {
      const from = validateHex(value.from, "action.from");
      if (!from.ok) return from;
      const to = validateHex(value.to, "action.to");
      if (!to.ok) return to;
      return { ok: true, value: { type: "MOVE", baseVersion, from: from.value, to: to.value } };
    }
    case "ATTACK": {
      const from = validateHex(value.from, "action.from");
      if (!from.ok) return from;
      const target = validateHex(value.target, "action.target");
      if (!target.ok) return target;
      return { ok: true, value: { type: "ATTACK", baseVersion, from: from.value, target: target.value } };
    }
    case "CASTLE_ATTACK": {
      const from = validateHex(value.from, "action.from");
      if (!from.ok) return from;
      const castle = validateHex(value.castle, "action.castle");
      if (!castle.ok) return castle;
      return { ok: true, value: { type: "CASTLE_ATTACK", baseVersion, from: from.value, castle: castle.value } };
    }
    case "RECRUIT": {
      const castle = validateHex(value.castle, "action.castle");
      if (!castle.ok) return castle;
      const spawn = validateHex(value.spawn, "action.spawn");
      if (!spawn.ok) return spawn;
      return { ok: true, value: { type: "RECRUIT", baseVersion, castle: castle.value, spawn: spawn.value } };
    }
    case "PLEDGE": {
      const sanctuary = validateHex(value.sanctuary, "action.sanctuary");
      if (!sanctuary.ok) return sanctuary;
      const spawn = validateHex(value.spawn, "action.spawn");
      if (!spawn.ok) return spawn;
      return { ok: true, value: { type: "PLEDGE", baseVersion, sanctuary: sanctuary.value, spawn: spawn.value } };
    }
    case "ABILITY": {
      const from = validateHex(value.from, "action.from");
      if (!from.ok) return from;
      const target = validateHex(value.target, "action.target");
      if (!target.ok) return target;
      if (typeof value.ability !== "string" || !ABILITY_TYPES.has(value.ability as AbilityType)) {
        return bad("action.ability is not a known ability type.");
      }
      return {
        ok: true,
        value: {
          type: "ABILITY",
          baseVersion,
          from: from.value,
          ability: value.ability as AbilityType,
          target: target.value,
        },
      };
    }
    case "PROMOTE":
      if (typeof value.pieceType !== "string" || !PIECE_TYPES.has(value.pieceType as PieceType)) {
        return bad("action.pieceType is not a known piece type.");
      }
      return {
        ok: true,
        value: { type: "PROMOTE", baseVersion, pieceType: value.pieceType as PieceType },
      };
    case "PASS":
      return { ok: true, value: { type: "PASS", baseVersion } };
    case "RESIGN":
      return { ok: true, value: { type: "RESIGN", baseVersion } };
    default:
      return bad("action.type is not supported.");
  }
}

export function validateClientMessage(value: unknown): ValidationResult<OnlineClientMessage> {
  if (!isRecord(value)) return bad("message must be an object.");
  if (!isSupportedOnlineProtocolVersion(value.protocolVersion)) {
    return bad(`message.protocolVersion must be ${ONLINE_PROTOCOL_VERSION}.`);
  }
  if (value.type === "join") {
    const gameId = validateOnlineGameId(value.gameId, "join.gameId");
    if (!gameId.ok) return gameId;
    if (!isBoundedString(value.token, MAX_TOKEN_LENGTH)) return bad("join.token is invalid.");
    return {
      ok: true,
      value: {
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "join",
        gameId: gameId.value,
        token: value.token,
      },
    };
  }

  if (value.type === "spectate") {
    const gameId = validateOnlineGameId(value.gameId, "spectate.gameId");
    if (!gameId.ok) return gameId;
    return {
      ok: true,
      value: {
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "spectate",
        gameId: gameId.value,
      },
    };
  }

  if (value.type === "action") {
    if (!isValidClientActionId(value.clientActionId)) {
      return bad("action.clientActionId is invalid.");
    }
    const action = validateOnlineAction(value.action);
    if (!action.ok) return action;
    return {
      ok: true,
      value: {
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "action",
        clientActionId: value.clientActionId,
        action: action.value,
      },
    };
  }

  if (value.type === "ping") {
    return {
      ok: true,
      value: {
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "ping",
        clientTime: value.clientTime,
      },
    };
  }

  return bad("message.type is not supported.");
}
