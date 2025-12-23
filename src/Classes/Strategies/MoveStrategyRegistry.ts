/**
 * @file MoveStrategyRegistry.ts
 * @description Registry pattern for piece movement strategies.
 *
 * This registry decouples the Piece class from specific movement implementations,
 * making it easy to add new piece types without modifying the Piece class.
 *
 * To add a new piece type:
 * 1. Create the movement function in MoveStrategies.ts
 * 2. Register it here with: registerMoveStrategy(PieceType.NewType, newTypeMoves)
 *
 * @see MoveStrategies.ts - Movement algorithm implementations
 * @see Piece.ts - Uses this registry via getMoveStrategy()
 */

import { Hex } from "../Entities/Hex";
import { Color, PieceType, N_SQUARES } from "../../Constants";

import {
  swordsmanMoves,
  archerMoves,
  knightMoves,
  eagleMoves,
  dragonMoves,
  assassinMoves,
  giantMoves,
  wolfMoves,
  rangerMoves,
} from "./MoveStrategies";

/**
 * Signature for movement strategy functions.
 * All movement strategies must conform to this interface.
 */
export type MoveStrategy = (
  hex: Hex,
  blockedHexSet: Set<string>,
  validHexSet: Set<string>,
  color: Color,
  boardSize?: number
) => Hex[];

/**
 * Internal registry mapping piece types to their movement strategies.
 */
const moveStrategyRegistry = new Map<PieceType, MoveStrategy>();

/**
 * Registers a movement strategy for a piece type.
 * Call this to add new piece types without modifying the Piece class.
 */
export const registerMoveStrategy = (
  pieceType: PieceType,
  strategy: MoveStrategy
): void => {
  moveStrategyRegistry.set(pieceType, strategy);
};

/**
 * Gets the movement strategy for a piece type.
 * @throws Error if no strategy is registered for the type.
 */
export const getMoveStrategy = (pieceType: PieceType): MoveStrategy => {
  const strategy = moveStrategyRegistry.get(pieceType);
  if (!strategy) {
    throw new Error(
      `No movement strategy registered for piece type: ${pieceType}. ` +
      `Register it in MoveStrategyRegistry.ts.`
    );
  }
  return strategy;
};

/**
 * Checks if a movement strategy is registered for a piece type.
 */
export const hasMoveStrategy = (pieceType: PieceType): boolean => {
  return moveStrategyRegistry.has(pieceType);
};

// ============================================================================
// DEFAULT REGISTRATIONS
// Register all built-in piece types. New pieces can be added to this list.
// ============================================================================

// Swordsman: Forward diagonal movement (color-dependent)
registerMoveStrategy(PieceType.Swordsman, (hex, blocked, valid, color) => 
  swordsmanMoves(hex, blocked, valid, color)
);

// Archer: 1 hex in any direction
registerMoveStrategy(PieceType.Archer, (hex, blocked, valid) => 
  archerMoves(hex, blocked, valid)
);

// Knight: Slides diagonally
registerMoveStrategy(PieceType.Knight, (hex, blocked, valid, _color, boardSize = N_SQUARES) => 
  knightMoves(hex, blocked, valid, boardSize)
);

// Trebuchet: 1 hex (same as Archer)
registerMoveStrategy(PieceType.Trebuchet, (hex, blocked, valid) => 
  archerMoves(hex, blocked, valid)
);

// Monarch: 1 hex (same as Archer)
registerMoveStrategy(PieceType.Monarch, (hex, blocked, valid) => 
  archerMoves(hex, blocked, valid)
);

// Eagle: Flying, up to 13 hexes
registerMoveStrategy(PieceType.Eagle, (hex, blocked, valid) => 
  eagleMoves(hex, blocked, valid)
);

// Giant: Slides orthogonally
registerMoveStrategy(PieceType.Giant, (hex, blocked, valid, _color, boardSize = N_SQUARES) => 
  giantMoves(hex, blocked, valid, boardSize)
);

// Dragon: L-shaped jumps
registerMoveStrategy(PieceType.Dragon, (hex, blocked, valid) => 
  dragonMoves(hex, blocked, valid)
);

// Assassin: Slides in all directions (orthogonal + diagonal)
registerMoveStrategy(PieceType.Assassin, (hex, blocked, valid, _color, boardSize = N_SQUARES) => 
  assassinMoves(hex, blocked, valid, boardSize)
);

// Wolf: Walking 3 hexes (pathfinding)
registerMoveStrategy(PieceType.Wolf, (hex, blocked, valid) => 
  wolfMoves(hex, blocked, valid)
);

// Healer: 1 hex (same as Archer)
registerMoveStrategy(PieceType.Healer, (hex, blocked, valid) => 
  archerMoves(hex, blocked, valid)
);

// Ranger: Walking 2 hexes (pathfinding)
registerMoveStrategy(PieceType.Ranger, (hex, blocked, valid) => 
  rangerMoves(hex, blocked, valid)
);

// Phoenix: Flying (same as Eagle)
registerMoveStrategy(PieceType.Phoenix, (hex, blocked, valid) => 
  eagleMoves(hex, blocked, valid)
);

// Wizard: 1 hex (same as Archer)
registerMoveStrategy(PieceType.Wizard, (hex, blocked, valid) => 
  archerMoves(hex, blocked, valid)
);

// Necromancer: 1 hex (same as Archer)
registerMoveStrategy(PieceType.Necromancer, (hex, blocked, valid) => 
  archerMoves(hex, blocked, valid)
);
