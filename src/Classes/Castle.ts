import { Hex } from "./Hex";
import { Color } from "../Constants";
export class Castle {
  constructor(
    public hex: Hex,
    public color: Color,
    public turns_controlled: number,
    public used_this_turn: boolean = false
  ) {}
  public adjacentHexes(): Hex[] {
    return this.hex.cubeRing(1);
  }
  public isAdjacent(hex: Hex): boolean {
    return this.adjacentHexes().some((castleHex) => castleHex.equals(hex));
  }
  public clone(): Castle {
      return new Castle(this.hex, this.color, this.turns_controlled, this.used_this_turn);
  }
}
