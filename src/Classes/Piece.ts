import { Board } from '../Classes/Board';
import { RenderHex } from '../Classes/RenderHex';
import {Move} from '../Classes/Move';

  //Defines the piece class which has a hex, color, and type
  import { Hex} from './Hex';
  import { PieceType, Color, NSquaresc } from '../Constants';



  export class Piece {
    constructor(
      public hex: Hex,
      public color: Color,
      public type: PieceType
    ) {
      if (!hex || !color || !type ) {
        throw new Error("Invalid arguments for Piece constructor");
      }
    }
    public swordsmanMoves(blockedhexes: Hex[]): Move[] {
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
        moves = moves.filter((move) => !blockedhexes.some((hex) => hex.equals(move.end)));
      return moves;
    }
    public archerMoves(blockedhexes: Hex[]): Move[] {//archers move the same to any hex in a radius of 1
      let moves = [];
      let hex = this.hex;
      let q = hex.q;
      let r = hex.r;
      let s = hex.s;
      for (let dq = -1; dq <= 1; dq++) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let ds = -1; ds <= 1; ds++) {
            if (dq + dr + ds === 0 && (dq !== 0 || dr !== 0 || ds !== 0)) {
              let newHex = new Hex(q + dq, r + dr, s + ds);
              
                moves.push(new Move(hex, newHex));
              
            }
          }
        }
      }
      moves= moves.filter((move) => !blockedhexes.some((hex) => hex.equals(move.end)));
      return moves;
    }
    public knightMoves(blockedhexes: Hex[]): Move[] {
      let moves = [];
      let hex = this.hex;
      let q = hex.q;
      let r = hex.r;
      let s = hex.s;

      // Define the 2 possible knight move directions
      let knightDirections = [
        { dq: -1, dr: -1, ds: 2 },
        { dq: 1, dr: -2, ds: 1 },
        {dq:2,dr:-1,ds:-1},
      ];

      for (let direction of knightDirections) {
        // Check moves in the positive direction
        for (let k = 1; k <= board.NSquares; k++) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
           
          if (!blockedhexes.some((hex) => hex.equals(newHex))) {
            moves.push(new Move(hex, newHex));
          } else {
            break;
          }
        }
      
        // Check moves in the negative direction
        for (let k = -1; k >= -board.NSquares; k--) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
           
          if (!blockedhexes.some((hex) => hex.equals(newHex))) {
            moves.push(new Move(hex, newHex));
          } else {
            break;
          }
        }
      }
      
      return moves;
    }
    public dragonMoves(blockedhexes: Hex[]): Move[] {//Dragons move like the knight in chess, orthogonally two and then 1 diagonally
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
    public assassinsMoves(blockedhexes: Hex[]): Move[] {//Assassins move like the queen in chess
      let moves = [];
      let hex = this.hex;
      let q = hex.q;
      let r = hex.r;
      let s = hex.s;
      let assassinDirections = [
        { dq: 0, dr: -1, ds: 1 },
        { dq: 1, dr: -2, ds: 1 },
        { dq: 1, dr: -1, ds: 0 },
        { dq: 2, dr: -1, ds: -1 },
        { dq: 1, dr: 0, ds: -1 },
        { dq: 1, dr: 1, ds: -2 }
      ];

      for (let direction of assassinDirections) {
        // Check moves in the positive direction
        for (let k = 1; k <= 2 * NSquaresc; k++) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
          
          if (!blockedhexes.some((hex) => hex.equals(newHex))) {
            moves.push(new Move(hex, newHex));
          } else {
            break;
          }
        }
    
        // Check moves in the negative direction
        for (let k = -1; k >= -2 * NSquaresc; k--) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
          
          if (!blockedhexes.some((hex) => hex.equals(newHex))) {
            moves.push(new Move(hex, newHex));
          } else {
            break;
          }
        }
      }
    
      return moves;
    }
    public giantMoves(blockedhexes: Hex[]): Move[] {//Giants move like the rook in chess
      let moves = [];
      let hex = this.hex;
      let q = hex.q;
      let r = hex.r;
      let s = hex.s;
      let giantDirections = [
        { dq: 0, dr: -1, ds: 1 },
        { dq: 1, dr: -1, ds: 0 },
        { dq: 1, dr: 0, ds: -1 },
      ];

      for (let direction of giantDirections) {
        // Check moves in the positive direction
        for (let k = 1; k <= 2 * NSquaresc; k++) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
          
          if (!blockedhexes.some((hex) => hex.equals(newHex))) {
            moves.push(new Move(hex, newHex));
          } else {
            break;
          }
        }
    
        // Check moves in the negative direction
        for (let k = -1; k >= -2 * NSquaresc; k--) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
          
          if (!blockedhexes.some((hex) => hex.equals(newHex))) {
            moves.push(new Move(hex, newHex));
          } else {
            break;
          }
        }
      }
      return moves;
    }
    public monarchMoves(blockedhexes: Hex[]): Move[] {//Moves the same as archer
      return this.archerMoves(blockedhexes);
    }

    public legalmoves(blockedhexes: Hex[]): Move[] {
      let moves: Move[] = []; // Initialize the 'moves' variable with an empty array
      switch (this.type) {
        case PieceType.Swordsman:
          moves = this.swordsmanMoves(blockedhexes);
          break;
        case PieceType.Archer:
          moves = this.archerMoves(blockedhexes);
          break;
        case PieceType.Knight:
          moves = this.knightMoves(blockedhexes);
          break;
        case PieceType.Giant:
          moves = this.giantMoves(blockedhexes);
          break;
        case PieceType.Dragon:
          moves = this.dragonMoves(blockedhexes);
          break;
        case PieceType.Assassin:
          moves = this.assassinsMoves(blockedhexes);
          break;
        case PieceType.Monarch:
          moves = this.monarchMoves(blockedhexes);
          break;
      }

      return moves;
    }
                                      //LEGAL ATTACK LOGIC //
    private isValidAttack(newHex: Hex, board: RenderHex[]): boolean {
      return board.some(
        (hex) => 
          hex.q === newHex.q && 
          hex.r === newHex.r && 
          hex.s === newHex.s && 
          hex.piece !== undefined && 
          hex.piece.color !== this.color
      );
    }
    public meleeAttacks(board: RenderHex[]): Move[] {
      let attacks = [];
      let hex = this.hex;
      // let q = hex.q;
      // let r = hex.r;
      // let s = hex.s;

      // Array of potential moves
      // let potentialAttacks = [
      //   new Hex(q+1, r - 1, s),
      //   new Hex(q+1, r, s-1),
      //   new Hex(q, r + 1, s-1),
      //   new Hex(q , r-1, s +1),
      //   new Hex(q - 1, r+1, s),
      //   new Hex(q - 1, r, s+1)
      // ];
      let potentialAttacks =  hex.cubeRing(1);

      // Loop over each potential move
      for (let newHex of potentialAttacks) {
        if (this.isValidAttack(newHex, board)) {
          attacks.push(new Move(hex, newHex));
        }
      }

      return attacks;
    }
    public rangedAttacks(board: RenderHex[]): Move[] {
      let attacks = [];
      let hex = this.hex;
      let potentialAttacks =  hex.cubeRing(2);

      // Loop over each potential move
      for (let newHex of potentialAttacks) {
        if (this.isValidAttack(newHex, board)) {
          attacks.push(new Move(hex, newHex));
        }
      }

      return attacks;
    }
    public legalAttacks(board: RenderHex[]): Move[] {
      let attacks: Move[] = [];

      switch (this.type) {
        case PieceType.Swordsman:
        case PieceType.Knight:
        case PieceType.Giant:
        case PieceType.Dragon:
        case PieceType.Assassin:
        case PieceType.Monarch:
          attacks = this.meleeAttacks(board);
          break;
        case PieceType.Archer:
        case PieceType.Trebuchet:
          attacks = this.rangedAttacks(board);
          break;
      }

      return attacks;
    }

      




    public getHex(): Hex {
      return this.hex;
    }



    public setHex(newHex: Hex): void {
      this.hex = newHex;
    }

    public setColor(color: Color): void {
      this.color = color;
    }

    public getColor(): Color {
      return this.color;
    }

    public getType(): PieceType {
      return this.type;
    }

  }

  const board = new Board([]);

  export{}