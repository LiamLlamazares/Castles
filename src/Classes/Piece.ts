
  //Defines the piece class which has a hex, color, and type
  import { Hex, Point, Layout } from './Hex';
  import { startingBoard } from '../Constants';
//List of all types of pieces
export type PieceType = "Swordsman" | "Archer" | ""
// | "Knight" | "Eagle" | "Giant" | "Assassin" | "Dracon" | "Monarch";

 
export class Piece {
    constructor(
        public hex: Hex, 
        public color: string, 
        public type: PieceType, 
        public position: Point //This is necessary so that the piece can be rendered
    ) {}

    public getHex(): Hex {
        return this.hex;
    }
}