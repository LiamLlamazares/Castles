import { Hex, Layout, generateHexagons, Point} from './Hex'; 
import { Piece } from './Piece'; 
//imports constants
import { NSquaresc, HEX_SIZE_FACTORc, X_OFFSETc, layoutTypec } from '../Constants';
import { Castle } from './Castle';


export class Board {
  public pieces: Piece[];
  public NSquares: number;
  public hexes: Hex[];
  public layoutType: string;
  public layout: Layout;
  public HEX_SIZE_FACTOR;
  public X_OFFSET;
  public riverHexes: Hex[];
  public castleHexes: Hex[];
  public whiteCastleHexes: Hex[];
  public blackCastleHexes: Hex[];
  public highGroundHexes: Hex[];
  public colorClassMap: { [key: string]: string };
  public hexCenters: { [key: string]: Point };
  public hexCornerString: { [key: string]: string };
  
  constructor(pieces: Piece[], NSquares: number = NSquaresc, HEX_SIZE_FACTOR: number =HEX_SIZE_FACTORc, X_OFFSET: number = X_OFFSETc, layoutType: string = layoutTypec) {
    this.pieces = pieces;
    this.NSquares = NSquares;
    this.hexes = generateHexagons(this.NSquares);
    this.HEX_SIZE_FACTOR = HEX_SIZE_FACTOR;
    this.X_OFFSET = X_OFFSET;
    this.layoutType = layoutType;
    this.layout = this.getLayout();
    this.riverHexes = this.hexes.filter((hex: Hex) => this.isRiver(this.layout.hexToPixel(hex)));
    this.castleHexes = this.hexes.filter((hex: Hex) => this.isCastle(hex, this.NSquares));
    this.whiteCastleHexes = this.castleHexes.filter((hex: Hex) => this.isWhiteCastle(hex));
    this.blackCastleHexes = this.castleHexes.filter((hex: Hex) => this.isBlackCastle(hex));
    this.highGroundHexes = this.hexes.filter((hex: Hex) => this.isCastle(hex, this.NSquares-2));
    let colorClassMap: { [key: string]: string } = {};
    this.hexes.forEach((hex: Hex) => {
      colorClassMap[hex.getKey()] = hex.colorClass(
        this.riverHexes,
        this.castleHexes,
        this.whiteCastleHexes,
        this.blackCastleHexes
      );
    });
this.colorClassMap = colorClassMap;
  this.hexCornerString = this.layout.hexCornersStringMap(this.hexes);
  this.hexCenters = this.layout.hexCentersMap(this.hexes);
  }


  get origin(): Point {
    let x = window.innerWidth / 2 + this.X_OFFSET;
    let y = window.innerHeight / 2;
    return new Point(x, y);
  }
  get size_hexes(): number {
    return Math.min(window.innerWidth, window.innerHeight) / (this.HEX_SIZE_FACTOR * this.NSquares);
  }
  get hexSize(): Point {
    return new Point(this.size_hexes, this.size_hexes);
  }
  
  
  getLayout(): Layout {
    if (this.layoutType === "flat") {
      return new Layout(Layout.flat, this.hexSize, this.origin);
    } else {
      return new Layout(Layout.pointy, this.hexSize, this.origin);
    }
  }

 public isRiver(center: Point): boolean {
    return center.y === this.origin.y; // Return true if the hexagon is at the center
  }

public isCastle(hex: Hex, N: number): boolean {
  return (
    (hex.q === 0 && Math.abs(hex.r) === N && Math.abs(hex.s) === N) ||
    (hex.r === 0 && Math.abs(hex.q) === N && Math.abs(hex.s) === N) ||
    (hex.s === 0 && Math.abs(hex.q) === N && Math.abs(hex.r) === N)
  ); // Return true if the hexagon is at a corner
};
// const isWhiteCastle = (hex: Hex, N: number): boolean => {
//   if (layout.hexToPixel(hex).y - origin.y > 0) {
//     return true;
//   }
//   return false;
// };

public isWhiteCastle(castleHex: Hex): boolean {
  if (this.layout.hexToPixel(castleHex).y - this.origin.y > 0) {
    return true;
  }
  return false;
}
public isBlackCastle(castleHex: Hex): boolean {
  if (this.layout.hexToPixel(castleHex).y - this.origin.y < 0) {
    return true;
  }
  return false;
}

get Castles(): Castle[] {
  let castles = [];
  for (let hex of this.whiteCastleHexes) {
    let castle = new Castle(hex, 'w', 0);
    castles.push(castle);
  }
  for (let hex of this.blackCastleHexes) {
    let castle = new Castle(hex, 'b', 0);
    castles.push(castle);
  }
  return castles;
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
      const hexisaRiver = this.isRiver(center);
      const hexisaCastle = this.isCastle(hex, this.NSquares);
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

