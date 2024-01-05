import { Hex } from './Classes/Hex';
import { Piece} from './Classes/Piece';
import {Board} from './Classes/Board';




//Size of board
export const NSquaresc = 5;
export const HEX_SIZE_FACTORc = 4;
export const X_OFFSETc = 100;
export const layoutTypec = "flat";
export enum PieceType {
    Swordsman = "Swordsman",
    Archer = "Archer",
  }

//Starting board = starting pieces + hexes
export const startingBoard = new Board(
[
    new Piece(new Hex(0, 0, 0), "red", PieceType.Swordsman,new Board([]).getHexCenter(new Hex(0, 0, 0))),
    new Piece(new Hex(1, 0, -1), "red", PieceType.Archer, new Board([]).getHexCenter(new Hex(1, 0, -1))),
]
,
NSquaresc

)

export{}