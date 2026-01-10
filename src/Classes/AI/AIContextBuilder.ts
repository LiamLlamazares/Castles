/**
 * @file AIContextBuilder.ts
 * @description Utility to pre-compute all legal actions for an AI player.
 *
 * This builder queries RuleEngine once per turn phase and caches results,
 * avoiding redundant calculations when the AI evaluates multiple candidates.
 *
 * @see IAgent - Consumers of AIContext
 * @see RuleEngine - Source of legal move/attack data
 */

import { GameEngine } from "../Core/GameEngine";
import { GameState } from "../Core/GameState";
import { Board } from "../Core/Board";
import { RuleEngine } from "../Systems/RuleEngine";
import { SanctuaryService } from "../Services/SanctuaryService";
import { TurnManager } from "../Core/TurnManager";
import { Hex } from "../Entities/Hex";
import { Color, TurnPhase, PieceType, AbilityType } from "../../Constants";
import {
  AIContext,
  RecruitOption,
  PledgeOption,
  AbilityOption,
} from "./IAgent";

// Recruitment cycle matches StateMutator.ts
const RECRUITMENT_CYCLE = [
  PieceType.Swordsman,
  PieceType.Archer,
  PieceType.Knight,
  PieceType.Eagle,
  PieceType.Giant,
  PieceType.Trebuchet,
  PieceType.Assassin,
  PieceType.Dragon,
  PieceType.Monarch,
];

/**
 * Builds a complete AIContext for a given game state and player.
 * Call once at the start of each AI decision to get all legal actions.
 */
export class AIContextBuilder {
  /**
   * Builds the complete context of legal actions for an AI player.
   *
   * @param gameState - Current game state
   * @param board - Board topology
   * @param gameEngine - Game engine instance for ability queries
   * @param myColor - The AI's color
   * @returns AIContext with all legal actions pre-computed
   */
  static build(
    gameState: GameState,
    board: Board,
    gameEngine: GameEngine,
    myColor: Color
  ): AIContext {
    const phase = TurnManager.getTurnPhase(gameState.turnCounter);

    return {
      phase,
      myColor,
      legalMoves: this.buildLegalMoves(gameState, board, myColor, phase),
      legalAttacks: this.buildLegalAttacks(gameState, board, myColor, phase),
      recruitOptions: this.buildRecruitOptions(gameState, board, myColor, phase),
      pledgeOptions: this.buildPledgeOptions(gameState, board, myColor, phase),
      abilityOptions: this.buildAbilityOptions(gameState, board, gameEngine, myColor, phase),
    };
  }

  /**
   * Builds a map of piece hex key → legal move destinations.
   * Only pieces that can still move (canMove=true) are considered.
   */
  private static buildLegalMoves(
    gameState: GameState,
    board: Board,
    myColor: Color,
    phase: TurnPhase
  ): Map<string, Hex[]> {
    const result = new Map<string, Hex[]>();

    // Only collect moves during Movement phase
    if (phase !== "Movement") return result;

    // Filter pieces that belong to AI and can still move this turn
    const myPieces = gameState.pieces.filter(
      (p) => p.color === myColor && p.canMove
    );

    for (const piece of myPieces) {
      const moves = RuleEngine.getLegalMoves(piece, gameState, board);
      if (moves.length > 0) {
        result.set(piece.hex.getKey(), moves);
      }
    }

    return result;
  }

  /**
   * Builds a map of piece hex key → legal attack targets.
   * Only pieces that can still attack (canAttack=true) are considered.
   */
  private static buildLegalAttacks(
    gameState: GameState,
    board: Board,
    myColor: Color,
    phase: TurnPhase
  ): Map<string, Hex[]> {
    const result = new Map<string, Hex[]>();

    // Only collect attacks during Attack phase
    if (phase !== "Attack") return result;

    // Filter pieces that belong to AI and can still attack this turn
    const myPieces = gameState.pieces.filter(
      (p) => p.color === myColor && p.canAttack
    );

    for (const piece of myPieces) {
      const attacks = RuleEngine.getLegalAttacks(piece, gameState, board);
      if (attacks.length > 0) {
        result.set(piece.hex.getKey(), attacks);
      }
    }

    return result;
  }

