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
import { MoveTree, MoveNode } from "../Classes/Core/MoveTree";
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
    // Block moves in Play Mode (Read-Only) when viewing history
    if (!isAnalysisMode && isViewingHistory) {
      return;
    }

    const effectiveState = getEffectiveState();

    const snapshot = createHistorySnapshot(effectiveState);
    
    // When viewing history, we need to sync the tree cursor before mutation
    let treeForMutation = state.moveTree;
    if (isViewingHistory && treeForMutation && state.viewNodeId) {
         treeForMutation = treeForMutation.clone();
         const viewNode = treeForMutation.findNodeById(state.viewNodeId);
         if (viewNode) {
             treeForMutation.setCurrentNode(viewNode);
         }
    }

    setState(prev => {
      const stateWithHistory = { 
          ...effectiveState, 
          history: [...effectiveState.history, snapshot],
          moveTree: treeForMutation
      };
      const newState = gameEngine.passTurn(stateWithHistory);
      return { ...prev, ...newState, viewNodeId: null, history: newState.history };
    });
  }, [gameEngine, isViewingHistory, state, getEffectiveState]);

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
  }, [gameEngine, movingPiece, currentPlayer, turnPhase, isLegalAttack, saveHistory]);

  const handleHexClick = useCallback((hex: Hex) => {
    // Block moves in Play Mode (Read-Only) when viewing history
    if (!isAnalysisMode && isViewingHistory) {
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    // Get effective state (handles analysis mode merging)
    const effectiveState = getEffectiveState();

    // Helper to commit the new branch
    const commitBranch = (newState: GameState) => {
        // If we were in analysis mode, we are now LIVE at the new head.
        // The GameEngine/StateMutator should have updated the MoveTree already via appendHistory -> moveTree.addMove
        
        // We need to sync MoveTree cursor if it wasn't already. (StateMutator updates `currentNode` if addMove is called on it)
        // BUT StateMutator only calls addMove if we pass `moveTree`.
        // We passed `state.moveTree`.
        
        // HOWEVER: moveTree.addMove adds to `currentNode`.
        // If we are viewing history, we MUST ensure `moveTree.currentNode` points to the node we are viewing!
        if (isViewingHistory && state.viewNodeId) {
            // Sync tree to viewed node before mutation
            const viewNode = state.moveTree?.findNodeById(state.viewNodeId);
            if (viewNode) {
                state.moveTree?.setCurrentNode(viewNode);
            }
        }
        
        // Now apply final update
        // We replace the entire history with the new history sequence? 
        // Or rather, we just update the View to be LIVE.
        // `newState.moveHistory` will contain the new linear history.
        
        setState(prev => ({
            ...prev,
            ...newState, // Apply new pieces, turnCounter, etc
            viewNodeId: null, // Exit history view
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
        
        let treeForMutation = state.moveTree;
        // When viewing history, sync tree cursor to the viewed node before mutation
        if (isViewingHistory && treeForMutation && state.viewNodeId) {
            treeForMutation = treeForMutation.clone();
            const viewNode = treeForMutation.findNodeById(state.viewNodeId);
            if (viewNode) {
                treeForMutation.setCurrentNode(viewNode);
            }
        }

        const stateWithHistory = {
            ...effectiveState,
            history: [...effectiveState.history, snapshot],
            moveTree: treeForMutation
        };

        setState(prev => {
          const newState = gameEngine.applyMove(stateWithHistory, movingPiece!, hex);
          return { ...prev, ...newState, viewNodeId: null, history: newState.history };
        });
        return;
      }
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    if (turnPhase === "Attack" && movingPiece?.canAttack) {
      if (isLegalAttack(hex)) {
        
        const snapshot = createHistorySnapshot(effectiveState);
        
        let treeForMutation = state.moveTree;
        // When viewing history, sync tree cursor to viewed node before mutation
        if (isViewingHistory && treeForMutation && state.viewNodeId) {
            treeForMutation = treeForMutation.clone();
            const viewNode = treeForMutation.findNodeById(state.viewNodeId);
            if (viewNode) {
                treeForMutation.setCurrentNode(viewNode);
            }
        }

        const stateWithHistory = { 
            ...effectiveState, 
            history: [...effectiveState.history, snapshot],
            moveTree: treeForMutation
        };

        const targetPiece = effectiveState.pieces.find(p => p.hex.equals(hex));
        
        setState(prev => {
          if (targetPiece) {
            const newState = gameEngine.applyAttack(stateWithHistory, movingPiece!, hex);
            return { ...prev, ...newState, viewNodeId: null, history: newState.history };
          } else {
            const newState = gameEngine.applyCastleAttack(stateWithHistory, movingPiece!, hex);
            return { ...prev, ...newState, viewNodeId: null, history: newState.history };
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
        
        let treeForMutation = state.moveTree;
        if (isViewingHistory && treeForMutation && state.viewNodeId) {
            treeForMutation = treeForMutation.clone();
            const viewNode = treeForMutation.findNodeById(state.viewNodeId);
            if (viewNode) {
                treeForMutation.setCurrentNode(viewNode);
            }
        }

        const stateWithHistory = { 
            ...effectiveState, 
            history: [...effectiveState.history, snapshot],
            moveTree: treeForMutation
        };

        setState(prev => {
          const newState = gameEngine.recruitPiece(stateWithHistory, castle, hex);
          return { ...prev, ...newState, viewMoveIndex: null, history: newState.history };
        });
        return;
      }
    }

    setState(prev => ({ ...prev, movingPiece: null }));
  }, [gameEngine, turnPhase, movingPiece, pieces, castles, isLegalMove, isLegalAttack, isRecruitmentSpot, isAnalysisMode, state, getEffectiveState]);

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

  // Pledge Action
  const pledge = useCallback((sanctuaryHex: Hex, spawnHex: Hex) => {
    // Block pledge in Play Mode (Read-Only) when viewing history
    if (!isAnalysisMode && isViewingHistory) {
      return;
    }

    const effectiveState = getEffectiveState();

    const snapshot = createHistorySnapshot(effectiveState);

    let treeForMutation = state.moveTree;
    if (isViewingHistory && treeForMutation && state.viewNodeId) {
         treeForMutation = treeForMutation.clone();
         const viewNode = treeForMutation.findNodeById(state.viewNodeId);
         if (viewNode) {
             treeForMutation.setCurrentNode(viewNode);
         }
    }

    setState(prevState => {
       try {
           const stateWithHistory = { 
               ...effectiveState, 
               history: [...effectiveState.history, snapshot],
               moveTree: treeForMutation
           };

           const sanctuary = stateWithHistory.sanctuaries?.find(s => s.hex.equals(sanctuaryHex));
           if (!sanctuary) throw new Error("Sanctuary not found");
           
           const newCoreState = gameEngine.pledge(stateWithHistory, sanctuaryHex, spawnHex);
           
           const notation = NotationService.getPledgeNotation(sanctuary.pieceType, spawnHex);
           const currentPlayer = gameEngine.getCurrentPlayer(stateWithHistory.turnCounter);
           const turnPhase = gameEngine.getTurnPhase(stateWithHistory.turnCounter);
           const turnNumber = Math.floor(stateWithHistory.turnCounter / 10) + 1;
           
           const moveRecord = { notation, turnNumber, color: currentPlayer, phase: turnPhase };
           
           let finalTree = treeForMutation;
           if (finalTree) {
               // If we already cloned it above due to analysis mode, we mutate the clone.
               // If not, we clone now.
               if (!isAnalysisMode) {
                   finalTree = finalTree.clone();
               }
               finalTree.addMove(moveRecord);
           }
           
           return { 
               ...prevState, 
               ...newCoreState, 
               moveHistory: [...stateWithHistory.moveHistory, moveRecord],
               history: stateWithHistory.history,
               viewNodeId: null,
               moveTree: finalTree
           };
       } catch (e) {
           console.error(e);
           return prevState;
       }
    });
  }, [gameEngine, isAnalysisMode, state, getEffectiveState]);

  const canPledge = useCallback((sanctuaryHex: Hex): boolean => {
      return gameEngine.canPledge(state as unknown as GameState, sanctuaryHex);
  }, [gameEngine, state]);

  // Ability Usage
  const triggerAbility = useCallback((sourceHex: Hex, targetHex: Hex, ability: "Fireball" | "Teleport" | "RaiseDead") => {
      // Block abilities in Play Mode (Read-Only) when viewing history
      if (!isAnalysisMode && isViewingHistory) {
        return;
      }

      const effectiveState = getEffectiveState();
      const snapshot = createHistorySnapshot(effectiveState);
      
      let treeForMutation = state.moveTree;
      if (isViewingHistory && treeForMutation && state.viewNodeId) {
          treeForMutation = treeForMutation.clone();
          const viewNode = treeForMutation.findNodeById(state.viewNodeId);
          if (viewNode) {
              treeForMutation.setCurrentNode(viewNode);
          }
      }

      setState(prevState => {
        try {
            const stateWithHistory = { 
                ...effectiveState, 
                history: [...effectiveState.history, snapshot],
                moveTree: treeForMutation
            };
            const newState = gameEngine.activateAbility(stateWithHistory, sourceHex, targetHex, ability);
            return { ...prevState, ...newState, viewNodeId: null, history: newState.history };
        } catch (e) {
            console.error(e);
            return prevState;
        }
      });
  }, [gameEngine, isViewingHistory, state, getEffectiveState]);

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
