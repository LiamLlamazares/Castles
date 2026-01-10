/**
 * @file GameCommand.ts
 * @description Command Pattern interface for game actions.
 *
 * The Command Pattern encapsulates game actions as objects, providing:
 * - **Undo/Redo capability**: Commands can be stored and reversed
 * - **Action history**: Complete log of all game actions for debugging
 * - **Testability**: Commands can be executed in isolation
 * - **Decoupling**: UI doesn't need to know how actions are implemented
 *
 * @see useMoveExecution - Consumes commands for action execution
 * @see StateMutator - Underlying state mutation layer
 */

import { GameEngine } from "../Core/GameEngine";
import { GameState } from "../Core/GameState";
import { Board } from "../Core/Board";
import { Hex } from "../Entities/Hex";
import { Piece } from "../Entities/Piece";
import { MoveRecord } from "../../Constants";

/**
 * Result of executing a command.
 * Contains the new state and metadata about the action.
 */
export interface CommandResult {
  /** The new game state after command execution */
  newState: GameState;
  /** Move notation for history recording (e.g., "Sw c4", "Ar x e5") */
  notation: string;
  /** Whether the command was successfully executed */
  success: boolean;
  /** Optional error message if execution failed */
  error?: string;
}

/**
 * Base interface for all game commands.
 * 
 * Commands are immutable action objects that can:
 * 1. Execute against a game state
 * 2. Generate notation for history
 * 3. Be stored for undo/redo
 */
export interface GameCommand {
  /** Unique identifier for this command type */
  readonly type: CommandType;
  
  /**
   * Executes the command against the given state.
   * Returns a new state (immutable) and metadata.
   */
  execute(state: GameState): CommandResult;
  
  /**
   * Returns the move notation for this command.
   * Used for history display and PGN export.
   */
  getNotation(): string;
}

/**
 * Enumeration of all command types.
 * Used for command identification and factory pattern.
 */
export enum CommandType {
  Move = "MOVE",
  Attack = "ATTACK",
  CastleAttack = "CASTLE_ATTACK",
  Pass = "PASS",
  Recruit = "RECRUIT",
  Pledge = "PLEDGE",
  Ability = "ABILITY",
}

/**
 * Context passed to command constructors.
 * Contains all dependencies needed for command execution.
 */
export interface CommandContext {
  /** The game engine instance (for rule validation) */
  gameEngine: import("../Core/GameEngine").GameEngine;
  /** The board instance (for topology queries) */
  board: import("../Core/Board").Board;
}
