import { Hex } from './Classes/Hex';
import { Piece} from './Classes/Piece';
import {Board} from './Classes/Board';
import { NSquaresc, PieceType } from './Constants';


//Starting board = starting pieces + hexes
export const startingBoard = new Board(
    [
        new Piece(new Hex(0, 0, 0), "red", PieceType.Swordsman,new Board([]).getHexCenter(new Hex(0, 0, 0))),
        new Piece(new Hex(1, 0, -1), "red", PieceType.Archer, new Board([]).getHexCenter(new Hex(1, 0, -1))),
    ]
    ,
    NSquaresc
    
    )