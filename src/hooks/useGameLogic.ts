/**
 * @file useGameLogic.ts
 * @description Central React hook for game state management.
 *
 * Provides all game state and actions to the Game component:
 * - **State**: pieces, castles, sanctuaries, turnCounter, etc.
 * - **Computed**: legalMoves, legalAttacks, winner, victoryMessage
 * - **Actions**: handlePass, handleHexClick, handlePieceClick, etc.
 * - **PGN**: getPGN, loadPGN for import/export
 *
 * Internally uses GameEngine for all game logic delegation.
 *
 * @usage Called by Game.tsx to power the game UI.
 * @see GameEngine - Core game logic facade
 * @see Game.tsx - Component that consumes this hook
 */
import { useState, useMemo, useCallback } from "react";
import { createPieceMap } from "../utils/PieceMap";
import { PGNService } from "../Classes/Services/PGNService";
import { SanctuaryGenerator } from "../Classes/Systems/SanctuaryGenerator";
import { GameEngine, GameState } from "../Classes/Core/GameEngine";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Hex } from "../Classes/Entities/Hex";
import {
  TurnPhase,
  Color,
  HistoryEntry,
  MoveRecord,
} from "../Constants";
import { startingBoard, allPieces } from "../ConstantImports";



export interface GameBoardState extends Omit<GameState, 'moveHistory'> {
  showCoordinates: boolean;
  cheatMode: boolean;
  isBoardRotated: boolean;
  resizeVersion: number;
  moveHistory: MoveRecord[];
}

