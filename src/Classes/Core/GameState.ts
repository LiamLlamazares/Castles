/**
 * @file GameState.ts
 * @description Type definitions for the game state.
 *
 * Extracted from GameEngine.ts to break circular dependencies.
 */

import { Piece } from "../Entities/Piece";
import { Castle } from "../Entities/Castle";
import { Sanctuary } from "../Entities/Sanctuary";
import { MoveTree } from "./MoveTree";
import { Color, HistoryEntry, MoveRecord, SanctuaryType } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";

// Phoenix Rebirth Record
export interface PhoenixRecord {
    respawnTurn: number;
    owner: Color;
}

/**
 * Represents the complete state of a game at any point.
 * Used for state transitions and history tracking.
 */
export interface GameState {
  pieces: Piece[];
  pieceMap: PieceMap; // O(1) lookup
  castles: Castle[];
  sanctuaries: Sanctuary[]; // Special piece sanctuaries
  sanctuaryPool: SanctuaryType[]; // Available types for evolution
  sanctuarySettings?: { unlockTurn: number, cooldown: number }; // Configurable sanctuary settings
  turnCounter: number;
  movingPiece: Piece | null;
  history: HistoryEntry[];
  moveHistory: MoveRecord[];
  moveTree: MoveTree; // Mandatory for history and variation tracking
  graveyard: Piece[]; // Captured pieces eligible for revival
  phoenixRecords: PhoenixRecord[]; // Active rebirth timers
  viewNodeId: string | null; // Node ID for history navigation (null = live)
  victoryPoints?: { w: number, b: number }; // VP for castle control (optional, for VP mode)
  gameRules?: { vpModeEnabled: boolean }; // Active rules
}
