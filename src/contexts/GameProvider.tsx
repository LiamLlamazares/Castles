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
import { MoveRecord, Color, SanctuaryType } from "../Constants";
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
import { 
  GameStateContext, 
  GameDispatchContext, 
  IGameState, 
  IGameActions,
  GameConfig,
  GameRules,
  GameModeFlags 
} from "./GameContext";

/**
 * GameProvider Props - uses bundled configuration interfaces.
 */
interface GameProviderProps {
  children: ReactNode;
  /** Initial game configuration (board, pieces, sanctuaries) */
  config?: GameConfig;
  /** Game rule settings */
  rules?: GameRules;
  /** Mode flags */
  mode?: GameModeFlags;
}

export const GameProvider: React.FC<GameProviderProps> = ({
  children,
  config,
  rules,
  mode,
}) => {
  // Extract config values with defaults
  const initialBoard = config?.board ?? startingBoard;
  const initialPieces = config?.pieces ?? allPieces;
  const initialTurnCounter = config?.turnCounter ?? 0;
  const initialSanctuaries = config?.sanctuaries;
  const initialMoveTree = config?.moveTree;
  const initialPoolTypes = config?.poolTypes;
  
  // Extract rules
  const sanctuarySettings = rules?.sanctuarySettings;
  const gameRules = rules?.vpModeEnabled !== undefined 
    ? { vpModeEnabled: rules.vpModeEnabled } 
    : undefined;
  
  // Extract mode flags
  const isAnalysisMode = mode?.isAnalysisMode ?? false;
  const isTutorialMode = mode?.isTutorialMode ?? false;
  
  // =========== CORE GAME STATE ===========
  const { state, setState, gameEngine, startingSanctuaries } = useCoreGame(
    initialBoard, 
    initialPieces, 
    initialTurnCounter,
    initialSanctuaries,
    initialMoveTree,
    sanctuarySettings,
    gameRules,
    initialPoolTypes
  );

  // =========== COMPOSED HOOKS ===========
  const { isViewingHistory, analysisState, stepHistory } = useAnalysisMode(state, setState, isAnalysisMode);
  const { getPGN, loadPGN } = usePGN(initialBoard, initialPieces, startingSanctuaries, state.moveTree, sanctuarySettings);

  const {
    movingPiece 
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
    recruitmentHexes,
    recruitmentHexSet
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
    (hex: Hex): boolean => legalMoveSet.has(hex.getKey()),
    [legalMoveSet]
  );
  
  const isLegalAttack = useCallback(
    (hex: Hex): boolean => legalAttackSet.has(hex.getKey()),
    [legalAttackSet]
  );

  const isRecruitmentSpot = useCallback(
    (hex: Hex): boolean => recruitmentHexSet.has(hex.getKey()),
    [recruitmentHexSet]
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
    const newTree = state.moveTree.clone();
    if (newTree.navigateBack()) {
      const parentNode = newTree.current;
      const snapshot = parentNode.snapshot;
      if (snapshot) {
        setState(prev => ({
          ...prev,
          pieces: snapshot.pieces,
          castles: snapshot.castles,
          sanctuaries: snapshot.sanctuaries,
          turnCounter: snapshot.turnCounter,
          moveTree: newTree,
          movingPiece: null
        }));
      }
    }
  }, [state.moveTree, setState]);

  const hasGameStarted = turnCounter > 0;

  const canPledge = useCallback((sanctuaryHex: Hex): boolean => {
      return gameEngine.canPledge(state, sanctuaryHex); 
  }, [gameEngine, state]);

  // =========== CONTEXT VALUES ===========
  
  const gameStateValue: IGameState = useMemo(() => {
    const currentLine = state.moveTree.getHistoryLine();
    
    return {
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
      moveHistory: currentLine,
      history: [], // History object array now legacy or empty
      sanctuaryPool: state.sanctuaryPool,
      graveyard: state.graveyard,
      phoenixRecords: state.phoenixRecords,
      hasGameStarted,
      isAnalysisMode,
      isViewingHistory,
      viewNodeId: state.viewNodeId,
      aiIntegration: {
        gameEngine,
        board: gameEngine.board,
        getState: () => state,
        applyAIState: (newState: GameState) => setState(prev => ({ ...prev, ...newState })),
        isViewingHistory,
      }
    };
  }, [
    pieces, castles, state.sanctuaries, turnCounter, viewState.pieceMap, movingPiece,
    turnPhase, currentPlayer, hexagons, legalMoveSet, legalAttackSet, victoryMessage, winner,
    isRecruitmentSpot, gameEngine, state.moveTree,
    state.sanctuaryPool, state.graveyard, state.phoenixRecords,
    hasGameStarted, isAnalysisMode, isViewingHistory, state.viewNodeId, state, setState
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
