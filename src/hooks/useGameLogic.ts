import { useState, useMemo, useCallback } from "react";
import { GameEngine, GameState } from "../Classes/GameEngine";
import { Piece } from "../Classes/Piece";
import { Castle } from "../Classes/Castle";
import { Hex } from "../Classes/Hex";
import {
  TurnPhase,
  Color,
  HistoryEntry,
  MoveRecord,
} from "../Constants";
import { startingBoard, allPieces } from "../ConstantImports";

// Create game engine instance (stable reference)
// const gameEngine = new GameEngine(startingBoard);

export interface GameBoardState extends Omit<GameState, 'moveHistory'> {
  showCoordinates: boolean;
  cheatMode: boolean;
  isBoardRotated: boolean;
  resizeVersion: number;
  moveHistory: MoveRecord[];
}

export const useGameLogic = () => {
  // Create game engine instance (stable reference)
  const gameEngine = useMemo(() => new GameEngine(startingBoard), []);
  // =========== STATE ===========
  const [state, setState] = useState<GameBoardState>({
    history: [],
    pieces: allPieces,
    movingPiece: null,
    turnCounter: 0,
    castles: startingBoard.castles as Castle[],
    showCoordinates: false,
    cheatMode: false,
    isBoardRotated: false,
    resizeVersion: 0,
    moveHistory: [],
  });

  const { pieces, castles, turnCounter, movingPiece, history, showCoordinates, isBoardRotated, resizeVersion, moveHistory } = state;

  // =========== COMPUTED VALUES (useMemo) ===========
  
  const turnPhase = useMemo<TurnPhase>(
    () => gameEngine.getTurnPhase(turnCounter),
    [turnCounter]
  );

  const currentPlayer = useMemo<Color>(
    () => gameEngine.getCurrentPlayer(turnCounter),
    [turnCounter]
  );

  const hexagons = useMemo(() => startingBoard.hexes, []);

  const legalMoves = useMemo(
    () => gameEngine.getLegalMoves(movingPiece, pieces, castles, turnCounter),
    [movingPiece, pieces, castles, turnCounter]
  );

  const legalAttacks = useMemo(
    () => gameEngine.getLegalAttacks(movingPiece, pieces, castles, turnCounter),
    [movingPiece, pieces, castles, turnCounter]
  );

  const victoryMessage = useMemo(
    () => gameEngine.getVictoryMessage(pieces, castles),
    [pieces, castles]
  );

  const winner = useMemo(
    () => gameEngine.getWinner(pieces, castles),
    [pieces, castles]
  );

  const emptyUnusedHexesAdjacentToControlledCastles = useMemo(() => {
    return gameEngine.getRecruitmentHexes(pieces, castles, turnCounter);
  }, [pieces, castles, turnCounter]);

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
      const newState = gameEngine.passTurn(prev);
      return { ...prev, ...newState };
    });
  }, [saveHistory]);

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

  const setResizeVersion = useCallback((version: number) => {
    setState(prev => ({ ...prev, resizeVersion: version }));
  }, []);

  const incrementResizeVersion = useCallback(() => {
    setState(prev => ({ ...prev, resizeVersion: prev.resizeVersion + 1 }));
  }, []);

  // =========== INTERACTION HANDLERS ===========

  const handlePieceClick = useCallback((pieceClicked: Piece) => {
    // CASE 1: Deselect currently selected piece
    if (movingPiece === pieceClicked) {
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    // CASE 2: Switch to different friendly piece
    if (movingPiece && pieceClicked.color === currentPlayer) {
      setState(prev => ({ ...prev, movingPiece: pieceClicked }));
      return;
    }

    // CASE 3: Attack enemy piece
    if (
      movingPiece &&
      turnPhase === "Attack" &&
      pieceClicked.color !== currentPlayer &&
      isLegalAttack(pieceClicked.hex)
    ) {
      saveHistory();
      setState(prev => {
        const newState = gameEngine.applyAttack(prev, movingPiece!, pieceClicked.hex);
        return { ...prev, ...newState };
      });
      return;
    }

    // CASE 4: Select own piece (if valid for current phase)
    const canSelectForMovement = turnPhase === "Movement" && pieceClicked.canMove;
    const canSelectForAttack = turnPhase === "Attack" && pieceClicked.canAttack;
    const isOwnPiece = pieceClicked.color === currentPlayer;

    if (isOwnPiece && (canSelectForMovement || canSelectForAttack)) {
      setState(prev => ({ ...prev, movingPiece: pieceClicked }));
      return;
    }

    // Default: Invalid click, deselect
    setState(prev => ({ ...prev, movingPiece: null }));
  }, [movingPiece, currentPlayer, turnPhase, isLegalAttack, saveHistory]);

  const handleHexClick = useCallback((hex: Hex) => {
    // CASE 1: Movement - move piece to empty hex
    if (turnPhase === "Movement" && movingPiece?.canMove) {
      if (isLegalMove(hex)) {
        saveHistory();
        setState(prev => {
          const newState = gameEngine.applyMove(prev, movingPiece!, hex);
          return { ...prev, ...newState };
        });
        return;
      }
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    // CASE 2: Attack - attack piece or capture castle
    if (turnPhase === "Attack" && movingPiece?.canAttack) {
      if (isLegalAttack(hex)) {
        saveHistory();
        const targetPiece = pieces.find(p => p.hex.equals(hex));
        setState(prev => {
          if (targetPiece) {
            const newState = gameEngine.applyAttack(prev, movingPiece!, hex);
            return { ...prev, ...newState };
          } else {
            const newState = gameEngine.applyCastleAttack(prev, movingPiece!, hex);
            return { ...prev, ...newState };
          }
        });
        return;
      }
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    // CASE 3: Castles phase - recruit new piece
    if (isRecruitmentSpot(hex)) {
      const castle = castles.find(c => c.isAdjacent(hex));
      if (castle) {
        saveHistory();
        setState(prev => {
          const newState = gameEngine.recruitPiece(prev, castle, hex);
          return { ...prev, ...newState };
        });
        return;
      }
    }

    // Default: Invalid click, deselect
    setState(prev => ({ ...prev, movingPiece: null }));
  }, [turnPhase, movingPiece, pieces, castles, isLegalMove, isLegalAttack, isRecruitmentSpot, saveHistory, isRecruitmentSpot]);

  return {
    // State
    pieces,
    castles,
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

    // Actions
    handlePass,
    handleTakeback,
    handleFlipBoard,
    toggleCoordinates,
    incrementResizeVersion,
    handlePieceClick,
    handleHexClick
  };
};
