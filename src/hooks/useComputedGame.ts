/**
 * @file useComputedGame.ts
 * @description Hook for computing derived game values.
 *
 * Extracted from useGameLogic to reduce complexity and improve separation of concerns.
 * Contains all computed/derived values that depend on the game state and engine.
 *
 * @see useGameLogic - Composes this hook
 * @see GameEngine - Source of computed values
 */
import { useMemo } from "react";
import { GameEngine, GameState } from "../Classes/Core/GameEngine";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Hex } from "../Classes/Entities/Hex";
import { TurnPhase, Color } from "../Constants";

export interface ComputedGameProps {
  gameEngine: GameEngine;
  viewState: GameState;
  pieces: Piece[];
  castles: Castle[];
  movingPiece: Piece | null;
  turnCounter: number;
  isAnalysisMode: boolean;
  isViewingHistory: boolean;
}

export interface ComputedGameResult {
  /** Current turn phase (Movement, Attack, or Recruitment) */
  turnPhase: TurnPhase;
  /** Current player's color */
  currentPlayer: Color;
  /** Legal movement destinations for selected piece */
  legalMoves: Hex[];
  /** Legal attack targets for selected piece */
  legalAttacks: Hex[];
  /** O(1) lookup set for legal moves */
  legalMoveSet: Set<string>;
  /** O(1) lookup set for legal attacks */
  legalAttackSet: Set<string>;
  /** Victory message if game is over */
  victoryMessage: string | null;
  /** Winner if game is over */
  winner: Color | null;
  /** Available recruitment positions */
  recruitmentHexes: Hex[];
  /** O(1) lookup set for recruitment hexes */
  recruitmentHexSet: Set<string>;
  /** Whether move indicators should be hidden */
  shouldHideMoveIndicators: boolean;
}

/**
 * Hook for computing derived game values.
 * All values are memoized and only recompute when dependencies change.
 */
export const useComputedGame = ({
  gameEngine,
  viewState,
  pieces,
  castles,
  movingPiece,
  turnCounter,
  isAnalysisMode,
  isViewingHistory,
}: ComputedGameProps): ComputedGameResult => {
  // Turn phase and current player
  const turnPhase = useMemo<TurnPhase>(
    () => gameEngine.getTurnPhase(turnCounter),
    [gameEngine, turnCounter]
  );

  const currentPlayer = useMemo<Color>(
    () => gameEngine.getCurrentPlayer(turnCounter),
    [gameEngine, turnCounter]
  );

  // Legal actions for selected piece
  const legalMoves = useMemo(
    () => gameEngine.getLegalMoves(viewState, movingPiece),
    [gameEngine, viewState, movingPiece]
  );

  const legalAttacks = useMemo(
    () => gameEngine.getLegalAttacks(viewState, movingPiece),
    [gameEngine, viewState, movingPiece]
  );

  // Win conditions
  const victoryMessage = useMemo(
    () => gameEngine.getVictoryMessage(pieces, castles),
    [gameEngine, pieces, castles]
  );

  const winner = useMemo(
    () => gameEngine.getWinner(pieces, castles),
    [gameEngine, pieces, castles]
  );

  // Recruitment positions
  const recruitmentHexes = useMemo(
    () => gameEngine.getRecruitmentHexes(viewState),
    [gameEngine, viewState]
  );

  // Hide indicators ONLY if we are in Play Mode (Read-Only) and viewing history
  const shouldHideMoveIndicators = !isAnalysisMode && isViewingHistory;

  // O(1) lookup sets for render performance
  const legalMoveSet = useMemo(
    () => shouldHideMoveIndicators ? new Set<string>() : new Set(legalMoves.map(h => h.getKey())),
    [legalMoves, shouldHideMoveIndicators]
  );

  const legalAttackSet = useMemo(
    () => shouldHideMoveIndicators ? new Set<string>() : new Set(legalAttacks.map(h => h.getKey())),
    [legalAttacks, shouldHideMoveIndicators]
  );

  const recruitmentHexSet = useMemo(
    () => shouldHideMoveIndicators ? new Set<string>() : new Set(recruitmentHexes.map(h => h.getKey())),
    [recruitmentHexes, shouldHideMoveIndicators]
  );

  return {
    turnPhase,
    currentPlayer,
    legalMoves,
    legalAttacks,
    legalMoveSet,
    legalAttackSet,
    victoryMessage,
    winner,
    recruitmentHexes,
    recruitmentHexSet,
    shouldHideMoveIndicators,
  };
};
