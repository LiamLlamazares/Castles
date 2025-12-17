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
import { MoveTree } from "../Classes/Core/MoveTree";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { MoveRecord } from "../Constants";

export interface PGNHookResult {
  getPGN: () => string;
  loadPGN: (pgn: string) => {
    board: Board;
    pieces: Piece[];
    history: any[];
    moveHistory: MoveRecord[];
    turnCounter: number;
    sanctuaries: import("../Classes/Entities/Sanctuary").Sanctuary[];
    castles: import("../Classes/Entities/Castle").Castle[];
  } | null;
}

/**
 * Creates PGN controls.
 */
export const usePGN = (
  initialBoard: Board,
  initialPieces: Piece[],
  initialSanctuaries: Sanctuary[],
  moveHistory: MoveRecord[],
  moveTree: MoveTree | undefined
): PGNHookResult => {
  
  const getPGN = useCallback(() => {
    return PGNService.generatePGN(initialBoard, initialPieces, moveHistory, initialSanctuaries, {}, moveTree);
  }, [initialBoard, initialPieces, moveHistory, initialSanctuaries, moveTree]);

  const loadPGN = useCallback((pgn: string) => {
    const { setup, moves } = PGNService.parsePGN(pgn);
    if (!setup) {
      console.error("Failed to parse PGN setup");
      return null;
    }
    const { board, pieces: startPieces, sanctuaries: startSanctuaries } = PGNService.reconstructState(setup);
    
    try {
      const finalState = PGNService.replayMoveHistory(board, startPieces, moves, startSanctuaries);
      
      return { 
        board, 
        pieces: finalState.pieces,
        castles: finalState.castles,
        sanctuaries: finalState.sanctuaries,
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
        castles: board.castles, // Add castles return even on error
        sanctuaries: startSanctuaries, // Add sanctuaries return
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