  /**
   * Builds recruitment options from captured castles.
   * A castle can recruit if:
   * - Owned by AI (not original owner) 
   * - Not used this turn
   * - Has adjacent empty hexes
   */
  private static buildRecruitOptions(
    gameState: GameState,
    board: Board,
    myColor: Color,
    phase: TurnPhase
  ): RecruitOption[] {
    const result: RecruitOption[] = [];

    // Only collect during Recruitment phase
    if (phase !== "Recruitment") return result;

    // Get controlled castles that can recruit (captured, not used this turn)
    const controlledCastles = gameState.castles.filter(
      (c) =>
        c.owner === myColor &&
        c.color !== myColor && // Must be captured (not starting castle)
        !c.used_this_turn
    );

    const occupiedSet = new Set(gameState.pieces.map((p) => p.hex.getKey()));

    for (const castle of controlledCastles) {
      // Get valid spawn hexes (adjacent, unoccupied, on board)
      // Hex.cubeRing(1) returns all neighbors
      const neighbors = castle.hex.cubeRing(1);
      const spawnHexes = neighbors.filter(
        (h: Hex) => board.hexSet.has(h.getKey()) && !occupiedSet.has(h.getKey())
      );

      if (spawnHexes.length > 0) {
        // Calculate next piece type from recruitment cycle
        const nextPieceType = RECRUITMENT_CYCLE[castle.turns_controlled % RECRUITMENT_CYCLE.length];
        
        result.push({
          castleHex: castle.hex,
          spawnHexes,
          nextPieceType,
        });
      }
    }

    return result;
  }

  /**
   * Builds pledge options from ready sanctuaries.
   * Uses SanctuaryService.canPledge for validation.
   */
  private static buildPledgeOptions(
    gameState: GameState,
    board: Board,
    _myColor: Color, // Unused - canPledge checks current player internally
    phase: TurnPhase
  ): PledgeOption[] {
    const result: PledgeOption[] = [];

    // Only collect during Recruitment phase
    if (phase !== "Recruitment") return result;

    const occupiedSet = new Set(gameState.pieces.map((p) => p.hex.getKey()));

    for (const sanctuary of gameState.sanctuaries) {
      // SanctuaryService.canPledge validates:
      // - Sanctuary exists and is ready (not on cooldown)
      // - Current player owns a piece on it
      // - Strength requirement is met
      const canPledge = SanctuaryService.canPledge(gameState, sanctuary.hex);
      if (!canPledge) continue;

      // Get valid spawn hexes (adjacent to sanctuary, unoccupied, on board)
      const neighbors = sanctuary.hex.cubeRing(1);
      const spawnHexes = neighbors.filter(
        (h: Hex) => board.hexSet.has(h.getKey()) && !occupiedSet.has(h.getKey())
      );

      if (spawnHexes.length > 0) {
        result.push({
          sanctuaryHex: sanctuary.hex,
          spawnHexes,
          pieceType: sanctuary.pieceType,
          requiresSacrifice: sanctuary.requiresSacrifice,
        });
      }
    }

    return result;
  }

  /**
   * Builds ability activation options for special pieces (Wizard, Necromancer).
   */
  private static buildAbilityOptions(
    gameState: GameState,
    board: Board,
    gameEngine: GameEngine,
    myColor: Color,
    phase: TurnPhase
  ): AbilityOption[] {
    const result: AbilityOption[] = [];

    // Abilities can typically be used during Attack phase
    if (phase !== "Attack") return result;

    const myPieces = gameState.pieces.filter(
      (p) => p.color === myColor && p.canAttack
    );

    for (const piece of myPieces) {
      // Get abilities for this piece via GameEngine
      const abilities = gameEngine.getAbilitiesForPiece(gameState, piece);

      for (const ability of abilities) {
        if (!ability.canUse) continue;

        const targets = gameEngine.getAbilityTargets(
          gameState,
          piece,
          ability.type as AbilityType
        );

        if (targets.length > 0) {
          result.push({
            pieceHex: piece.hex,
            abilityType: ability.type as AbilityType,
            targetHexes: targets,
          });
        }
      }
    }

    return result;
  }

  /**
   * Utility: Count total available actions in a context.
   * Useful for "pass if no actions" logic.
   */
  static countActions(context: AIContext): number {
    let count = 0;

    // Use Array.from to avoid iterator issues with older targets
    const moveEntries = Array.from(context.legalMoves.values());
    for (const moves of moveEntries) {
      count += moves.length;
    }
    
    const attackEntries = Array.from(context.legalAttacks.values());
    for (const attacks of attackEntries) {
      count += attacks.length;
    }
    
    for (const recruit of context.recruitOptions) {
      count += recruit.spawnHexes.length;
    }
    for (const pledge of context.pledgeOptions) {
      count += pledge.spawnHexes.length;
    }
    for (const ability of context.abilityOptions) {
      count += ability.targetHexes.length;
    }

    return count;
  }
}
