
  //Defines the piece class which has a hex, color, and type
  import { Hex } from './Hex';
  export class Piece {
    constructor(public hex: Hex, public color: string, public type: string) {}

    //Returns the legal moves for a piece
    public getLegalMoves(): Hex[] {
        let legalMoves: Hex[] = [];
        let directions: Hex[] = Hex.directions;
        for (let i = 0; i < directions.length; i++) {
            let neighbor: Hex = this.hex.neighbor(i);
            if (neighbor.q >= -3 && neighbor.q <= 3 && neighbor.r >= -3 && neighbor.r <= 3 && neighbor.s >= -3 && neighbor.s <= 3) {
                legalMoves.push(neighbor);
            }
        }
        return legalMoves;
    }
}