import { Hex,Layout,Point } from './Classes/Hex';
import { Piece} from './Classes/Piece';
import {Board} from './Classes/Board';
import { NSquaresc,HEX_SIZE_FACTORc, PieceType,layoutTypec,X_OFFSETc, Color } from './Constants';


//Starting board = starting pieces + hexes
function generatePieces(pieceType: PieceType, coordinates: Hex[]): Piece[] {
  const whitePieces = coordinates.map(coordinate => new Piece(coordinate, "w", pieceType));
  const blackPieces = whitePieces.map(piece => new Piece(new Hex(-piece.hex.q, -piece.hex.r, -piece.hex.s), "b", pieceType));
  return [...whitePieces, ...blackPieces];
}
const boardisSmall = NSquaresc <= 6;
const swordsmen1 = generatePieces(PieceType.Swordsman, Array.from({length: NSquaresc-1}, (_, k) => new Hex(-k, k+1, -1)));
const swordsmen2 = generatePieces(PieceType.Swordsman, Array.from({length: NSquaresc-2}, (_, k) => new Hex(k+1, 1, -k-2)));
const archers1 = generatePieces(PieceType.Archer, Array.from({length: Math.max(NSquaresc-5)}, (_, k) => new Hex(-2, NSquaresc-1-k, k+3-NSquaresc)));
const archers2 = generatePieces(PieceType.Archer, Array.from({length: Math.max(NSquaresc-5,1)}, (_, k) => new Hex(2, NSquaresc-k-3, k+1-NSquaresc)));
const knights = generatePieces(PieceType.Knight, Array.from({length: Math.max(NSquaresc-4,1)}, (_, k) => new Hex(0, NSquaresc-1-k, k+1-NSquaresc)));
const trebuchets = generatePieces(PieceType.Trebuchet, [new Hex(-3, NSquaresc-1, 4-NSquaresc),new Hex(3, NSquaresc-4, 1-NSquaresc)]);
const eagles = generatePieces(PieceType.Eagle, [new Hex(-1, NSquaresc-2, 3-NSquaresc),new Hex(1, NSquaresc-3, 2-NSquaresc)]);
const giantCoordinates = boardisSmall 
  ? [new Hex(-1, NSquaresc-3, 4-NSquaresc), new Hex(1, NSquaresc-4, 3-NSquaresc)]
  : [new Hex(-5, NSquaresc-1, 6-NSquaresc), new Hex(5, NSquaresc-6, 1-NSquaresc)];

const giants = generatePieces(PieceType.Giant, giantCoordinates);
const dragonCoordinates = boardisSmall 
  ? [new Hex(-2, NSquaresc-2, 4-NSquaresc), new Hex(2, NSquaresc-4, 2-NSquaresc)]
  : [new Hex(-4, NSquaresc-1, 5-NSquaresc), new Hex(4, NSquaresc-5, 1-NSquaresc)];

const dragons = generatePieces(PieceType.Dragon, dragonCoordinates);
const assassin = generatePieces(PieceType.Assassin, [new Hex(-1, NSquaresc-1, 2-NSquaresc)]);
const monarch = generatePieces(PieceType.Monarch, [new Hex(1, NSquaresc-2, 1-NSquaresc)]);

export const startingBoard = new Board(
    [...swordsmen1,... swordsmen2, ... knights,...archers1,... archers2,...trebuchets,...eagles,... giants, ...dragons,... assassin,... monarch],
    
    NSquaresc-1
  );

// Grpahical information

const size_hexes =  Math.min(window.innerWidth, window.innerHeight) / (HEX_SIZE_FACTORc * NSquaresc);
const hexSize = new Point(size_hexes, size_hexes);
const origin = new Point(window.innerWidth / 2 + X_OFFSETc, window.innerHeight / 2);
export const layout = new Layout(layoutTypec === "flat" ? Layout.flat : Layout.pointy, hexSize, origin);

//Calculation of river and castle hexes
const isRiver = (center: Point, origin: Point): boolean => {
  return center.y === origin.y; // Return true if the hexagon is at the center
};

const isCastle = (hex: Hex, N: number): boolean => {
  return (hex.q === 0 && Math.abs(hex.r) === N && Math.abs(hex.s) === N) || 
         (hex.r === 0 && Math.abs(hex.q) === N && Math.abs(hex.s) === N) || 
         (hex.s === 0 && Math.abs(hex.q) === N && Math.abs(hex.r) === N); // Return true if the hexagon is at a corner
};
const isWhiteCastle = (hex: Hex, N: number): boolean => {
  if(layout.hexToPixel(hex).y-origin.y > 0) {
    return true;
  }
  return false;
};
const isBlackCastle = (hex: Hex, N: number): boolean => {
  if(layout.hexToPixel(hex).y-origin.y < 0) {
    return true;
  }
  return false;
}


export const riverHexes = startingBoard.hexes.filter((hex: Hex) => isRiver(layout.hexToPixel(hex), origin));
export const castleHexes = startingBoard.hexes.filter((hex: Hex) => isCastle(hex, NSquaresc-1));
export const whiteCastleHexes = castleHexes.filter((hex: Hex) => isWhiteCastle(hex, NSquaresc-1));
export const blackCastleHexes = castleHexes.filter((hex: Hex) => isBlackCastle(hex, NSquaresc-1));
export const colorClassMap: { [key: string]: string } = {};
startingBoard.hexes.forEach((hex: Hex) => {
  colorClassMap[hex.getKey()] = hex.colorClass(riverHexes, castleHexes,whiteCastleHexes,blackCastleHexes);
});


