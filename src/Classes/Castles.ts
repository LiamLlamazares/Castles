import { Hex } from "./Hex";
import { Color } from "../Constants";
export class Castles {
  constructor(
    public hex: Hex,
    public color: Color,
    public turns_controlled: number
  ) {}
  public adjacentCastles(): Hex[] {
    return this.hex.cubeRing(1);
  }
}
