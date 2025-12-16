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
