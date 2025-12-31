import { Hex, Layout, Point } from '../Entities/Hex';
import { Board } from '../Core/Board';
import { HEX_SIZE_FACTOR, X_OFFSET, Y_OFFSET, LAYOUT_TYPE, PIECE_SCALE_FACTOR } from '../../Constants';

/**
 * Virtual canvas size - all layout calculations use this fixed size.
 * SVG viewBox scales this to fit the actual container.
 */
export const VIRTUAL_CANVAS_SIZE = 1000;

/**
 * Manages the visual layout and coordinate transformations for the board.
 * 
 * Uses a "virtual canvas" approach:
 * - All calculations use fixed VIRTUAL_CANVAS_SIZE dimensions
 * - SVG viewBox auto-scales to fit actual container
 * - Guarantees consistent proportions regardless of window size
 */
export class LayoutService {
  public layout: Layout;
  
  // Virtual canvas dimensions (fixed size for consistent proportions)
  public pixelWidth: number = VIRTUAL_CANVAS_SIZE;
  public pixelHeight: number = VIRTUAL_CANVAS_SIZE;
  
  public hexCornerString: { [key: string]: string } = {};
  public hexCenters: { [key: string]: Point } = {};

  constructor(
    private board: Board,
    public HEX_SIZE_FACTOR_ARG: number = HEX_SIZE_FACTOR,
    public X_OFFSET_ARG: number = X_OFFSET,
    public Y_OFFSET_ARG: number = Y_OFFSET,
    public layoutType: "flat" | "pointy" = LAYOUT_TYPE as "flat" | "pointy"
  ) {
    this.layout = this.getLayout();
    this.updateCache();
  }

  private updateCache(): void {
    this.hexCornerString = this.layout.hexCornersStringMap(this.board.hexes);
    this.hexCenters = this.layout.hexCentersMap(this.board.hexes);
  }

  get origin(): Point {
    const x = this.pixelWidth / 2 + this.X_OFFSET_ARG;
    const y = this.pixelHeight / 2 + this.Y_OFFSET_ARG;
    return new Point(x, y);
  }

  get size_hexes(): number {
    return Math.min(this.pixelWidth, this.pixelHeight) / (this.HEX_SIZE_FACTOR_ARG * this.board.NSquares);
  }

  get size_image(): number {
    return this.size_hexes * PIECE_SCALE_FACTOR;
  }

  get hexSize(): Point {
    return new Point(this.size_hexes, this.size_hexes);
  }

  getLayout(): Layout {
    if (this.layoutType === "flat") {
      return new Layout(Layout.flat, this.hexSize, this.origin);
    }
    return new Layout(Layout.pointy, this.hexSize, this.origin);
  }

  getHexCenter(hex: Hex): Point {
    return this.layout.hexToPixel(hex);
  }

  /**
   * Calculates the SVG viewBox string for this board.
   * Uses the bounding box of all hex corners plus minimal padding.
   * 
   * @param padding - Extra padding around the board (default 10)
   * @returns ViewBox string like "minX minY width height"
   */
  public calculateViewBox(padding: number = 10): string {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    this.board.hexes.forEach(hex => {
      const corners = this.layout.polygonCorners(hex);
      corners.forEach(corner => {
        if (corner.x < minX) minX = corner.x;
        if (corner.x > maxX) maxX = corner.x;
        if (corner.y < minY) minY = corner.y;
        if (corner.y > maxY) maxY = corner.y;
      });
    });

    const width = maxX - minX;
    const height = maxY - minY;
    
    return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
  }
}

