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
import { useState, useMemo, useCallback } from "react";
import { createPieceMap } from "../utils/PieceMap";
import { SanctuaryGenerator } from "../Classes/Systems/SanctuaryGenerator";
import { GameEngine, GameState } from "../Classes/Core/GameEngine";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { MoveTree } from "../Classes/Core/MoveTree";
import { Hex } from "../Classes/Entities/Hex";
import {
  TurnPhase,
  Color,
  HistoryEntry,
  MoveRecord,
} from "../Constants";
import { startingBoard, allPieces } from "../ConstantImports";

// Composed hooks
import { useAnalysisMode, AnalysisModeState } from "./useAnalysisMode";
import { useUISettings, UISettingsState } from "./useUISettings";
import { usePGN } from "./usePGN";
import { useMoveExecution } from "./useMoveExecution";

// GameBoardState combines GameState and UI/Analysis state
// We omit moveHistory (redefined) and avoid moveTree conflict by using Omit
export interface GameBoardState extends Omit<GameState, 'moveHistory'>, UISettingsState, Omit<AnalysisModeState, 'moveTree'> {
  moveHistory: MoveRecord[];
}

export const useGameLogic = (
  initialBoard: import("../Classes/Core/Board").Board = startingBoard,
  initialPieces: Piece[] = allPieces,
  initialHistory: HistoryEntry[] = [],
  initialMoveHistory: MoveRecord[] = [],
  initialTurnCounter: number = 0,
  initialSanctuaries?: Sanctuary[], // Optional, uses default generator if missing
  isAnalysisMode: boolean = false, // When false, blocks moves during analysis mode (Play Mode)
  initialMoveTree?: MoveTree // Optional, use this tree if provided (e.g., from PGN import with snapshots)
) => {
  // Create game engine instance (stable reference)
  const gameEngine = useMemo(() => new GameEngine(initialBoard), [initialBoard]);
  
  // Use provided sanctuaries or generate default set (random)
  const startingSanctuaries = useMemo(() => {
      if (initialSanctuaries && initialSanctuaries.length > 0) {
          return initialSanctuaries;
      }
      return SanctuaryGenerator.generateDefaultSanctuaries(initialBoard);
  }, [initialBoard, initialSanctuaries]);

  // Use passed MoveTree if available (e.g., from PGN import with snapshots)
  // Otherwise build a new tree from initialMoveHistory
  const startingMoveTree = useMemo(() => {
    if (initialMoveTree) {
      return initialMoveTree; // Use tree with snapshots from PGN import
    }
    // Build new tree from moveHistory (no snapshots, for normal start)
    const tree = new MoveTree();
    if (initialMoveHistory && initialMoveHistory.length > 0) {
      tree.goToRoot();
      for (const move of initialMoveHistory) {
        tree.addMove(move);
      }
    }
    return tree;
  }, [initialMoveHistory, initialMoveTree]);

  // =========== STATE ===========
  const [state, setState] = useState<GameBoardState>({
    history: initialHistory,
    pieces: initialPieces,
    pieceMap: createPieceMap(initialPieces),
    movingPiece: null,
    turnCounter: initialTurnCounter,
    castles: initialBoard.castles as Castle[], 
    sanctuaries: startingSanctuaries, 
    moveTree: startingMoveTree,
    
    // UI Settings
    showCoordinates: false,
    isBoardRotated: false,
    resizeVersion: 0,
    
    // History Navigation (node-based)
    moveHistory: initialMoveHistory,
    viewNodeId: null,  // Node ID for tree navigation (null = live)
    graveyard: [],
    phoenixRecords: []
  });

  // =========== COMPOSED HOOKS ===========
  // isAnalysisMode is true when user explicitly entered Analysis Mode
  // This enables variant creation and shows move indicators
  const { isViewingHistory, analysisState, jumpToNode: jumpToViewNode, stepHistory } = useAnalysisMode(state, setState, isAnalysisMode);
  const { showCoordinates, isBoardRotated, resizeVersion, toggleCoordinates, handleFlipBoard, incrementResizeVersion } = useUISettings(state, setState);
  const { getPGN, loadPGN } = usePGN(initialBoard, initialPieces, startingSanctuaries, state.moveHistory, state.moveTree);

  // Destructure for convenience
  const { 
    pieces: currentPieces, 
    castles: currentCastles, 
    turnCounter: currentTurnCounter, 
    movingPiece, 
    history, 
    moveHistory 
  } = state;

  /**
   * Returns the "effective" game state for actions.
   * When viewing history, this uses the node's snapshot.
   * When live, returns the current state as-is.
   */
  const getEffectiveState = useCallback((): GameState => {
    if (isViewingHistory && analysisState) {
      return {
        ...(state as unknown as GameState),
        pieces: analysisState.pieces.map(p => p.clone()),
        pieceMap: createPieceMap(analysisState.pieces.map(p => p.clone())),
        castles: analysisState.castles.map(c => c.clone()) as Castle[],
        sanctuaries: analysisState.sanctuaries.map(s => s.clone()),
        turnCounter: analysisState.turnCounter,
        movingPiece: null,
        moveHistory: analysisState.moveNotation,
        moveTree: state.moveTree
      } as unknown as GameState;
    }
    // If viewing history but at root node (no snapshot), return initial state
    if (isViewingHistory && !analysisState) {
      return {
        pieces: initialPieces.map(p => p.clone()),
        pieceMap: createPieceMap(initialPieces.map(p => p.clone())),
        castles: initialBoard.castles.map(c => c.clone()) as Castle[],
        sanctuaries: startingSanctuaries.map(s => s.clone()),
        turnCounter: initialTurnCounter,
        movingPiece: null,
        history: [],
        moveHistory: [],
        moveTree: state.moveTree,
        graveyard: [],
        phoenixRecords: []
      } as unknown as GameState;
    }
    return state as unknown as GameState;
  }, [isViewingHistory, analysisState, state, initialPieces, initialBoard, startingSanctuaries, initialTurnCounter]);

  // Constructed View State (GameState compatible)
  const viewState = useMemo<GameState>(() => {
      if (isViewingHistory && analysisState) {
          return {
              pieces: analysisState.pieces,
              pieceMap: createPieceMap(analysisState.pieces),
              castles: analysisState.castles,
              sanctuaries: analysisState.sanctuaries || state.sanctuaries,
              turnCounter: analysisState.turnCounter,
              movingPiece: null,
              history: [],
              moveHistory: analysisState.moveNotation,
              moveTree: state.moveTree,
              graveyard: [],
              phoenixRecords: []
          };
      }
      // At root node (start of game)
      if (isViewingHistory && !analysisState) {
          return {
              pieces: initialPieces,
              pieceMap: createPieceMap(initialPieces),
              castles: initialBoard.castles as Castle[],
              sanctuaries: startingSanctuaries,
              turnCounter: initialTurnCounter,
              movingPiece: null,
              history: [],
              moveHistory: [],
              moveTree: state.moveTree,
              graveyard: [],
              phoenixRecords: []
          };
      }
      return state as unknown as GameState;
  }, [state, isViewingHistory, analysisState, initialPieces, initialBoard, startingSanctuaries, initialTurnCounter]);

  // Derived state to use for rendering
  const pieces = viewState.pieces;
  const castles = viewState.castles;
  const turnCounter = viewState.turnCounter;

  /**
   * Jumps to a specific node in the move tree, potentially switching variations.
   * Now simplified - just sets viewNodeId and updates tree cursor.
   */
  const jumpToNode = useCallback((nodeId: string) => {
      const node = state.moveTree?.findNodeById(nodeId);
      if (!node) return;

      // Update tree cursor and set view to this node
      const newTree = state.moveTree!.clone();
      newTree.setCurrentNode(node);
      
      setState(prev => ({
          ...prev,
          viewNodeId: nodeId,
          movingPiece: null,
          moveTree: newTree
      }));
  }, [state.moveTree, setState]);

  // =========== COMPUTED VALUES ===========
  const turnPhase = useMemo<TurnPhase>(
    () => gameEngine.getTurnPhase(turnCounter),
    [gameEngine, turnCounter]
  );

  const currentPlayer = useMemo<Color>(
    () => gameEngine.getCurrentPlayer(turnCounter),
    [gameEngine, turnCounter]
  );

  const hexagons = useMemo(() => initialBoard.hexes, [initialBoard]);

  const legalMoves = useMemo(
    () => gameEngine.getLegalMoves(viewState, movingPiece),
    [gameEngine, viewState, movingPiece]
  );

  const legalAttacks = useMemo(
    () => gameEngine.getLegalAttacks(viewState, movingPiece),
    [gameEngine, viewState, movingPiece]
  );

  const victoryMessage = useMemo(
    () => gameEngine.getVictoryMessage(pieces, castles),
    [gameEngine, pieces, castles]
  );

  const winner = useMemo(
    () => gameEngine.getWinner(pieces, castles),
    [gameEngine, pieces, castles]
  );

  const emptyUnusedHexesAdjacentToControlledCastles = useMemo(() => {
    return gameEngine.getRecruitmentHexes(viewState);
  }, [gameEngine, viewState]);

  // Sets for O(1) lookup in render
  // Hide indicators ONLY if we are in Play Mode (Read-Only) and viewing history
  const shouldHideMoveIndicators = !isAnalysisMode && isViewingHistory;

  const legalMoveSet = useMemo(
    () => shouldHideMoveIndicators ? new Set<string>() : new Set(legalMoves.map(h => h.getKey())),
    [legalMoves, shouldHideMoveIndicators]
  );

  const legalAttackSet = useMemo(
    () => shouldHideMoveIndicators ? new Set<string>() : new Set(legalAttacks.map(h => h.getKey())),
    [legalAttacks, shouldHideMoveIndicators]
  );

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
    (hex: Hex): boolean => emptyUnusedHexesAdjacentToControlledCastles.some(
      (adjacentHex) => hex.equals(adjacentHex)
    ),
    [emptyUnusedHexesAdjacentToControlledCastles]
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

  // =========== REMAINING ACTIONS ===========
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
  }, [history]);

  // =========== INTERACTION HANDLERS ===========
  const handlePieceClick = useCallback((pieceClicked: Piece) => {
    if (movingPiece === pieceClicked) {
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    if (movingPiece && pieceClicked.color === currentPlayer) {
      setState(prev => ({ ...prev, movingPiece: pieceClicked }));
      return;
    }

    const canSelectForMovement = turnPhase === "Movement" && pieceClicked.canMove;
    const canSelectForAttack = turnPhase === "Attack" && pieceClicked.canAttack;
    const isOwnPiece = pieceClicked.color === currentPlayer;

    if (isOwnPiece && (canSelectForMovement || canSelectForAttack)) {
      setState(prev => ({ ...prev, movingPiece: pieceClicked }));
      return;
    }

    setState(prev => ({ ...prev, movingPiece: null }));
  }, [movingPiece, currentPlayer, turnPhase]);

  const handleResign = useCallback((player: Color) => {
    // Reset to live game state before resigning (in case viewing history)
    setState(prev => {
        // First reset viewMoveIndex to exit history view
        // Then find and remove the resigning player's monarch from the ACTUAL state
        const myMonarch = prev.pieces.find(p => p.type === "Monarch" && p.color === player);
        if (myMonarch) {
            const newPieces = prev.pieces.filter(p => p !== myMonarch);
            return { ...prev, pieces: newPieces, viewMoveIndex: null, movingPiece: null };
        }
        return { ...prev, viewMoveIndex: null, movingPiece: null };
    });
  }, []);

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
    movingPiece,
    showCoordinates,
    isBoardRotated,
    resizeVersion,
    
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
    handleFlipBoard,
    toggleCoordinates,
    incrementResizeVersion,
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
    triggerAbility
  };
};
