import { Hex } from './Classes/Hex';
import { Piece} from './Classes/Piece';
import {Board} from './Classes/Board';
import { NSquaresc, PieceType } from './Constants';


//Starting board = starting pieces + hexes
export const startingBoard = new Board(
    [
      new Piece(new Hex(0, 0, 0), "w", PieceType.Swordsman),
      new Piece(new Hex(1, 0, -1), "w", PieceType.Swordsman),
      new Piece(new Hex(2, 0, -2), "w", PieceType.Dragon),
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
      new Piece(new Hex(-3, 0, 3), "w", PieceType.Giant),
      new Piece(new Hex(-4, 0, 4), "w", PieceType.Giant),
      // Monarch
      new Piece(new Hex(-5, 0, 5), "w", PieceType.Monarch),
      // Eagles
      // ... Repeat for the 4 eagles
    ],
    NSquaresc
  );