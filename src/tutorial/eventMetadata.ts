import { AbilityType, type Color, PieceType, SanctuaryConfig, SanctuaryType, type TurnPhase } from "../Constants";
import { Hex } from "../Classes/Entities/Hex";
import { NotationService } from "../Classes/Systems/NotationService";
import type { TutorialGameEvent } from "./types";

export interface TutorialEventSnapshotPiece {
  color: Color;
  type: PieceType;
}

export interface TutorialEventSnapshotCastle {
  color: string;
  owner: string;
}

export interface TutorialEventSnapshotSanctuary {
  type: SanctuaryType;
  controller: string | null;
}

export interface TutorialEventSnapshot {
  pieceCount: number;
  graveyardLength: number;
  piecesByHex: Record<string, TutorialEventSnapshotPiece>;
  castleOwnersByHex: Record<string, string>;
  castlesByHex?: Record<string, TutorialEventSnapshotCastle>;
  sanctuariesByHex?: Record<string, TutorialEventSnapshotSanctuary>;
}

interface BuildTutorialGameEventInput {
  notation: string;
  phase: TurnPhase;
  resultPhase: TurnPhase;
  previousSnapshot: TutorialEventSnapshot | null;
  currentSnapshot: TutorialEventSnapshot;
  castleHexKeys: Set<string>;
}

const PIECE_CODE_TO_TYPE: Record<string, PieceType> = {
  Sw: PieceType.Swordsman,
  Swo: PieceType.Swordsman,
  Ar: PieceType.Archer,
  Arc: PieceType.Archer,
  Kn: PieceType.Knight,
  Kni: PieceType.Knight,
  Tr: PieceType.Trebuchet,
  Tre: PieceType.Trebuchet,
  Ea: PieceType.Eagle,
  Eag: PieceType.Eagle,
  Gi: PieceType.Giant,
  Gia: PieceType.Giant,
  As: PieceType.Assassin,
  Asn: PieceType.Assassin,
  Dr: PieceType.Dragon,
  Dra: PieceType.Dragon,
  Mo: PieceType.Monarch,
  Mon: PieceType.Monarch,
  Wl: PieceType.Wolf,
  Wlf: PieceType.Wolf,
  He: PieceType.Healer,
  Hea: PieceType.Healer,
  Rn: PieceType.Ranger,
  Rng: PieceType.Ranger,
  Wi: PieceType.Wizard,
  Wiz: PieceType.Wizard,
  Ne: PieceType.Necromancer,
  Nec: PieceType.Necromancer,
  Ph: PieceType.Phoenix,
  Phx: PieceType.Phoenix,
};

function parseCoordinatePair(notationPart: string): { sourceHexKey?: string; targetHexKey?: string } {
  const match = notationPart.match(/^([A-Z]\d+)(?:x)?([A-Z]\d+)(?:=[A-Za-z]+)?$/);
  if (!match) return {};
  try {
    return {
      sourceHexKey: NotationService.fromCoordinate(match[1]).getKey(),
      targetHexKey: NotationService.fromCoordinate(match[2]).getKey(),
    };
  } catch {
    return {};
  }
}

function parsePieceCode(pieceCode: string | undefined): PieceType | undefined {
  return pieceCode ? PIECE_CODE_TO_TYPE[pieceCode] : undefined;
}

function getSnapshotPieceId(piece: TutorialEventSnapshotPiece | undefined): string | undefined {
  return piece ? `${piece.color}:${piece.type}` : undefined;
}

function getAbilityTypeFromNotation(notation: string): AbilityType | undefined {
  const abilityCode = notation.charAt(1);
  return abilityCode === "F"
    ? AbilityType.Fireball
    : abilityCode === "T"
      ? AbilityType.Teleport
      : abilityCode === "R"
        ? AbilityType.RaiseDead
        : undefined;
}

function hexKeysAreAdjacent(a: string, b: string): boolean {
  try {
    return Hex.fromKey(a).distance(Hex.fromKey(b)) === 1;
  } catch {
    return false;
  }
}

function findSourceCastleHexKey(
  targetHexKey: string | undefined,
  createdPiece: TutorialEventSnapshotPiece | undefined,
  currentSnapshot: TutorialEventSnapshot
): string | undefined {
  if (!targetHexKey || !currentSnapshot.castlesByHex) return undefined;
  const adjacentCastles = Object.entries(currentSnapshot.castlesByHex).filter(([hexKey]) =>
    hexKeysAreAdjacent(hexKey, targetHexKey)
  );
  if (adjacentCastles.length === 0) return undefined;

  const capturedCastle = adjacentCastles.find(([, castle]) =>
    createdPiece && castle.owner === createdPiece.color && castle.color !== createdPiece.color
  );
  return capturedCastle?.[0] ?? adjacentCastles[0]?.[0];
}

function findSourceSanctuaryHexKey(
  targetHexKey: string | undefined,
  createdPieceType: PieceType | undefined,
  previousSnapshot: TutorialEventSnapshot | null,
  currentSnapshot: TutorialEventSnapshot
): string | undefined {
  if (!targetHexKey) return undefined;
  const sanctuariesByHex = previousSnapshot?.sanctuariesByHex ?? currentSnapshot.sanctuariesByHex;
  if (!sanctuariesByHex) return undefined;
  const adjacentSanctuaries = Object.entries(sanctuariesByHex).filter(([hexKey]) =>
    hexKeysAreAdjacent(hexKey, targetHexKey)
  );
  if (adjacentSanctuaries.length === 0) return undefined;

  const matchingSanctuary = adjacentSanctuaries.find(([, sanctuary]) =>
    createdPieceType && SanctuaryConfig[sanctuary.type]?.pieceType === createdPieceType
  );
  return matchingSanctuary?.[0] ?? adjacentSanctuaries[0]?.[0];
}

