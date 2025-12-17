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
  initialTurnCounter: number = 0
) => {
  // Create game engine instance (stable reference)
  const gameEngine = useMemo(() => new GameEngine(initialBoard), [initialBoard]);
  
  // =========== STATE ===========
  const [state, setState] = useState<GameBoardState>({
    history: initialHistory,
    pieces: initialPieces,
    pieceMap: createPieceMap(initialPieces),
    movingPiece: null,
    turnCounter: initialTurnCounter,
    castles: initialBoard.castles as Castle[], 
    sanctuaries: SanctuaryGenerator.generateDefaultSanctuaries(initialBoard), 
    
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
  const { getPGN, loadPGN } = usePGN(initialBoard, initialPieces, state.moveHistory);

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
    saveHistory();
    setState(prevState => {
       try {
           const sanctuary = prevState.sanctuaries?.find(s => s.hex.equals(sanctuaryHex));
           if (!sanctuary) throw new Error("Sanctuary not found");
           
           const newCoreState = gameEngine.pledge(prevState as unknown as GameState, sanctuaryHex, spawnHex);
           
           const { NotationService } = require("../Classes/Systems/NotationService");
           const notation = NotationService.getPledgeNotation(sanctuary.pieceType, spawnHex);
           const currentPlayer = gameEngine.getCurrentPlayer(prevState.turnCounter);
           const turnPhase = gameEngine.getTurnPhase(prevState.turnCounter);
           const turnNumber = Math.floor(prevState.turnCounter / 10) + 1;
           
           const moveRecord = { notation, turnNumber, color: currentPlayer, phase: turnPhase };
           
           return { ...prevState, ...newCoreState, moveHistory: [...prevState.moveHistory, moveRecord] };
       } catch (e) {
           console.error(e);
           return prevState;
       }
    });
  }, [gameEngine, saveHistory]);

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
