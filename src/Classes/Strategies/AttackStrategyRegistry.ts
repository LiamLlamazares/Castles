/**
 * @file AttackStrategyRegistry.ts
 * @description Registry pattern for piece attack strategies.
 *
 * This registry decouples the Piece class from specific attack implementations,
 * making it easy to add new piece types without modifying the Piece class.
 *
 * To add a new piece type:
 * 1. Create the attack function in AttackStrategies.ts (or reuse existing)
 * 2. Register it here with: registerAttackStrategy(PieceType.NewType, newTypeAttacks)
 *
 * @see AttackStrategies.ts - Attack algorithm implementations
 * @see Piece.ts - Uses this registry via getAttackStrategy()
 */

import { Hex } from "../Entities/Hex";
import { Color, PieceType, AttackType } from "../../Constants";

import {
  meleeAttacks,
  rangedAttacks,
  longRangedAttacks,
  swordsmanAttacks,
} from "./AttackStrategies";

/**
 * Signature for attack strategy functions.
 * All attack strategies must conform to this interface.
 */
export type AttackStrategy = (
  hex: Hex,
  attackableHexSet: Set<string>,
  color: Color,
  highGroundHexSet?: Set<string>
) => Hex[];

/**
 * Configuration for a piece's attack behavior.
 */
export interface AttackConfig {
  attackType: AttackType;
  strategy: AttackStrategy;
}

/**
 * Internal registry mapping piece types to their attack configurations.
 */
const attackStrategyRegistry = new Map<PieceType, AttackConfig>();

/**
 * Registers an attack strategy for a piece type.
 * Call this to add new piece types without modifying the Piece class.
 */
export const registerAttackStrategy = (
  pieceType: PieceType,
  attackType: AttackType,
  strategy: AttackStrategy
): void => {
  attackStrategyRegistry.set(pieceType, { attackType, strategy });
};

/**
 * Gets the attack configuration for a piece type.
 * @throws Error if no strategy is registered for the type.
 */
export const getAttackConfig = (pieceType: PieceType): AttackConfig => {
  const config = attackStrategyRegistry.get(pieceType);
  if (!config) {
    throw new Error(
      `No attack strategy registered for piece type: ${pieceType}. ` +
      `Register it in AttackStrategyRegistry.ts.`
    );
  }
  return config;
};

/**
 * Gets just the attack type for a piece type.
 */
export const getAttackType = (pieceType: PieceType): AttackType => {
  return getAttackConfig(pieceType).attackType;
};

/**
 * Gets the attack strategy function for a piece type.
 */
export const getAttackStrategy = (pieceType: PieceType): AttackStrategy => {
  return getAttackConfig(pieceType).strategy;
};

/**
 * Checks if an attack strategy is registered for a piece type.
 */
export const hasAttackStrategy = (pieceType: PieceType): boolean => {
  return attackStrategyRegistry.has(pieceType);
};

// ============================================================================
// NULL ATTACK STRATEGY
// For pieces that cannot attack (e.g., Healer)
// ============================================================================

const noAttacks: AttackStrategy = () => [];

// ============================================================================
// WRAPPED STRATEGIES
// Wrap existing functions to match the unified AttackStrategy signature
// ============================================================================

const meleeAttackStrategy: AttackStrategy = (hex, attackable) => 
  meleeAttacks(hex, attackable);

const rangedAttackStrategy: AttackStrategy = (hex, attackable, _color, highGround) => 
  rangedAttacks(hex, attackable, highGround);

const longRangedAttackStrategy: AttackStrategy = (hex, attackable, _color, highGround) => 
  longRangedAttacks(hex, attackable, highGround);

const swordsmanAttackStrategy: AttackStrategy = (hex, attackable, color) => 
  swordsmanAttacks(hex, attackable, color);

// ============================================================================
// DEFAULT REGISTRATIONS
// Register all built-in piece types. New pieces can be added to this list.
// ============================================================================

// Swordsman: Diagonal-forward attacks
registerAttackStrategy(PieceType.Swordsman, AttackType.Swordsman, swordsmanAttackStrategy);

// Archer: Ranged (distance 2, +3 from high ground)
registerAttackStrategy(PieceType.Archer, AttackType.Ranged, rangedAttackStrategy);

// Knight: Melee
registerAttackStrategy(PieceType.Knight, AttackType.Melee, meleeAttackStrategy);

// Trebuchet: Long ranged (distance 3, +4 from high ground)
registerAttackStrategy(PieceType.Trebuchet, AttackType.LongRanged, longRangedAttackStrategy);

// Monarch: Melee
registerAttackStrategy(PieceType.Monarch, AttackType.Melee, meleeAttackStrategy);

// Eagle: Melee
registerAttackStrategy(PieceType.Eagle, AttackType.Melee, meleeAttackStrategy);

// Giant: Melee
registerAttackStrategy(PieceType.Giant, AttackType.Melee, meleeAttackStrategy);

// Dragon: Melee
registerAttackStrategy(PieceType.Dragon, AttackType.Melee, meleeAttackStrategy);

// Assassin: Melee
registerAttackStrategy(PieceType.Assassin, AttackType.Melee, meleeAttackStrategy);

// Wolf: Melee
registerAttackStrategy(PieceType.Wolf, AttackType.Melee, meleeAttackStrategy);

// Healer: Cannot attack
registerAttackStrategy(PieceType.Healer, AttackType.None, noAttacks);

// Ranger: Long ranged (like Trebuchet)
registerAttackStrategy(PieceType.Ranger, AttackType.LongRanged, longRangedAttackStrategy);

// Phoenix: Melee
registerAttackStrategy(PieceType.Phoenix, AttackType.Melee, meleeAttackStrategy);

// Wizard: Ranged (like Archer)
registerAttackStrategy(PieceType.Wizard, AttackType.Ranged, rangedAttackStrategy);

// Necromancer: Melee
registerAttackStrategy(PieceType.Necromancer, AttackType.Melee, meleeAttackStrategy);
