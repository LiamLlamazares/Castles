import { Hex, Layout, Point } from "./Classes/Hex";
import { Piece } from "./Classes/Piece";
import { Board } from "./Classes/Board";
import { Castle } from "./Classes/Castle";
import {
  NSquaresc,
  HEX_SIZE_FACTORc,
  PieceType,
  layoutTypec,
  X_OFFSETc,
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
const boardisSmall = NSquaresc <= 6;
const swordsmen1 = generatePieces(
  PieceType.Swordsman,
  Array.from({ length: NSquaresc - 1 }, (_, k) => new Hex(-k, k + 1, -1))
);
const swordsmen2 = generatePieces(
  PieceType.Swordsman,
  Array.from({ length: NSquaresc - 2 }, (_, k) => new Hex(k + 1, 1, -k - 2))
);
const archers1 = generatePieces(
  PieceType.Archer,
  Array.from(
    { length: Math.max(NSquaresc - 5) },
    (_, k) => new Hex(-2, NSquaresc - 1 - k, k + 3 - NSquaresc)
  )
);
const archers2 = generatePieces(
  PieceType.Archer,
  Array.from(
    { length: Math.max(NSquaresc - 5, 1) },
    (_, k) => new Hex(2, NSquaresc - k - 3, k + 1 - NSquaresc)
  )
);
const knights = generatePieces(
  PieceType.Knight,
  Array.from(
    { length: Math.max(NSquaresc - 4, 1) },
    (_, k) => new Hex(0, NSquaresc - 1 - k, k + 1 - NSquaresc)
  )
);
const trebuchets = generatePieces(PieceType.Trebuchet, [
  new Hex(-3, NSquaresc - 1, 4 - NSquaresc),
  new Hex(3, NSquaresc - 4, 1 - NSquaresc),
]);
const eagles = generatePieces(PieceType.Eagle, [
  new Hex(-1, NSquaresc - 2, 3 - NSquaresc),
  new Hex(1, NSquaresc - 3, 2 - NSquaresc),
]);
const giantCoordinates = boardisSmall
  ? [
      new Hex(-1, NSquaresc - 3, 4 - NSquaresc),
      new Hex(1, NSquaresc - 4, 3 - NSquaresc),
    ]
  : [
      new Hex(-5, NSquaresc - 1, 6 - NSquaresc),
      new Hex(5, NSquaresc - 6, 1 - NSquaresc),
    ];

const giants = generatePieces(PieceType.Giant, giantCoordinates);
const dragonCoordinates = boardisSmall
  ? [
      new Hex(-2, NSquaresc - 2, 4 - NSquaresc),
      new Hex(2, NSquaresc - 4, 2 - NSquaresc),
    ]
  : [
      new Hex(-4, NSquaresc - 1, 5 - NSquaresc),
      new Hex(4, NSquaresc - 5, 1 - NSquaresc),
    ];

const dragons = generatePieces(PieceType.Dragon, dragonCoordinates);
const assassin = generatePieces(PieceType.Assassin, [
  new Hex(-1, NSquaresc - 1, 2 - NSquaresc),
]);
const monarch = generatePieces(PieceType.Monarch, [
  new Hex(1, NSquaresc - 2, 1 - NSquaresc),
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

  NSquaresc - 1
);
export const emptyBoard = new Board([], NSquaresc - 1);


