/**
 * @file usePGN.ts
 * @description Hook for PGN import/export functionality.
 *
 * Provides:
 * - getPGN: Generate PGN string from current game
 * - loadPGN: Parse and replay a PGN string
 *
 * @usage Composed into useGameLogic for game persistence.
 */
import { useCallback } from "react";
import { PGNService } from "../Classes/Services/PGNService";
import { Board } from "../Classes/Core/Board";
import { Piece } from "../Classes/Entities/Piece";
import { MoveRecord } from "../Constants";

export interface PGNHookResult {
  getPGN: () => string;
  loadPGN: (pgn: string) => {
    board: Board;
    pieces: Piece[];
    history: any[];
    moveHistory: MoveRecord[];
    turnCounter: number;
  } | null;
}

/**
 * Creates PGN controls.
 */
export const usePGN = (
  initialBoard: Board,
  initialPieces: Piece[],
  moveHistory: MoveRecord[]
): PGNHookResult => {
  
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

  return {
    getPGN,
    loadPGN
  };
};
