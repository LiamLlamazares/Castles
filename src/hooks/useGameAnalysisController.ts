/**
 * @file useGameAnalysisController.ts
 * @description Manages the view state projection (Live vs History) and analysis controls.
 */
import { useMemo, useCallback } from "react";
import { GameState } from "../Classes/Core/GameState";
import { GameBoardState } from "./useCoreGame";
import { createPieceMap } from "../utils/PieceMap";
import { Castle } from "../Classes/Entities/Castle";
import { Piece } from "../Classes/Entities/Piece";
import { Sanctuary } from "../Classes/Entities/Sanctuary";

interface UseGameAnalysisControllerProps {
  state: GameBoardState;
  setState: React.Dispatch<React.SetStateAction<GameBoardState>>;
  initialPieces: Piece[];
  initialBoard: import("../Classes/Core/Board").Board;
  startingSanctuaries: Sanctuary[];
  initialTurnCounter: number;
  isViewingHistory: boolean;
  analysisState: any; // Using any for now to match useAnalysisMode return type signature, should be typed properly
}

export const useGameAnalysisController = ({
  state,
  setState,
  initialPieces,
  initialBoard,
  startingSanctuaries,
  initialTurnCounter,
  isViewingHistory,
  analysisState
}: UseGameAnalysisControllerProps) => {

  /**
   * Returns the "effective" game state for actions.
   * When viewing history, this uses the node's snapshot.
   * When live, returns the current state as-is.
   */
  const getEffectiveState = useCallback((): GameState => {
    if (isViewingHistory && analysisState) {
      return {
        ...(state as unknown as GameState),
        pieces: analysisState.pieces.map((p: Piece) => p.clone()),
        pieceMap: createPieceMap(analysisState.pieces.map((p: Piece) => p.clone())),
        castles: analysisState.castles.map((c: Castle) => c.clone()) as Castle[],
        sanctuaries: analysisState.sanctuaries.map((s: Sanctuary) => s.clone()),
        turnCounter: analysisState.turnCounter,
        movingPiece: null,
        moveHistory: analysisState.moveNotation,
        moveTree: state.moveTree
      } as unknown as GameState;
    }
    // If viewing history but at root node (no snapshot), return initial state
    if (isViewingHistory && !analysisState) {
      return {
        pieces: initialPieces.map(p => p.clone()),
        pieceMap: createPieceMap(initialPieces.map(p => p.clone())),
        castles: initialBoard.castles.map(c => c.clone()) as Castle[],
        sanctuaries: startingSanctuaries.map(s => s.clone()),
        sanctuaryPool: state.sanctuaryPool,
        turnCounter: initialTurnCounter,
        movingPiece: null,
        history: [],
        moveHistory: [],
        moveTree: state.moveTree,
        graveyard: [],
        phoenixRecords: []
      } as unknown as GameState;
    }
    return state as unknown as GameState;
  }, [isViewingHistory, analysisState, state, initialPieces, initialBoard, startingSanctuaries, initialTurnCounter]);

  // Constructed View State (GameState compatible)
  const viewState = useMemo<GameState>(() => {
      if (isViewingHistory && analysisState) {
          return {
              pieces: analysisState.pieces,
              pieceMap: createPieceMap(analysisState.pieces),
              castles: analysisState.castles,
              sanctuaries: analysisState.sanctuaries || state.sanctuaries,
              sanctuaryPool: state.sanctuaryPool,
              turnCounter: analysisState.turnCounter,
              movingPiece: null,
              history: [],
              moveHistory: analysisState.moveNotation,
              moveTree: state.moveTree,
              graveyard: [],
              phoenixRecords: []
          };
      }
      // At root node (start of game)
      if (isViewingHistory && !analysisState) {
          return {
              pieces: initialPieces,
              pieceMap: createPieceMap(initialPieces),
              castles: initialBoard.castles as Castle[],
              sanctuaries: startingSanctuaries,
              sanctuaryPool: state.sanctuaryPool,
              turnCounter: initialTurnCounter,
              movingPiece: null,
              history: [],
              moveHistory: [],
              moveTree: state.moveTree,
              graveyard: [],
              phoenixRecords: []
          };
      }
      return state as unknown as GameState;
  }, [state, isViewingHistory, analysisState, initialPieces, initialBoard, startingSanctuaries, initialTurnCounter]);

  /**
   * Jumps to a specific node in the move tree, potentially switching variations.
   * Now simplified - just sets viewNodeId and updates tree cursor.
   */
  const jumpToNode = useCallback((nodeId: string | null) => {
      // If null, we might be exiting analysis or jumping to root? 
      // Current implementation in GameProvider implies null is valid.
      // If null is passed and we want to exit view or go to root:
      if (!nodeId) {
           setState(prev => ({
              ...prev,
              viewNodeId: null, // Exit view mode or go to live
              movingPiece: null
          }));
          return;
      }

      // Must clone first to treat state as immutable
      const newTree = state.moveTree!.clone();
      
      // Find the node in the NEW tree (ensure we don't mix references)
      const targetNode = newTree.findNodeById(nodeId);
      
      if (!targetNode) return;

      // Update tree cursor and set view to this node
      newTree.setCurrentNode(targetNode);
      
      setState(prev => ({
          ...prev,
          viewNodeId: nodeId,
          movingPiece: null,
          moveTree: newTree
      }));
  }, [state.moveTree, setState]);

  return {
    getEffectiveState,
    viewState,
    jumpToNode
  };
};
