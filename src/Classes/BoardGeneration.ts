import { Hex } from "./Hex";

export const generateHexagons = (N: number) => {
  const hexList: Hex[] = [];
  for (let q = -N; q <= N; q++) {
    let r1 = Math.max(-N, -q - N);
    let r2 = Math.min(N, -q + N);
    let color_index = q >= 1 ? -q : q; // Set color_index to q+1 when q >= 1
    for (let r = r1; r <= r2; r++) {
      const s = -q - r;
      const hex = new Hex(q, r, s);
      hex.color_index = color_index; // Add color_index as a property
      hexList.push(hex);
      color_index = color_index + 1;
    }
  }
  return hexList;
};

const initialHighGroundHexes = [
  new Hex(0, 1, -1),
  new Hex(-1, 2, -1),
  new Hex(0, 2, -2),
  new Hex(1, 1, -2),
];

const invertedHighGroundHexes = initialHighGroundHexes.map(
  (hex) => new Hex(-hex.q, -hex.r, -hex.s)
);

export const highGroundHexes = [
  ...initialHighGroundHexes,
  ...invertedHighGroundHexes,
];
