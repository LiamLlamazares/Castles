/**
 * @file GameContext.tsx
 * @description Context definitions for the Game State and Actions.
 *
 * Splitting State and Actions allows for better performance (components that only need actions won't re-render on state changes)
 * and cleaner separation of concerns.
 */
import React, { createContext, useContext } from "react";
import { Piece } from "../Classes/Entities/Piece";
import { Castle } from "../Classes/Entities/Castle";
import { Sanctuary } from "../Classes/Entities/Sanctuary";
import { Hex } from "../Classes/Entities/Hex";
import { Board } from "../Classes/Core/Board";
import { MoveTree } from "../Classes/Core/MoveTree";
import { MoveRecord, TurnPhase, Color, SanctuaryType } from "../Constants";
import { PieceMap } from "../utils/PieceMap";
import { GameEngine } from "../Classes/Core/GameEngine";
import { GameState, HistoryEntry } from "../Classes/Core/GameState";

export interface IGameState extends Omit<GameState, 'moveTree'> {
  // Computed State
  turnPhase: TurnPhase;
  currentPlayer: Color;
  hexagons: Hex[];
  legalMoveSet: Set<string>;
  legalAttackSet: Set<string>;
  victoryMessage: string | null;
  winner: Color | null;
  isRecruitmentSpot: (hex: Hex) => boolean;
  board: Board;
  moveTree: MoveTree | undefined; // Override to allow undefined explicitly
  moveHistory: MoveRecord[]; // Derived list for UI display
  history: HistoryEntry[]; // Legacy snapshots array
  hasGameStarted: boolean;

  // Analysis State
  isAnalysisMode: boolean;
  isViewingHistory: boolean;
  // viewNodeId is inherited from GameState
  
  // AI Integration (Optional to expose here, but useful for components that might need it)
  aiIntegration?: {
    gameEngine: GameEngine;
    board: Board;
    getState: () => GameState;
    applyAIState: (newState: GameState) => void;
    isViewingHistory: boolean;
  };
}

export interface IGameActions {
  // Game Actions
  handlePass: () => void;
  handleTakeback: () => void;
  handlePieceClick: (piece: Piece) => void;
  handleHexClick: (hex: Hex) => void;
  handleResign: (forColor?: Color) => void; // Made optional to match common usage, though implementation usually needs it
  pledge: (sanctuaryHex: Hex, spawnHex: Hex) => void;
  
  // Queries/Helpers
  canPledge: (sanctuaryHex: Hex) => boolean;
  triggerAbility: (source: Piece, targetHex: Hex, ability: import("../Constants").AbilityType) => void;
  isHexDefended: (hex: Hex, attackerColor: Color) => boolean;
  
  // Analysis & PGN
  jumpToNode: (nodeId: string | null) => void;
  stepHistory: (direction: -1 | 1) => void;
  getPGN: () => string;
  loadPGN: (pgn: string) => import("../hooks/usePGN").PGNLoadResult | null;
}

// Create Contexts
export const GameStateContext = createContext<IGameState | null>(null);
export const GameDispatchContext = createContext<IGameActions | null>(null);

// Custom Hooks for safe consumption
export const useGameState = () => {
  const context = useContext(GameStateContext);
  if (!context) {
    throw new Error("useGameState must be used within a GameProvider");
  }
  return context;
};

export const useGameActions = () => {
  const context = useContext(GameDispatchContext);
  if (!context) {
    throw new Error("useGameActions must be used within a GameProvider");
  }
  return context;
};
