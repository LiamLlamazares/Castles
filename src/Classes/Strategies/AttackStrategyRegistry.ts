/**
 * @file AttackStrategyRegistry.ts
 * @description Registry pattern for piece attack strategies.
 *
 * This registry decouples the Piece class from specific attack implementations,
 * making it easy to add new piece types without modifying the Piece class.
 *
 * NOTE: Attack types (Melee, Ranged, etc.) are defined in PieceTypeConfig.ts.
 * This registry only stores the strategy functions for determining legal attack hexes.
 *
 * To add a new piece type:
 * 1. Define attackType in PieceTypeConfig.ts
 * 2. Create the attack function in AttackStrategies.ts (or reuse existing)
 * 3. Register it here with: registerAttackStrategy(PieceType.NewType, newTypeAttackStrategy)
 *
 * @see AttackStrategies.ts - Attack algorithm implementations
 * @see PieceTypeConfig.ts - Attack type definitions
 * @see Piece.ts - Uses this registry via getAttackStrategy()
 */

import { Hex } from "../Entities/Hex";
import { Color, PieceType } from "../../Constants";

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
 * Internal registry mapping piece types to their attack strategy functions.
 */
const attackStrategyRegistry = new Map<PieceType, AttackStrategy>();

/**
 * Registers an attack strategy for a piece type.
 * Call this to add new piece types without modifying the Piece class.
 */
export const registerAttackStrategy = (
  pieceType: PieceType,
  strategy: AttackStrategy
): void => {
  attackStrategyRegistry.set(pieceType, strategy);
};

/**
 * Gets the attack strategy function for a piece type.
 * @throws Error if no strategy is registered for the type.
 */
export const getAttackStrategy = (pieceType: PieceType): AttackStrategy => {
  const strategy = attackStrategyRegistry.get(pieceType);
  if (!strategy) {
    throw new Error(
      `No attack strategy registered for piece type: ${pieceType}. ` +
      `Register it in AttackStrategyRegistry.ts.`
    );
  }
  return strategy;
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
// Attack types are defined in PieceTypeConfig.ts.
// ============================================================================

// Swordsman: Diagonal-forward attacks
registerAttackStrategy(PieceType.Swordsman, swordsmanAttackStrategy);

// Archer: Ranged (distance 2, +3 from high ground)
registerAttackStrategy(PieceType.Archer, rangedAttackStrategy);

// Knight: Melee
registerAttackStrategy(PieceType.Knight, meleeAttackStrategy);

// Trebuchet: Long ranged (distance 3, +4 from high ground)
registerAttackStrategy(PieceType.Trebuchet, longRangedAttackStrategy);

// Monarch: Melee
registerAttackStrategy(PieceType.Monarch, meleeAttackStrategy);

// Eagle: Melee
registerAttackStrategy(PieceType.Eagle, meleeAttackStrategy);

// Giant: Melee
registerAttackStrategy(PieceType.Giant, meleeAttackStrategy);

// Dragon: Melee
registerAttackStrategy(PieceType.Dragon, meleeAttackStrategy);

// Assassin: Melee
registerAttackStrategy(PieceType.Assassin, meleeAttackStrategy);

// Wolf: Melee
registerAttackStrategy(PieceType.Wolf, meleeAttackStrategy);

// Healer: Cannot attack
registerAttackStrategy(PieceType.Healer, noAttacks);

// Ranger: Long ranged (like Trebuchet)
registerAttackStrategy(PieceType.Ranger, longRangedAttackStrategy);

// Phoenix: Melee
registerAttackStrategy(PieceType.Phoenix, meleeAttackStrategy);

// Wizard: Ranged (like Archer)
registerAttackStrategy(PieceType.Wizard, rangedAttackStrategy);

// Necromancer: Melee
registerAttackStrategy(PieceType.Necromancer, meleeAttackStrategy);
