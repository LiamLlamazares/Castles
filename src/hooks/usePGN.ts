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

export interface PGNLoadResult {
  board: Board;
  pieces: Piece[];
  history: any[];
  moveHistory: MoveRecord[];
  moveTree: MoveTree;
  turnCounter: number;
  sanctuaries: Sanctuary[];
  castles: import("../Classes/Entities/Castle").Castle[];
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
}

export interface PGNHookResult {
  getPGN: () => string;
  loadPGN: (pgn: string) => PGNLoadResult | null;
}

/**
 * Creates PGN controls.
 */
export const usePGN = (
  initialBoard: Board,
  initialPieces: Piece[],
  initialSanctuaries: Sanctuary[],
  moveHistory: MoveRecord[],
  moveTree: MoveTree | undefined,
  sanctuarySettings?: { unlockTurn: number, cooldown: number }
): PGNHookResult => {
  
  const getPGN = useCallback(() => {
    // DEBUG: Uncomment these logs if PGN export issues occur
    // console.log('[getPGN] rootSnapshot exists:', !!moveTree?.rootNode?.snapshot);
    
    // IMPORTANT: Use root node snapshot for starting pieces (not current pieces)
    // This ensures the exported setup matches the move list
    const rootSnapshot = moveTree?.rootNode?.snapshot;
    const startPieces = rootSnapshot?.pieces ?? initialPieces;
    const startSanctuaries = rootSnapshot?.sanctuaries ?? initialSanctuaries;
    
    // Convert to GameSettings format for PGN export
    const gameSettings = sanctuarySettings ? {
      sanctuaryUnlockTurn: sanctuarySettings.unlockTurn,
      sanctuaryRechargeTurns: sanctuarySettings.cooldown
    } : undefined;
    
    return PGNService.generatePGN(initialBoard, startPieces, moveHistory, startSanctuaries, {}, moveTree, gameSettings);
  }, [initialBoard, initialPieces, moveHistory, initialSanctuaries, moveTree, sanctuarySettings]);

  const loadPGN = useCallback((pgn: string) => {
    // DEBUG: Uncomment these logs if PGN import issues occur
    // console.log('[loadPGN] Raw PGN:', pgn.substring(0, 200) + '...');
    
    const { setup, moveTree } = PGNService.parsePGN(pgn);
    
    if (!setup) {
      console.error("[loadPGN] Failed to parse PGN setup");
      return null;
    }
    
    const { board, pieces: startPieces, sanctuaries: startSanctuaries } = PGNService.reconstructState(setup);
    
    // Extract gameSettings from setup
    const importedSettings = setup.gameSettings ? {
      unlockTurn: setup.gameSettings.sanctuaryUnlockTurn,
      cooldown: setup.gameSettings.sanctuaryRechargeTurns
    } : undefined;
    
    try {
      const finalState = PGNService.replayMoveHistory(board, startPieces, moveTree, startSanctuaries, setup.gameSettings);
      
      return { 
        board, 
        pieces: finalState.pieces,
        castles: finalState.castles,
        sanctuaries: finalState.sanctuaries,
        history: finalState.history,
        moveHistory: finalState.moveHistory,
        moveTree: finalState.moveTree!,
        turnCounter: finalState.turnCounter,
        sanctuarySettings: importedSettings
      };
    } catch (e) {
      console.error("Failed to replay moves:", e);
      alert("Error replaying moves. Game loaded at start position.");
      return {
        board,
        pieces: startPieces,
        castles: board.castles,
        sanctuaries: startSanctuaries,
        history: [],
        moveHistory: [],
        moveTree: new MoveTree(),
        turnCounter: 0
      };
    }
  }, []);

  return {
    getPGN,
    loadPGN
  };
};
