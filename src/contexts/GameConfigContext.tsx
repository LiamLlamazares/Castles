/**
 * @file GameConfigContext.tsx
 * @description React Context for game configuration.
 *
 * Eliminates prop drilling for game config (opponent, theme, etc.)
 * by providing direct access to configuration from any component.
 *
 * @usage
 * ```tsx
 * // In App.tsx - provide config
 * <GameConfigProvider config={config}>
 *   <Game />
 * </GameConfigProvider>
 *
 * // In Game.tsx - consume config
 * const { opponentConfig, pieceTheme } = useGameConfig();
 * ```
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { PieceTheme, SanctuaryType } from '../Constants';
import { AIOpponentConfig } from '../hooks/useAIOpponent';

/**
 * All game configuration that needs to be shared across components.
 */
export interface GameConfig {
  /** AI opponent configuration (if playing vs AI) */
  opponentConfig?: AIOpponentConfig;

  /** Piece visual theme */
  pieceTheme: PieceTheme;

  /** Sanctuary types that start on the board */
  startingSanctuaries?: SanctuaryType[];

  /** Pool of sanctuary types available for upgrades */
  sanctuaryPool?: SanctuaryType[];

  /** Time control settings */
  timeControl?: { initial: number; increment: number };

  /** Sanctuary pledge settings */
  sanctuarySettings?: { unlockTurn: number; cooldown: number };

  /** Optional game rules */
  gameRules?: { vpModeEnabled: boolean };

  /** Whether in analysis mode */
  isAnalysisMode?: boolean;
}

/** Default config values */
const defaultConfig: GameConfig = {
  pieceTheme: 'Castles',
};

/** The context itself */
const GameConfigContext = createContext<GameConfig>(defaultConfig);

/** Provider props */
interface GameConfigProviderProps {
  config: Partial<GameConfig>;
  children: ReactNode;
}

/**
 * Provider component that wraps the game tree.
 */
export const GameConfigProvider: React.FC<GameConfigProviderProps> = ({
  config,
  children,
}) => {
  // Merge with defaults
  const mergedConfig: GameConfig = {
    ...defaultConfig,
    ...config,
  };

  return (
    <GameConfigContext.Provider value={mergedConfig}>
      {children}
    </GameConfigContext.Provider>
  );
};

/**
 * Hook to access game configuration from any component.
 */
export const useGameConfig = (): GameConfig => {
  return useContext(GameConfigContext);
};

export default GameConfigContext;
