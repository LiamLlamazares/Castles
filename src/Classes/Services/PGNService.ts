/**
 * @file PGNService.ts
 * @description Facade for PGN import/export functionality.
 *
 * This module re-exports from focused sub-modules:
 * - **PGNGenerator** - Converts game state to PGN format
 * - **PGNImporter** - Parses PGN and reconstructs game state
 * - **PGNTypes** - Shared type definitions
 *
 * Maintains backward compatibility - existing imports continue to work.
 *
 * @see PGNGenerator - For export functionality
 * @see PGNImporter - For import functionality
 */

// Import modules for facade class
import { PGNGenerator } from "./PGNGenerator";
import { PGNImporter } from "./PGNImporter";
import { Board } from "../Core/Board";
import { Piece } from "../Entities/Piece";
import { MoveRecord, HistoryEntry, TurnPhase, GameResult } from "../../Constants";
import { MoveTree } from "../Core/MoveTree";
import { Sanctuary } from "../Entities/Sanctuary";
import { GameState } from "../Core/GameState";
import { GameSetup, GameSettings } from "./PGNTypes";

// Re-export types
export type { GameSetup, CompactSetup, GameSettings } from "./PGNTypes";

/**
 * Facade class for PGN operations.
 * Delegates to PGNGenerator and PGNImporter for actual implementation.
 * 
 * @example
 * // Export game to PGN
 * const pgn = PGNService.generatePGN(board, pieces, history, sanctuaries);
 * 
 * // Import PGN to game
 * const { setup, moves, moveTree } = PGNService.parsePGN(pgnString);
 */
export class PGNService {
  // ============ GENERATION (delegated to PGNGenerator) ============

  /**
   * Generates a PGN string from the game state.
   * @see PGNGenerator.generatePGN
   */
  public static generatePGN(
    board: Board,
    pieces: Piece[],
    history: MoveRecord[],
    sanctuaries: Sanctuary[] = [],
    gameTags: { [key: string]: string } = {},
    moveTree?: MoveTree,
    gameSettings?: GameSettings
  ): string {
    return PGNGenerator.generatePGN(board, pieces, history, sanctuaries, gameTags, moveTree, gameSettings);
  }

  // ============ PARSING (delegated to PGNImporter) ============

  /**
   * Parses a PGN string to recover the GameSetup and Move list.
   * @see PGNImporter.parsePGN
   */
  public static parsePGN(pgn: string): { setup: GameSetup | null; moves: string[]; moveTree: MoveTree } {
    return PGNImporter.parsePGN(pgn);
  }

  /**
   * Reconstructs Board, Pieces, and Sanctuaries from a GameSetup.
   * @see PGNImporter.reconstructState
   */
  public static reconstructState(setup: GameSetup): { board: Board; pieces: Piece[]; sanctuaries: Sanctuary[] } {
    return PGNImporter.reconstructState(setup);
  }

  /**
   * Replays a list of move notations to rebuild full game state.
   * @see PGNImporter.replayMoveHistory
   */
  public static replayMoveHistory(
    board: Board,
    initialPieces: Piece[],
    input: MoveTree,
    initialSanctuaries: Sanctuary[] = [],
    gameSettings?: { sanctuaryUnlockTurn: number, sanctuaryRechargeTurns: number }
  ): GameState {
    return PGNImporter.replayMoveHistory(board, initialPieces, input, initialSanctuaries, gameSettings);
  }
}
