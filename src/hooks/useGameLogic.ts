/**
 * @file useGameLogic.ts
 * @description Central React hook for game state management.
 *
 * Composes specialized hooks:
 * - **useAnalysisMode**: History navigation
 * - **useUISettings**: Board display toggles
 * - **usePGN**: Import/export functionality
 * - **useMoveExecution**: Move/attack/recruit/ability execution
 *
 * Provides all game state and actions to the Game component.
 *
 * @usage Called by Game.tsx to power the game UI.
 * @see GameEngine - Core game logic facade
 * @see Game.tsx - Component that consumes this hook
 */
import React, { useMemo, useCallback } from "react";
import { createPieceMap } from "../utils/PieceMap";
import { GameEngine } from "../Classes/Core/GameEngine";
import { GameState } from "../Classes/Core/GameState";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { MoveTree } from "../Classes/Core/MoveTree";
import { Hex } from "../Classes/Entities/Hex";
import {
  Color,
  HistoryEntry,
  MoveRecord,
  SanctuaryConfig,
  SanctuaryType
} from "../Constants";
import { startingBoard, allPieces } from "../ConstantImports";

// Composed hooks
import { useCoreGame} from "./useCoreGame";
import { useAnalysisMode } from "./useAnalysisMode";
import { usePGN } from "./usePGN";
import { useMoveExecution } from "./useMoveExecution";
import { useComputedGame } from "./useComputedGame";
import { useGameAnalysisController } from "./useGameAnalysisController";
import { useGameInteraction } from "./useGameInteraction";



export const useGameLogic = (
  initialBoard: import("../Classes/Core/Board").Board = startingBoard,
  initialPieces: Piece[] = allPieces,
  initialHistory: HistoryEntry[] = [],
  initialMoveHistory: MoveRecord[] = [],
  initialTurnCounter: number = 0,
  initialSanctuaries?: Sanctuary[], // Optional, uses default generator if missing
  isAnalysisMode: boolean = false, // When false, blocks moves during analysis mode (Play Mode)
  initialMoveTree?: MoveTree, // Optional, use this tree if provided (e.g., from PGN import with snapshots)
  sanctuarySettings?: { unlockTurn: number, cooldown: number }, // Configurable sanctuary settings
  gameRules?: { vpModeEnabled: boolean },
  isTutorialMode: boolean = false, // When true, skip victory checks
  initialPoolTypes?: import("../Constants").SanctuaryType[]
) => {
  // Create game engine instance (stable reference)
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
  // isAnalysisMode is true when user explicitly entered Analysis Mode
  // This enables variant creation and shows move indicators
  const { isViewingHistory, analysisState, stepHistory } = useAnalysisMode(state, setState, isAnalysisMode);
  const { getPGN, loadPGN } = usePGN(initialBoard, initialPieces, startingSanctuaries, state.moveHistory, state.moveTree, sanctuarySettings);

  // Destructure for convenience
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
      return gameEngine.canPledge(state as unknown as GameState, sanctuaryHex);
  }, [gameEngine, state]);

  return {
    // State
    pieces,
    castles,
    sanctuaries: state.sanctuaries || [],
    turnCounter,
    pieceMap: viewState.pieceMap,
    movingPiece,
    
    // Computed
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
    moveHistory: moveHistory,
    history: state.history,
    hasGameStarted,

    // Actions
    handlePass,
    handleTakeback,
    handlePieceClick,
    handleHexClick,
    handleResign,
    pledge,
    
    // Analysis & PGN
    isAnalysisMode,
    isViewingHistory,
    viewNodeId: state.viewNodeId,
    jumpToNode,
    stepHistory,
    getPGN,
    loadPGN,
    
    // Helpers
    canPledge,
    triggerAbility,
    isHexDefended: (hex: Hex, color: Color) => gameEngine.isHexDefended(hex, color, viewState),
    
    // AI Integration
    aiIntegration: {
      gameEngine,
      board: gameEngine.board,
      getState: () => state as unknown as GameState,
      applyAIState: (newState: GameState) => setState(newState as any),
      isViewingHistory,
    }
  };
};
