/**
 * @file useAIOpponent.ts
 * @description Hook to manage AI opponent during gameplay.
 *
 * When enabled, this hook automatically triggers AI moves when it's
 * the AI's turn. It uses the AIController to execute actions and
 * updates the game state accordingly.
 *
 * @see RandomAgent - Default AI implementation
 * @see AIController - Orchestrates AI turns
 */

import { useEffect, useMemo, useCallback, useRef } from "react";
import { GameState, GameEngine } from "../Classes/Core/GameEngine";
import { Board } from "../Classes/Core/Board";
import { TurnManager } from "../Classes/Core/TurnManager";
import { RandomAgent, AIController } from "../Classes/AI";
import type { IAgent } from "../Classes/AI";
import { Color } from "../Constants";

/** Supported opponent types */
export type OpponentType = "human" | "random-ai"; // Future: 'heuristic-ai', 'minimax-ai'

/** Configuration for AI opponent */
export interface AIOpponentConfig {
  type: OpponentType;
  aiColor: Color;
}

/** Hook options */
interface UseAIOpponentOptions {
  /** Whether AI opponent is enabled */
  enabled: boolean;
  /** Type of AI opponent */
  opponentType: OpponentType;
  /** Which color the AI controls */
  aiColor: Color;
  /** Game engine instance */
  gameEngine: GameEngine;
  /** Board topology */
  board: Board;
  /** Current game state */
  gameState: GameState;
  /** State setter callback */
  onStateChange: (newState: GameState) => void;
  /** Whether user is viewing history (AI should not act) */
  isViewingHistory?: boolean;
}

/**
 * Hook that manages AI opponent turns.
 *
 * Usage:
 * ```tsx
 * useAIOpponent({
 *   enabled: opponentConfig?.type !== 'human',
 *   opponentType: opponentConfig?.type ?? 'human',
 *   aiColor: 'b',
 *   gameEngine,
 *   board,
 *   gameState: state,
 *   onStateChange: setState,
 * });
 * ```
 */
export const useAIOpponent = (options: UseAIOpponentOptions) => {
  const {
    enabled,
    opponentType,
    aiColor,
    gameEngine,
    board,
    gameState,
    onStateChange,
    isViewingHistory = false,
  } = options;

  // Track if AI is currently "thinking" to prevent multiple triggers
  const isThinking = useRef(false);

  // Create the appropriate agent based on type
  const agent: IAgent | null = useMemo(() => {
    if (!enabled) return null;

    switch (opponentType) {
      case "random-ai":
        return new RandomAgent(gameEngine, board);
      // Future agent types:
      // case 'heuristic-ai':
      //   return new HeuristicAgent(gameEngine, board);
      default:
        return null;
    }
  }, [enabled, opponentType, gameEngine, board]);

  // Create controller for the agent
  const controller = useMemo(() => {
    if (!agent) return null;
    return new AIController(agent, gameEngine, board);
  }, [agent, gameEngine, board]);

  // Execute AI turn
  const executeAITurn = useCallback(async () => {
    if (!controller || isThinking.current) return;

    isThinking.current = true;

    try {
      // Play a single action (not full turn, for better UX feedback)
      const result = await controller.playSingleAction(gameState, aiColor);
      
      if (result.actionTaken) {
        onStateChange(result.state);
      }
    } catch (error) {
      console.error("[useAIOpponent] Error during AI turn:", error);
    } finally {
      isThinking.current = false;
    }
  }, [controller, gameState, aiColor, onStateChange]);

  // Effect: Trigger AI when it's AI's turn
  useEffect(() => {
    if (!enabled || !agent || isViewingHistory) return;

    const currentPlayer = TurnManager.getCurrentPlayer(gameState.turnCounter);

    // Only act if it's AI's turn
    if (currentPlayer !== aiColor) return;

    // Check if game is over
    const winner = gameEngine.getWinner(
      gameState.pieces,
      gameState.castles,
      gameState.victoryPoints
    );
    if (winner) return;

    // Small delay for better UX (makes AI feel like it's "thinking")
    const timeoutId = setTimeout(() => {
      executeAITurn();
    }, 300); // 300ms delay

    return () => clearTimeout(timeoutId);
  }, [
    enabled,
    agent,
    gameState.turnCounter,
    aiColor,
    isViewingHistory,
    executeAITurn,
    gameEngine,
    gameState.pieces,
    gameState.castles,
    gameState.victoryPoints,
  ]);

  // Return info for optional UI display
  return {
    isAIEnabled: enabled && agent !== null,
    aiColor,
    isAITurn: enabled && TurnManager.getCurrentPlayer(gameState.turnCounter) === aiColor,
    agentName: agent?.name ?? null,
  };
};
