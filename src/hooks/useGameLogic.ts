import { useState, useMemo, useCallback } from "react";
import { createPieceMap } from "../utils/PieceMap";
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
  initialPieces: Piece[] = allPieces
) => {
  // Create game engine instance (stable reference)
  const gameEngine = useMemo(() => new GameEngine(initialBoard), [initialBoard]);
  // =========== STATE ===========
  const [state, setState] = useState<GameBoardState>({
    history: [],
    pieces: initialPieces,
    pieceMap: createPieceMap(initialPieces),
    movingPiece: null,
    turnCounter: 0,
    castles: initialBoard.castles as Castle[],
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
    [gameEngine, turnCounter]
  );

  const currentPlayer = useMemo<Color>(
    () => gameEngine.getCurrentPlayer(turnCounter),
    [gameEngine, turnCounter]
  );

  const hexagons = useMemo(() => initialBoard.hexes, [initialBoard]);

  const legalMoves = useMemo(
    () => gameEngine.getLegalMoves(movingPiece, pieces, castles, turnCounter),
    [gameEngine, movingPiece, pieces, castles, turnCounter]
  );

  const legalAttacks = useMemo(
    () => gameEngine.getLegalAttacks(movingPiece, pieces, castles, turnCounter),
    [gameEngine, movingPiece, pieces, castles, turnCounter]
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
    return gameEngine.getRecruitmentHexes(pieces, castles, turnCounter);
  }, [gameEngine, pieces, castles, turnCounter]);

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
        const newState = gameEngine.applyAttack(prev, movingPiece!, pieceClicked.hex);
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
          const newState = gameEngine.applyMove(prev, movingPiece!, hex);
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

    setState(prev => ({ ...prev, movingPiece: null }));
  }, [gameEngine, turnPhase, movingPiece, pieces, castles, isLegalMove, isLegalAttack, isRecruitmentSpot, saveHistory]);

  const handleResign = useCallback((player: Color) => {
    // Determine winner based on who resigned
    // If current player resigns, other player wins.
    // Assuming resigner is always current player or passed explicitly.
    // For simplicity, let's assume the person passing the resign action is resigning.
    // If White resigns, Black wins.
    const winningColor = player === 'w' ? 'b' : 'w';
    // We can't easily update just 'winner' without a full state update that GameEngine recognizes,
    // OR we just override the logic. 
    // Ideally GameEngine has a 'resign' method, but we can hot-wire it here by modifying pieces/castles or just handling it in UI.
    // Better: Add a resign method to GameEngine or just handle it here locally if strictly UI.
    // Let's verify if GameEngine has resign. It doesn't seem to have been modified recently.
    // Plan: We will trigger a state update that sets a flag? Or just compute it.
    // Actually, simple approach: Cleave everything and set a "game over" state in hook?
    // But `winner` is computed from `pieces` / `castles`.
    // Let's rely on GameEngine having a way, or just assume we handle resignation by treating it as a UI overlay state?
    // User requested "Resign -> Victory Overlay". VictoryOverlay takes `winner`.
    // If we want `winner` to be computed, we need to kill the King? 
    // Yes, killing the monarch is the canon way to lose.
    // So `resign` = remove my Monarch.
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

  const hasGameStarted = turnCounter > 0;

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
    hasGameStarted,

    // Actions
    handlePass,
    handleTakeback,
    handleFlipBoard,
    toggleCoordinates,
    incrementResizeVersion,
    handlePieceClick,
    handleHexClick,
    handleResign
  };
};
