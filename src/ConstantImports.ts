import { Hex,Layout,Point } from './Classes/Hex';
import { Piece} from './Classes/Piece';
import {Board} from './Classes/Board';
import { NSquaresc,HEX_SIZE_FACTORc, PieceType,layoutTypec,X_OFFSETc } from './Constants';


//Starting board = starting pieces + hexes
export const startingBoard = new Board(
    [
      new Piece(new Hex(0, 0, 0), "w", PieceType.Swordsman),
      new Piece(new Hex(1, 0, -1), "w", PieceType.Swordsman),
      new Piece(new Hex(2, 0, -2), "w", PieceType.Dragon),
      new Piece(new Hex(6, 1, -7), "w", PieceType.Knight),
      // Add more pieces here...
      // Trebuchets
     // new Piece(new Hex(3, 0, -3), "red", PieceType.Trebuchet, new Board([]).getHexCenter(new Hex(3, 0, -3))),
     // new Piece(new Hex(1, 2, -3), "red", PieceType.Trebuchet, new Board([]).getHexCenter(new Hex(4, 0, -4))),
      // Archers
      // ... Repeat for the remaining 6 archers
      // Knights
      // ... Repeat for the 4 knights
      // Dragons
      // ... Repeat for the 2 dragons
      // Assassin
      new Piece(new Hex(3, 0, -3), "w", PieceType.Assassin),
      // Giants
      new Piece(new Hex(-3, 0, 3), "b", PieceType.Giant),
      new Piece(new Hex(-4, 0, 4), "b", PieceType.Giant),
      // Monarch
      new Piece(new Hex(-5, 0, 5), "w", PieceType.Monarch),
      // Eagles
      // ... Repeat for the 4 eagles
    ],
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


export const riverHexes = startingBoard.hexes.filter((hex: Hex) => isRiver(layout.hexToPixel(hex), origin));
export const castleHexes = startingBoard.hexes.filter((hex: Hex) => isCastle(hex, NSquaresc));
export const colorClassMap: { [key: string]: string } = {};
startingBoard.hexes.forEach((hex: Hex) => {
  colorClassMap[hex.getKey()] = hex.colorClass(riverHexes, castleHexes);
});


