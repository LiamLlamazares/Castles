/**
 * @file AbilityConfig.ts
 * @description Single source of truth for all ability configurations.
 *
 * ## Purpose
 * Centralizes ability metadata (range, description, cooldown) similar to PieceTypeConfig.
 * Eliminates magic numbers scattered across the codebase.
 *
 * ## Usage
 * ```typescript
 * const config = getAbilityConfig(AbilityType.Fireball);
 * console.log(config.range); // 2
 * ```
 *
 * @see PieceTypeConfig - Similar pattern for piece metadata
 * @see StateMutator.activateAbility - Ability execution
 * @see useClickHandler - Ability targeting validation
 */

import { AbilityType, PieceType } from "../../Constants";

/**
 * Configuration for a single ability.
 * Contains all metadata needed to validate and describe an ability.
 */
export interface AbilityConfig {
  /** Maximum range in hexes from source */
  range: number;

  /** Minimum range (0 for abilities that can target self/adjacent) */
  minRange: number;

  /** Human-readable description for rules/UI */
  description: string;

  /** Which piece types can use this ability */
  usableBy: PieceType[];

  /** Whether this ability can only be used once per game */
  oneTimeUse: boolean;

  /** Area of effect radius (0 for single-target) */
  aoeRadius: number;
}

/**
 * Comprehensive configuration for all ability types.
 *
 * ## Adding a New Ability:
 * 1. Add to `AbilityType` enum in Constants.ts
 * 2. Add entry here with range, description, and usableBy
 * 3. Implement execution logic in StateMutator.activateAbility()
 * 4. Update useClickHandler if targeting behavior differs
 */
export const AbilityTypeConfig: Record<AbilityType, AbilityConfig> = {
  [AbilityType.Fireball]: {
    range: 2,
    minRange: 1,
    description:
      "Deals 1 damage to target hex and all adjacent hexes (7 hexes total). Cannot self-target.",
    usableBy: [PieceType.Wizard],
    oneTimeUse: true,
    aoeRadius: 1,
  },

  [AbilityType.Teleport]: {
    range: 3,
    minRange: 1,
    description:
      "Instantly move to any unoccupied hex within range. Cannot teleport onto other pieces.",
    usableBy: [PieceType.Wizard],
    oneTimeUse: true,
    aoeRadius: 0,
  },

  [AbilityType.RaiseDead]: {
    range: 1,
    minRange: 1,
    description:
      "Spend 1 soul to revive a friendly piece from the graveyard at an adjacent hex. Revived pieces are exiled if killed again.",
    usableBy: [PieceType.Necromancer],
    oneTimeUse: false, // Can use multiple times if enough souls
    aoeRadius: 0,
  },
};

/**
 * Gets the configuration for a specific ability type.
 * Throws if the ability type doesn't exist (should never happen in practice).
 *
 * @param type - The ability type to look up
 * @returns The configuration object
 * @throws Error if ability type not found in config
 */
export function getAbilityConfig(type: AbilityType): AbilityConfig {
  const config = AbilityTypeConfig[type];
  if (!config) {
    throw new Error(`No configuration found for ability type: ${type}`);
  }
  return config;
}

/**
 * Gets just the range value for an ability type.
 * Convenience wrapper around getAbilityConfig().
 *
 * @param type - The ability type
 * @returns The maximum range value
 */
export function getAbilityRange(type: AbilityType): number {
  return getAbilityConfig(type).range;
}

/**
 * Gets the minimum range for an ability type.
 *
 * @param type - The ability type
 * @returns The minimum range value
 */
export function getAbilityMinRange(type: AbilityType): number {
  return getAbilityConfig(type).minRange;
}

/**
 * Checks if a piece type can use a specific ability.
 *
 * @param abilityType - The ability to check
 * @param pieceType - The piece type attempting to use it
 * @returns True if the piece can use this ability
 */
export function canPieceUseAbility(
  abilityType: AbilityType,
  pieceType: PieceType
): boolean {
  const config = getAbilityConfig(abilityType);
  return config.usableBy.includes(pieceType);
}

/**
 * Validates if a target is within valid range for an ability.
 *
 * @param abilityType - The ability being used
 * @param distance - Distance from source to target in hexes
 * @returns True if the target is within valid range
 */
export function isValidAbilityTarget(
  abilityType: AbilityType,
  distance: number
): boolean {
  const config = getAbilityConfig(abilityType);
  return distance >= config.minRange && distance <= config.range;
}
