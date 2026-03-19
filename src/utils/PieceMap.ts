import { Piece } from '../Classes/Entities/Piece';
import { Hex } from '../Classes/Entities/Hex';

/**
 * Utility for O(1) piece lookups by hex position.
 * 
 * Replaces O(N) findIndex() calls with O(1) Map lookups.
 * Useful in combat resolution and game state queries.
 */
export class PieceMap {
  private map: Map<string, Piece>;

  constructor(pieces: Piece[]) {
    this.map = new Map();
    for (const piece of pieces) {
      this.map.set(piece.hex.getKey(), piece);
    }
  }

  /** Get piece at given hex (O(1)) */
  get(hex: Hex): Piece | undefined {
    return this.map.get(hex.getKey());
  }

  /** Check if hex is occupied (O(1)) */
  has(hex: Hex): boolean {
    return this.map.has(hex.getKey());
  }

  /** Get piece by hex key string (O(1)) */
  getByKey(hexKey: string): Piece | undefined {
    return this.map.get(hexKey);
  }

  /** Get all pieces as array */
  toArray(): Piece[] {
    return Array.from(this.map.values());
  }

  /** Number of pieces */
  get size(): number {
    return this.map.size;
  }
}

/** Helper function to create PieceMap from array */
export function createPieceMap(pieces: Piece[]): PieceMap {
  return new PieceMap(pieces);
}

/**
 * Gets all pieces adjacent to a hex, with optional filtering.
 * Consolidates the common pattern of cubeRing(1) + pieceMap lookup
 * that appears ~20 times across CombatSystem, RuleEngine, SanctuaryService.
 *
 * @param hex - Center hex to check neighbors of
 * @param pieceMap - PieceMap for O(1) lookups
 * @param predicate - Optional filter (e.g., only friendly wolves)
 * @returns Array of pieces on adjacent hexes matching the predicate
 */
export function getNeighborPieces(
  hex: Hex,
  pieceMap: PieceMap,
  predicate?: (p: Piece) => boolean
): Piece[] {
  const neighbors = hex.cubeRing(1);
  const result: Piece[] = [];
  for (const n of neighbors) {
    const piece = pieceMap.get(n);
    if (piece && (!predicate || predicate(piece))) {
      result.push(piece);
    }
  }
  return result;
}
