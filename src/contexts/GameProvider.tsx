/**
 * @file GameProvider.tsx
 * @description Provider component that encapsulates the game logic and state.
 *
 * This component effectively replaces the direct usage of `useGameLogic` in `Game.tsx`.
 * It instantiates the core hooks and provides the state and actions down the tree
 * via `GameContext`.
 */
import React, { useMemo, useCallback, ReactNode } from "react";
import { Board } from "../Classes/Core/Board";
import { Piece } from "../Classes/Entities/Piece";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { MoveTree } from "../Classes/Core/MoveTree";
import { Hex } from "../Classes/Entities/Hex";
import { HistoryEntry, MoveRecord, Color, SanctuaryType } from "../Constants";
import { startingBoard, allPieces } from "../ConstantImports";
import { GameState } from "../Classes/Core/GameState";

// Hooks
import { useCoreGame } from "../hooks/useCoreGame";
import { useAnalysisMode } from "../hooks/useAnalysisMode";
import { usePGN } from "../hooks/usePGN";
import { useMoveExecution } from "../hooks/useMoveExecution";
import { useComputedGame } from "../hooks/useComputedGame";
import { useGameAnalysisController } from "../hooks/useGameAnalysisController";
import { useGameInteraction } from "../hooks/useGameInteraction";

// Contexts
import { GameStateContext, GameDispatchContext, IGameState, IGameActions } from "./GameContext";

interface GameProviderProps {
  children: ReactNode;
  
  // Initial Configuration
  initialBoard?: Board;
  initialPieces?: Piece[];
  initialHistory?: HistoryEntry[];
  initialMoveHistory?: MoveRecord[];
  initialTurnCounter?: number;
  initialSanctuaries?: Sanctuary[];
  isAnalysisMode?: boolean;
  initialMoveTree?: MoveTree;
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
  gameRules?: { vpModeEnabled: boolean };
  isTutorialMode?: boolean;
  initialPoolTypes?: SanctuaryType[];
}

