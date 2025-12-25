/**
 * @file AbilitySystem.ts
 * @description Centralized system for ability validation and execution.
 *
 * Responsibilities:
 * - Validate ability usage (cooldowns, targets, resources)
 * - Execute ability effects (delegating state changes to StateMutator)
 * - Provide ability targeting information for UI
 *
 * This system extracts ability logic that was scattered across:
 * - useClickHandler.ts (range validation)
 * - StateMutator.ts (execution logic)
 * - GameEngine.ts (validation checks)
 *
 * @see AbilityConfig - Configuration for ability metadata
 * @see StateMutator.activateAbility - Actual state mutation
 * @see useClickHandler - UI targeting mode
 */
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { GameState } from "../Core/GameEngine";
import { PieceMap } from "../../utils/PieceMap";
import { AbilityType, PieceType, Color } from "../../Constants";
import {
  getAbilityConfig,
  isValidAbilityTarget,
  canPieceUseAbility,
} from "../Config/AbilityConfig";

/**
 * Result of ability validation check.
 */
export interface AbilityValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Information about an ability for UI display.
 */
export interface AbilityInfo {
  type: AbilityType;
  name: string;
  description: string;
  range: number;
  available: boolean;
  reason?: string;
}

/**
 * Centralized ability system for validation and targeting.
 * Execution is delegated to StateMutator.activateAbility().
 */
