/**
 * @file PieceTypeConfig.ts
 * @description Single source of truth for all piece type configurations.
 * 
 * ## Purpose
 * Consolidates all piece-specific data (strength, attack type, description)
 * AND behavior (movement, attack strategies) into one configuration object.
 * 
 * ## Usage
 * ```typescript
 * const config = getPieceConfig(PieceType.Dragon);
 * const legalMoves = config.moveStrategy(hex, blocked, valid, color);
 * ```
 */

import { PieceType, AttackType, Color, N_SQUARES } from "../../Constants";
import { Hex } from "../Entities/Hex";

// Import Strategies
import {
  swordsmanMoves,
  archerMoves,
  knightMoves,
  eagleMoves,
  dragonMoves,
  assassinMoves,
  giantMoves,
  wolfMoves,
  rangerMoves,
} from "../Strategies/MoveStrategies";

import {
  meleeAttacks,
  rangedAttacks,
  longRangedAttacks,
  swordsmanAttacks,
} from "../Strategies/AttackStrategies";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Signature for movement strategy functions.
 */
export type MoveStrategy = (
  hex: Hex,
  blockedHexSet: Set<string>,
  validHexSet: Set<string>,
  color: Color,
  boardSize?: number
) => Hex[];

/**
 * Signature for attack strategy functions.
 */
export type AttackStrategy = (
  hex: Hex,
  attackableHexSet: Set<string>,
  color: Color,
  highGroundHexSet?: Set<string>
) => Hex[];

/**
 * Minimal piece interface to avoid circular dependency with Piece.ts
 */
export interface PieceContext {
    type: PieceType;
    color: Color;
    hex: Hex;
}

/**
 * Configuration for a single piece type.
 */
export interface PieceConfig {
  /** Base combat strength */
  strength: number;
  
  /** Attack type determines range and capture behavior (metadata) */
  attackType: AttackType;
  
  /** Human-readable description */
  description: string;
  
  /** Display name (optional) */
  displayName?: string;

  /** Movement logic */
  moveStrategy: MoveStrategy;

  /** Attack logic */
  attackStrategy: AttackStrategy;

  /** Optional: Compute dynamic strength based on context (overrides base level strength) */
  strengthCompute?: (piece: PieceContext) => number;
}

// ============================================================================
// STRATEGY WRAPPERS
// Adapting raw strategy functions to match the uniform signatures
// ============================================================================

const noAttacks: AttackStrategy = () => [];

const meleeAttackStrategy: AttackStrategy = (hex, attackable) => 
  meleeAttacks(hex, attackable);

const rangedAttackStrategy: AttackStrategy = (hex, attackable, _color, highGround) => 
  rangedAttacks(hex, attackable, highGround);

const longRangedAttackStrategy: AttackStrategy = (hex, attackable, _color, highGround) => 
  longRangedAttacks(hex, attackable, highGround);

const swordsmanAttackStrategy: AttackStrategy = (hex, attackable, color) => 
  swordsmanAttacks(hex, attackable, color);

// ============================================================================
// CONFIGURATION
// ============================================================================

