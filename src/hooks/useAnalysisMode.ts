/**
 * @file useAnalysisMode.ts
 * @description Hook for managing analysis/history navigation mode.
 *
 * Provides:
 * - History viewing state (viewNodeId)
 * - Navigation controls (jumpToNode, stepHistory)
 * - Analysis mode detection
 *
 * @usage Composed into useGameLogic for history replay functionality.
 */
import { useCallback } from "react";
import { HistoryEntry } from "../Constants";
import { MoveTree, MoveNode } from "../Classes/Core/MoveTree";

export interface AnalysisModeState {
  viewNodeId: string | null;  // Node ID for tree-based navigation (null = live)
  moveTree?: MoveTree;  // Reference to the move tree for navigation
}

export interface AnalysisModeActions {
  jumpToNode: (nodeId: string | null) => void;
  stepHistory: (direction: -1 | 1) => void;
}

export interface AnalysisModeResult extends AnalysisModeActions {
  isAnalysisMode: boolean;
  analysisState: HistoryEntry | null;
  isViewingHistory: boolean;
}

/**
 * Creates analysis mode controls bound to a setState function.
 * 
 * @param state - Current state containing moveTree and viewNodeId
 * @param setState - State setter function
 * @param isAnalysisModeExplicit - Explicit flag indicating if in analysis mode (blocks moves/dots)
 * @returns Analysis mode controls and computed values
 */
export const useAnalysisMode = <T extends AnalysisModeState>(
  state: T,
  setState: React.Dispatch<React.SetStateAction<T>>,
  isAnalysisModeExplicit: boolean = false
): AnalysisModeResult => {
  const { moveTree, viewNodeId } = state;
  
  // Find the current view node from the tree
  const viewNode = viewNodeId && moveTree ? moveTree.findNodeById(viewNodeId) : null;
  
  // Viewing history if we have a specific node selected (not live)
  const isViewingHistory = viewNodeId !== null;
  
  // Analysis mode is true when:
  // 1. Variant creation is disabled (Play Mode), AND
  // 2. Currently viewing history (viewNodeId !== null)
  const isAnalysisMode = isAnalysisModeExplicit && isViewingHistory;
  
  // Get the snapshot from the viewed node
  const analysisState = viewNode?.snapshot || null;

  /**
   * Jump to a specific node by ID (or null for live)
   */
  const jumpToNode = useCallback((nodeId: string | null) => {
    setState(prev => ({ ...prev, viewNodeId: nodeId }));
  }, [setState]);

  /**
   * Step through history using tree navigation
   * -1 = go to parent node (back)
   * +1 = go to selected child node (forward)
   */
  const stepHistory = useCallback((direction: -1 | 1) => {
    setState(prev => {
      const { moveTree: tree, viewNodeId: currentNodeId } = prev;
      if (!tree) return prev;
      
      // If currently live (null), stepping back goes to the parent of current tree head
      if (currentNodeId === null) {
        if (direction === -1) {
          // Go to parent of current tree position (one move back from last played)
          const currentNode = tree.current;
          // If at root, stay live (no moves to go back)
          if (currentNode === tree.rootNode) return prev;
          // If current has a parent (should always be true if not at root)
          if (currentNode.parent) {
            // Go to parent - but if parent is root, go to root
            return { ...prev, viewNodeId: currentNode.parent.id };
          }
          return prev;
        }
        // Can't step forward from live
        return prev;
      }
      
      // Find the current node
      const currentNode = tree.findNodeById(currentNodeId);
      if (!currentNode) return prev;
      
      if (direction === -1) {
        // Go to parent
        if (currentNode.parent) {
          // If parent is root, we're at start of game
          if (currentNode.parent === tree.rootNode) {
            return { ...prev, viewNodeId: tree.rootNode.id };
          }
          return { ...prev, viewNodeId: currentNode.parent.id };
        }
        // Already at root, stay there
        return prev;
      } else {
        // Go to selected child
        if (currentNode.children.length > 0) {
          const selectedChild = currentNode.children[currentNode.selectedChildIndex] || currentNode.children[0];
          return { ...prev, viewNodeId: selectedChild.id };
        }
        // No children - if we're at the tree's current position, go live
        if (currentNode === tree.current) {
          return { ...prev, viewNodeId: null };
        }
        // Otherwise stay where we are
        return prev;
      }
    });
  }, [setState]);

  return {
    isAnalysisMode,
    isViewingHistory,
    analysisState,
    jumpToNode,
    stepHistory
  };
};
