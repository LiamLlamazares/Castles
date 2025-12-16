/**
 * Hexagonal grid utilities based on Red Blob Games' hex grid guide.
 * @see https://www.redblobgames.com/grids/hexagons/
 * 
 * License: CC0 -- No Rights Reserved
 */

/** A 2D point in pixel coordinates */
export class Point {
  constructor(public x: number, public y: number) {}
}

/**
 * Represents a hex position using cube coordinates (q, r, s).
 * 
 * Cube coordinates satisfy the constraint: q + r + s = 0
 * This constraint enables simple arithmetic operations like addition and scaling.
 * 
 * Coordinate system:
 * - q: increases to the right (east)
 * - r: increases down-left (south-west)  
 * - s: increases up-left (north-west)
 * 
 * The coordinate is valid if and only if q + r + s = 0.
 */
export class Hex {
  constructor(
    /** Column position (increases eastward) */
    public q: number,
    /** Row position (increases south-westward) */
    public r: number,
    /** Diagonal position (increases north-westward) */
    public s: number,
    /** Index for checkerboard coloring (0, 1, or 2) */
    public color_index: number = 0
  ) {
    if (Math.round(q + r + s) !== 0) throw new Error("q + r + s must be 0");
    // Normalize -0 to 0
    this.q = q === 0 ? 0 : q;
    this.r = r === 0 ? 0 : r;
    this.s = s === 0 ? 0 : s;
  }

  /** Checks if two hexes have the same coordinates */
  public equals(other: Hex): boolean {
    return this.q === other.q && this.r === other.r && this.s === other.s;
  }

  /** Returns a unique string key for this hex (used for Maps/Sets) */
  public getKey(isReflected: boolean = false): string {
    if (isReflected) {
      return `${-this.q},${-this.r},${-this.s}`;
    }
    return `${this.q},${this.r},${this.s}`;
  }

  /** Vector addition: returns a new hex at position (this + b) */
  public add(b: Hex): Hex {
    return new Hex(this.q + b.q, this.r + b.r, this.s + b.s);
  }

  /** Vector subtraction: returns a new hex at position (this - b) */
  public subtract(b: Hex): Hex {
    return new Hex(this.q - b.q, this.r - b.r, this.s - b.s);
  }

  /** Scalar multiplication: returns a hex scaled by factor k */
  public scale(k: number): Hex {
    return new Hex(this.q * k, this.r * k, this.s * k);
  }

  /** Returns the hex reflected through the origin (negation of all coordinates) */
  public reflect(): Hex {
    return new Hex(-this.q, -this.r, -this.s);
  }

  /** Rotates the hex 60° counter-clockwise around the origin */
  public rotateLeft(): Hex {
    return new Hex(-this.s, -this.q, -this.r);
  }

  /** Rotates the hex 60° clockwise around the origin */
  public rotateRight(): Hex {
    return new Hex(-this.r, -this.s, -this.q);
  }

  public static directions: Hex[] = [
    new Hex(1, 0, -1),
    new Hex(1, -1, 0),
    new Hex(0, -1, 1),
    new Hex(-1, 0, 1),
    new Hex(-1, 1, 0),
    new Hex(0, 1, -1),
  ];

  public static direction(direction: number): Hex {
    return Hex.directions[direction];
  }

  public neighbor(direction: number): Hex {
    return this.add(Hex.direction(direction));
  }

  public static diagonals: Hex[] = [
    new Hex(2, -1, -1),
    new Hex(1, -2, 1),
    new Hex(-1, -1, 2),
    new Hex(-2, 1, 1),
    new Hex(-1, 2, -1),
    new Hex(1, 1, -2),
  ];

  public diagonalNeighbor(direction: number): Hex {
    return this.add(Hex.diagonals[direction]);
  }

  public len(): number {
    return (Math.abs(this.q) + Math.abs(this.r) + Math.abs(this.s)) / 2;
  }

  public distance(b: Hex): number {
    return this.subtract(b).len();
  }