export const GameProvider: React.FC<GameProviderProps> = ({
  children,
  initialBoard = startingBoard,
  initialPieces = allPieces,
  initialHistory = [],
  initialMoveHistory = [],
  initialTurnCounter = 0,
  initialSanctuaries,
  isAnalysisMode = false,
  initialMoveTree,
  sanctuarySettings,
  gameRules,
  isTutorialMode = false,
  initialPoolTypes
}) => {
  
  // =========== CORE GAME STATE ===========
  const { state, setState, gameEngine, startingSanctuaries } = useCoreGame(
    initialBoard, 
    initialPieces, 
    initialHistory, 
    initialMoveHistory, 
    initialTurnCounter, 
    initialSanctuaries, 
    initialMoveTree,
    sanctuarySettings,
    gameRules,
    initialPoolTypes
  );

  // =========== COMPOSED HOOKS ===========
  const { isViewingHistory, analysisState, stepHistory } = useAnalysisMode(state, setState, isAnalysisMode);
  const { getPGN, loadPGN } = usePGN(initialBoard, initialPieces, startingSanctuaries, state.moveHistory, state.moveTree, sanctuarySettings);

  const {
    movingPiece, 
    history, 
    moveHistory 
  } = state;

  // =========== VIEW STATE CONTROLLER ===========
  const { viewState, getEffectiveState, jumpToNode } = useGameAnalysisController({
    state,
    setState,
    initialPieces,
    initialBoard,
    startingSanctuaries,
    initialTurnCounter,
    isViewingHistory,
    analysisState
  });

  // Derived state to use for rendering
  const pieces = viewState.pieces;
  const castles = viewState.castles;
  const turnCounter = viewState.turnCounter;

  // =========== COMPUTED STATE ===========
  const {
    turnPhase,
    currentPlayer,
    legalMoves,
    legalAttacks,
    legalMoveSet,
    legalAttackSet,
    victoryMessage,
    winner,
    recruitmentHexes
  } = useComputedGame({
    gameEngine,
    viewState,
    pieces,
    castles,
    movingPiece,
    turnCounter,
    isAnalysisMode,
    isViewingHistory,
    isTutorialMode
  });

  const hexagons = useMemo(() => initialBoard.hexes, [initialBoard]);

  // =========== HELPER FUNCTIONS ===========
  const isLegalMove = useCallback(
    (hex: Hex): boolean => legalMoves.some((move) => move.equals(hex)),
    [legalMoves]
  );
  
  const isLegalAttack = useCallback(
    (hex: Hex): boolean => legalAttacks.some((attack) => attack.equals(hex)),
    [legalAttacks]
  );

  const isRecruitmentSpot = useCallback(
    (hex: Hex): boolean => recruitmentHexes.some(
      (adjacentHex) => hex.equals(adjacentHex)
    ),
    [recruitmentHexes]
  );

  // =========== MOVE EXECUTION HOOK ===========
  const { handlePass, handleHexClick, pledge, triggerAbility } = useMoveExecution({
    gameEngine,
    state,
    setState,
    isAnalysisMode,
    isViewingHistory,
    turnPhase,
    currentPlayer,
    isLegalMove,
    isLegalAttack,
    isRecruitmentSpot,
    getEffectiveState,
    initialPieces,
    initialBoard,
    startingSanctuaries,
    initialTurnCounter,
  });

  // =========== INTERACTION HOOK ===========
  const { handlePieceClick, handleResign } = useGameInteraction({
    state,
    setState,
    gameEngine,
    turnPhase,
    currentPlayer,
    handleHexClick,
    movingPiece
  });

  const handleTakeback = useCallback(() => {
    if (history.length > 0) {
      const newHistory = [...history];
      const previousState = newHistory.pop();
      if (previousState) {
        setState(prev => ({
          ...prev,
          pieces: previousState.pieces,
          castles: previousState.castles,
          sanctuaries: previousState.sanctuaries,
          turnCounter: previousState.turnCounter,
          history: newHistory,
          movingPiece: null
        }));
      }
    }
  }, [history, setState]);

  const hasGameStarted = turnCounter > 0;

  const canPledge = useCallback((sanctuaryHex: Hex): boolean => {
      // Use explicit cast if generic state has incompatible details, though it matches interface structure
      return gameEngine.canPledge(state as unknown as GameState, sanctuaryHex); 
  }, [gameEngine, state]);

  // =========== CONTEXT VALUES ===========
  
  const gameStateValue: IGameState = useMemo(() => ({
    pieces,
    castles,
    sanctuaries: state.sanctuaries || [],
    turnCounter,
    pieceMap: viewState.pieceMap,
    movingPiece,
    turnPhase,
    currentPlayer,
    hexagons,
    legalMoveSet,
    legalAttackSet,
    victoryMessage,
    winner,
    isRecruitmentSpot,
    board: gameEngine.board,
    moveTree: state.moveTree,
    moveHistory,
    history: state.history,
    hasGameStarted,
    isAnalysisMode,
    isViewingHistory,
    viewNodeId: state.viewNodeId,
    aiIntegration: {
      gameEngine,
      board: gameEngine.board,
      getState: () => state as unknown as GameState,
      applyAIState: (newState: GameState) => setState(newState as any),
      isViewingHistory,
    }
  }), [
    pieces, castles, state.sanctuaries, turnCounter, viewState.pieceMap, movingPiece,
    turnPhase, currentPlayer, hexagons, legalMoveSet, legalAttackSet, victoryMessage, winner,
    isRecruitmentSpot, gameEngine, state.moveTree, moveHistory, state.history, hasGameStarted,
    isAnalysisMode, isViewingHistory, state.viewNodeId, state, setState
  ]);

  const gameActionsValue: IGameActions = useMemo(() => ({
    handlePass,
    handleTakeback,
    handlePieceClick,
    handleHexClick,
    handleResign: (forColor?: Color) => handleResign(forColor || currentPlayer),
    pledge,
    canPledge,
    triggerAbility: (source, targetHex, ability) => triggerAbility(source.hex, targetHex, ability),
    isHexDefended: (hex: Hex, color: Color) => gameEngine.isHexDefended(hex, color, viewState),
    jumpToNode,
    stepHistory,
    getPGN,
    loadPGN
  }), [
    handlePass, handleTakeback, handlePieceClick, handleHexClick, handleResign, pledge, canPledge,
    triggerAbility, gameEngine, viewState, jumpToNode, stepHistory, getPGN, loadPGN
  ]);

  return (
    <GameDispatchContext.Provider value={gameActionsValue}>
      <GameStateContext.Provider value={gameStateValue}>
        {children}
      </GameStateContext.Provider>
    </GameDispatchContext.Provider>
  );
};
