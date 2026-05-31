/**
 * @file TestGameProvider.tsx
 * @description Test wrapper for GameProvider to support hook tests.
 */
import React from 'react';
import { renderHook } from '@testing-library/react';
import { GameProvider } from '../../contexts/GameProvider';
import { useGameState, useGameActions } from '../../contexts/GameContext';
import { startingBoard, allPieces } from '../../ConstantImports';
import { Board } from '../../Classes/Core/Board';
import { Piece } from '../../Classes/Entities/Piece';
import { Sanctuary } from '../../Classes/Entities/Sanctuary';
import { MoveTree } from '../../Classes/Core/MoveTree';
import { SanctuaryType } from '../../Constants';
import type { OnlineClientSession } from '../../online/types';

// A shim that behaves like the old useGameLogic by combining the two new hooks
// This allows us to reuse most test logic with minimal changes
export const useGameLogicShim = () => {
  const state = useGameState();
  const actions = useGameActions();
  return { ...state, ...actions };
};

// Test props interface for convenience
export interface TestGameProps {
  isAnalysisMode?: boolean;
  isTutorialMode?: boolean;
  // Add more as needed for tests
}

export interface CustomTestGameProps extends TestGameProps {
  board?: Board;
  pieces?: Piece[];
  sanctuaries?: Sanctuary[];
  moveTree?: MoveTree;
  turnCounter?: number;
  poolTypes?: SanctuaryType[];
  sanctuaryPool?: SanctuaryType[];
  sanctuarySettings?: { unlockTurn: number; cooldown: number };
  onlineSession?: OnlineClientSession;
}

// Wrapper component for tests
export const TestGameWrapper = ({ children, props }: { children: React.ReactNode, props?: TestGameProps }) => (
  <GameProvider
    config={{
      board: startingBoard,
      pieces: allPieces,
    }}
    mode={{
      isAnalysisMode: props?.isAnalysisMode,
      isTutorialMode: props?.isTutorialMode,
    }}
  >
    {children}
  </GameProvider>
);

// Helper to render the shimmed hook within the provider
export const renderGameLogicHook = (initialProps: TestGameProps = {}) => {
  return renderHook(() => useGameLogicShim(), {
    wrapper: ({ children }) => <TestGameWrapper props={initialProps}>{children}</TestGameWrapper>
  });
};

export const renderCustomGameLogicHook = (props: CustomTestGameProps = {}) => {
  return renderHook(() => useGameLogicShim(), {
    wrapper: ({ children }) => (
      <GameProvider
        config={{
          board: props.board ?? startingBoard,
          pieces: props.pieces ?? allPieces,
          sanctuaries: props.sanctuaries,
          moveTree: props.moveTree,
          turnCounter: props.turnCounter,
          poolTypes: props.poolTypes ?? props.sanctuaryPool,
        }}
        rules={{
          sanctuarySettings: props.sanctuarySettings,
        }}
        mode={{
          isAnalysisMode: props.isAnalysisMode,
          isTutorialMode: props.isTutorialMode,
          onlineSession: props.onlineSession,
        }}
      >
        {children}
      </GameProvider>
    ),
  });
};
