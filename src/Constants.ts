//Size of board
export const N_SQUARES = 8;

/**
 * ZOOM LEVEL (Smaller number = Larger Board)
 * 3.0 = Very Large (Maximized)
 * 3.2 = Balanced
 * 3.5 = Smaller (Requested)
 * 3.8 = Small
 */
export const HEX_SIZE_FACTOR = 3.8;

/**
 * HORIZONTAL OFFSET (Pixels)
 * Negative = Shift Left (closer to sidebar)
 * Positive = Shift Right
 * 0 = Centered in available space (right of sidebar)
 */
export const X_OFFSET = 0;

/**
 * VERTICAL OFFSET (Pixels)
 * Positive = Shift Down (creates top padding)
 * Negative = Shift Up
 * 0 = Centered Vertically (Half Screen Height)
 */
export const Y_OFFSET = 0;

/**
 * PIECE SIZE SCALAR
 * Multiplier for piece image size relative to hex size.
 * 1.0 = Bounds match hex flat-to-flat width approx.
 * 1.5 = Large pieces (overflow hex slightly)
 */
export const PIECE_SCALE_FACTOR = 1.35;

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

// Rendering constants (derived from N_SQUARES for consistent scaling)
export const PIECE_IMAGE_SIZE = 275; // Base size of piece images in pixels
export const PIECE_IMAGE_OFFSET = 145; // Offset to center piece on hex
// Dot size scalar relative to hex size (0.25 = 1/4th of hex size)
export const LEGAL_MOVE_DOT_SCALE_FACTOR = 0.25;

// History entry type for strict typing
export interface MoveRecord {
  notation: string;
  turnNumber: number;
  color: Color;
  phase: TurnPhase;
}

export interface HistoryEntry {
  pieces: import('./Classes/Piece').Piece[];
  castles: import('./Classes/Castle').Castle[];
  turnCounter: number;
  moveNotation: MoveRecord[]; // List of all moves made so far
}
