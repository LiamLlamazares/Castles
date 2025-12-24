/**
 * @file useAnalysisMode.ts
 * @description Hook for managing analysis/history navigation mode.
 *
 * ## Purpose
 * Provides controls for navigating through move history using the MoveTree.
 * Uses MoveTree's new consolidated methods for state retrieval.
 *
 * ## Key Concepts
 * - `viewNodeId = null` → Live position (current game state)
 * - `viewNodeId = "abc123"` → Viewing a historical position
 * - `isViewingHistory` → Derived from `viewNodeId !== null`
 *
 * @see MoveTree.getViewState - Gets snapshot for any node
 * @see MoveTree.getViewNode - Gets node by ID
 */
import { useCallback } from "react";
import { HistoryEntry } from "../Constants";
import { MoveTree } from "../Classes/Core/MoveTree";

export interface AnalysisModeState {
  viewNodeId: string | null;  // Node ID for tree navigation (null = live)
  moveTree?: MoveTree;
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
 * @param isAnalysisMode - Explicit flag indicating if in analysis mode
 * @returns Analysis mode controls and computed values
 */
export const useAnalysisMode = <T extends AnalysisModeState>(
  state: T,
  setState: React.Dispatch<React.SetStateAction<T>>,
  isAnalysisMode: boolean = false
): AnalysisModeResult => {
  const { moveTree, viewNodeId } = state;
  
  // Use MoveTree's consolidated method for view state
  const analysisState = moveTree?.getViewState(viewNodeId) || null;
  
  // Simple derivation - viewing history if viewNodeId is set
  const isViewingHistory = viewNodeId !== null;

  /**
   * Jump to a specific node by ID (or null for live)
   */
  const jumpToNode = useCallback((nodeId: string | null) => {
    setState(prev => ({ ...prev, viewNodeId: nodeId }));
  }, [setState]);

  /**
   * Step through history using tree navigation
   * -1 = go to parent node (back in time)
   * +1 = go to selected child node (forward in time)
   */
  const stepHistory = useCallback((direction: -1 | 1) => {
    setState(prev => {
      const { moveTree: tree, viewNodeId: currentNodeId } = prev;
      if (!tree) {
        console.log('[stepHistory] No tree!');
        return prev;
      }
      
      // Get the current view node using MoveTree's method
      const currentNode = tree.getViewNode(currentNodeId);
      if (!currentNode) {
        console.log('[stepHistory] No currentNode found for ID:', currentNodeId);
        return prev;
      }

      console.log('[stepHistory] direction:', direction);
      console.log('[stepHistory] currentNodeId:', currentNodeId);
      console.log('[stepHistory] currentNode.id:', currentNode.id);
      console.log('[stepHistory] currentNode.move.notation:', currentNode.move?.notation);
      console.log('[stepHistory] currentNode.parent:', currentNode.parent?.id, currentNode.parent?.move?.notation);
      console.log('[stepHistory] currentNode.children.length:', currentNode.children.length);
      console.log('[stepHistory] tree.rootNode.id:', tree.rootNode.id);
      console.log('[stepHistory] tree.current.id:', tree.current.id);
      
      if (direction === -1) {
        // Stepping backwards
        if (currentNodeId === null) {
          // Currently live - go to parent of current position
          if (currentNode.parent && currentNode.parent !== tree.rootNode) {
            console.log('[stepHistory] Going back from live to:', currentNode.parent.id);
            return { ...prev, viewNodeId: currentNode.parent.id };
          } else if (currentNode !== tree.rootNode && currentNode.parent) {
            // At first move, go to root
            console.log('[stepHistory] Going back to root:', tree.rootNode.id);
            return { ...prev, viewNodeId: tree.rootNode.id };
          }
          console.log('[stepHistory] Cannot go back - at root or no parent');
          return prev;
        }
        
        // Viewing history - go to parent
        if (currentNode.parent) {
          console.log('[stepHistory] Going back in history to:', currentNode.parent.id);
          return { ...prev, viewNodeId: currentNode.parent.id };
        }
        console.log('[stepHistory] Cannot go back - no parent');
        return prev;
        
      } else {
        // Stepping forward (+1)
        if (currentNode.children.length > 0) {
          const selectedChild = currentNode.children[currentNode.selectedChildIndex] || currentNode.children[0];
          console.log('[stepHistory] Going forward to:', selectedChild.id);
          return { ...prev, viewNodeId: selectedChild.id };
        }
        
        // No children - if at current tree position, go live
        if (currentNode === tree.current) {
          console.log('[stepHistory] At end, going live (null)');
          return { ...prev, viewNodeId: null };
        }
        console.log('[stepHistory] Cannot go forward - no children');
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
