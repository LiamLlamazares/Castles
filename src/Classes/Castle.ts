import { Hex } from "./Hex";
import { Color } from "../Constants";
export class Castle {
  constructor(
    public hex: Hex,
    public color: Color,
    public turns_controlled: number
  ) {}
  public adjacentHexes(): Hex[] {
    return this.hex.cubeRing(1);
  }
  public isAdjacent(hex: Hex): boolean {
    return this.adjacentHexes().some((castleHex) => castleHex.equals(hex));
  }
}
