/**
 * @file GameError.ts
 * @description Unified error handling for game-related errors.
 * 
 * Provides a structured way to handle and categorize game errors:
 * - Type-safe error codes for programmatic handling
 * - Recoverable flag for UI error boundaries
 * - Consistent error formatting across the codebase
 * 
 * @example
 * throw new GameError("Invalid spawn location", GameErrorCode.INVALID_SPAWN);
 * 
 * @see SanctuaryService - Uses for pledge validation errors
 * @see useMoveExecution - Uses for command execution errors
 */

/**
 * Error codes for categorizing game errors.
 * Used for programmatic error handling and i18n.
 */
export enum GameErrorCode {
  /** Move is not legal (wrong phase, blocked, etc.) */
  INVALID_MOVE = "INVALID_MOVE",
  
  /** Attack target is invalid (out of range, defended, etc.) */
  INVALID_ATTACK = "INVALID_ATTACK",
  
  /** Spawn location is invalid (occupied, river, castle) */
  INVALID_SPAWN = "INVALID_SPAWN",
  
  /** Sanctuary pledge error (requirements not met, cooldown, etc.) */
  SANCTUARY_ERROR = "SANCTUARY_ERROR",
  
  /** Game state is corrupted or inconsistent */
  STATE_ERROR = "STATE_ERROR",
  
  /** Ability cannot be used (no targets, cooldown, etc.) */
  ABILITY_ERROR = "ABILITY_ERROR",
  
  /** PGN parsing or export error */
  PGN_ERROR = "PGN_ERROR",
}

/**
 * Custom error class for game-related errors.
 * 
 * Features:
 * - Typed error codes for switch/case handling
 * - Recoverable flag for error boundary decisions
 * - Preserves stack trace
 */
export class GameError extends Error {
  public readonly name = "GameError";
  
  /**
   * @param message Human-readable error message
   * @param code Error code for programmatic handling
   * @param recoverable Whether the game can continue after this error
   */
  constructor(
    message: string,
    public readonly code: GameErrorCode,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    
    // Maintains proper stack trace in V8 (Chrome/Node)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GameError);
    }
  }
  
  /**
   * Returns a formatted string for logging.
   */
  toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

/**
 * Type guard for checking if an error is a GameError.
 */
export function isGameError(error: unknown): error is GameError {
  return error instanceof GameError;
}

/**
 * Helper to create common game errors.
 */
export const GameErrors = {
  invalidSpawn: (reason?: string) => 
    new GameError(
      reason || "Invalid spawn location",
      GameErrorCode.INVALID_SPAWN
    ),
    
  sanctuaryNotReady: (reason?: string) =>
    new GameError(
      reason || "Sanctuary is not ready for pledging",
      GameErrorCode.SANCTUARY_ERROR
    ),
    
  insufficientStrength: (required: number, actual: number) =>
    new GameError(
      `Insufficient strength: ${actual}/${required} required`,
      GameErrorCode.SANCTUARY_ERROR
    ),
    
  invalidMove: (reason?: string) =>
    new GameError(
      reason || "Invalid move",
      GameErrorCode.INVALID_MOVE
    ),
    
  stateCorrupted: (details?: string) =>
    new GameError(
      details || "Game state is corrupted",
      GameErrorCode.STATE_ERROR,
      false // Not recoverable
    ),
};
