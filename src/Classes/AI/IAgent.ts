/**
 * @file IAgent.ts
 * @description Core interface and types for AI agents in Castles.
 *
 * All AI implementations (Random, Heuristic, Minimax, MCTS, Neural) must
 * implement the IAgent interface. This enables easy swapping of AI strategies
 * and supports future engine extensions.
 *
 * @see RandomAgent - Baseline implementation
 * @see AIController - Orchestrates AI turns
 */

import { GameState } from "../Core/GameEngine";
import { Board } from "../Core/Board";
import { GameCommand } from "../Commands/GameCommand";
import { Hex } from "../Entities/Hex";
import { Color, TurnPhase, PieceType, AbilityType } from "../../Constants";

// =============================================================================
// CORE AGENT INTERFACE
// =============================================================================

/**
 * The contract all AI implementations must satisfy.
 *
 * Design notes:
 * - Returns Promise to support async computation (Web Workers, neural inference).
 * - Returns GameCommand directly for seamless integration with existing command pattern.
 * - Returns null to indicate "pass turn" (no legal/desired action).
 */
export interface IAgent {
  /** Display name for UI (e.g., "Random Bot v1.0", "Minimax Depth 4") */
  readonly name: string;

  /**
   * Selects the next action for the AI player.
   *
   * @param gameState - Current immutable game state
   * @param board - Board topology for move validation
   * @param myColor - The color this AI is playing as
   * @returns A GameCommand to execute, or null to pass the current phase
   */
  getNextAction(
    gameState: GameState,
    board: Board,
    myColor: Color
  ): Promise<GameCommand | null>;
}

// =============================================================================
// EVALUATOR INTERFACE (for search-based AIs)
// =============================================================================

/**
 * Evaluation function interface for Minimax/Alpha-Beta search.
 *
 * Implementations can create different "personalities":
 * - MaterialEvaluator: Counts piece values
 * - TerritoryEvaluator: Values board control
 * - AggressiveEvaluator: Prioritizes attacking positions
 */
export interface IEvaluator {
  /**
   * Scores a game position from a player's perspective.
   *
   * @param state - Game state to evaluate
   * @param board - Board topology
   * @param perspective - Which color's perspective to score from
   * @returns Score: +Infinity (win), -Infinity (loss), 0 (even)
   */
  evaluate(state: GameState, board: Board, perspective: Color): number;
}

// =============================================================================
// AI CONTEXT TYPES
// =============================================================================

/** A legal move option for the AI */
export interface MoveOption {
  pieceHex: Hex;
  targetHex: Hex;
}

/** A legal attack option for the AI */
export interface AttackOption {
  pieceHex: Hex;
  targetHex: Hex;
  isCastleAttack: boolean;
}

/** A recruitment option from a captured castle */
export interface RecruitOption {
  castleHex: Hex;
  spawnHexes: Hex[];
  nextPieceType: PieceType;
}

/** A pledge option from an available sanctuary */
export interface PledgeOption {
  sanctuaryHex: Hex;
  spawnHexes: Hex[];
  pieceType: PieceType;
  requiresSacrifice: boolean;
}

/** An ability activation option */
export interface AbilityOption {
  pieceHex: Hex;
  abilityType: AbilityType;
  targetHexes: Hex[];
}

/**
 * Pre-computed context of all legal actions for the current player.
 * Built once per turn phase to avoid redundant RuleEngine queries.
 * 
 * Note: All collections are Readonly to prevent accidental mutation by AI.
 */
export interface AIContext {
  /** Current turn phase */
  readonly phase: TurnPhase;

  /** Color of the AI player */
  readonly myColor: Color;

  /** All legal moves indexed by piece hex key */
  readonly legalMoves: ReadonlyMap<string, readonly Hex[]>;

  /** All legal attacks indexed by piece hex key */
  readonly legalAttacks: ReadonlyMap<string, readonly Hex[]>;

  /** Available recruitment options from captured castles */
  readonly recruitOptions: readonly RecruitOption[];

  /** Available pledge options from ready sanctuaries */
  readonly pledgeOptions: readonly PledgeOption[];

  /** Available ability activations */
  readonly abilityOptions: readonly AbilityOption[];
}

// =============================================================================
// AI CONFIGURATION
// =============================================================================

/** Optional settings for configurable AI agents */
export interface AISettings {
  /** Search depth for Minimax/Alpha-Beta */
  searchDepth?: number;

  /** Time limit in milliseconds for move selection */
  timeLimitMs?: number;

  /** Randomization factor (0 = deterministic, 1 = fully random) */
  randomFactor?: number;
}

/** Result of an AI vs AI game for testing */
export interface AIGameResult {
  /** Final game state */
  finalState: GameState;

  /** Number of turns played */
  turnCount: number;

  /** Winner color, or null if draw/timeout */
  winner: Color | null;

  /** Any errors encountered */
  errors: string[];
}
