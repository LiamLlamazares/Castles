//Size of board
export const N_SQUARES = 8;
export const HEX_SIZE_FACTOR = 4;
export const X_OFFSET = 100;
export const LAYOUT_TYPE = "flat";
export const COLORS = ["w", "b"] as const;

export enum PieceType {
  Swordsman = "Swordsman",
  Archer = "Archer",
  Knight = "Knight",
  Trebuchet = "Trebuchet",
  Eagle = "Eagle",
  Giant = "Giant",
  Assassin = "Assassin",
  Dragon = "Dragon",
  Monarch = "Monarch",
}
export enum AttackType {
  Melee = "Melee",
  Ranged = "Ranged",
  LongRanged = "LongRanged",
  Swordsman = "Swordsman",
}

export enum PieceStrength {
  Swordsman = 1,
  Archer = 1,
  Knight = 1,
  Trebuchet = 1,
  Eagle = 1,
  Giant = 2,
  Assassin = 1,
  Dragon = 3,
  Monarch = 3,
}

export type TurnPhase = "Movement" | "Attack" | "Castles";
export type Color = "w" | "b";
export const STARTING_TIME = 20 * 60;
export const DEFENDED_PIECE_IS_PROTECTED_RANGED = true; //if true, a defended piece is protected from ranged attacks

// Turn phase cycle constants
export const PHASE_CYCLE_LENGTH = 5; // Movement(0-1) → Attack(2-3) → Castles(4)
export const PLAYER_CYCLE_LENGTH = 10; // Full round = 2 players × 5 phases
export const MOVEMENT_PHASE_END = 2; // turnCounter % 5 < 2 = Movement
export const ATTACK_PHASE_END = 4; // turnCounter % 5 < 4 = Attack

// History entry type for strict typing
export interface HistoryEntry {
  pieces: import('./Classes/Piece').Piece[];
  Castles: import('./Classes/Castle').Castle[];
  turnCounter: number;
}
