import { Hex, Layout, Point } from './Hex';
import { Board } from './Board';
import { HEX_SIZE_FACTOR, X_OFFSET, Y_OFFSET, LAYOUT_TYPE, PIECE_SCALE_FACTOR } from '../Constants';

/**
 * Manages the visual layout and coordinate transformations for the board.
 * Separate from the logical Board model.
 */
export class LayoutService {
  public layout: Layout;
  public pixelWidth: number = 800; // Default
  public pixelHeight: number = 600; // Default
  
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

  public updateDimensions(width: number, height: number): void {
    this.pixelWidth = width;
    this.pixelHeight = height;
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
}
