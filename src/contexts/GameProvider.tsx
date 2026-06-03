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
import { MoveRecord, Color, SanctuaryType, PieceType } from "../Constants";
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
  const initialCastles = config?.castles ?? initialBoard.castles;
  const initialSanctuaries = config?.sanctuaries;
  const initialMoveTree = config?.moveTree;
  const initialPoolTypes = config?.poolTypes;
  const initialGraveyard = config?.graveyard ?? [];
  const initialPhoenixRecords = config?.phoenixRecords ?? [];
  const initialPromotionPending = config?.promotionPending ?? null;
  const initialVictoryPoints = config?.victoryPoints;
  
  // Extract rules
  const sanctuarySettings = rules?.sanctuarySettings;
  const gameRules = rules?.vpModeEnabled !== undefined 
    ? { vpModeEnabled: rules.vpModeEnabled } 
    : undefined;
  
  // Extract mode flags
  const isAnalysisMode = mode?.isAnalysisMode ?? false;
  const isTutorialMode = mode?.isTutorialMode ?? false;
  const onlineSession = mode?.onlineSession;
  
  // =========== CORE GAME STATE ===========
  const { state, setState, gameEngine, startingSanctuaries } = useCoreGame(
    initialBoard, 
    initialPieces, 
    initialTurnCounter,
    initialCastles,
    initialSanctuaries,
    initialMoveTree,
    sanctuarySettings,
    gameRules,
    initialPoolTypes,
    initialGraveyard,
    initialPhoenixRecords,
    initialPromotionPending,
    initialVictoryPoints
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
    initialCastles,
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
    recruitmentHexSet,
    pledgeHexSet
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

  const isPledgeSpot = useCallback(
    (hex: Hex): boolean => pledgeHexSet.has(hex.getKey()),
    [pledgeHexSet]
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
    onlineSession,
  });

  // =========== INTERACTION HOOK ===========
  const { handlePieceClick, handleResign } = useGameInteraction({
    state,
    setState,
    gameEngine,
    turnPhase,
    currentPlayer,
    handleHexClick,
    movingPiece,
    isHistoryReadOnly: !isAnalysisMode && isViewingHistory,
    onlineSession
  });

  const handleTakeback = useCallback(() => {
    if (onlineSession) return;

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
  }, [state.moveTree, setState, onlineSession]);

  const hasGameStarted = turnCounter > 0;

  // =========== PROMOTION ===========
  const promotePiece = useCallback((newType: PieceType) => {
    if (!isAnalysisMode && isViewingHistory) {
      return;
    }

    if (onlineSession) {
      if (onlineSession.result) return;
      if (onlineSession.role === "player" && onlineSession.isActionPending) return;
      if (onlineSession.role === "player" && onlineSession.status !== "connected") return;
      if (onlineSession.role !== "player") return;
      onlineSession.submitAction({
        type: "PROMOTE",
        pieceType: newType,
        baseVersion: onlineSession.version,
      });
      return;
    }

    if (!state.promotionPending) return;
    const newState = gameEngine.promotePiece(state, state.promotionPending, newType);
    setState((prev: GameState) => ({ ...prev, ...newState }));
  }, [isAnalysisMode, isViewingHistory, state, gameEngine, setState, onlineSession]);

  const canPledge = useCallback((sanctuaryHex: Hex): boolean => {
      return gameEngine.canPledge(state, sanctuaryHex); 
  }, [gameEngine, state]);

  // =========== CONTEXT VALUES ===========
  
  const gameStateValue: IGameState = useMemo(() => {
    const currentLine = state.moveTree.getHistoryLine();
    
    return {
      pieces,
      castles,
      sanctuaries: viewState.sanctuaries || [],
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
      isPledgeSpot,
      board: gameEngine.board,
      moveTree: state.moveTree,
      moveHistory: currentLine,
      history: [], // History object array now legacy or empty
      sanctuaryPool: viewState.sanctuaryPool,
      graveyard: viewState.graveyard,
      phoenixRecords: viewState.phoenixRecords,
      victoryPoints: viewState.victoryPoints,
      hasGameStarted,
      isAnalysisMode,
      isViewingHistory,
      viewNodeId: state.viewNodeId,
      promotionPending: isViewingHistory ? null : state.promotionPending ?? null,
      aiIntegration: {
        gameEngine,
        board: gameEngine.board,
        getState: () => state,
        applyAIState: (newState: GameState) => setState(prev => ({ ...prev, ...newState })),
        isViewingHistory,
      },
      onlineSession
    };
  }, [
    pieces, castles, viewState.sanctuaries, turnCounter, viewState.pieceMap, movingPiece,
    turnPhase, currentPlayer, hexagons, legalMoveSet, legalAttackSet, victoryMessage, winner,
    isRecruitmentSpot, isPledgeSpot, gameEngine, state.moveTree,
    viewState.sanctuaryPool, viewState.graveyard, viewState.phoenixRecords, viewState.victoryPoints,
    hasGameStarted, isAnalysisMode, isViewingHistory, state.viewNodeId, state.promotionPending, state, setState,
    onlineSession
  ]);

  const gameActionsValue: IGameActions = useMemo(() => ({
    handlePass,
    handleTakeback,
    handlePieceClick,
    handleHexClick,
    handleResign: (forColor?: Color) => {
      handleResign(forColor || currentPlayer);
    },
    promotePiece,
    handlePromotion: promotePiece,
    pledge,
    canPledge,
    triggerAbility: (source, targetHex, ability) => triggerAbility(source.hex, targetHex, ability),
    isHexDefended: (hex: Hex, color: Color) => gameEngine.isHexDefended(hex, color, viewState),
    jumpToNode,
    stepHistory,
    getPGN,
    loadPGN
  }), [
    handlePass, handleTakeback, handlePieceClick, handleHexClick, handleResign, promotePiece, pledge, canPledge,
    triggerAbility, gameEngine, viewState, jumpToNode, stepHistory, getPGN, loadPGN,
    onlineSession, currentPlayer
  ]);

  return (
    <GameDispatchContext.Provider value={gameActionsValue}>
      <GameStateContext.Provider value={gameStateValue}>
        {children}
      </GameStateContext.Provider>
    </GameDispatchContext.Provider>
  );
};
