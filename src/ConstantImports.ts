/**
 * Starting board configuration.
 * Defines initial piece positions and creates the game board.
 * 
 * COORDINATE SYSTEM:
 * Uses cube coordinates (q, r, s) where q + r + s = 0.
 * - q: increases eastward (right)
 * - r: increases south-westward (down-left, towards white's side)
 * - s: -q - r (derived)
 * 
 * PIECE PLACEMENT STRATEGY:
 * - White pieces have positive r values (southern half of board)
 * - Black pieces are mirrored: (-q, -r, -s) of white's position
 * - Most piece positions are relative to N_SQUARES (board radius)
 * 
 * VISUAL LAYOUT (n=8, white's perspective):
 * 
 *         (Black's side, r < 0)
 *              ___
 *          ___/   \___
 *         /   \___/   \
 *         \___/   \___/
 *         /   \___/   \
 *         \___/   \___/    ← River (r = 0)
 *         /   \___/   \
 *         \___/   \___/
 *         /   \___/   \
 *              \___/
 *         (White's side, r > 0)
 */
import { Hex } from "./Classes/Entities/Hex";
import { Piece } from "./Classes/Entities/Piece";
import { Board } from "./Classes/Core/Board";
import { LayoutService } from "./Classes/Systems/LayoutService";
import { N_SQUARES, PieceType, Color } from "./Constants";

// =========== PIECE GENERATION HELPERS ===========

/** Small boards (≤6) have different piece positions for better playability */
const IS_SMALL_BOARD = N_SQUARES <= 6;

/**
 * Creates a piece for white at the given coordinates,
 * and its mirrored counterpart for black.
 * 
 * The mirroring reflects through the origin: (q, r, s) → (-q, -r, -s)
 * This places black's pieces on the opposite side of the board.
 */
function createMirroredPair(type: PieceType, q: number, r: number, s: number): Piece[] {
  return [
    new Piece(new Hex(q, r, s), "w" as Color, type),
    new Piece(new Hex(-q, -r, -s), "b" as Color, type),
  ];
}

/**
 * Creates pieces along a line from start coordinates.
 * 
 * @param type - Type of piece to create
 * @param count - Number of pieces in the line
 * @param startQ - Starting q coordinate
 * @param startR - Starting r coordinate  
 * @param deltaQ - Change in q per step
 * @param deltaR - Change in r per step
 * 
 * Example: createLine(Swordsman, 3, 0, 1, -1, 1) creates swordsmen at:
 *   (0, 1, -1), (-1, 2, -1), (-2, 3, -1)
 */
function createLine(
  type: PieceType,
  count: number,
  startQ: number,
  startR: number,
  deltaQ: number,
  deltaR: number
): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const q = startQ + i * deltaQ;
    const r = startR + i * deltaR;
    const s = -q - r;
    pieces.push(...createMirroredPair(type, q, r, s));
  }
  return pieces;
}

// =========== PIECE CONFIGURATIONS ===========
// n = N_SQUARES = board radius (8 for standard board)

const n = N_SQUARES;

// Swordsmen: two lines of pawns
const swordsmen = [
  ...createLine(PieceType.Swordsman, n - 1, 0, 1, -1, 1),      // Left diagonal
  ...createLine(PieceType.Swordsman, n - 2, 1, 1, 1, 0),      // Right diagonal
];

// Knights: vertical line in center
const knights = createLine(PieceType.Knight, Math.max(n - 4, 1), 0, n - 1, 0, -1);

// Archers: two columns
const archers = [
  ...createLine(PieceType.Archer, Math.max(n - 5, 0), -2, n - 1, 0, -1),
  ...createLine(PieceType.Archer, Math.max(n - 5, 1), 2, n - 3, 0, -1),
];

// Fixed position pieces (explicit coordinates)
const trebuchets = [
  ...createMirroredPair(PieceType.Trebuchet, -3, n - 1, 4 - n),
  ...createMirroredPair(PieceType.Trebuchet, 3, n - 4, 1 - n),
];

const eagles = [
  ...createMirroredPair(PieceType.Eagle, -1, n - 2, 3 - n),
  ...createMirroredPair(PieceType.Eagle, 1, n - 3, 2 - n),
];

// Giants and Dragons: different positions based on board size
const giants = IS_SMALL_BOARD
  ? [...createMirroredPair(PieceType.Giant, -1, n - 3, 4 - n),
     ...createMirroredPair(PieceType.Giant, 1, n - 4, 3 - n)]
  : [...createMirroredPair(PieceType.Giant, -5, n - 1, 6 - n),
     ...createMirroredPair(PieceType.Giant, 5, n - 6, 1 - n)];

const dragons = IS_SMALL_BOARD
  ? [...createMirroredPair(PieceType.Dragon, -2, n - 2, 4 - n),
     ...createMirroredPair(PieceType.Dragon, 2, n - 4, 2 - n)]
  : [...createMirroredPair(PieceType.Dragon, -4, n - 1, 5 - n),
     ...createMirroredPair(PieceType.Dragon, 4, n - 5, 1 - n)];

// Unique pieces
const assassins = createMirroredPair(PieceType.Assassin, -1, n - 1, 2 - n);
const monarchs = createMirroredPair(PieceType.Monarch, 1, n - 2, 1 - n);

// =========== BOARD EXPORTS ===========

const allPieces = [
  ...swordsmen,
  ...knights,
  ...archers,
  ...trebuchets,
  ...eagles,
  ...giants,
  ...dragons,
  ...assassins,
  ...monarchs,
];

/** Exported for Game.tsx initial state */
export { allPieces };

export const startingBoard = new Board({ nSquares: N_SQUARES - 1 });
export const emptyBoard = new Board({ nSquares: N_SQUARES - 1 });
export const startingLayout = new LayoutService(startingBoard);
