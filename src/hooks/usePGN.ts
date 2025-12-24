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
    moveTree: MoveTree;
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
    console.log('=== [getPGN] EXPORT DEBUG START ===');
    console.log('[getPGN] moveTree exists:', !!moveTree);
    console.log('[getPGN] moveTree.rootNode exists:', !!moveTree?.rootNode);
    console.log('[getPGN] moveTree.rootNode.snapshot exists:', !!moveTree?.rootNode?.snapshot);
    
    // IMPORTANT: Use root node snapshot for starting pieces (not current pieces)
    // This ensures the exported setup matches the move list
    const rootSnapshot = moveTree?.rootNode?.snapshot;
    const startPieces = rootSnapshot?.pieces ?? initialPieces;
    const startSanctuaries = rootSnapshot?.sanctuaries ?? initialSanctuaries;
    
    console.log('[getPGN] Using rootSnapshot pieces:', !!rootSnapshot?.pieces);
    console.log('[getPGN] startPieces count:', startPieces.length);
    console.log('[getPGN] Sample pieces being exported:');
    startPieces.slice(0, 5).forEach(p => {
      console.log(`  ${p.type}@(${p.hex.q},${p.hex.r},${p.hex.s}) color=${p.color}`);
    });
    
    // Also log the initialPieces for comparison
    console.log('[getPGN] initialPieces (passed to hook) count:', initialPieces.length);
    console.log('[getPGN] Sample initialPieces:');
    initialPieces.slice(0, 5).forEach(p => {
      console.log(`  ${p.type}@(${p.hex.q},${p.hex.r},${p.hex.s}) color=${p.color}`);
    });
    
    const pgn = PGNService.generatePGN(initialBoard, startPieces, moveHistory, startSanctuaries, {}, moveTree);
    console.log('[getPGN] Generated PGN length:', pgn.length);
    console.log('=== [getPGN] EXPORT DEBUG END ===');
    
    return pgn;
  }, [initialBoard, initialPieces, moveHistory, initialSanctuaries, moveTree]);

  const loadPGN = useCallback((pgn: string) => {
    console.log('=== [loadPGN] FULL DEBUG START ===');
    console.log('[loadPGN] Raw PGN:\n', pgn);
    
    const { setup, moveTree, moves } = PGNService.parsePGN(pgn);
    
    console.log('[loadPGN] Parsed setup:', setup);
    console.log('[loadPGN] Parsed moves (linear):', moves);
    console.log('[loadPGN] MoveTree structure:');
    if (moveTree) {
      const logTree = (node: any, depth: number = 0) => {
        const indent = '  '.repeat(depth);
        console.log(`${indent}Node: ${node.move?.notation || 'ROOT'} (id: ${node.id})`);
        for (const child of node.children) {
          logTree(child, depth + 1);
        }
      };
      logTree(moveTree.rootNode);
    }
    
    if (!setup) {
      console.error("[loadPGN] Failed to parse PGN setup");
      return null;
    }
    
    console.log('[loadPGN] Setup pieces from PGN:');
    setup.pieces.forEach((p: any) => {
      console.log(`  ${p.type}@(${p.q},${p.r},${p.s}) color=${p.color}`);
    });
    
    const { board, pieces: startPieces, sanctuaries: startSanctuaries } = PGNService.reconstructState(setup);
    
    console.log('[loadPGN] Reconstructed pieces:');
    startPieces.forEach(p => {
      console.log(`  ${p.type}@(${p.hex.q},${p.hex.r},${p.hex.s}) color=${p.color}`);
    });
    
    console.log('[loadPGN] About to replay with moveTree...');
    
    try {
      const finalState = PGNService.replayMoveHistory(board, startPieces, moveTree, startSanctuaries);
      
      return { 
        board, 
        pieces: finalState.pieces,
        castles: finalState.castles,
        sanctuaries: finalState.sanctuaries,
        history: finalState.history,
        moveHistory: finalState.moveHistory,
        moveTree: finalState.moveTree!,
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
