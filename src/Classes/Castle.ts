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
}
