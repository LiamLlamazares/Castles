import { Hex } from './Classes/Hex';
import { Piece} from './Classes/Piece';
import {Board} from './Classes/Board';


export type PieceType = "Swordsman" | "Archer" 
// | "Knight" | "Eagle" | "Giant" | "Assassin" | "Dracon" | "Monarch";


//Size of board
export const NSquaresc = 5;
export const HEX_SIZE_FACTORc = 4;
export const X_OFFSETc = 100;
export const layoutTypec = "flat";

//Starting board = starting pieces + hexes
export const startingBoard = new Board(
[
    new Piece(new Hex(0, 0, 0), "red", "Swordsman",new Board([]).getHexCenter(new Hex(0, 0, 0))),
    new Piece(new Hex(1, 0, -1), "red", "Archer", new Board([]).getHexCenter(new Hex(1, 0, -1))),
]
,
NSquaresc

)

export{}