export const PieceTypeConfig: Record<PieceType, PieceConfig> = {
  // ========== STANDARD PIECES ==========
  
  [PieceType.Swordsman]: {
    strength: 1,
    attackType: AttackType.Swordsman,
    description: "Moves 1 hex forward. Attacks diagonally forward (captures by moving onto target). Gains +1 Strength when crossing the river.",
    moveStrategy: (hex, blocked, valid, color) => swordsmanMoves(hex, blocked, valid, color),
    attackStrategy: swordsmanAttackStrategy,
    strengthCompute: (piece: PieceContext) => {
        // Swordsmen get +1 Strength when crossing the river into enemy territory
        // White (starts bottom, r>0) crossing to r<0
        if (piece.color === 'w' && piece.hex.r < 0) {
            return 2;
        }
        // Black (starts top, r<0) crossing to r>0
        if (piece.color === 'b' && piece.hex.r > 0) {
            return 2;
        }
        return 1; // Base strength
    }
  },
  
  [PieceType.Archer]: {
    strength: 1,
    attackType: AttackType.Ranged,
    description: "Moves 1 hex in any direction. Attacks at range 2 (3 from high ground). Cannot attack adjacent enemies.",
    moveStrategy: (hex, blocked, valid) => archerMoves(hex, blocked, valid),
    attackStrategy: rangedAttackStrategy,
  },
  
  [PieceType.Knight]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Slides diagonally up to 2 hexes. Attacks adjacent hexes (captures by moving onto target).",
    moveStrategy: (hex, blocked, valid, _color, boardSize = N_SQUARES) => knightMoves(hex, blocked, valid, boardSize),
    attackStrategy: meleeAttackStrategy,
  },
  
  [PieceType.Trebuchet]: {
    strength: 1,
    attackType: AttackType.LongRanged,
    description: "Moves 1 hex in any direction. Attacks at range 3 (4 from high ground). Cannot attack closer enemies.",
    moveStrategy: (hex, blocked, valid) => archerMoves(hex, blocked, valid),
    attackStrategy: longRangedAttackStrategy,
  },
  
  [PieceType.Eagle]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Flies over obstacles up to 3 hexes in straight lines. Attacks adjacent hexes.",
    moveStrategy: (hex, blocked, valid) => eagleMoves(hex, blocked, valid),
    attackStrategy: meleeAttackStrategy,
  },
  
  [PieceType.Giant]: {
    strength: 2,
    attackType: AttackType.Melee,
    description: "Slides up to 2 hexes in any direction. Attacks adjacent hexes. Strength 2 (requires 2+ attackers or strength 2+ attacker to defeat).",
    moveStrategy: (hex, blocked, valid, _color, boardSize = N_SQUARES) => giantMoves(hex, blocked, valid, boardSize),
    attackStrategy: meleeAttackStrategy,
  },
  
  [PieceType.Assassin]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Moves 1 hex in any direction. Attacks adjacent hexes. Instantly kills Monarchs regardless of defenders.",
    moveStrategy: (hex, blocked, valid, _color, boardSize = N_SQUARES) => assassinMoves(hex, blocked, valid, boardSize),
    attackStrategy: meleeAttackStrategy,
  },
  
  [PieceType.Dragon]: {
    strength: 3,
    attackType: AttackType.Melee,
    description: "Slides up to 3 hexes in any direction. Attacks adjacent hexes. Strength 3 (very hard to kill).",
    moveStrategy: (hex, blocked, valid) => dragonMoves(hex, blocked, valid),
    attackStrategy: meleeAttackStrategy,
  },
  
  [PieceType.Monarch]: {
    strength: 3,
    attackType: AttackType.Melee,
    description: "Moves 1 hex in any direction. Attacks adjacent hexes. Strength 3. Losing your Monarch = instant defeat.",
    displayName: "Monarch (King/Queen)",
    moveStrategy: (hex, blocked, valid) => archerMoves(hex, blocked, valid),
    attackStrategy: meleeAttackStrategy,
  },
  
  // ========== SANCTUARY PIECES ==========
  
  [PieceType.Wolf]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Pack Tactics: Gains +1 strength for each adjacent friendly Wolf. Moves 2 hexes, attacks adjacent.",
    moveStrategy: (hex, blocked, valid) => wolfMoves(hex, blocked, valid),
    attackStrategy: meleeAttackStrategy,
  },
  
  [PieceType.Healer]: {
    strength: 1,
    attackType: AttackType.None,
    description: "Cannot attack. Aura: All adjacent friendly pieces gain +1 strength during combat. Moves 1 hex.",
    moveStrategy: (hex, blocked, valid) => archerMoves(hex, blocked, valid),
    attackStrategy: noAttacks,
  },
  
  [PieceType.Ranger]: {
    strength: 1,
    attackType: AttackType.LongRanged,
    description: "Enhanced Archer. Moves 2 hexes, attacks at range 3 (or 4 from high ground).",
    moveStrategy: (hex, blocked, valid) => rangerMoves(hex, blocked, valid),
    attackStrategy: longRangedAttackStrategy,
  },
  
  [PieceType.Wizard]: {
    strength: 1,
    attackType: AttackType.Ranged,
    description: "Moves 1 hex, attacks at range 2. Ability (once per game): Fireball deals 1 damage to target hex + ring 1 (7 hexes total).",
    moveStrategy: (hex, blocked, valid) => archerMoves(hex, blocked, valid),
    attackStrategy: rangedAttackStrategy,
  },
  
  [PieceType.Necromancer]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Moves 1 hex, attacks adjacent. Collects souls from nearby deaths. Ability: Spend 1 soul to raise a dead friendly piece.",
    moveStrategy: (hex, blocked, valid) => archerMoves(hex, blocked, valid),
    attackStrategy: meleeAttackStrategy,
  },
  
  [PieceType.Phoenix]: {
    strength: 2,
    attackType: AttackType.Melee,
    description: "Flies up to 2 hexes. Attacks adjacent. First death: Respawns after 3 turns at original sanctuary. Second death: Permanent.",
    moveStrategy: (hex, blocked, valid) => eagleMoves(hex, blocked, valid),
    attackStrategy: meleeAttackStrategy,
  },
};

/**
 * Gets the configuration for a specific piece type.
 */
export function getPieceConfig(type: PieceType): PieceConfig {
  const config = PieceTypeConfig[type];
  if (!config) {
    throw new Error(`No configuration found for piece type: ${type}`);
  }
  return config;
}

/**
 * Gets just the strength value for a piece type.
 */
export function getPieceStrength(type: PieceType): number {
  return getPieceConfig(type).strength;
}

/**
 * Gets just the attack type for a piece type.
 */
export function getPieceAttackType(type: PieceType): AttackType {
  return getPieceConfig(type).attackType;
}

/**
 * Gets the human-readable display name for a piece type.
 */
export function getPieceDisplayName(type: PieceType): string {
  const config = getPieceConfig(type);
  return config.displayName || type;
}
