/**
 * @file InteractionPolicy.ts
 * @description Centralized policy for validating user interactions.
 *
 * This service acts as the single source of truth for "is this interaction valid?"
 * It decouples the UI (useClickHandler) from the domain logic (HexValidation, SanctuaryService).
 *
 * @usage Called by useClickHandler to validate user actions.
 */

import { Hex } from "../Entities/Hex";
import { Board } from "../Core/Board";
import { GameState } from "../Core/GameState";
import { AbilityType } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";
import { isValidAbilityTarget } from "../Config/AbilityConfig";
import { isValidAdjacentSpawn } from "../../utils/HexValidation";
import { SanctuaryService } from "../Services/SanctuaryService";

/** Context required for validating interactions */
export interface InteractionContext {
  board: Board;
  gameState: GameState;
}

export const InteractionPolicy = {
  /**
   * Validates if a target hex is a valid target for the active ability.
   */
  isValidAbilityTarget(
    sourceHex: Hex,
    targetHex: Hex,
    ability: AbilityType
  ): boolean {
    const distance = sourceHex.distance(targetHex);
    return isValidAbilityTarget(ability, distance);
  },

  /**
   * Validates if a hex is a valid spawn location for pledging a sanctuary.
   */
  isValidPledgeSpawn(
    ctx: InteractionContext,
    sanctuaryHex: Hex,
    targetHex: Hex
  ): boolean {
    const { board, gameState } = ctx;
    return isValidAdjacentSpawn(targetHex, sanctuaryHex, board, gameState.pieceMap);
  },

  /**
   * Checks if the player can enter "Pledge Mode" for a specific sanctuary.
   */
  canEnterPledgeMode(
    ctx: InteractionContext,
    sanctuaryHex: Hex
  ): boolean {
    const { board, gameState } = ctx;
    return SanctuaryService.canPledge(gameState, board, sanctuaryHex);
  },
  
  /**
   * Checks if specific hex is a valid neighbor to pledge to
   * Useful for highlighting valid spawn targets in UI
   */
  isPledgeTarget(
    ctx: InteractionContext,
    sanctuaryHex: Hex,
    targetHex: Hex,
  ): boolean {
    // Must be neighbor AND valid spawn
    if (sanctuaryHex.distance(targetHex) !== 1) return false;
    return this.isValidPledgeSpawn(ctx, sanctuaryHex, targetHex);
  }
};
