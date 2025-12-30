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
  showShields: boolean;
  showCastleRecruitment: boolean;
}

export interface GameViewActions {
  toggleCoordinates: () => void;
  handleFlipBoard: () => void;
  incrementResizeVersion: () => void;
  toggleShields: () => void;
  toggleCastleRecruitment: () => void;
}

export const useGameView = (): GameViewState & GameViewActions => {
  const [state, setState] = useState<GameViewState>({
    showCoordinates: false,
    isBoardRotated: false,
    resizeVersion: 0,
    showShields: true,
    showCastleRecruitment: true,
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

  const toggleShields = useCallback(() => {
    setState(prev => ({ ...prev, showShields: !prev.showShields }));
  }, []);

  const toggleCastleRecruitment = useCallback(() => {
    setState(prev => ({ ...prev, showCastleRecruitment: !prev.showCastleRecruitment }));
  }, []);

  return {
    showCoordinates: state.showCoordinates,
    isBoardRotated: state.isBoardRotated,
    resizeVersion: state.resizeVersion,
    showShields: state.showShields,
    showCastleRecruitment: state.showCastleRecruitment,
    toggleCoordinates,
    handleFlipBoard,
    incrementResizeVersion,
    toggleShields,
    toggleCastleRecruitment
  };
};
