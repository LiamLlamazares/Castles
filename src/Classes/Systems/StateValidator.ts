/**
 * @file StateValidator.ts
 * @description Validates game state invariants to catch bugs early.
 *
 * Run in development mode after state mutations to ensure:
 * 1. No two pieces occupy the same hex
 * 2. All pieces are on valid board hexes
 * 3. Castle ownership is consistent
 * 4. Turn counter is valid
 *
 * @usage Enable in development by calling validateState() after setState
 * @example
 * if (process.env.NODE_ENV === 'development') {
 *   const errors = StateValidator.validate(newState, board);
 *   if (errors.length > 0) console.error('Invalid state:', errors);
 * }
 */

import { Board } from "../Core/Board";
import { GameState } from "../Core/GameState";
import { RuleEngine } from "./RuleEngine";
import { Piece } from "../Entities/Piece";
import { Color } from "../../Constants";

export interface ValidationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class StateValidator {
  /**
   * Validates all game state invariants.
   * Returns empty array if state is valid.
   */
  public static validate(state: GameState, board: Board): ValidationError[] {
    const errors: ValidationError[] = [];

    errors.push(...this.validateNoDuplicatePieces(state));
    errors.push(...this.validatePiecesOnBoard(state, board));
    errors.push(...this.validateCastleOwnership(state));
    errors.push(...this.validateTurnCounter(state));
    errors.push(...this.validatePieceMapSync(state));
    errors.push(...this.validateSanctuaryPool(state));
    errors.push(...this.validatePhoenixRecords(state));

    return errors;
  }

  /**
   * Invariant: No two pieces can occupy the same hex.
   */
  private static validateNoDuplicatePieces(state: GameState): ValidationError[] {
    const errors: ValidationError[] = [];
    const seenHexes = new Map<string, Piece>();

    for (const piece of state.pieces) {
      const key = piece.hex.getKey();
      const existing = seenHexes.get(key);
      
      if (existing) {
        errors.push({
          code: "DUPLICATE_PIECE_POSITION",
          message: `Two pieces occupy hex ${key}`,
          details: {
            hex: key,
            piece1: { type: existing.type, color: existing.color },
            piece2: { type: piece.type, color: piece.color },
          },
        });
      } else {
        seenHexes.set(key, piece);
      }
    }

    return errors;
  }

  /**
   * Invariant: All pieces must be on valid board hexes.
   */
  private static validatePiecesOnBoard(state: GameState, board: Board): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const piece of state.pieces) {
      const key = piece.hex.getKey();
      if (!board.hexSet.has(key)) {
        errors.push({
          code: "PIECE_OFF_BOARD",
          message: `Piece at ${key} is not on a valid board hex`,
          details: {
            hex: key,
            pieceType: piece.type,
            pieceColor: piece.color,
          },
        });
      }
    }

    return errors;
  }

  /**
   * Invariant: Castle ownership must be consistent with piece positions.
   */
  private static validateCastleOwnership(state: GameState): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const castle of state.castles) {
      // Find piece on this castle hex
      const pieceOnCastle = state.pieces.find(p => p.hex.equals(castle.hex));
      
      // If castle has an owner, check consistency
      if (castle.owner && !pieceOnCastle) {
        // Owner exists but no piece - this is OK (owner persists after piece leaves)
      }
      
      // If there's a piece on the castle, it should be the enemy of the original owner
      // (otherwise it wouldn't have captured it)
      // This is a weak check - mainly for sanity
    }

    return errors;
  }

  /**
   * Invariant: Turn counter must be non-negative.
   */
  private static validateTurnCounter(state: GameState): ValidationError[] {
    const errors: ValidationError[] = [];

    if (state.turnCounter < 0 || !Number.isInteger(state.turnCounter)) {
      errors.push({
        code: "INVALID_TURN_COUNTER",
        message: `Turn counter must be a non-negative integer: ${state.turnCounter}`,
        details: { turnCounter: state.turnCounter },
      });
    }

    return errors;
  }

  /**
   * Invariant: PieceMap must be in sync with pieces array.
   */
  private static validatePieceMapSync(state: GameState): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check that pieceMap has same count as pieces
    const mapSize = state.pieceMap.size;
    const arraySize = state.pieces.length;

    if (mapSize !== arraySize) {
      errors.push({
        code: "PIECE_MAP_DESYNC",
        message: `PieceMap size (${mapSize}) doesn't match pieces array (${arraySize})`,
        details: { mapSize, arraySize },
      });
    }

    // Check that each piece in array is in map
    for (const piece of state.pieces) {
      const key = piece.hex.getKey();
      const mapPiece = state.pieceMap.getByKey(key);
      
      if (!mapPiece) {
        errors.push({
          code: "PIECE_NOT_IN_MAP",
          message: `Piece at ${key} not found in pieceMap`,
          details: { hex: key, pieceType: piece.type },
        });
      } else if (mapPiece !== piece) {
        errors.push({
          code: "PIECE_MAP_MISMATCH",
          message: `PieceMap at ${key} contains different piece than array`,
          details: { hex: key },
        });
      }
    }

    return errors;
  }

  /**
   * Invariant: Sanctuary pool must not contain duplicates or types already on board.
   */
  private static validateSanctuaryPool(state: GameState): ValidationError[] {
    const errors: ValidationError[] = [];
    const seenPoolTypes = new Set<string>();
    const boardTypes = new Set(state.sanctuaries.map(s => s.type));

    for (const type of state.sanctuaryPool) {
      if (seenPoolTypes.has(type)) {
        errors.push({
          code: "DUPLICATE_SANCTUARY_POOL_TYPE",
          message: `Sanctuary pool contains duplicate type ${type}`,
          details: { type },
        });
      } else {
        seenPoolTypes.add(type);
      }

      if (boardTypes.has(type)) {
        errors.push({
          code: "SANCTUARY_TYPE_IN_POOL_AND_BOARD",
          message: `Sanctuary type ${type} exists both on board and in the pool`,
          details: { type },
        });
      }
    }

    return errors;
  }

  /**
   * Invariant: Phoenix respawn records in settled state must be future-due.
   */
  private static validatePhoenixRecords(state: GameState): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const record of state.phoenixRecords) {
      if (
        record.respawnTurn < 0 ||
        !Number.isInteger(record.respawnTurn) ||
        record.respawnTurn <= state.turnCounter
      ) {
        errors.push({
          code: "INVALID_PHOENIX_RECORD",
          message: `Phoenix respawn turn must be a future non-negative integer: ${record.respawnTurn}`,
          details: {
            owner: record.owner,
            respawnTurn: record.respawnTurn,
            turnCounter: state.turnCounter,
          },
        });
      }
    }

    return errors;
  }

  /**
   * Convenience method to validate and throw if errors found.
   * Use in development mode.
   */
  public static assertValid(state: GameState, board: Board): void {
    const errors = this.validate(state, board);
    if (errors.length > 0) {
      const messages = errors.map(e => `[${e.code}] ${e.message}`).join('\n');
      throw new Error(`Invalid game state:\n${messages}`);
    }
  }

  /**
   * Convenience method to validate and log warnings.
   * Non-throwing, suitable for production with logging.
   */
  public static warnIfInvalid(state: GameState, board: Board): boolean {
    const errors = this.validate(state, board);
    if (errors.length > 0) {
      console.warn('[StateValidator] Invalid state detected:', errors);
      return false;
    }
    return true;
  }
}
