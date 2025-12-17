import { Hex } from "../Entities/Hex";
import { Color } from "../../Constants";

/** Direction vector for hex movement */
interface HexDirection {
  dq: number;
  dr: number;
  ds: number;
}

/**
 * Helper function for "sliding" pieces that move in a straight line until blocked.
 * Used by Knight, Giant, and Assassin.
 * 
 * @param hex - Starting hex position
 * @param blockedHexSet - Set of hex keys for O(1) blocked lookups
 * @param validHexSet - Set of valid board hex keys
 * @param directions - Array of direction vectors to check
 * @param maxDistance - Maximum distance piece can travel in each direction
 * @returns Array of legal moves
 */
const getSlidingMoves = (
  hex: Hex,
  blockedHexSet: Set<string>,
  validHexSet: Set<string>,
  directions: HexDirection[],
  maxDistance: number
): Hex[] => {
  const moves: Hex[] = [];
  const { q, r, s } = hex;

  for (const dir of directions) {
    // Check moves in the positive direction
    for (let k = 1; k <= maxDistance; k++) {
      const newHex = new Hex(q + k * dir.dq, r + k * dir.dr, s + k * dir.ds);
      const key = newHex.getKey();
      
      if (!validHexSet.has(key)) break; // Stop if off board
      
      if (!blockedHexSet.has(key)) {
        moves.push(newHex);
      } else {
        break; // Blocked - stop in this direction
      }
    }

    // Check moves in the negative direction
    for (let k = -1; k >= -maxDistance; k--) {
      const newHex = new Hex(q + k * dir.dq, r + k * dir.dr, s + k * dir.ds);
      const key = newHex.getKey();

      if (!validHexSet.has(key)) break; // Stop if off board

      if (!blockedHexSet.has(key)) {
        moves.push(newHex);
      } else {
        break; // Blocked - stop in this direction
      }
    }
  }

  return moves;
};

/**
 * Swordsman movement: Forward in 3 diagonal directions (color-dependent).
 * Similar to pawn in chess but with hex geometry.
 * 
 * @param hex - Starting position
 * @param blockedHexSet - Set of hex keys for O(1) blocked lookups
 * @param validHexSet - Set of valid board hex keys
 * @param color - Piece color (determines forward direction)
 */
export const swordsmanMoves = (hex: Hex, blockedHexSet: Set<string>, validHexSet: Set<string>, color: Color): Hex[] => {
  const moves: Hex[] = [];
  const { q, r, s } = hex;
  const direction = color === "b" ? -1 : 1;

  const moveDirections = [
    { q: direction, r: -direction, s: 0 },
    { q: 0, r: -direction, s: direction },
    { q: -direction, r: 0, s: direction },
  ];

  for (const dir of moveDirections) {
    const newHex = new Hex(q + dir.q, r + dir.r, s + dir.s);
    const key = newHex.getKey();
    if (validHexSet.has(key) && !blockedHexSet.has(key)) {
      moves.push(newHex);
    }
  }

  return moves;
};

/**
 * Archer/Monarch/Trebuchet movement: One hex in any direction.
 * Simple adjacent movement (radius 1).
 * 
 * @param hex - Starting position
 * @param blockedHexSet - Set of hex keys for O(1) blocked lookups
 * @param validHexSet - Set of valid board hex keys
 */
export const archerMoves = (hex: Hex, blockedHexSet: Set<string>, validHexSet: Set<string>): Hex[] => {
  const potentialMoves = hex.cubeRing(1);
  return potentialMoves.filter((move) => {
    const key = move.getKey();
    return validHexSet.has(key) && !blockedHexSet.has(key);
  });
};

/**
 * Knight movement: Slides along diagonal lines (like bishop in chess).
 * Uses 3 diagonal direction vectors, can move any distance until blocked.
 * 
 * @param hex - Starting position
 * @param blockedHexSet - Set of hex keys for O(1) blocked lookups
 * @param validHexSet - Set of valid board hex keys
 * @param boardSize - Maximum board dimension (limits sliding distance)
 */
export const knightMoves = (hex: Hex, blockedHexSet: Set<string>, validHexSet: Set<string>, boardSize: number): Hex[] => {
  // Diagonal directions (similar to bishop movement in standard chess)
  const knightDirections: HexDirection[] = [
    { dq: -1, dr: -1, ds: 2 },
    { dq: 1, dr: -2, ds: 1 },
    { dq: 2, dr: -1, ds: -1 },
  ];

  return getSlidingMoves(hex, blockedHexSet, validHexSet, knightDirections, boardSize);
};