  public round(): Hex {
    let qi: number = Math.round(this.q);
    let ri: number = Math.round(this.r);
    let si: number = Math.round(this.s);
    const q_diff: number = Math.abs(qi - this.q);
    const r_diff: number = Math.abs(ri - this.r);
    const s_diff: number = Math.abs(si - this.s);
    if (q_diff > r_diff && q_diff > s_diff) {
      qi = -ri - si;
    } else if (r_diff > s_diff) {
      ri = -qi - si;
    } else {
      si = -qi - ri;
    }
    return new Hex(qi, ri, si);
  }

  public lerp(b: Hex, t: number): Hex {
    return new Hex(
      this.q * (1.0 - t) + b.q * t,
      this.r * (1.0 - t) + b.r * t,
      this.s * (1.0 - t) + b.s * t
    );
  }

  public linedraw(b: Hex): Hex[] {
    const N: number = this.distance(b);
    const results: Hex[] = [];
    const step = 1.0 / Math.max(N, 1);
    
    for (let i = 0; i <= N; i++) {
        results.push(this.lerp(b, step * i).round());
    }
    return results;
  }
  public cube_scale(factor: number): Hex {
    return new Hex(this.q * factor, this.r * factor, this.s * factor);
  }
  public cubeRing(radius: number): Hex[] {
    const results = [];
    let cube = this.add(Hex.direction(4).scale(radius));

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < radius; j++) {
        results.push(cube);
        cube = cube.neighbor(i);
      }
    }

    return results;
  }
}

export class OffsetCoord {
  constructor(public col: number, public row: number) {}
  public static EVEN: number = 1;
  public static ODD: number = -1;

  public static qoffsetFromCube(offset: number, h: Hex): OffsetCoord {
    const col: number = h.q;
    const row: number = h.r + (h.q + offset * (h.q % 2)) / 2;
    if (offset !== OffsetCoord.EVEN && offset !== OffsetCoord.ODD) {
      throw new Error("offset must be EVEN (+1) or ODD (-1)");
    }
    return new OffsetCoord(col, row);
  }

  public static qoffsetToCube(offset: number, h: OffsetCoord): Hex {
    const q: number = h.col;
    const r: number = h.row - (h.col + offset * (h.col % 2)) / 2;
    const s: number = -q - r;
    if (offset !== OffsetCoord.EVEN && offset !== OffsetCoord.ODD) {
      throw new Error("offset must be EVEN (+1) or ODD (-1)");
    }
    return new Hex(q, r, s);
  }

  public static roffsetFromCube(offset: number, h: Hex): OffsetCoord {
    const col: number = h.q + (h.r + offset * (h.r % 2)) / 2;
    const row: number = h.r;
    if (offset !== OffsetCoord.EVEN && offset !== OffsetCoord.ODD) {
      throw new Error("offset must be EVEN (+1) or ODD (-1)");
    }
    return new OffsetCoord(col, row);
  }

  public static roffsetToCube(offset: number, h: OffsetCoord): Hex {
    const q: number = h.col - (h.row + offset * (h.row % 2)) / 2;
    const r: number = h.row;
    const s: number = -q - r;
    if (offset !== OffsetCoord.EVEN && offset !== OffsetCoord.ODD) {
      throw new Error("offset must be EVEN (+1) or ODD (-1)");
    }
    return new Hex(q, r, s);
  }
}

export class DoubledCoord {
  constructor(public col: number, public row: number) {}

  public static qdoubledFromCube(h: Hex): DoubledCoord {
    const col: number = h.q;
    const row: number = 2 * h.r + h.q;
    return new DoubledCoord(col, row);
  }

  public qdoubledToCube(): Hex {
    const q: number = this.col;
    const r: number = (this.row - this.col) / 2;
    const s: number = -q - r;
    return new Hex(q, r, s);
  }

  public static rdoubledFromCube(h: Hex): DoubledCoord {
    const col: number = 2 * h.q + h.r;
    const row: number = h.r;
    return new DoubledCoord(col, row);
  }

  public rdoubledToCube(): Hex {
    const q: number = (this.col - this.row) / 2;
    const r: number = this.row;
    const s: number = -q - r;
    return new Hex(q, r, s);
  }
}

export class Orientation {
  constructor(
    public f0: number,
    public f1: number,
    public f2: number,
    public f3: number,
    public b0: number,
    public b1: number,
    public b2: number,
    public b3: number,
    public start_angle: number
  ) {}
}

