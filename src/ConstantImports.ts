import { Hex, Layout, Point } from "./Classes/Hex";
import { Piece } from "./Classes/Piece";
import { Board } from "./Classes/Board";
import { Castle } from "./Classes/Castle";
import {
  N_SQUARES,
  HEX_SIZE_FACTOR,
  PieceType,
  LAYOUT_TYPE,
  X_OFFSET,
} from "./Constants";

//Starting board = starting pieces + hexes
function generatePieces(pieceType: PieceType, coordinates: Hex[]): Piece[] {
  const whitePieces = coordinates.map(
    (coordinate) => new Piece(coordinate, "w", pieceType)
  );
  const blackPieces = whitePieces.map(
    (piece) =>
      new Piece(
        new Hex(-piece.hex.q, -piece.hex.r, -piece.hex.s),
        "b",
        pieceType
      )
  );
  return [...whitePieces, ...blackPieces];
}
const boardisSmall = N_SQUARES <= 6;
const swordsmen1 = generatePieces(
  PieceType.Swordsman,
  Array.from({ length: N_SQUARES - 1 }, (_, k) => new Hex(-k, k + 1, -1))
);
const swordsmen2 = generatePieces(
  PieceType.Swordsman,
  Array.from({ length: N_SQUARES - 2 }, (_, k) => new Hex(k + 1, 1, -k - 2))
);
const archers1 = generatePieces(
  PieceType.Archer,
  Array.from(
    { length: Math.max(N_SQUARES - 5) },
    (_, k) => new Hex(-2, N_SQUARES - 1 - k, k + 3 - N_SQUARES)
  )
);
const archers2 = generatePieces(
  PieceType.Archer,
  Array.from(
    { length: Math.max(N_SQUARES - 5, 1) },
    (_, k) => new Hex(2, N_SQUARES - k - 3, k + 1 - N_SQUARES)
  )
);
const knights = generatePieces(
  PieceType.Knight,
  Array.from(
    { length: Math.max(N_SQUARES - 4, 1) },
    (_, k) => new Hex(0, N_SQUARES - 1 - k, k + 1 - N_SQUARES)
  )
);
const trebuchets = generatePieces(PieceType.Trebuchet, [
  new Hex(-3, N_SQUARES - 1, 4 - N_SQUARES),
  new Hex(3, N_SQUARES - 4, 1 - N_SQUARES),
]);
const eagles = generatePieces(PieceType.Eagle, [
  new Hex(-1, N_SQUARES - 2, 3 - N_SQUARES),
  new Hex(1, N_SQUARES - 3, 2 - N_SQUARES),
]);
const giantCoordinates = boardisSmall
  ? [
      new Hex(-1, N_SQUARES - 3, 4 - N_SQUARES),
      new Hex(1, N_SQUARES - 4, 3 - N_SQUARES),
    ]
  : [
      new Hex(-5, N_SQUARES - 1, 6 - N_SQUARES),
      new Hex(5, N_SQUARES - 6, 1 - N_SQUARES),
    ];

const giants = generatePieces(PieceType.Giant, giantCoordinates);
const dragonCoordinates = boardisSmall
  ? [
      new Hex(-2, N_SQUARES - 2, 4 - N_SQUARES),
      new Hex(2, N_SQUARES - 4, 2 - N_SQUARES),
    ]
  : [
      new Hex(-4, N_SQUARES - 1, 5 - N_SQUARES),
      new Hex(4, N_SQUARES - 5, 1 - N_SQUARES),
    ];

const dragons = generatePieces(PieceType.Dragon, dragonCoordinates);
const assassin = generatePieces(PieceType.Assassin, [
  new Hex(-1, N_SQUARES - 1, 2 - N_SQUARES),
]);
const monarch = generatePieces(PieceType.Monarch, [
  new Hex(1, N_SQUARES - 2, 1 - N_SQUARES),
]);

export const startingBoard = new Board(
  [
    ...swordsmen1,
    ...swordsmen2,
    ...knights,
    ...archers1,
    ...archers2,
    ...trebuchets,
    ...eagles,
    ...giants,
    ...dragons,
    ...assassin,
    ...monarch,
  ],

  N_SQUARES - 1
);
export const emptyBoard = new Board([], N_SQUARES - 1);
