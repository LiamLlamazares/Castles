import { Board } from '../Classes/Board';
import {Move} from '../Classes/Move';

  //Defines the piece class which has a hex, color, and type
  import { Hex, Point, Layout } from './Hex';
  import { NSquaresc, PieceType } from '../Constants';



  export class Piece {
    constructor(
      public hex: Hex,
      public color: string,
      public type: PieceType
    ) {
      if (!hex || !color || !type ) {
        throw new Error("Invalid arguments for Piece constructor");
      }
    }
    public swordsmanMoves(): Move[] {
      let moves = [];
      let hex = this.hex;
      let q = hex.q;
      let r = hex.r;
      let s = hex.s;
      let newHex = new Hex(q+1, r - 1, s);
     
        moves.push(new Move(hex, newHex));
      
      newHex = new Hex(q , r-1, s +1);
     
        moves.push(new Move(hex, newHex));
      
      newHex = new Hex(q - 1, r, s+1);
      
        moves.push(new Move(hex, newHex));
      return moves;
    }
    public archerMoves(): Move[] {//archers move the same to any hex in a radius of 1
      let moves = [];
      let hex = this.hex;
      let q = hex.q;
      let r = hex.r;
      let s = hex.s;
      for (let dq = -1; dq <= 1; dq++) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let ds = -1; ds <= 1; ds++) {
            if (dq + dr + ds == 0) {
              let newHex = new Hex(q + dq, r + dr, s + ds);
              
                moves.push(new Move(hex, newHex));
              
            }
          }
        }
      }
      return moves;
    }
    public knightMoves(): Move[] {
      let moves = [];
      let hex = this.hex;
      let q = hex.q;
      let r = hex.r;
      let s = hex.s;
    
      // Define the 2 possible knight move directions
      let knightDirections = [
        { dq: -1, dr: -1, ds: 2 },
        { dq: 1, dr: -2, ds: 1 }
      ];
    
      for (let direction of knightDirections) {
        for (let k = -board.NSquares; k <= board.NSquares; k++) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
          
            moves.push(new Move(hex, newHex));
          
          
        }
      }
    
      return moves;
    }
    public dragonMoves(): Move[] {//Dragons move like the knight in chess, orthogonally two and then 1 diagonally
      let moves = [];
      let hex = this.hex;
      let q = hex.q;
      let r = hex.r;
      let s = hex.s;
    
      // Define the 2 possible knight move directions
      let dragonDirections = [
        { dq: -1, dr: -2, ds: 3 },
        { dq: 1, dr: -3, ds: 2 },
        { dq: 2, dr: -3, ds: 1 },
        { dq: 3, dr: -2, ds: -1 },
        { dq: 3, dr: -1, ds: -2 },
        { dq: 2, dr: 1, ds: -3 }
      ];
    
      for (let direction of dragonDirections) {
        for (let k of [-1, 1]) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
          
            moves.push(new Move(hex, newHex));
          
        }
      }
    
      return moves;
    }
    public legalmoves(): Move[] {
      let moves: Move[] = []; // Initialize the 'moves' variable with an empty array
      switch (this.type) {
        case PieceType.Swordsman:
          moves = this.swordsmanMoves();
          break;
        case PieceType.Archer:
          moves = this.archerMoves();
          break;
        case PieceType.Knight:
          moves = this.knightMoves();
          break;
        case PieceType.Dragon:
          moves = this.dragonMoves();
          break;
      }
      return moves;
    }


      




    public getHex(): Hex {
      return this.hex;
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

  }

  const board = new Board([]);

  export{}