export class Layout {
  constructor(
    public orientation: Orientation,
    public size: Point,
    public origin: Point
  ) {}
  public static pointy: Orientation = new Orientation(
    Math.sqrt(3.0),
    Math.sqrt(3.0) / 2.0,
    0.0,
    3.0 / 2.0,
    Math.sqrt(3.0) / 3.0,
    -1.0 / 3.0,
    0.0,
    2.0 / 3.0,
    0.5
  );
  public static flat: Orientation = new Orientation(
    3.0 / 2.0,
    0.0,
    Math.sqrt(3.0) / 2.0,
    Math.sqrt(3.0),
    2.0 / 3.0,
    0.0,
    -1.0 / 3.0,
    Math.sqrt(3.0) / 3.0,
    0.0
  );

  public hexToPixel(h: Hex): Point {
    const M: Orientation = this.orientation;
    const size: Point = this.size;
    const origin: Point = this.origin;
    const x: number = (M.f0 * h.q + M.f1 * h.r) * size.x;
    const y: number = (M.f2 * h.q + M.f3 * h.r) * size.y;
    return new Point(x + origin.x, y + origin.y);
  }
  public hexToPixelReflected(h: Hex, isRotated: boolean): Point {
    if (isRotated) {
      return this.hexToPixel(h.reflect());
    }
    return this.hexToPixel(h);
  }

  public pixelToHex(p: Point): Hex {
    const M: Orientation = this.orientation;
    const size: Point = this.size;
    const origin: Point = this.origin;
    const pt: Point = new Point(
      (p.x - origin.x) / size.x,
      (p.y - origin.y) / size.y
    );
    const q: number = M.b0 * pt.x + M.b1 * pt.y;
    const r: number = M.b2 * pt.x + M.b3 * pt.y;
    return new Hex(q, r, -q - r);
  }

  public hexCornerOffset(corner: number): Point {
    const M: Orientation = this.orientation;
    const size: Point = this.size;
    const angle: number = (2.0 * Math.PI * (M.start_angle - corner)) / 6.0;
    return new Point(size.x * Math.cos(angle), size.y * Math.sin(angle));
  }

  public polygonCorners(h: Hex, isReflected: boolean = false): Point[] {
    if (isReflected) {
      h = h.reflect();
    }
    const corners: Point[] = [];
    const center: Point = this.hexToPixel(h);
    for (let i = 0; i < 6; i++) {
        const offset: Point = this.hexCornerOffset(i);
        corners.push(new Point(center.x + offset.x, center.y + offset.y));
    }
    return corners;
  }
  public polygonCornersString(h: Hex, isReflected: boolean = false): string {
    if (isReflected) {
      h = h.reflect();
    }
    const corners: Point[] = this.polygonCorners(h);
    return corners.map((p) => `${p.x},${p.y}`).join(" ");
  }
  public hexCornersStringMap(
    hexes: Hex[],
    isReflected: boolean = false
  ): { [key: string]: string } {
    if (isReflected) {
      hexes = hexes.map((hex) => hex.reflect());
    }
    let hexCornersStringMap: { [key: string]: string } = {};
    for (const hex of hexes) {
      hexCornersStringMap[hex.getKey()] = this.polygonCornersString(hex);
    }
    return hexCornersStringMap;
  }
  public hexCentersMap(
    hexes: Hex[],
    isReflected: boolean = false
  ): { [key: string]: Point } {
    if (isReflected) {
      hexes = hexes.map((hex) => hex.reflect());
    }
    let hexCentersMap: { [key: string]: Point } = {};
    for (const hex of hexes) {
      hexCentersMap[hex.getKey()] = this.hexToPixel(hex);
    }
    return hexCentersMap;
  }

  public sortHexList(hexList: Hex[]): void {
    hexList.sort((a, b) => {
      const aCenter = this.hexToPixel(a);
      const bCenter = this.hexToPixel(b);
      if (aCenter.y < bCenter.y) {
        return -1;
      } else if (aCenter.y > bCenter.y) {
        return 1;
      }
      if (aCenter.x < bCenter.x) {
        return -1;
      } else if (aCenter.x > bCenter.x) {
        return 1;
      }
      return 0;
    });
  }

  public getKey(hex: Hex): string {
    return `${hex.q},${hex.r},${hex.s}`;
  }
}


