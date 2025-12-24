/**
 * @file useGameView.ts
 * @description Hook for managing UI-only settings independently of Game Logic.
 *
 * Provides:
 * - Board display toggles (coordinates, rotation)
 * - Resize version tracking for layout recalculation
 *
 * @usage Called directly by Game.tsx to manage view state.
 */
import { useState, useCallback } from "react";

export interface GameViewState {
  showCoordinates: boolean;
  isBoardRotated: boolean;
  resizeVersion: number;
}

export interface GameViewActions {
  toggleCoordinates: () => void;
  handleFlipBoard: () => void;
  incrementResizeVersion: () => void;
}

export const useGameView = (): GameViewState & GameViewActions => {
  const [state, setState] = useState<GameViewState>({
    showCoordinates: false,
    isBoardRotated: false,
    resizeVersion: 0,
  });

  const toggleCoordinates = useCallback(() => {
    setState(prev => ({ ...prev, showCoordinates: !prev.showCoordinates }));
  }, []);

  const handleFlipBoard = useCallback(() => {
    setState(prev => ({ ...prev, isBoardRotated: !prev.isBoardRotated }));
  }, []);

  const incrementResizeVersion = useCallback(() => {
    setState(prev => ({ ...prev, resizeVersion: prev.resizeVersion + 1 }));
  }, []);

  return {
    showCoordinates: state.showCoordinates,
    isBoardRotated: state.isBoardRotated,
    resizeVersion: state.resizeVersion,
    toggleCoordinates,
    handleFlipBoard,
    incrementResizeVersion
  };
};