export const useGameLogic = (
  initialBoard: import("../Classes/Core/Board").Board = startingBoard,
  initialPieces: Piece[] = allPieces,
  initialHistory: HistoryEntry[] = [],
  initialMoveHistory: MoveRecord[] = [],
  initialTurnCounter: number = 0
) => {
  // Create game engine instance (stable reference)
  const gameEngine = useMemo(() => new GameEngine(initialBoard), [initialBoard]);
  // =========== STATE ===========
  const [state, setState] = useState<GameBoardState & { viewMoveIndex: number | null }>({
    history: initialHistory,
    pieces: initialPieces,
    pieceMap: createPieceMap(initialPieces),
    movingPiece: null,
    turnCounter: initialTurnCounter,
    castles: initialBoard.castles as Castle[], 
    sanctuaries: SanctuaryGenerator.generateDefaultSanctuaries(initialBoard), 
    
    showCoordinates: false,
    cheatMode: false,
    isBoardRotated: false,
    resizeVersion: 0,
    moveHistory: initialMoveHistory,
    viewMoveIndex: null, // null = viewing live game
    graveyard: [],
    phoenixRecords: []
  });

  const { 
    pieces: currentPieces, 
    castles: currentCastles, 
    turnCounter: currentTurnCounter, 
    movingPiece, 
    history, 
    showCoordinates, 
    isBoardRotated, 
    resizeVersion, 
    moveHistory 
  } = state;

  // Analysis Mode Logic: If viewMoveIndex is set, use historical state
  const isAnalysisMode = state.viewMoveIndex !== null;
  const analysisState = isAnalysisMode ? history[state.viewMoveIndex!] : null;

  // Constructed View State (GameState compatible)
  const viewState = useMemo<GameState>(() => {
      if (isAnalysisMode && analysisState) {
          // Reconstruct a partial GameState for viewing history
          // Note: Graveyard/Phoenix/Sanctuaries might be desynced in history view if not tracked
          return {
              pieces: analysisState.pieces,
              pieceMap: createPieceMap(analysisState.pieces),
              castles: analysisState.castles,
              sanctuaries: state.sanctuaries, // Assuming constant for now
              turnCounter: analysisState.turnCounter,
              movingPiece: null, // Cannot move in history
              history: [], // Not needed for view
              moveHistory: analysisState.moveNotation,
              graveyard: [], // Not tracked in history
              phoenixRecords: [] // Not tracked in history
          };
      }
      return state as unknown as GameState; // Live state is compatible
  }, [state, isAnalysisMode, analysisState]);

  // Derived state to use for rendering
  const pieces = viewState.pieces;
  const castles = viewState.castles;
  const turnCounter = viewState.turnCounter;

  
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
      turnCounter: turnCounter,
      moveNotation: moveHistory,
    };
    setState(prev => ({
      ...prev,
      history: [...prev.history, currentState]
    }));
  }, [pieces, castles, turnCounter, moveHistory]);

  const handlePass = useCallback(() => {
    saveHistory();
    setState(prev => {
      const newState = gameEngine.passTurn(prev as unknown as GameState);
      return { ...prev, ...newState };
    });
  }, [gameEngine, saveHistory]);

  const handleTakeback = useCallback(() => {
    if (history.length > 0) {
      const newHistory = [...history];
      const previousState = newHistory.pop();
      if (previousState) {
        setState(prev => ({
          ...prev,
          pieces: previousState.pieces,
          castles: previousState.castles,
          turnCounter: previousState.turnCounter,
          history: newHistory,
          movingPiece: null
        }));
      }
    }
  }, [history]);

  const handleFlipBoard = useCallback(() => {
    setState(prev => ({ ...prev, isBoardRotated: !prev.isBoardRotated }));
  }, []);

  const toggleCoordinates = useCallback(() => {
    setState(prev => ({ ...prev, showCoordinates: !prev.showCoordinates }));
  }, []);

  const incrementResizeVersion = useCallback(() => {
    setState(prev => ({ ...prev, resizeVersion: prev.resizeVersion + 1 }));
  }, []);

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
    if (turnPhase === "Movement" && movingPiece?.canMove) {
      if (isLegalMove(hex)) {
        saveHistory();
        setState(prev => {
          const newState = gameEngine.applyMove(prev as unknown as GameState, movingPiece!, hex);
          return { ...prev, ...newState };
        });
        return;
      }
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    if (turnPhase === "Attack" && movingPiece?.canAttack) {
      if (isLegalAttack(hex)) {
        saveHistory();
        const targetPiece = pieces.find(p => p.hex.equals(hex));
        setState(prev => {
          if (targetPiece) {
            const newState = gameEngine.applyAttack(prev as unknown as GameState, movingPiece!, hex);
            return { ...prev, ...newState };
          } else {
            const newState = gameEngine.applyCastleAttack(prev as unknown as GameState, movingPiece!, hex);
            return { ...prev, ...newState };
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
        saveHistory();
        setState(prev => {
          const newState = gameEngine.recruitPiece(prev as unknown as GameState, castle, hex);
          return { ...prev, ...newState };
        });
        return;
      }
    }

    setState(prev => ({ ...prev, movingPiece: null }));
  }, [gameEngine, turnPhase, movingPiece, pieces, castles, isLegalMove, isLegalAttack, isRecruitmentSpot, saveHistory]);

  const handleResign = useCallback((player: Color) => {
    //`resign` = remove Monarch.
    saveHistory();
    setState(prev => {
        const myMonarch = prev.pieces.find(p => p.type === "Monarch" && p.color === player);
        if (myMonarch) {
            // Remove monarch
            const newPieces = prev.pieces.filter(p => p !== myMonarch);
            return {
                ...prev,
                pieces: newPieces
                // GameEngine.getWinner should now return the other player
            };
        }
        return prev;
    });
  }, [pieces, saveHistory]);

  const jumpToMove = useCallback((moveIndex: number | null) => {
    setState(prev => {
        if (moveIndex === null) return { ...prev, viewMoveIndex: null };
        if (moveIndex < 0) return { ...prev, viewMoveIndex: 0 };
        if (moveIndex >= prev.history.length) return { ...prev, viewMoveIndex: prev.history.length - 1 };
        return { ...prev, viewMoveIndex: moveIndex };
    });
  }, []);

  const stepHistory = useCallback((direction: -1 | 1) => {
    setState(prev => {
        // If live, "left" goes to last history item.
        if (prev.viewMoveIndex === null) {
            if (direction === -1 && prev.history.length > 0) {
                return { ...prev, viewMoveIndex: prev.history.length - 1 };
            }
            return prev;
        }

        const newIndex = prev.viewMoveIndex + direction;
        // If stepping past end, go back to live
        if (newIndex >= prev.history.length) {
            return { ...prev, viewMoveIndex: null };
        }
        if (newIndex < 0) {
            return { ...prev, viewMoveIndex: 0 };
        }
        return { ...prev, viewMoveIndex: newIndex };
    });
  }, []);

  const hasGameStarted = turnCounter > 0;

  const getPGN = useCallback(() => {
    return PGNService.generatePGN(initialBoard, initialPieces, moveHistory);
  }, [initialBoard, initialPieces, moveHistory]);

  const loadPGN = useCallback((pgn: string) => {
    const { setup, moves } = PGNService.parsePGN(pgn);
    if (!setup) {
        console.error("Failed to parse PGN setup");
        return null;
    }
    const { board, pieces: startPieces } = PGNService.reconstructState(setup);
    
    // Replay moves to get final state
    try {
        const finalState = PGNService.replayMoveHistory(board, startPieces, moves);
        
        return { 
            board, 
            pieces: finalState.pieces,
            castles: finalState.castles,
            history: finalState.history,
            moveHistory: finalState.moveHistory,
            turnCounter: finalState.turnCounter
        };
    } catch (e) {
        console.error("Failed to replay moves:", e);
        alert("Error replaying moves. Game loaded at start position.");
        return {
             board,
             pieces: startPieces,
             history: [],
             moveHistory: [],
             turnCounter: 0
        };
    }
  }, []);

  // Pledge Action
  const pledge = useCallback((sanctuaryHex: Hex, spawnHex: Hex) => {
    setState(prevState => {
       try {
           // Find the sanctuary to get the piece type for notation
           const sanctuary = prevState.sanctuaries?.find(s => s.hex.equals(sanctuaryHex));
           if (!sanctuary) throw new Error("Sanctuary not found");
           
           const newCoreState = gameEngine.pledge(prevState as unknown as GameState, sanctuaryHex, spawnHex);
           
           // Generate notation for the pledge
           const { NotationService } = require("../Classes/Systems/NotationService");
           const notation = NotationService.getPledgeNotation(sanctuary.pieceType, spawnHex);
           const currentPlayer = gameEngine.getCurrentPlayer(prevState.turnCounter);
           const turnPhase = gameEngine.getTurnPhase(prevState.turnCounter);
           const turnNumber = Math.floor(prevState.turnCounter / 10) + 1;
           
           const moveRecord = {
               notation,
               turnNumber,
               color: currentPlayer,
               phase: turnPhase
           };
           
           return {
               ...prevState,
               ...newCoreState,
               moveHistory: [...prevState.moveHistory, moveRecord]
           };
       } catch (e) {
           console.error(e);
           return prevState;
       }
    });
  }, [gameEngine]);

  const canPledge = useCallback((sanctuaryHex: Hex): boolean => {
      // Use VIEW state? Or Live state?
      // Usually canPledge is for UI state in Live Game.
      // But we can check it in analysis too (though meaningless).
      // Let's use PREV state logic (live).
      return gameEngine.canPledge(state as unknown as GameState, sanctuaryHex);
  }, [gameEngine, state]);

  // Ability Usage
  const triggerAbility = useCallback((sourceHex: Hex, targetHex: Hex, ability: "Fireball" | "Teleport" | "RaiseDead") => {
      setState(prevState => {
        try {
            saveHistory(); // Save before effect
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
    sanctuaries: (state as any).sanctuaries || [], // Fallback until fully typed
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
