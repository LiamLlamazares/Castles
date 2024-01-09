import { Board } from '../Classes/Board';

  //Defines the piece class which has a hex, color, and type
  import { Hex} from './Hex';
  import { PieceType, PieceStrength, Color, NSquaresc } from '../Constants';



  export class Piece {
    constructor(
      public hex: Hex,
      public color: Color,
      public type: PieceType,
      public canMove: boolean = true,
      public canAttack: boolean = true,
    ) {
      if (!hex || !color || !type ) {
        throw new Error("Invalid arguments for Piece constructor");
      }
    }
    getStrength(): number {
      return PieceStrength[this.type];
    }
    public swordsmanMoves(blockedhexes: Hex[], color: Color): Hex[] {
      let moves = [];
      let hex = this.hex;
      let q = hex.q;
      let r = hex.r;
      let s = hex.s;
      let offset = color === 'b' ? -1 : 1;
    
      let offsets = [
        { q: offset, r: -offset, s: 0 },
        { q: 0, r: -offset, s: offset },
        { q: -offset, r: 0, s: offset }
      ];
    
      for (let offset of offsets) {
        let newHex = new Hex(q + offset.q, r + offset.r, s + offset.s);
        if (!blockedhexes.some((blockedHex) => blockedHex.equals(newHex))) {
          moves.push(newHex);
        }
      }
    
      return moves;
    }
    public archerMoves(blockedhexes: Hex[]): Hex[] {//archers move the same to any hex in a radius of 1
      let hex = this.hex;
      let moves = hex.cubeRing(1);
      moves = moves.filter((move) => !blockedhexes.some((hex) => hex.equals(move)));
      return moves;
    }
    public knightMoves(blockedhexes: Hex[]): Hex[] {
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
            moves.push(newHex);
          } else {
            break;
          }
        }
      
        // Check moves in the negative direction
        for (let k = -1; k >= -board.NSquares; k--) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
           
          if (!blockedhexes.some((hex) => hex.equals(newHex))) {
            moves.push(newHex);
          } else {
            break;
          }
        }
      }
      
      return moves;
    }
    public eagleMoves(blockedhexes: Hex[]): Hex[] {//The eagle can move to any hex in a radius of 3
      const hex = this.hex;
      let moves: Hex[] = []; // Declare the 'moves' variable
      moves =[... hex.cubeRing(1),...hex.cubeRing(2),...hex.cubeRing(3)];
      moves = moves.filter((move) => !blockedhexes.some((hex) => hex.equals(move)));
      return moves;
    }
    public dragonMoves(blockedhexes: Hex[]): Hex[] {//Dragons move like the knight in chess, orthogonally two and then 1 diagonally
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
          
            moves.push(newHex);
          
        }
      }
    
      return moves.filter((move) => !blockedhexes.some((hex) => hex.equals(move)));
    }
    public assassinsMoves(blockedhexes: Hex[]): Hex[] {//Assassins move like the queen in chess
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
            moves.push(newHex);
          } else {
            break;
          }
        }
    
        // Check moves in the negative direction
        for (let k = -1; k >= -2 * NSquaresc; k--) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
          
          if (!blockedhexes.some((hex) => hex.equals(newHex))) {
            moves.push(newHex);
          } else {
            break;
          }
        }
      }
    
      return moves;
    }
    public giantMoves(blockedhexes: Hex[]): Hex[] {//Giants move like the rook in chess
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
            moves.push(newHex);
          } else {
            break;
          }
        }
    
        // Check moves in the negative direction
        for (let k = -1; k >= -2 * NSquaresc; k--) {
          let newHex = new Hex(q + k * direction.dq, r + k * direction.dr, s + k * direction.ds);
          
          if (!blockedhexes.some((hex) => hex.equals(newHex))) {
            moves.push(newHex);
          } else {
            break;
          }
        }
      }
      return moves;
    }

    public legalmoves(blockedhexes: Hex[], color: Color): Hex[] {
      let moves: Hex[] = []; // Initialize the 'moves' variable with an empty array
      switch (this.type) {
        case PieceType.Swordsman:
          moves = this.swordsmanMoves(blockedhexes, color);
          break;
        case PieceType.Archer:
        case PieceType.Trebuchet:
        case PieceType.Monarch:
          moves = this.archerMoves(blockedhexes);
          break;
        case PieceType.Knight:
          moves = this.knightMoves(blockedhexes);
          break;
        case PieceType.Eagle:
          moves = this.eagleMoves(blockedhexes);
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
      }

      return moves;
    }
                                      //LEGAL ATTACK LOGIC //
//Enemy hexes are hexes on board that can be attacked
    private isValidAttack(newHex: Hex, enemyHexes: Hex[]): boolean {
      return enemyHexes.some( (hex)=> hex.equals(newHex));
    }
    public meleeAttacks(enemyHexes: Hex[]): Hex[] {
      let attacks = [];
      let hex = this.hex;
      let potentialAttacks =  hex.cubeRing(1);

      // Loop over each potential move
      for (let newHex of potentialAttacks) {
        if (this.isValidAttack(newHex, enemyHexes)) {
          attacks.push(newHex);
        }
      }

      return attacks;
    }
    public rangedAttacks(enemyHexes: Hex[]): Hex[] {
      let attacks = [];
      let hex = this.hex;
      let potentialAttacks =  hex.cubeRing(2);

      // Loop over each potential move
      for (let newHex of potentialAttacks) {
        if (this.isValidAttack(newHex, enemyHexes)) {
          attacks.push(newHex);
        }
      }

      return attacks;
    }
    public legalAttacks(enemyHexes: Hex[]): Hex[] {
      let attacks: Hex[] = [];

      switch (this.type) {
        case PieceType.Swordsman:
        case PieceType.Knight:
        case PieceType.Giant:
        case PieceType.Dragon:
        case PieceType.Assassin:
        case PieceType.Monarch:
          attacks = this.meleeAttacks(enemyHexes);
          break;
        case PieceType.Archer:
        case PieceType.Trebuchet:
          attacks = this.rangedAttacks(enemyHexes);
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