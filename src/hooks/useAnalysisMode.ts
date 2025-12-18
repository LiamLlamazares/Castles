/**
 * @file useAnalysisMode.ts
 * @description Hook for managing analysis/history navigation mode.
 *
 * Provides:
 * - History viewing state (viewMoveIndex)
 * - Navigation controls (jumpToMove, stepHistory)
 * - Analysis mode detection
 *
 * @usage Composed into useGameLogic for history replay functionality.
 */
import { useCallback } from "react";
import { HistoryEntry } from "../Constants";

export interface AnalysisModeState {
  viewMoveIndex: number | null;
  history: HistoryEntry[];
}

export interface AnalysisModeActions {
  jumpToMove: (moveIndex: number | null) => void;
  stepHistory: (direction: -1 | 1) => void;
}

export interface AnalysisModeResult extends AnalysisModeActions {
  isAnalysisMode: boolean;
  analysisState: HistoryEntry | null;
}

/**
 * Creates analysis mode controls bound to a setState function.
 * 
 * @param state - Current state containing history and viewMoveIndex
 * @param setState - State setter function
 * @returns Analysis mode controls and computed values
 */
export const useAnalysisMode = <T extends AnalysisModeState>(
  state: T,
  setState: React.Dispatch<React.SetStateAction<T>>
): AnalysisModeResult => {
  // In analysis mode iff viewMoveIndex is not null
  const isAnalysisMode = state.viewMoveIndex !== null;
  const analysisState = isAnalysisMode ? state.history[state.viewMoveIndex!] : null;

  const jumpToMove = useCallback((moveIndex: number | null) => {
    setState(prev => {
      if (moveIndex === null) return { ...prev, viewMoveIndex: null };
      if (moveIndex < -1) return { ...prev, viewMoveIndex: -1 };
      if (moveIndex >= prev.history.length) return { ...prev, viewMoveIndex: prev.history.length - 1 };
      return { ...prev, viewMoveIndex: moveIndex };
    });
  }, [setState]);

  // Defines function used on left/ right arrow that returns state with updated viewMoveIndex
  const stepHistory = useCallback((direction: -1 | 1) => {
    setState(prev => {
      // If at last move (viewMoveIndex is null), "left" reduces viewMove index by 1
      if (prev.viewMoveIndex === null) {
        if (direction === -1 && prev.history.length > 0) {
             const newIndex = prev.history.length - 1;
             return { ...prev, viewMoveIndex: newIndex };
        }
        return prev;
      }

      // Otherwise, viewMoveIndex is updated by +1 or -1
      const newIndex = prev.viewMoveIndex + direction;
      // If stepping past last move, go back to live
      if (newIndex >= prev.history.length) {
        return { ...prev, viewMoveIndex: null };
      }
      // If stepping back from first move, stay at first move
      if (newIndex < 0) {
        return { ...prev, viewMoveIndex: 0 };
      }
      // Otherwise, return state with updated viewMoveIndex
      return { ...prev, viewMoveIndex: newIndex };
    });
  }, [setState]);

  return {
    isAnalysisMode,
    analysisState,
    jumpToMove,
    stepHistory
  };
};
