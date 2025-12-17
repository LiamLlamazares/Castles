/**
 * @file useGameLogic.ts
 * @description Central React hook for game state management.
 *
 * Composes specialized hooks:
 * - **useAnalysisMode**: History navigation
 * - **useUISettings**: Board display toggles
 * - **usePGN**: Import/export functionality
 *
 * Provides all game state and actions to the Game component.
 *
 * @usage Called by Game.tsx to power the game UI.
 * @see GameEngine - Core game logic facade
 * @see Game.tsx - Component that consumes this hook
 */
import { useState, useMemo, useCallback } from "react";
import { createPieceMap } from "../utils/PieceMap";
import { createHistorySnapshot } from "../utils/GameStateUtils";
import { SanctuaryGenerator } from "../Classes/Systems/SanctuaryGenerator";
import { NotationService } from "../Classes/Systems/NotationService";
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

export interface GameBoardState extends Omit<GameState, 'moveHistory'>, UISettingsState, AnalysisModeState {
  moveHistory: MoveRecord[];
}

export const useGameLogic = (
  initialBoard: import("../Classes/Core/Board").Board = startingBoard,
  initialPieces: Piece[] = allPieces,
  initialHistory: HistoryEntry[] = [],
  initialMoveHistory: MoveRecord[] = [],
  initialTurnCounter: number = 0,
  initialSanctuaries?: Sanctuary[] // Optional, uses default generator if missing
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

  // =========== STATE ===========
  const [state, setState] = useState<GameBoardState>({
    history: initialHistory,
    pieces: initialPieces,
    pieceMap: createPieceMap(initialPieces),
    movingPiece: null,
    turnCounter: initialTurnCounter,
    castles: initialBoard.castles as Castle[], 
    sanctuaries: startingSanctuaries, 
    moveTree: new MoveTree(),
    
    // UI Settings
    showCoordinates: false,
    isBoardRotated: false,
    resizeVersion: 0,
    
    // History
    moveHistory: initialMoveHistory,
    viewMoveIndex: null,
    graveyard: [],
    phoenixRecords: []
  });

  // =========== COMPOSED HOOKS ===========
  const { isAnalysisMode, analysisState, jumpToMove, stepHistory } = useAnalysisMode(state, setState);
  const { showCoordinates, isBoardRotated, resizeVersion, toggleCoordinates, handleFlipBoard, incrementResizeVersion } = useUISettings(state, setState);
  const { getPGN, loadPGN } = usePGN(initialBoard, initialPieces, startingSanctuaries, state.moveHistory);

  // Destructure for convenience
  const { 
    pieces: currentPieces, 
    castles: currentCastles, 
    turnCounter: currentTurnCounter, 
    movingPiece, 
    history, 
    moveHistory 
  } = state;

  // Constructed View State (GameState compatible)
  const viewState = useMemo<GameState>(() => {
      if (isAnalysisMode && analysisState) {
          return {
              pieces: analysisState.pieces,
              pieceMap: createPieceMap(analysisState.pieces),
              castles: analysisState.castles,
              sanctuaries: state.sanctuaries,
              turnCounter: analysisState.turnCounter,
              movingPiece: null,
              history: [],
              moveHistory: analysisState.moveNotation,
              graveyard: [],
              phoenixRecords: []
          };
      }
      return state as unknown as GameState;
  }, [state, isAnalysisMode, analysisState]);

  // Derived state to use for rendering
  const pieces = viewState.pieces;
  const castles = viewState.castles;
  const turnCounter = viewState.turnCounter;

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
  const legalMoveSet = useMemo(
    () => new Set(legalMoves.map(h => h.getKey())),
    [legalMoves]
  );

  const legalAttackSet = useMemo(
    () => new Set(legalAttacks.map(h => h.getKey())),
    [legalAttacks]
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

  // =========== ACTIONS ===========
  const saveHistory = useCallback(() => {
    const currentState: HistoryEntry = {
      pieces: pieces.map((p) => p.clone()),
      castles: castles.map((c) => c.clone()),
      sanctuaries: state.sanctuaries.map((s) => s.clone()),
      turnCounter: turnCounter,
      moveNotation: moveHistory,
    };
    setState(prev => ({
      ...prev,
      history: [...prev.history, currentState]
    }));
  }, [pieces, castles, state.sanctuaries, turnCounter, moveHistory]);

  const handlePass = useCallback(() => {
    const effectiveState = isAnalysisMode && analysisState 
        ? { 
            ...(state as unknown as GameState), 
            ...analysisState, 
            moveHistory: analysisState.moveNotation,
            history: state.history.slice(0, state.viewMoveIndex! + 1),
            moveTree: state.moveTree
        } as unknown as GameState
        : state as unknown as GameState;

    const snapshot = createHistorySnapshot(effectiveState);
    
    if (isAnalysisMode) {
         state.moveTree?.navigateToIndex(state.viewMoveIndex!);
    }

    setState(prev => {
      const stateWithHistory = { ...effectiveState, history: [...effectiveState.history, snapshot] };
      const newState = gameEngine.passTurn(stateWithHistory);
      return { ...prev, ...newState, viewMoveIndex: null, history: newState.history };
    });
  }, [gameEngine, isAnalysisMode, analysisState, state]);

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

    if (
      movingPiece &&
      turnPhase === "Attack" &&
      pieceClicked.color !== currentPlayer &&
      isLegalAttack(pieceClicked.hex)
    ) {
      saveHistory();
      setState(prev => {
        const newState = gameEngine.applyAttack(prev as unknown as GameState, movingPiece!, pieceClicked.hex);
        return { ...prev, ...newState };
      });
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
  }, [gameEngine, movingPiece, currentPlayer, turnPhase, isLegalAttack, saveHistory]);

  const handleHexClick = useCallback((hex: Hex) => {
    // Determine effective "base" state for the move
    const effectiveState = isAnalysisMode && analysisState 
        ? { 
            ...(state as unknown as GameState), // Start with current global state props
            ...analysisState, // Override with historical props (pieces, turnCounter etc)
            moveHistory: analysisState.moveNotation,
            // Reconstruct history array for this point
            // AnalysisState is just a snapshot, so we assume the history up to this point 
            // is effectively the first (viewMoveIndex + 1) items of the main history.
            // NOTE: This assumes linear navigation. If MoveTree is used, we need MoveTree sync.
            history: state.history.slice(0, state.viewMoveIndex! + 1),
            // Ensure MoveTree is the global object reference
            moveTree: state.moveTree
        } as unknown as GameState
        : state as unknown as GameState;

    // Helper to commit the new branch
    const commitBranch = (newState: GameState) => {
        // If we were in analysis mode, we are now LIVE at the new head.
        // The GameEngine/StateMutator should have updated the MoveTree already via appendHistory -> moveTree.addMove
        
        // We need to sync MoveTree cursor if it wasn't already. (StateMutator updates `currentNode` if addMove is called on it)
        // BUT StateMutator only calls addMove if we pass `moveTree`.
        // We passed `state.moveTree`.
        
        // HOWEVER: moveTree.addMove adds to `currentNode`.
        // If we are in analysis mode, we MUST ensure `moveTree.currentNode` points to the node we are viewing!
        if (isAnalysisMode) {
            // Sync tree to view index before mutation
            state.moveTree?.navigateToIndex(state.viewMoveIndex!);
        }
        
        // Now apply final update
        // We replace the entire history with the new history sequence? 
        // Or rather, we just update the View to be LIVE.
        // `newState.moveHistory` will contain the new linear history.
        
        setState(prev => ({
            ...prev,
            ...newState, // Apply new pieces, turnCounter, etc
            viewMoveIndex: null, // Exit analysis mode
            history: newState.history // Use the history returned by mutation (which includes the new snapshot)
        }));
    };

    if (turnPhase === "Movement" && movingPiece?.canMove) {
      if (isLegalMove(hex)) {
        // We do NOT call old valid 'saveHistory()' here because we are handling it via StateMutator's internal logic
        // But wait, `saveHistory` does the SNAPSHOT push. `StateMutator` does the MOVE RECORD push.
        // `useGameLogic` manages the SNAPSHOT history manually in `handleHexClick` normally via `saveHistory()`.
        
        // If we use `effectiveState`, we need to ensure we push the snapshot of `effectiveState` before mutation.
        // `saveHistory` uses `state` (global).
        // Let's manually push snapshot of `effectiveState`.
        
        const snapshot = createHistorySnapshot(effectiveState);
        
        const stateWithHistory = {
            ...effectiveState,
            history: [...effectiveState.history, snapshot]
        };

        if (isAnalysisMode) {
             state.moveTree?.navigateToIndex(state.viewMoveIndex!);
        }

        setState(prev => {
          const newState = gameEngine.applyMove(stateWithHistory, movingPiece!, hex);
          return { ...prev, ...newState, viewMoveIndex: null, history: newState.history };
        });
        return;
      }
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    if (turnPhase === "Attack" && movingPiece?.canAttack) {
      if (isLegalAttack(hex)) {
        
        const snapshot = createHistorySnapshot(effectiveState);
        const stateWithHistory = { ...effectiveState, history: [...effectiveState.history, snapshot] };

        if (isAnalysisMode) {
             state.moveTree?.navigateToIndex(state.viewMoveIndex!);
        }
        
        const targetPiece = effectiveState.pieces.find(p => p.hex.equals(hex));
        
        setState(prev => {
          if (targetPiece) {
            const newState = gameEngine.applyAttack(stateWithHistory, movingPiece!, hex);
            return { ...prev, ...newState, viewMoveIndex: null, history: newState.history };
          } else {
            const newState = gameEngine.applyCastleAttack(stateWithHistory, movingPiece!, hex);
            return { ...prev, ...newState, viewMoveIndex: null, history: newState.history };
          }
        });
        return;
      }
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    if (isRecruitmentSpot(hex)) {
      const castle = castles.find(c => c.isAdjacent(hex));
      if (castle) {
        // Recruitment logic similar to above
        const snapshot = createHistorySnapshot(effectiveState);
        const stateWithHistory = { ...effectiveState, history: [...effectiveState.history, snapshot] };

        if (isAnalysisMode) {
             state.moveTree?.navigateToIndex(state.viewMoveIndex!);
        }

        setState(prev => {
          const newState = gameEngine.recruitPiece(stateWithHistory, castle, hex);
          return { ...prev, ...newState, viewMoveIndex: null, history: newState.history };
        });
        return;
      }
    }

    setState(prev => ({ ...prev, movingPiece: null }));
  }, [gameEngine, turnPhase, movingPiece, pieces, castles, isLegalMove, isLegalAttack, isRecruitmentSpot, isAnalysisMode, analysisState, state]);

  const handleResign = useCallback((player: Color) => {
    saveHistory();
    setState(prev => {
        const myMonarch = prev.pieces.find(p => p.type === "Monarch" && p.color === player);
        if (myMonarch) {
            const newPieces = prev.pieces.filter(p => p !== myMonarch);
            return { ...prev, pieces: newPieces };
        }
        return prev;
    });
  }, [saveHistory]);

  const hasGameStarted = turnCounter > 0;

  // Pledge Action
  const pledge = useCallback((sanctuaryHex: Hex, spawnHex: Hex) => {
    const effectiveState = isAnalysisMode && analysisState 
        ? { 
            ...(state as unknown as GameState), 
            ...analysisState, 
            moveHistory: analysisState.moveNotation,
            history: state.history.slice(0, state.viewMoveIndex! + 1),
            moveTree: state.moveTree
        } as unknown as GameState
        : state as unknown as GameState;

    const snapshot = createHistorySnapshot(effectiveState);

    if (isAnalysisMode) {
         state.moveTree?.navigateToIndex(state.viewMoveIndex!);
    }

    setState(prevState => {
       try {
           const stateWithHistory = { ...effectiveState, history: [...effectiveState.history, snapshot] };

           const sanctuary = stateWithHistory.sanctuaries?.find(s => s.hex.equals(sanctuaryHex));
           if (!sanctuary) throw new Error("Sanctuary not found");
           
           const newCoreState = gameEngine.pledge(stateWithHistory, sanctuaryHex, spawnHex);
           
           const notation = NotationService.getPledgeNotation(sanctuary.pieceType, spawnHex);
           const currentPlayer = gameEngine.getCurrentPlayer(stateWithHistory.turnCounter);
           const turnPhase = gameEngine.getTurnPhase(stateWithHistory.turnCounter);
           const turnNumber = Math.floor(stateWithHistory.turnCounter / 10) + 1;
           
           const moveRecord = { notation, turnNumber, color: currentPlayer, phase: turnPhase };
           
           // StateMutator normally appends history, but pledge logic in GameEngine is raw?
           // GameEngine.pledge returns { pieces, sanctuaries, castles, pieceMap }
           // It does NOT update moveHistory or moveTree automatically via StateMutator.
           // We must manually update MoveTree here if we want variants for pledges.
           
           if (state.moveTree) {
               state.moveTree.addMove(moveRecord);
           }
           
           return { 
               ...prevState, 
               ...newCoreState, 
               moveHistory: [...stateWithHistory.moveHistory, moveRecord],
               history: stateWithHistory.history,
               viewMoveIndex: null 
           };
       } catch (e) {
           console.error(e);
           return prevState;
       }
    });
  }, [gameEngine, isAnalysisMode, analysisState, state]);

  const canPledge = useCallback((sanctuaryHex: Hex): boolean => {
      return gameEngine.canPledge(state as unknown as GameState, sanctuaryHex);
  }, [gameEngine, state]);

  // Ability Usage
  const triggerAbility = useCallback((sourceHex: Hex, targetHex: Hex, ability: "Fireball" | "Teleport" | "RaiseDead") => {
      setState(prevState => {
        try {
            saveHistory();
            const newState = gameEngine.activateAbility(prevState as unknown as GameState, sourceHex, targetHex, ability);
            return { ...prevState, ...newState };
        } catch (e) {
            console.error(e);
            return prevState;
        }
      });
  }, [gameEngine, saveHistory]);

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
    moveHistory: moveHistory,
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
    jumpToMove,
    stepHistory,
    getPGN,
    loadPGN,
    
    // Helpers
    canPledge,
    triggerAbility
  };
};
