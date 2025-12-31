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
  showTerrainIcons: boolean;
  showSanctuaryIcons: boolean;
}

export interface GameViewActions {
  toggleCoordinates: () => void;
  handleFlipBoard: () => void;
  incrementResizeVersion: () => void;
  toggleShields: () => void;
  toggleCastleRecruitment: () => void;
  toggleTerrainIcons: () => void;
  toggleSanctuaryIcons: () => void;
  setAllIcons: (visible: boolean) => void;
}

export const useGameView = (): GameViewState & GameViewActions => {
  const [state, setState] = useState<GameViewState>({
    showCoordinates: false,
    isBoardRotated: false,
    resizeVersion: 0,
    showShields: true,
    showCastleRecruitment: true,
    showTerrainIcons: true,
    showSanctuaryIcons: true,
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

  const toggleTerrainIcons = useCallback(() => {
    setState(prev => ({ ...prev, showTerrainIcons: !prev.showTerrainIcons }));
  }, []);

  const toggleSanctuaryIcons = useCallback(() => {
    setState(prev => ({ ...prev, showSanctuaryIcons: !prev.showSanctuaryIcons }));
  }, []);

  const setAllIcons = useCallback((visible: boolean) => {
    setState(prev => ({
      ...prev,
      showShields: visible,
      showCastleRecruitment: visible,
      showTerrainIcons: visible,
      showSanctuaryIcons: visible
    }));
  }, []);

  return {
    showCoordinates: state.showCoordinates,
    isBoardRotated: state.isBoardRotated,
    resizeVersion: state.resizeVersion,
    showShields: state.showShields,
    showCastleRecruitment: state.showCastleRecruitment,
    showTerrainIcons: state.showTerrainIcons,
    showSanctuaryIcons: state.showSanctuaryIcons,
    toggleCoordinates,
    handleFlipBoard,
    incrementResizeVersion,
    toggleShields,
    toggleCastleRecruitment,
    toggleTerrainIcons,
    toggleSanctuaryIcons,
    setAllIcons

  };
};
