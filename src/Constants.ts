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
  // Special pieces (from Sanctuaries)
  Wolf = "Wolf",
  Healer = "Healer",
  Ranger = "Ranger",
  Wizard = "Wizard",
  Necromancer = "Necromancer",
  Phoenix = "Phoenix",
}

export enum SanctuaryType {
  WolfCovenant = "WolfCovenant",
  SacredSpring = "SacredSpring",
  WardensWatch = "WardensWatch",
  ArcaneRefuge = "ArcaneRefuge",
  ForsakenGrounds = "ForsakenGrounds",
  PyreEternal = "PyreEternal",
}

export enum AttackType {
  Melee = "Melee",
  Ranged = "Ranged",
  LongRanged = "LongRanged",
  Swordsman = "Swordsman",
  None = "None", // For Healer
}

/**
 * Ability types for special pieces (Wizard, Necromancer).
 * Used by activateAbility methods throughout the codebase.
 */
export enum AbilityType {
  Fireball = "Fireball",     // Wizard: AoE damage
  Teleport = "Teleport",     // Wizard: Move to distant hex
  RaiseDead = "RaiseDead",   // Necromancer: Revive dead piece
}

// Sanctuary configuration
export const SanctuaryConfig: Record<SanctuaryType, {
  pieceType: PieceType;
  tier: 1 | 2 | 3;
  requiredStrength: number;
  requiresSacrifice: boolean;
}> = {
  [SanctuaryType.WolfCovenant]: { pieceType: PieceType.Wolf, tier: 1, requiredStrength: 1, requiresSacrifice: false },
  [SanctuaryType.SacredSpring]: { pieceType: PieceType.Healer, tier: 1, requiredStrength: 1, requiresSacrifice: false },
  [SanctuaryType.WardensWatch]: { pieceType: PieceType.Ranger, tier: 2, requiredStrength: 3, requiresSacrifice: false },
  [SanctuaryType.ArcaneRefuge]: { pieceType: PieceType.Wizard, tier: 2, requiredStrength: 3, requiresSacrifice: false },
  [SanctuaryType.ForsakenGrounds]: { pieceType: PieceType.Necromancer, tier: 3, requiredStrength: 4, requiresSacrifice: true },
  [SanctuaryType.PyreEternal]: { pieceType: PieceType.Phoenix, tier: 3, requiredStrength: 4, requiresSacrifice: true },
};

/**
 * Cooldown turns after a sanctuary evolves to a higher tier.
 * During cooldown, the sanctuary cannot be pledged.
 */
export const SANCTUARY_EVOLUTION_COOLDOWN = 10;

export type TurnPhase = "Movement" | "Attack" | "Castles";
export type Color = "w" | "b";
export const STARTING_TIME = 20 * 60;
export const DEFENDED_PIECE_IS_PROTECTED_RANGED = true; //if true, a defended piece is protected from ranged attacks

/**
 * TURN COUNTER SYSTEM
 * 
 * The turnCounter is a single integer that encodes both the current player
 * and the current phase within that player's turn.
 * 
 * Turn Structure (one full round = 10 increments):
 * ```
 * turnCounter:  0   1   2   3   4   5   6   7   8   9   10  11  ...
 *              └─── WHITE ────────┘   └─── BLACK ────────┘   └─ WHITE
 * Phase:        M   M   A   A   C       M   M   A   A   C       M   M
 * ```
 * 
 * Where:
 *   M = Movement phase (piece can move)
 *   A = Attack phase (piece can attack)
 *   C = Castles phase (can recruit from controlled castles)
 * 
 * Formula Reference:
 *   - Current Player: (turnCounter % 10) < 5 ? 'w' : 'b'
 *   - Current Phase:  turnCounter % 5 → 0,1=Movement, 2,3=Attack, 4=Castles
 *   - Turn Number:    Math.floor(turnCounter / 10) + 1
 */
export const PHASE_CYCLE_LENGTH = 5;    // One player's turn = 5 sub-phases
export const PLAYER_CYCLE_LENGTH = 10;  // Full round = both players = 10 sub-phases
export const MOVEMENT_PHASE_END = 2;    // Indices 0-1 are Movement
export const ATTACK_PHASE_END = 4;      // Indices 2-3 are Attack (index 4 is Castles)

/**
 * PHOENIX RESPAWN TIMING
 * 
 * When a Phoenix dies, it respawns after this many full rounds.
 * A "round" = both players completing their turns (10 sub-phases).
 * 
 * At respawn, Phoenix appears at owner's castle (or adjacent hex if occupied).
 * If no spawn location available, Phoenix is lost permanently.
 */
export const PHOENIX_RESPAWN_TURNS = 3;

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
  pieces: import('./Classes/Entities/Piece').Piece[];
  castles: import('./Classes/Entities/Castle').Castle[];
  sanctuaries: import('./Classes/Entities/Sanctuary').Sanctuary[];
  turnCounter: number;
  moveNotation: MoveRecord[]; // List of all moves made so far
}
