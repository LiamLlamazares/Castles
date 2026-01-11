/**
 * @file TestGameProvider.tsx
 * @description Test wrapper for GameProvider to support legacy hook tests.
 */
import React from 'react';
import { render, renderHook } from '@testing-library/react';
import { GameProvider } from '../../contexts/GameProvider';
import { useGameState, useGameActions } from '../../contexts/GameContext';
import { startingBoard, allPieces } from '../../ConstantImports';

// A shim that behaves like the old useGameLogic by combining the two new hooks
// This allows us to reuse most test logic with minimal changes
export const useGameLogicShim = () => {
  const state = useGameState();
  const actions = useGameActions();
  return { ...state, ...actions };
};

// Wrapper component for tests
export const TestGameWrapper = ({ children, props }: { children: React.ReactNode, props?: any }) => (
  <GameProvider
    initialBoard={startingBoard}
    initialPieces={allPieces}
    {...props}
  >
    {children}
  </GameProvider>
);

// Helper to render the shimmed hook within the provider
export const renderGameLogicHook = (initialProps: any = {}) => {
  return renderHook(() => useGameLogicShim(), {
    wrapper: ({ children }) => <TestGameWrapper props={initialProps}>{children}</TestGameWrapper>
  });
};
