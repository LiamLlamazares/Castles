

//Defines the piece class which has a hex, color, and type
import { Hex, highGroundHexes } from "./Hex";
import {
  PieceType,
  AttackType,
  PieceStrength,
  Color,
  NSquaresc,
} from "../Constants";

import {
  swordsmanMoves,
  archerMoves,
  knightMoves,
  eagleMoves,
  dragonMoves,
  assassinMoves,
  giantMoves,
} from "./MoveStrategies";

export class Piece {
  constructor(
    public hex: Hex,
    public color: Color,
    public type: PieceType,
    public canMove: boolean = true,
    public canAttack: boolean = true,
    public damage: number = 0
  ) {
    if (!hex || !color || !type) {
      throw new Error("Invalid arguments for Piece constructor");
    }
  }
  get Strength(): number {
    return PieceStrength[this.type];
  }
  get AttackType(): string {
    return this.type === PieceType.Archer
      ? AttackType.Ranged
      : this.type === PieceType.Trebuchet
      ? AttackType.longRanged
      : this.type === PieceType.Swordsman
      ? AttackType.Swordsman
      : AttackType.Melee;
  }

  public legalmoves(blockedhexes: Hex[], color: Color): Hex[] {
    let moves: Hex[] = []; 
    switch (this.type) {
      case PieceType.Swordsman:
        moves = swordsmanMoves(this.hex, blockedhexes, color);
        break;
      case PieceType.Archer:
      case PieceType.Trebuchet:
      case PieceType.Monarch:
        moves = archerMoves(this.hex, blockedhexes);
        break;
      case PieceType.Knight:
        moves = knightMoves(this.hex, blockedhexes, NSquaresc);
        break;
      case PieceType.Eagle:
        moves = eagleMoves(this.hex, blockedhexes);
        break;
      case PieceType.Giant:
        moves = giantMoves(this.hex, blockedhexes, NSquaresc);
        break;
      case PieceType.Dragon:
        moves = dragonMoves(this.hex, blockedhexes);
        break;
      case PieceType.Assassin:
        moves = assassinMoves(this.hex, blockedhexes, NSquaresc);
        break;
    }

    return moves;
  }
  //LEGAL ATTACK LOGIC //
  //Enemy hexes are hexes on board that can be attacked
  private isValidAttack(newHex: Hex, enemyHexes: Hex[]): boolean {
    return enemyHexes.some((hex) => hex.equals(newHex));
  }
  public meleeAttacks(enemyHexes: Hex[]): Hex[] {
    let attacks = [];
    let hex = this.hex;
    let potentialAttacks = hex.cubeRing(1);

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
    let potentialAttacks = hex.cubeRing(2);
    if (highGroundHexes.some((hex) => hex.equals(this.hex))) {
      potentialAttacks.push(...hex.cubeRing(3));
    }

    // Loop over each potential move
    for (let newHex of potentialAttacks) {
      if (this.isValidAttack(newHex, enemyHexes)) {
        attacks.push(newHex);
      }
    }
    return attacks;
  }
  public longRangedAttacks(enemyHexes: Hex[]): Hex[] {
    let attacks = [];
    let hex = this.hex;
    let potentialAttacks = hex.cubeRing(3);
    if (highGroundHexes.some((hex) => hex.equals(this.hex))) {
      potentialAttacks.push(...hex.cubeRing(4));
    }

    // Loop over each potential move
    for (let newHex of potentialAttacks) {
      if (this.isValidAttack(newHex, enemyHexes)) {
        attacks.push(newHex);
      }
    }
    return attacks;
  }

  public swordsmanAttacks(enemyHexes: Hex[]): Hex[] {
    let attacks = [];
    let hex = this.hex;
    let q = hex.q;
    let r = hex.r;
    let s = hex.s;
    let offset = this.color === "b" ? -1 : 1;

    let offsets = [
      { q: offset, r: -offset, s: 0 },
      { q: -offset, r: 0, s: offset },
    ];

    for (let offset of offsets) {
      let newHex = new Hex(q + offset.q, r + offset.r, s + offset.s);
      if (enemyHexes.some((hex) => hex.equals(newHex))) {
        attacks.push(newHex);
      }
    }
    return attacks;
  }

  public legalAttacks(enemyHexes: Hex[]): Hex[] {
    if (this.AttackType === AttackType.Melee) {
      return this.meleeAttacks(enemyHexes);
    } else if (this.AttackType === AttackType.Ranged) {
      return this.rangedAttacks(enemyHexes);
    } else if (this.AttackType === AttackType.longRanged) {
      return this.longRangedAttacks(enemyHexes);
    } else {
      return this.swordsmanAttacks(enemyHexes);
    }
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

  public clone(): Piece {
    return new Piece(this.hex, this.color, this.type, this.canMove, this.canAttack, this.damage);
  }
}