export function buildTutorialGameEventFromMove({
  notation,
  phase,
  resultPhase,
  previousSnapshot,
  currentSnapshot,
  castleHexKeys,
}: BuildTutorialGameEventInput): TutorialGameEvent {
  const pieceRemoved = previousSnapshot
    ? currentSnapshot.pieceCount < previousSnapshot.pieceCount ||
      currentSnapshot.graveyardLength > previousSnapshot.graveyardLength
    : false;
  const pieceAdded = previousSnapshot
    ? currentSnapshot.pieceCount > previousSnapshot.pieceCount
    : false;
  const castleControlChanged = previousSnapshot
    ? Object.entries(currentSnapshot.castleOwnersByHex).some(
        ([hexKey, owner]) =>
          previousSnapshot.castleOwnersByHex[hexKey] !== undefined &&
          previousSnapshot.castleOwnersByHex[hexKey] !== owner
      )
    : false;

  const abilityNotationPart = notation.includes(":") ? notation.split(":")[1] : notation;
  const coordinatePair = parseCoordinatePair(abilityNotationPart);
  let sourceHexKey = coordinatePair.sourceHexKey;
  let targetHexKey = coordinatePair.targetHexKey;
  let createdPieceType: PieceType | undefined;

  const recruitmentMatch = notation.match(/^([A-Z]\d+)=([A-Za-z]+)$/);
  if (recruitmentMatch) {
    try {
      targetHexKey = NotationService.fromCoordinate(recruitmentMatch[1]).getKey();
    } catch {
      targetHexKey = undefined;
    }
    createdPieceType = parsePieceCode(recruitmentMatch[2]);
  }

  const pledgeMatch = notation.match(/^P:([A-Za-z]+)([A-Z]\d+)$/);
  if (pledgeMatch) {
    try {
      targetHexKey = NotationService.fromCoordinate(pledgeMatch[2]).getKey();
    } catch {
      targetHexKey = undefined;
    }
    createdPieceType = parsePieceCode(pledgeMatch[1]);
  }

  const promotionMatch = notation.match(/^[A-Z]\d+[A-Z]\d+=([A-Za-z]{2,3})$/);
  if (promotionMatch) {
    createdPieceType = parsePieceCode(promotionMatch[1]);
  }

  const sourcePiece = sourceHexKey ? previousSnapshot?.piecesByHex[sourceHexKey] : undefined;
  const targetPiece = targetHexKey ? previousSnapshot?.piecesByHex[targetHexKey] : undefined;
  const createdPiece = targetHexKey ? currentSnapshot.piecesByHex[targetHexKey] : undefined;
  let actorPieceType = sourcePiece?.type;
  let actorColor = sourcePiece?.color;
  const targetPieceType = targetPiece?.type;
  const targetColor = targetPiece?.color;
  if (!actorPieceType && promotionMatch && targetPieceType) {
    actorPieceType = targetPieceType;
    actorColor = targetColor;
  }
  const emittedCreatedPieceType =
    createdPieceType ?? (pieceAdded ? createdPiece?.type : undefined);
  const emittedCreatedColor = emittedCreatedPieceType ? createdPiece?.color : undefined;
  const targetPieceChanged = !!(
    previousSnapshot &&
    targetHexKey &&
    previousSnapshot.piecesByHex[targetHexKey] &&
    getSnapshotPieceId(previousSnapshot.piecesByHex[targetHexKey]) !==
      getSnapshotPieceId(currentSnapshot.piecesByHex[targetHexKey])
  );

  let type: TutorialGameEvent["type"] = "move";
  let abilityType: AbilityType | undefined;
  if (notation.toLowerCase() === "pass") {
    type = "pass";
  } else if (notation.startsWith("P:")) {
    type = "pledge";
  } else if (/^[A-Z][TFR]:/.test(notation)) {
    type = "ability";
    abilityType = getAbilityTypeFromNotation(notation);
  } else if (phase === "Recruitment" && notation.includes("=")) {
    type = "recruitment";
  } else if (phase === "Movement" && notation.includes("=")) {
    type = "promotion";
  } else if (notation.includes("x")) {
    type = pieceRemoved || targetPieceChanged || castleControlChanged ? "capture" : "attack";
  } else if (castleControlChanged) {
    type = "capture";
  } else if (phase === "Movement") {
    type = "move";
  }

  const targetKind = targetHexKey
    ? targetPieceType
      ? "piece"
      : castleHexKeys.has(targetHexKey)
        ? "castle"
        : "hex"
    : undefined;
  const sourceCastleHexKey =
    type === "recruitment"
      ? findSourceCastleHexKey(
          targetHexKey,
          targetHexKey ? currentSnapshot.piecesByHex[targetHexKey] : undefined,
          currentSnapshot
        )
      : undefined;
  const sourceSanctuaryHexKey =
    type === "pledge"
      ? findSourceSanctuaryHexKey(targetHexKey, emittedCreatedPieceType, previousSnapshot, currentSnapshot)
      : undefined;

  return {
    type,
    notation,
    phase,
    resultPhase,
    abilityType,
    actorPieceType,
    actorColor,
    targetPieceType,
    targetColor,
    createdPieceType: emittedCreatedPieceType,
    createdColor: emittedCreatedColor,
    pieceColor: targetKind === "piece" ? targetColor : undefined,
    sourceHexKey,
    targetHexKey,
    sourceCastleHexKey,
    sourceSanctuaryHexKey,
    targetKind,
    pieceRemoved,
    pieceAdded,
    castleControlChanged,
  };
}
