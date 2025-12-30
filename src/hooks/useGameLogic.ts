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
import { useMemo, useCallback } from "react";
import { createPieceMap } from "../utils/PieceMap";
import { GameState } from "../Classes/Core/GameEngine";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { MoveTree } from "../Classes/Core/MoveTree";
import { Hex } from "../Classes/Entities/Hex";
import {
  Color,
  HistoryEntry,
  MoveRecord,
} from "../Constants";
import { startingBoard, allPieces } from "../ConstantImports";

// Composed hooks
import { useCoreGame} from "./useCoreGame";
import { useAnalysisMode } from "./useAnalysisMode";
import { usePGN } from "./usePGN";
import { useMoveExecution } from "./useMoveExecution";
import { useComputedGame } from "./useComputedGame";



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
  isTutorialMode: boolean = false // When true, skip victory checks
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
    gameRules
  );

  // =========== COMPOSED HOOKS ===========
  // isAnalysisMode is true when user explicitly entered Analysis Mode
  // This enables variant creation and shows move indicators
  const { isViewingHistory, analysisState, stepHistory } = useAnalysisMode(state, setState, isAnalysisMode);
  const { getPGN, loadPGN } = usePGN(initialBoard, initialPieces, startingSanctuaries, state.moveHistory, state.moveTree);

  // Destructure for convenience
  const {
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
        sanctuaryPool: state.sanctuaryPool,
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
              sanctuaryPool: state.sanctuaryPool,
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
              sanctuaryPool: state.sanctuaryPool,
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
      // Must clone first to treat state as immutable
      const newTree = state.moveTree!.clone();
      
      // Find the node in the NEW tree (ensure we don't mix references)
      const targetNode = newTree.findNodeById(nodeId);
      
      if (!targetNode) return;

      // Update tree cursor and set view to this node
      newTree.setCurrentNode(targetNode);
      
      setState(prev => ({
          ...prev,
          viewNodeId: nodeId,
          movingPiece: null,
          moveTree: newTree
      }));
  }, [state.moveTree, setState]);

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
        // First reset viewNodeId to exit history view
        // Then find and remove the resigning player's monarch from the ACTUAL state
        const myMonarch = prev.pieces.find(p => p.type === "Monarch" && p.color === player);
        if (myMonarch) {
            const newPieces = prev.pieces.filter(p => p !== myMonarch);
            return { ...prev, pieces: newPieces, viewNodeId: null, movingPiece: null };
        }
        return { ...prev, viewNodeId: null, movingPiece: null };
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
    triggerAbility
  };
};
