//Render hex is like a hex but includes piece and coordinates of corner and center

import { Point,Hex } from "./Hex";
import { Piece } from "./Piece";

export class RenderHex {
    key: string;
    corners: string;
    colorClass: string;
    center: Point;
    piece: Piece | undefined;
    q: number;
    r: number;
    s: number;
  
    constructor(key: string, corners: string, colorClass: string, center: Point, piece: Piece | undefined, q: number, r: number, s: number) {
      this.key = key;
      this.corners = corners;
      this.colorClass = colorClass;
      this.center = center;
      this.piece = piece;
      this.q = q;
      this.r = r;
      this.s = s;
    }
    public RenderHextoHex(): Hex {
      return new Hex(this.q, this.r, this.s);
    }
  }