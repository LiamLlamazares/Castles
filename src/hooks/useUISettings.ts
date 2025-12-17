/**
 * @file useUISettings.ts
 * @description Hook for managing UI-only settings.
 *
 * Provides:
 * - Board display toggles (coordinates, rotation)
 * - Resize version tracking for layout recalculation
 *
 * @usage Composed into useGameLogic for UI control.
 */
import { useCallback } from "react";

export interface UISettingsState {
  showCoordinates: boolean;
  isBoardRotated: boolean;
  resizeVersion: number;
}

export interface UISettingsActions {
  toggleCoordinates: () => void;
  handleFlipBoard: () => void;
  incrementResizeVersion: () => void;
}

/**
 * Creates UI settings controls bound to a setState function.
 */
export const useUISettings = <T extends UISettingsState>(
  state: T,
  setState: React.Dispatch<React.SetStateAction<T>>
): UISettingsState & UISettingsActions => {
  
  const toggleCoordinates = useCallback(() => {
    setState(prev => ({ ...prev, showCoordinates: !prev.showCoordinates }));
  }, [setState]);

  const handleFlipBoard = useCallback(() => {
    setState(prev => ({ ...prev, isBoardRotated: !prev.isBoardRotated }));
  }, [setState]);

  const incrementResizeVersion = useCallback(() => {
    setState(prev => ({ ...prev, resizeVersion: prev.resizeVersion + 1 }));
  }, [setState]);

  return {
    showCoordinates: state.showCoordinates,
    isBoardRotated: state.isBoardRotated,
    resizeVersion: state.resizeVersion,
    toggleCoordinates,
    handleFlipBoard,
    incrementResizeVersion
  };
};
