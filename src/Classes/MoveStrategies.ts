import { Hex } from "./Hex";
import { Color, N_SQUARES } from "../Constants";

export const swordsmanMoves = (hex: Hex, blockedhexes: Hex[], color: Color): Hex[] => {
  let moves = [];
  let q = hex.q;
  let r = hex.r;
  let s = hex.s;
  let offset = color === "b" ? -1 : 1;

  let offsets = [
    { q: offset, r: -offset, s: 0 },
    { q: 0, r: -offset, s: offset },
    { q: -offset, r: 0, s: offset },
  ];

  for (let dir of offsets) {
    let newHex = new Hex(q + dir.q, r + dir.r, s + dir.s);
    if (!blockedhexes.some((blockedHex) => blockedHex.equals(newHex))) {
      moves.push(newHex);
    }
  }

  return moves;
};

export const archerMoves = (hex: Hex, blockedhexes: Hex[]): Hex[] => {
  //archers move the same to any hex in a radius of 1
  let moves = hex.cubeRing(1);
  moves = moves.filter(
    (move) => !blockedhexes.some((h) => h.equals(move))
  );
  return moves;
};

export const knightMoves = (hex: Hex, blockedhexes: Hex[], NSquares: number): Hex[] => {
  let moves = [];
  let q = hex.q;
  let r = hex.r;
  let s = hex.s;

  // Define the 2 possible knight move directions
  // Note: Original code used board.NSquares global or similar. We pass NSquares in.
  let knightDirections = [
    { dq: -1, dr: -1, ds: 2 },
    { dq: 1, dr: -2, ds: 1 },
    { dq: 2, dr: -1, ds: -1 },
  ];

  for (let direction of knightDirections) {
    // Check moves in the positive direction
    for (let k = 1; k <= NSquares; k++) {
      let newHex = new Hex(
        q + k * direction.dq,
        r + k * direction.dr,
        s + k * direction.ds
      );

      if (!blockedhexes.some((h) => h.equals(newHex))) {
        moves.push(newHex);
      } else {
        break;
      }
    }

    // Check moves in the negative direction
    for (let k = -1; k >= -NSquares; k--) {
      let newHex = new Hex(
        q + k * direction.dq,
        r + k * direction.dr,
        s + k * direction.ds
      );

      if (!blockedhexes.some((h) => h.equals(newHex))) {
        moves.push(newHex);
      } else {
        break;
      }
    }
  }

  return moves;
};

export const eagleMoves = (hex: Hex, blockedhexes: Hex[]): Hex[] => {
  //The eagle can move to any hex in a radius of 3
  let moves: Hex[] = []; 
  for (let i = 1; i <= 3; i++) {
    moves = [...moves, ...hex.cubeRing(i)];
  }
  return moves.filter(
    (move) => !blockedhexes.some((h) => h.equals(move))
  );
};


export const dragonMoves = (hex: Hex, blockedhexes: Hex[]): Hex[] => {
  //Dragons move like the knight in chess, orthogonally two and then 1 diagonally
  let moves = [];
  let q = hex.q;
  let r = hex.r;
  let s = hex.s;

  let dragonDirections = [
    { dq: -1, dr: -2, ds: 3 },
    { dq: 1, dr: -3, ds: 2 },
    { dq: 2, dr: -3, ds: 1 },
    { dq: 3, dr: -2, ds: -1 },
    { dq: 3, dr: -1, ds: -2 },
    { dq: 2, dr: 1, ds: -3 },
  ];

  for (let direction of dragonDirections) {
    for (let k of [-1, 1]) {
      let newHex = new Hex(
        q + k * direction.dq,
        r + k * direction.dr,
        s + k * direction.ds
      );

      moves.push(newHex);
    }
  }

  return moves.filter(
    (move) => !blockedhexes.some((h) => h.equals(move))
  );
};

export const assassinMoves = (hex: Hex, blockedhexes: Hex[], NSquares: number): Hex[] => {
  //Assassins move like the queen in chess
  let moves = [];
  let q = hex.q;
  let r = hex.r;
  let s = hex.s;
  let assassinDirections = [
    { dq: 0, dr: -1, ds: 1 },
    { dq: 1, dr: -2, ds: 1 },
    { dq: 1, dr: -1, ds: 0 },
    { dq: 2, dr: -1, ds: -1 },
    { dq: 1, dr: 0, ds: -1 },
    { dq: 1, dr: 1, ds: -2 },
  ];

  for (let direction of assassinDirections) {
    // Check moves in the positive direction
    for (let k = 1; k <= 2 * NSquares; k++) {
      let newHex = new Hex(
        q + k * direction.dq,
        r + k * direction.dr,
        s + k * direction.ds
      );

      if (!blockedhexes.some((h) => h.equals(newHex))) {
        moves.push(newHex);
      } else {
        break;
      }
    }

    // Check moves in the negative direction
    for (let k = -1; k >= -2 * NSquares; k--) {
      let newHex = new Hex(
        q + k * direction.dq,
        r + k * direction.dr,
        s + k * direction.ds
      );

      if (!blockedhexes.some((h) => h.equals(newHex))) {
        moves.push(newHex);
      } else {
        break;
      }
    }
  }

  return moves;
};

export const giantMoves = (hex: Hex, blockedhexes: Hex[], NSquares: number): Hex[] => {
  //Giants move like the rook in chess
  let moves = [];
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
    for (let k = 1; k <= 2 * NSquares; k++) {
      let newHex = new Hex(
        q + k * direction.dq,
        r + k * direction.dr,
        s + k * direction.ds
      );

      if (!blockedhexes.some((h) => h.equals(newHex))) {
        moves.push(newHex);
      } else {
        break;
      }
    }

    // Check moves in the negative direction
    for (let k = -1; k >= -2 * NSquares; k--) {
      let newHex = new Hex(
        q + k * direction.dq,
        r + k * direction.dr,
        s + k * direction.ds
      );

      if (!blockedhexes.some((h) => h.equals(newHex))) {
        moves.push(newHex);
      } else {
        break;
      }
    }
  }
  return moves;
};
