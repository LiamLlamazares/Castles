/**
 * @file PieceTypeConfig.ts
 * @description Single source of truth for all piece type configurations.
 * 
 * ## Purpose
 * Consolidates all piece-specific data (strength, attack type, descriptions)
 * into one configuration object. This makes adding new piece types require editing only
 * this file instead of scattered enums.
 * 
 * Note: Movement and attack strategies are registered separately in MoveStrategyRegistry
 * and AttackStrategyRegistry. This config focuses on piece metadata.
 * 
 * ## Usage
 * ```typescript
 * const config = getPieceConfig(PieceType.Dragon);
 * console.log(config.strength); // 3
 * console.log(config.description); // "Slides up to 3 hexes..."
 * ```
 * 
 * @see MoveStrategyRegistry - Movement strategies
 * @see AttackStrategyRegistry - Attack strategies
 */

import { PieceType, AttackType } from "../../Constants";

/**
 * Configuration for a single piece type.
 * Contains all metadata needed to fully define a piece's characteristics.
 * 
 * Movement and Attack strategies are handled by separate registries.
 */
export interface PieceConfig {
  /** Combat strength - must exceed defender's strength to capture */
  strength: number;
  
  /** Attack type determines range and capture behavior */
  attackType: AttackType;
  
  /** Human-readable description for rules/UI */
  description: string;
  
  /** Display name (defaults to PieceType key if omitted) */
  displayName?: string;
}

/**
 * Comprehensive configuration for all piece types.
 * 
 * ## Adding a New Piece Type:
 * 1. Add to `PieceType` enum in Constants.ts
 * 2. Add entry here with strength, attackType, and description
 * 3. Register movement and attack strategies in the respective registries
 * 4. Add image assets to public/images/pieces/
 * 5. Update PieceImages.ts to map the image
 */
export const PieceTypeConfig: Record<PieceType, PieceConfig> = {
  // ========== STANDARD PIECES ==========
  
  [PieceType.Swordsman]: {
    strength: 1,
    attackType: AttackType.Swordsman,
    description: "Moves 1 hex forward. Attacks diagonally forward (captures by moving onto target).",
  },
  
  [PieceType.Archer]: {
    strength: 1,
    attackType: AttackType.Ranged,
    description: "Moves 1 hex in any direction. Attacks at range 2 (3 from high ground). Cannot attack adjacent enemies.",
  },
  
  [PieceType.Knight]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Slides diagonally up to 2 hexes. Attacks adjacent hexes (captures by moving onto target).",
  },
  
  [PieceType.Trebuchet]: {
    strength: 1,
    attackType: AttackType.LongRanged,
    description: "Moves 1 hex in any direction. Attacks at range 3 (4 from high ground). Cannot attack closer enemies.",
  },
  
  [PieceType.Eagle]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Flies over obstacles up to 3 hexes in straight lines. Attacks adjacent hexes.",
  },
  
  [PieceType.Giant]: {
    strength: 2,
    attackType: AttackType.Melee,
    description: "Slides up to 2 hexes in any direction. Attacks adjacent hexes. Strength 2 (requires 2+ attackers or strength 2+ attacker to defeat).",
  },
  
  [PieceType.Assassin]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Moves 1 hex in any direction. Attacks adjacent hexes. Instantly kills Monarchs regardless of defenders.",
  },
  
  [PieceType.Dragon]: {
    strength: 3,
    attackType: AttackType.Melee,
    description: "Slides up to 3 hexes in any direction. Attacks adjacent hexes. Strength 3 (very hard to kill).",
  },
  
  [PieceType.Monarch]: {
    strength: 3,
    attackType: AttackType.Melee,
    description: "Moves 1 hex in any direction. Attacks adjacent hexes. Strength 3. Losing your Monarch = instant defeat.",
    displayName: "Monarch (King/Queen)",
  },
  
  // ========== SANCTUARY PIECES ==========
  
  [PieceType.Wolf]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Pack Tactics: Gains +1 strength for each adjacent friendly Wolf. Moves 2 hexes, attacks adjacent.",
  },
  
  [PieceType.Healer]: {
    strength: 1,
    attackType: AttackType.None,
    description: "Cannot attack. Aura: All adjacent friendly pieces gain +1 strength during combat. Moves 1 hex.",
  },
  
  [PieceType.Ranger]: {
    strength: 1,
    attackType: AttackType.LongRanged,
    description: "Enhanced Archer. Moves 2 hexes, attacks at range 3 (or 4 from high ground).",
  },
  
  [PieceType.Wizard]: {
    strength: 1,
    attackType: AttackType.Ranged,
    description: "Moves 1 hex, attacks at range 2. Ability (once per game): Fireball deals 1 damage to target hex + ring 1 (7 hexes total).",
  },
  
  [PieceType.Necromancer]: {
    strength: 1,
    attackType: AttackType.Melee,
    description: "Moves 1 hex, attacks adjacent. Collects souls from nearby deaths. Ability: Spend 1 soul to raise a dead friendly piece.",
  },
  
  [PieceType.Phoenix]: {
    strength: 2,
    attackType: AttackType.Melee,
    description: "Flies up to 2 hexes. Attacks adjacent. First death: Respawns after 3 turns at original sanctuary. Second death: Permanent.",
  },
};

/**
 * Gets the configuration for a specific piece type.
 * Throws if the piece type doesn't exist (should never happen in practice).
 * 
 * @param type - The piece type to look up
 * @returns The configuration object
 * @throws Error if piece type not found in config
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
 * Convenience wrapper around getPieceConfig().
 * 
 * @param type - The piece type
 * @returns The strength value
 */
export function getPieceStrength(type: PieceType): number {
  return getPieceConfig(type).strength;
}

/**
 * Gets just the attack type for a piece type.
 * Convenience wrapper around getPieceConfig().
 * 
 * @param type - The piece type
 * @returns The attack type enum
 */
export function getPieceAttackType(type: PieceType): AttackType {
  return getPieceConfig(type).attackType;
}

/**
 * Gets the human-readable display name for a piece type.
 * 
 * @param type - The piece type
 * @returns Display name or the type key as fallback
 */
export function getPieceDisplayName(type: PieceType): string {
  const config = getPieceConfig(type);
  return config.displayName || type;
}
