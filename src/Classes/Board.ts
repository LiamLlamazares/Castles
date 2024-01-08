import { Hex, Layout, generateHexagons, Point} from './Hex'; // adjust the path as needed
import { Piece } from './Piece'; // adjust the path as needed
//imports constants
import { NSquaresc, HEX_SIZE_FACTORc, X_OFFSETc, layoutTypec } from '../Constants';
const isRiver = (center: Point, origin: Point): boolean => {
  return center.y === origin.y; // Return true if the hexagon is at the center
};

const isCastle = (hex: Hex, N: number): boolean => {
  return (hex.q === 0 && Math.abs(hex.r) === N && Math.abs(hex.s) === N) || 
         (hex.r === 0 && Math.abs(hex.q) === N && Math.abs(hex.s) === N) || 
         (hex.s === 0 && Math.abs(hex.q) === N && Math.abs(hex.r) === N); // Return true if the hexagon is at a corner
};

export class Board {
  public pieces: Piece[];
  public NSquares: number;
  public hexes: Hex[];
  public layoutType: string;
  public layout: Layout;
  public HEX_SIZE_FACTOR;
  public X_OFFSET;
  
  constructor(pieces: Piece[], NSquares: number = NSquaresc, HEX_SIZE_FACTOR: number =HEX_SIZE_FACTORc, X_OFFSET: number = X_OFFSETc, layoutType: string = layoutTypec) {
    this.pieces = pieces;
    this.NSquares = NSquares;
    this.hexes = generateHexagons(this.NSquares);
    this.HEX_SIZE_FACTOR = HEX_SIZE_FACTOR;
    this.X_OFFSET = X_OFFSET;
    this.layoutType = layoutType;
    this.layout = this.getLayout();
  }

  origin(): Point {
    let x = window.innerWidth / 2 + this.X_OFFSET;
    let y = window.innerHeight / 2;
    return new Point(x, y);
  }
  
  getLayout(): Layout {
    const size_hexes =  Math.min(window.innerWidth, window.innerHeight) / (this.HEX_SIZE_FACTOR * this.NSquares);
    const hexSize = new Point(size_hexes, size_hexes);
    let origin = this.origin();
    if (this.layoutType === "flat") {
      return new Layout(Layout.flat, hexSize, origin);
    } else {
      return new Layout(Layout.pointy, hexSize, origin);
    }
  }

  getCorners(): string[] {
    const hexList = this.hexes;
    const pixels = hexList.map((hex) => this.layout.polygonCorners(hex)
    .map((p) => `${p.x},${p.y}`)
    .join(" "));
    return pixels;
  }

  getCenters(): Point[] {
    const hexList = this.hexes;
    const centers = hexList.map((hex) => this.layout.hexToPixel(hex));
    return centers;
  }
  
  getHexCenter(hex: Hex): Point {
    return this.layout.hexToPixel(hex);
  }

  //Creates a list of hexagons that can be rendered of the form {key, corners, colorClass, center}
  renderHexagons = () => {
    const hexList = generateHexagons(this.NSquares);
    this.layout.sortHexList(hexList);

    const hexagons = hexList.map((hex) => {
      const corners = this.layout
        .polygonCorners(hex)
        .map((p) => `${p.x},${p.y}`)
        .join(" ");
      const center = this.layout.hexToPixel(hex);

      let colorClass = ["hexagon-dark", "hexagon-mid", "hexagon-light"][
        ((hex.color_index % 3) + 3) % 3
      ];
      const hexisaRiver = isRiver(center, this.origin());
      const hexisaCastle = isCastle(hex, this.NSquares);
      if (hexisaRiver) {
        colorClass = "hexagon-river";
      } else if (hexisaCastle) {
        colorClass = "hexagon-castles";
      }
      const piece = this.pieces.find(
        (piece) => piece.hex.q === hex.q && piece.hex.r === hex.r && piece.hex.s === hex.s
      );

      return {
        key: `${hex.q}-${hex.r}-${hex.s}`,
        corners,
        colorClass,
        center,
        piece,
        q: hex.q,
        r: hex.r,
        s: hex.s,
      };
    });

    return hexagons;
  };
}

