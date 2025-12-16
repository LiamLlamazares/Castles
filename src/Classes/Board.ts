import { Hex, Layout, generateHexagons, Point } from './Hex';
import { N_SQUARES, HEX_SIZE_FACTOR, X_OFFSET, Y_OFFSET, LAYOUT_TYPE } from '../Constants';
import { Castle } from './Castle';

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
 * - Maps logical hex coordinates to screen pixels via `Layout` helper.
 */
export class Board {
  /** Cached castle objects (computed once) */
  private _castles: Castle[] | null = null;
  
  /** Board size (number of hexes from center to edge) */
  public NSquares: number;
  
  /** All hexes on the board */
  public hexes: Hex[];
  
  /** Layout orientation: "flat" or "pointy" */
  public layoutType: "flat" | "pointy";
  
  /** Layout for hex ↔ pixel coordinate transformations */
  public layout: Layout;
  
  /** Sizing factor for hex rendering */
  public HEX_SIZE_FACTOR: number;
  
  /** Vertical offset for board centering */
  public Y_OFFSET: number;

  /** Horizontal offset for board centering */
  public X_OFFSET: number;
  
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
  
  /** Precomputed CSS class for each hex (for rendering) */
  public colorClassMap: { [key: string]: string };
  
  /** Precomputed pixel center for each hex */
  public hexCenters: { [key: string]: Point };
  
  /** Precomputed SVG polygon points for each hex */
  public hexCornerString: { [key: string]: string };
  
  /** Canvas/viewport width in pixels */
  public pixelWidth: number;
  
  /** Canvas/viewport height in pixels */
  public pixelHeight: number;

  constructor(
    NSquares: number = N_SQUARES,
    HEX_SIZE_FACTOR_ARG: number = HEX_SIZE_FACTOR,
    X_OFFSET_ARG: number = X_OFFSET,
    Y_OFFSET_ARG: number = Y_OFFSET,
    layoutType: "flat" | "pointy" = LAYOUT_TYPE as "flat" | "pointy"
  ) {
    this.NSquares = NSquares;
    this.hexes = generateHexagons(this.NSquares);
    this.HEX_SIZE_FACTOR = HEX_SIZE_FACTOR_ARG;
    this.X_OFFSET = X_OFFSET_ARG;
    this.Y_OFFSET = Y_OFFSET_ARG;
    this.layoutType = layoutType;

    // Default to standard size, updated by UI later
    this.pixelWidth = 800;
    this.pixelHeight = 600;

    this.layout = this.getLayout();

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

    // Precompute CSS classes for each hex (using O(1) Set lookups)
    const colorClassMap: { [key: string]: string } = {};
    this.hexes.forEach((hex) => {
      colorClassMap[hex.getKey()] = hex.colorClass(
        this.riverHexSet,
        this.castleHexSet,
        this.whiteCastleHexSet,
        this.blackCastleHexSet,
        this.highGroundHexSet
      );
    });
    this.colorClassMap = colorClassMap;

    // Precompute rendering data (layout-dependent)
    this.hexCornerString = this.layout.hexCornersStringMap(this.hexes);
    this.hexCenters = this.layout.hexCentersMap(this.hexes);
  }

  /**
   * Updates board dimensions and recomputes all layout-dependent data.
   * Call this when the viewport/window is resized.
   */
  public updateDimensions(width: number, height: number): void {
    this.pixelWidth = width;
    this.pixelHeight = height;
    this.layout = this.getLayout();
    this.hexCornerString = this.layout.hexCornersStringMap(this.hexes);
    this.hexCenters = this.layout.hexCentersMap(this.hexes);
  }

  /** Center point of the board in pixel coordinates */
  get origin(): Point {
    const x = this.pixelWidth / 2 + this.X_OFFSET;
    const y = this.pixelHeight / 2 + this.Y_OFFSET;
    return new Point(x, y);
  }

  /** Size of each hex in pixels (width and height are equal for regular hexagons) */
  get size_hexes(): number {
    return Math.min(this.pixelWidth, this.pixelHeight) / (this.HEX_SIZE_FACTOR * this.NSquares);
  }

  /** Size as a Point for Layout constructor */
  get hexSize(): Point {
    return new Point(this.size_hexes, this.size_hexes);
  }

  /** Creates a Layout object based on current settings */
  getLayout(): Layout {
    if (this.layoutType === "flat") {
      return new Layout(Layout.flat, this.hexSize, this.origin);
    }
    return new Layout(Layout.pointy, this.hexSize, this.origin);
  }

 /**
  * Checks if a hex is part of the river (impassable for ground units).
  * 
  * The river runs along r=0 (middle of the board) with a repeating pattern:
  * - RIVER_CROSSING_LENGTH hexes of crossing (passable)
  * - RIVER_SEGMENT_LENGTH hexes of river (impassable)
  * 
  * Castle hexes at the edges are excluded from the river.
  */
 public isRiver(hex: Hex): boolean {
    // River is only at r=0
    if (hex.r !== 0) return false;
    
    // Exclude castle hexes at the edges
    if (this.isCastle(hex, this.NSquares)) return false;
    
    // Define pattern lengths (can be adjusted for gameplay balance)
    const RIVER_CROSSING_LENGTH = 2;  // 1 hex crossing gap
    const RIVER_SEGMENT_LENGTH = 2;   // 2 hex river segment
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

get Castles(): Castle[] {
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


  getCorners(): string[] {
    const hexList = this.hexes;
    const pixels = hexList.map((hex) => this.layout.polygonCorners(hex)
    .map((p) => `${p.x},${p.y}`)
    .join(" "));
    return pixels;
  }

  get Centers(): Point[] {
    const hexList = this.hexes;
    const centers = hexList.map((hex) => this.layout.hexToPixel(hex));
    return centers;
  }
  
  getHexCenter(hex: Hex): Point {
    return this.layout.hexToPixel(hex);
  }
}

