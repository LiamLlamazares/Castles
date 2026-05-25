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
import { loadPGNText, PGNLoadResult } from "../Classes/Services/PGNLoadService";

export type { PGNLoadResult } from "../Classes/Services/PGNLoadService";

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
  moveTree: MoveTree | undefined,
  sanctuarySettings?: { unlockTurn: number, cooldown: number }
): PGNHookResult => {
  
  const getPGN = useCallback(() => {
    // IMPORTANT: Use root node snapshot for starting pieces (not current pieces)
    const rootSnapshot = moveTree?.rootNode?.snapshot;
    const startPieces = rootSnapshot?.pieces ?? initialPieces;
    const startSanctuaries = rootSnapshot?.sanctuaries ?? initialSanctuaries;
    
    // Derive moveHistory line from the MoveTree
    const moveHistoryLine = moveTree ? moveTree.getHistoryLine() : [];
    
    // Convert to GameSettings format for PGN export
    const gameSettings = sanctuarySettings ? {
      sanctuaryUnlockTurn: sanctuarySettings.unlockTurn,
      sanctuaryRechargeTurns: sanctuarySettings.cooldown
    } : undefined;
    
    return PGNService.generatePGN(initialBoard, startPieces, moveHistoryLine, startSanctuaries, {}, moveTree, gameSettings);
  }, [initialBoard, initialPieces, initialSanctuaries, moveTree, sanctuarySettings]);

  const loadPGN = useCallback((pgn: string) => {
    return loadPGNText(pgn);
  }, []);

  return {
    getPGN,
    loadPGN
  };
};
