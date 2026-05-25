import { GameState, PositionSnapshot } from "../Core/GameState";
import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Sanctuary } from "../Entities/Sanctuary";

type SnapshotLike = Pick<
  GameState | PositionSnapshot,
  | "pieces"
  | "castles"
  | "sanctuaries"
  | "turnCounter"
  | "sanctuaryPool"
  | "graveyard"
  | "phoenixRecords"
>;

const pieceKey = (piece: Piece): string =>
  [
    piece.color,
    piece.type,
    piece.hex.getKey(),
    `move=${piece.canMove}`,
    `attack=${piece.canAttack}`,
    `dmg=${piece.damage}`,
    `ability=${piece.abilityUsed}`,
    `souls=${piece.souls}`,
    `revived=${piece.isRevived}`,
  ].join(":");

const castleKey = (castle: Castle): string =>
  [
    castle.color,
    castle.owner ?? "none",
    castle.hex.getKey(),
    `turns=${castle.turns_controlled}`,
    `used=${castle.used_this_turn}`,
  ].join(":");

const sanctuaryKey = (sanctuary: Sanctuary): string =>
  [
    sanctuary.type,
    sanctuary.hex.getKey(),
    sanctuary.territorySide,
    sanctuary.controller ?? "none",
    `cooldown=${sanctuary.cooldown}`,
    `pledged=${sanctuary.hasPledgedThisGame}`,
  ].join(":");

export function canonicalState(state: SnapshotLike) {
  return {
    pieces: state.pieces.map(pieceKey).sort(),
    castles: state.castles.map(castleKey).sort(),
    sanctuaries: state.sanctuaries.map(sanctuaryKey).sort(),
    turnCounter: state.turnCounter,
    sanctuaryPool: [...state.sanctuaryPool].sort(),
    graveyard: state.graveyard.map(pieceKey).sort(),
    phoenixRecords: [...state.phoenixRecords]
      .map((record) => `${record.owner}:${record.respawnTurn}`)
      .sort(),
  };
}

export function expectCanonicalStateEqual(
  actual: SnapshotLike,
  expected: SnapshotLike
): void {
  expect(canonicalState(actual)).toEqual(canonicalState(expected));
}