export class AbilitySystem {
  /**
   * Validates if a piece can use a specific ability.
   * Checks piece type, cooldowns, and resources.
   *
   * @param piece - The piece attempting to use the ability
   * @param ability - The ability being used
   * @param gameState - Current game state (for graveyard check, etc.)
   * @returns Validation result with error message if invalid
   */
  public static canUseAbility(
    piece: Piece,
    ability: AbilityType,
    gameState: GameState
  ): AbilityValidationResult {
    // Check if piece type can use this ability
    if (!canPieceUseAbility(ability, piece.type)) {
      return {
        valid: false,
        error: `${piece.type} cannot use ${ability}`,
      };
    }

    // Check cooldown for one-time abilities
    const config = getAbilityConfig(ability);
    if (config.oneTimeUse && piece.abilityUsed) {
      return {
        valid: false,
        error: `${ability} has already been used`,
      };
    }

    // Special check for RaiseDead (requires souls)
    if (ability === AbilityType.RaiseDead) {
      if (piece.souls < 1) {
        return {
          valid: false,
          error: "Not enough souls (need at least 1)",
        };
      }

      // Check for available bodies in graveyard
      const friendlyBodies = gameState.graveyard.filter(
        (p) => p.color === piece.color
      );
      if (friendlyBodies.length === 0) {
        return {
          valid: false,
          error: "No friendly pieces in graveyard to revive",
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validates if a target hex is valid for an ability.
   *
   * @param source - The piece using the ability
   * @param targetHex - The hex being targeted
   * @param ability - The ability being used
   * @param gameState - Current game state
   * @returns Validation result with error message if invalid
   */
  public static validateTarget(
    source: Piece,
    targetHex: Hex,
    ability: AbilityType,
    gameState: GameState
  ): AbilityValidationResult {
    const distance = source.hex.distance(targetHex);

    // Check range using centralized config
    if (!isValidAbilityTarget(ability, distance)) {
      const config = getAbilityConfig(ability);
      return {
        valid: false,
        error: `Target out of range (range: ${config.minRange}-${config.range})`,
      };
    }

    // Ability-specific target validation
    if (ability === AbilityType.Teleport) {
      // Cannot teleport onto occupied hex
      if (gameState.pieceMap.has(targetHex)) {
        return {
          valid: false,
          error: "Cannot teleport to occupied hex",
        };
      }
    }

    if (ability === AbilityType.RaiseDead) {
      // Cannot raise onto occupied hex
      if (gameState.pieceMap.has(targetHex)) {
        return {
          valid: false,
          error: "Cannot revive onto occupied hex",
        };
      }
    }

    return { valid: true };
  }

  /**
   * Full validation pipeline for ability usage.
   * Combines canUseAbility and validateTarget checks.
   *
   * @param source - The piece using the ability
   * @param targetHex - The hex being targeted
   * @param ability - The ability being used
   * @param gameState - Current game state
   * @returns Validation result with error message if invalid
   */
  public static validate(
    source: Piece,
    targetHex: Hex,
    ability: AbilityType,
    gameState: GameState
  ): AbilityValidationResult {
    // Check if piece can use the ability at all
    const canUse = this.canUseAbility(source, ability, gameState);
    if (!canUse.valid) return canUse;

    // Check if target is valid
    return this.validateTarget(source, targetHex, ability, gameState);
  }

  /**
   * Gets the valid target hexes for an ability.
   * Used by UI to highlight valid targets.
   *
   * @param source - The piece using the ability
   * @param ability - The ability being used
   * @param gameState - Current game state
   * @returns Array of valid target hexes
   */
  public static getValidTargets(
    source: Piece,
    ability: AbilityType,
    gameState: GameState
  ): Hex[] {
    const config = getAbilityConfig(ability);
    const validTargets: Hex[] = [];

    // Get all hexes in range
    for (let r = config.minRange; r <= config.range; r++) {
      const ring = source.hex.cubeRing(r);
      for (const hex of ring) {
        const validation = this.validateTarget(source, hex, ability, gameState);
        if (validation.valid) {
          validTargets.push(hex);
        }
      }
    }

    return validTargets;
  }

  /**
   * Gets ability information for a piece (for UI display).
   * Returns all abilities the piece could use with availability status.
   *
   * @param piece - The piece to check
   * @param gameState - Current game state
   * @returns Array of ability info objects
   */
  public static getAbilitiesForPiece(
    piece: Piece,
    gameState: GameState
  ): AbilityInfo[] {
    const abilities: AbilityInfo[] = [];

    // Check Wizard abilities
    if (piece.type === PieceType.Wizard) {
      const fireballValidation = this.canUseAbility(
        piece,
        AbilityType.Fireball,
        gameState
      );
      abilities.push({
        type: AbilityType.Fireball,
        name: "Fireball",
        description: getAbilityConfig(AbilityType.Fireball).description,
        range: getAbilityConfig(AbilityType.Fireball).range,
        available: fireballValidation.valid,
        reason: fireballValidation.error,
      });

      const teleportValidation = this.canUseAbility(
        piece,
        AbilityType.Teleport,
        gameState
      );
      abilities.push({
        type: AbilityType.Teleport,
        name: "Teleport",
        description: getAbilityConfig(AbilityType.Teleport).description,
        range: getAbilityConfig(AbilityType.Teleport).range,
        available: teleportValidation.valid,
        reason: teleportValidation.error,
      });
    }

    // Check Necromancer abilities
    if (piece.type === PieceType.Necromancer) {
      const raiseDeadValidation = this.canUseAbility(
        piece,
        AbilityType.RaiseDead,
        gameState
      );
      abilities.push({
        type: AbilityType.RaiseDead,
        name: "Raise Dead",
        description: getAbilityConfig(AbilityType.RaiseDead).description,
        range: getAbilityConfig(AbilityType.RaiseDead).range,
        available: raiseDeadValidation.valid,
        reason: raiseDeadValidation.error,
      });
    }

    return abilities;
  }

  /**
   * Gets the hexes that will be affected by a Fireball at the target location.
   * Useful for UI to show AoE preview.
   *
   * @param targetHex - The center of the fireball
   * @returns Array of affected hexes (target + ring 1)
   */
  public static getFireballAffectedHexes(targetHex: Hex): Hex[] {
    return [targetHex, ...targetHex.cubeRing(1)];
  }
}
