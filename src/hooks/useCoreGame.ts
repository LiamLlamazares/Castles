/**
 * @file useCoreGame.ts
 * @description Manages the foundational Game State and Engine instance.
 *
 * Responsibilities:
 * - Instantiates the GameEngine with the board
 * - Initializes the primary Game State (pieces, history, tree)
 * - Manages the 'Source of Truth' state for the application
 *
 * This hook is the "Model" layer.
 */
import { useState, useMemo } from "react";
import { GameEngine, GameState } from "../Classes/Core/GameEngine";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { MoveTree } from "../Classes/Core/MoveTree";
import { HistoryEntry, MoveRecord } from "../Constants";
import { createPieceMap } from "../utils/PieceMap";
import { startingBoard, allPieces } from "../ConstantImports";
import { SanctuaryGenerator } from "../Classes/Systems/SanctuaryGenerator";
import { AnalysisModeState } from "./useAnalysisMode";

// GameBoardState combines GameState and Analysis state
export interface GameBoardState extends Omit<GameState, 'moveHistory'>, Omit<AnalysisModeState, 'moveTree'> {
  moveHistory: MoveRecord[];
}

export const useCoreGame = (
  initialBoard: import("../Classes/Core/Board").Board = startingBoard,
  initialPieces: Piece[] = allPieces,
  initialHistory: HistoryEntry[] = [],
  initialMoveHistory: MoveRecord[] = [],
  initialTurnCounter: number = 0,
  initialSanctuaries?: Sanctuary[],
  initialMoveTree?: MoveTree
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
    
    // CRITICAL: Set root snapshot with starting pieces
    // This ensures PGN export uses correct initial pieces, not current pieces
    tree.rootNode.snapshot = {
      pieces: initialPieces.map(p => p.clone()),
      castles: initialBoard.castles.map(c => c.clone()),
      sanctuaries: startingSanctuaries.map(s => s.clone()),
      turnCounter: 0,
      moveNotation: []
    };
    
    if (initialMoveHistory && initialMoveHistory.length > 0) {
      tree.goToRoot();
      for (const move of initialMoveHistory) {
        tree.addMove(move);
      }
    }
    return tree;
  }, [initialMoveHistory, initialMoveTree, initialPieces, initialBoard, startingSanctuaries]);

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
    
    // History Navigation (node-based)
    moveHistory: initialMoveHistory,
    viewNodeId: null,  // Node ID for tree navigation (null = live)
    graveyard: [],
    phoenixRecords: []
  });

  return {
    state,
    setState,
    gameEngine,
    startingSanctuaries,
    startingMoveTree
  };
};
