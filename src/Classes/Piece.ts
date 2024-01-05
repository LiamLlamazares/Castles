import { Board } from '../Classes/Board';

  //Defines the piece class which has a hex, color, and type
  import { Hex, Point, Layout } from './Hex';
  import { NSquaresc, PieceType } from '../Constants';



  export class Piece {
    constructor(
      public hex: Hex,
      public color: string,
      public type: PieceType,
      public position: Point //This is necessary so that the piece can be rendered
    ) {
      if (!hex || !color || !type || !position) {
        throw new Error("Invalid arguments for Piece constructor");
      }
    }

    public getHex(): Hex {
      return this.hex;
    }

    public setPosition(position: Point): void {
      this.position = position;
    }

    public setHex(newHex: Hex): void {
      this.hex = newHex;
    }

    public setColor(color: string): void {
      this.color = color;
    }

    public getColor(): string {
      return this.color;
    }

    public getType(): PieceType {
      return this.type;
    }

    public getPosition(): Point {
      return this.position;
    }
  }

  const board = new Board([]);

  export const startingBoard = new Board(
    [
      new Piece(new Hex(0, 0, 0), "red", PieceType.Swordsman, board.getHexCenter(new Hex(0, 0, 0))),
      new Piece(new Hex(1, 0, -1), "red", PieceType.Archer, board.getHexCenter(new Hex(1, 0, -1))),
    ],
    NSquaresc
  );

  export{}