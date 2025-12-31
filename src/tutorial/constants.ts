import { Board, BoardConfig } from '../Classes/Core/Board';
import { Castle } from '../Classes/Entities/Castle';
import { Hex } from '../Classes/Entities/Hex';
import { PieceFactory } from '../Classes/Entities/PieceFactory';
import { PieceType } from '../Constants';
import { getStartingLayout } from '../ConstantImports';
// Board sizes
export const TUTORIAL_BOARD_MINI_R = 2;      // 7-hex cluster
export const TUTORIAL_BOARD_SMALL_R = 3;     // Small scenarios
export const TUTORIAL_BOARD_MEDIUM_R = 4;    // Medium scenarios
export const TUTORIAL_BOARD_STANDARD_R = 6;  // Full game
// Reusable castle configurations
export const TUTORIAL_CASTLES_STANDARD = [
  new Castle(new Hex(-6, 6, 0), 'w', 0),
  new Castle(new Hex(6, -6, 0), 'b', 0),
  new Castle(new Hex(0, 6, -6), 'w', 0),
  new Castle(new Hex(0, -6, 6), 'b', 0),
  new Castle(new Hex(6, 0, -6), 'w', 0),
  new Castle(new Hex(-6, 0, 6), 'b', 0),
] as const;
export const TUTORIAL_CASTLES_SMALL = [
  new Castle(new Hex(-3, 3, 0), 'w', 0),
  new Castle(new Hex(3, -3, 0), 'b', 0),
] as const;
export const TUTORIAL_CASTLES_MINI = [
  new Castle(new Hex(-2, 2, 0), 'w', 0),
  new Castle(new Hex(2, -2, 0), 'b', 0),
] as const;