/**
 * Eagle movement: Flying unit that can move up to 3 hexes in any direction.
 * Not blocked by units in between (can fly over).
 * 
 * @param hex - Starting position
 * @param blockedHexSet - Set of hex keys for O(1) blocked lookups
 * @param validHexSet - Set of valid board hex keys
 */
export const eagleMoves = (hex: Hex, blockedHexSet: Set<string>, validHexSet: Set<string>): Hex[] => {
  // Collect all hexes in radius 1, 2, and 3
  const potentialMoves: Hex[] = [];
  for (let radius = 1; radius <= 13; radius++) {
    potentialMoves.push(...hex.cubeRing(radius));
  }
  
  // Eagles fly, so only the destination needs to be unblocked
  return potentialMoves.filter((move) => {
    const key = move.getKey();
    return validHexSet.has(key) && !blockedHexSet.has(key);
  });
};

/**
 * Dragon movement: L-shaped jumps like knight in standard chess.
 * Flies (not blocked by pieces in between), can land at 12 specific positions.
 * 
 * @param hex - Starting position
 * @param blockedHexSet - Set of hex keys for O(1) blocked lookups
 * @param validHexSet - Set of valid board hex keys
 */
export const dragonMoves = (hex: Hex, blockedHexSet: Set<string>, validHexSet: Set<string>): Hex[] => {
  const { q, r, s } = hex;
  const moves: Hex[] = [];

  // L-shaped jump offsets (2-then-1 pattern in hex coordinates)
  const dragonJumps: HexDirection[] = [
    { dq: -1, dr: -2, ds: 3 },
    { dq: 1, dr: -3, ds: 2 },
    { dq: 2, dr: -3, ds: 1 },
    { dq: 3, dr: -2, ds: -1 },
    { dq: 3, dr: -1, ds: -2 },
    { dq: 2, dr: 1, ds: -3 },
  ];

  // Each jump has both positive and negative variants (12 total landing spots)
  for (const jump of dragonJumps) {
    for (const sign of [-1, 1]) {
      moves.push(new Hex(q + sign * jump.dq, r + sign * jump.dr, s + sign * jump.ds));
    }
  }

  // Dragons fly, so only the landing spot needs to be unblocked
  return moves.filter((move) => {
    const key = move.getKey();
    return validHexSet.has(key) && !blockedHexSet.has(key);
  });
};

/**
 * Assassin movement: Combines Giant (orthogonal) and Knight (diagonal).
 * Similar to Queen in standard chess (rook + bishop).
 * 
 * @param hex - Starting position
 * @param blockedHexSet - Set of hex keys for O(1) blocked lookups
 * @param validHexSet - Set of valid board hex keys
 * @param boardSize - Maximum board dimension (limits sliding distance)
 */
export const assassinMoves = (hex: Hex, blockedHexSet: Set<string>, validHexSet: Set<string>, boardSize: number): Hex[] => {
  // All 6 directions: 3 orthogonal + 3 diagonal
  const assassinDirections: HexDirection[] = [
    // Orthogonal (like Giant/Rook)
    { dq: 0, dr: -1, ds: 1 },
    { dq: 1, dr: -1, ds: 0 },
    { dq: 1, dr: 0, ds: -1 },
    // Diagonal (like Knight/Bishop)
    { dq: 1, dr: -2, ds: 1 },
    { dq: 2, dr: -1, ds: -1 },
    { dq: 1, dr: 1, ds: -2 },
  ];

  return getSlidingMoves(hex, blockedHexSet, validHexSet, assassinDirections, 2 * boardSize);
};

/**
 * Giant movement: Slides along orthogonal lines (like rook in chess).
 * Uses 3 orthogonal direction vectors, can move any distance until blocked.
 * 
 * @param hex - Starting position
 * @param blockedHexSet - Set of hex keys for O(1) blocked lookups
 * @param validHexSet - Set of valid board hex keys
 * @param boardSize - Maximum board dimension (limits sliding distance)
 */
export const giantMoves = (hex: Hex, blockedHexSet: Set<string>, validHexSet: Set<string>, boardSize: number): Hex[] => {
  // Orthogonal directions (similar to rook movement in standard chess)
  const giantDirections: HexDirection[] = [
    { dq: 0, dr: -1, ds: 1 },
    { dq: 1, dr: -1, ds: 0 },
    { dq: 1, dr: 0, ds: -1 },
  ];

  return getSlidingMoves(hex, blockedHexSet, validHexSet, giantDirections, 2 * boardSize);
};
