import { Hex } from '../Entities/Hex';
import { generateHexagons } from '../Systems/BoardGeneration';
import { N_SQUARES} from '../../Constants';

import { Castle } from '../Entities/Castle';

// Define configuration interface
export interface BoardConfig {
  nSquares: number;
  riverCrossingLength?: number;
  riverSegmentLength?: number;
}

/**
 * Manages the topological structure and static data of the game board.
 * 
 * Primary functions:
 * - Generates the hexagonal grid (q, r, s coordinates).
 * - Classifies terrain types:
 *   - Rivers (impassable obstacles at r=0).
 *   - Castles (strategic capture points at board corners).
 *   - High Ground (terrain buffering ranged attacks).
 * - Provides O(1) lookups via Sets for collision detection and rendering.
 */
export class Board {
  /** Cached castle objects (computed once) */
  private _castles: Castle[] | null = null;
  
  /** Board size (number of hexes from center to edge) */
  public NSquares: number;
  
  /** Configuration for board generation */
  public config: BoardConfig;

  /** All hexes on the board */
  public hexes: Hex[];
  

  
  /** Hexes representing the river (impassable for ground units) */
  public riverHexes: Hex[];
  
  /** All castle hexes on the board */
  public castleHexes: Hex[];
  
  /** Castle hexes belonging to white player */
  public whiteCastleHexes: Hex[];
  
  /** Castle hexes belonging to black player */
  public blackCastleHexes: Hex[];
  
  /** Hexes providing high ground advantage (extended ranged attack range) */
  public highGroundHexes: Hex[];
  
  // --- O(1) lookup Sets (precomputed from arrays above) ---
  
  /** Set of river hex keys for O(1) membership testing */
  public riverHexSet: Set<string>;
  
  /** Set of all castle hex keys for O(1) membership testing */
  public castleHexSet: Set<string>;
  
  /** Set of white castle hex keys */
  public whiteCastleHexSet: Set<string>;
  
  /** Set of black castle hex keys */
  public blackCastleHexSet: Set<string>;
  
  /** Set of high ground hex keys */
  public highGroundHexSet: Set<string>;
  
  /** Set of ALL hex keys on board */
  public hexSet: Set<string>;
  

  

  constructor(
    configOrSize: number | BoardConfig = N_SQUARES
  ) {
    // Backward compatibility: handle number input
    if (typeof configOrSize === 'number') {
      this.config = { nSquares: configOrSize };
    } else {
      this.config = configOrSize;
    }

    this.NSquares = this.config.nSquares;
    this.hexes = generateHexagons(this.NSquares);

    // Precompute special hex classifications (computed once, independent of pixels)
    this.riverHexes = this.hexes.filter((hex) => this.isRiver(hex));
    this.castleHexes = this.hexes.filter((hex) => this.isCastle(hex, this.NSquares));
    this.whiteCastleHexes = this.castleHexes.filter((hex) => this.isWhiteCastle(hex));
    this.blackCastleHexes = this.castleHexes.filter((hex) => this.isBlackCastle(hex));
    this.highGroundHexes = this.hexes.filter((hex) => this.isCastle(hex, this.NSquares - 2));

    // Precompute Sets for O(1) lookups
    this.riverHexSet = new Set(this.riverHexes.map(h => h.getKey()));
    this.castleHexSet = new Set(this.castleHexes.map(h => h.getKey()));
    this.whiteCastleHexSet = new Set(this.whiteCastleHexes.map(h => h.getKey()));
    this.blackCastleHexSet = new Set(this.blackCastleHexes.map(h => h.getKey()));
    this.highGroundHexSet = new Set(this.highGroundHexes.map(h => h.getKey()));
    
    // Set of ALL valid hexes
    this.hexSet = new Set(this.hexes.map(h => h.getKey()));
  }

 /**
  * Checks if a hex is part of the river (impassable for ground units).
  * 
  * The river runs along r=0 (middle of the board) with a repeating pattern:
  * - RIVER_CROSSING_LENGTH hexes of crossing (passable)
  * - RIVER_SEGMENT_LENGTH hexes of river (impassable)
  * 
  * Pattern visualization (looking along r=0, varying q):
  * ```
  *   q: ...  -4   -3   -2   -1    0    1    2    3    4  ...
  *        [RIVER][RIVER][CROSS][CROSS][CROSS][CROSS][RIVER][RIVER][CROSS]...
  * ```
  * (Pattern repeats every 4 hexes: 2 crossings + 2 river segments)
  * 
  * Castle hexes at the edges are excluded from the river.
  */
 public isRiver(hex: Hex): boolean {
    // River is only at r=0
    if (hex.r !== 0) return false;
    
    // Exclude castle hexes at the edges
    if (this.isCastle(hex, this.NSquares)) return false;
    
    // Define pattern lengths (can be adjusted for gameplay balance)
    const RIVER_CROSSING_LENGTH = this.config.riverCrossingLength ?? 2;  // 1 hex crossing gap (default 2 per side from center?) 

    const RIVER_SEGMENT_LENGTH = this.config.riverSegmentLength ?? 2;   // 2 hex river segment
    const PATTERN_LENGTH = RIVER_CROSSING_LENGTH + RIVER_SEGMENT_LENGTH;
    
    // Use absolute q value to calculate position in repeating pattern
    // This ensures symmetry: crossing at center (q=0), then pattern repeats outward
    const absQ = Math.abs(hex.q);
    const positionInPattern = absQ % PATTERN_LENGTH;
    
    // Positions 0 to (CROSSING_LENGTH-1) are crossings (passable)
    // Positions CROSSING_LENGTH to (PATTERN_LENGTH-1) are river (impassable)
    return positionInPattern >= RIVER_CROSSING_LENGTH;
  }

public isCastle(hex: Hex, N: number): boolean {
  return (
    (hex.q === 0 && Math.abs(hex.r) === N && Math.abs(hex.s) === N) ||
    (hex.r === 0 && Math.abs(hex.q) === N && Math.abs(hex.s) === N) ||
    (hex.s === 0 && Math.abs(hex.q) === N && Math.abs(hex.r) === N)
  ); 
};

/**
 * Checks if a castle belongs to the white player's side.
 * 
 * White castles are in the "southern" half of the board:
 * - r > 0: normal case (below the river)
 * - r = 0: edge castles use s coordinate (s < 0 = white side)
 */
public isWhiteCastle(castleHex: Hex): boolean {
  if (castleHex.r > 0) return true;
  if (castleHex.r === 0) return castleHex.s < 0; // Edge case: use s coordinate
  return false;
}

/**
 * Checks if a castle belongs to the black player's side.
 * 
 * Black castles are in the "northern" half of the board:
 * - r < 0: normal case (above the river)
 * - r = 0: edge castles use s coordinate (s > 0 = black side)
 */
public isBlackCastle(castleHex: Hex): boolean {
  if (castleHex.r < 0) return true;
  if (castleHex.r === 0) return castleHex.s > 0; // Edge case: use s coordinate
  return false;
}

get castles(): Castle[] {
  if (!this._castles) {
    const castles: Castle[] = [];
    for (const hex of this.whiteCastleHexes) {
      castles.push(new Castle(hex, 'w', 0));
    }
    for (const hex of this.blackCastleHexes) {
      castles.push(new Castle(hex, 'b', 0));
    }
    this._castles = castles;
  }
  return this._castles;
}
}

