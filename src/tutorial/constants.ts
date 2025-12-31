import { Board, BoardConfig } from '../Classes/Core/Board';
import { Castle } from '../Classes/Entities/Castle';
import { Hex } from '../Classes/Entities/Hex';
import { PieceFactory } from '../Classes/Entities/PieceFactory';
import { Sanctuary } from '../Classes/Entities/Sanctuary';
import { PieceType, SanctuaryType } from '../Constants';
import { getStartingLayout } from '../ConstantImports';
// Board sizes
export const TUTORIAL_BOARD_MINI_R = 2;      // 7-hex cluster
export const TUTORIAL_BOARD_SMALL_R = 3;     // Small scenarios
export const TUTORIAL_BOARD_MEDIUM_R = 4;    // Medium scenarios
export const TUTORIAL_BOARD_STANDARD_R = 5;  // Full game
// Reusable castle configurations
export const TUTORIAL_CASTLES_STANDARD = [
  new Castle(new Hex(0, 4, -4), 'w', 0),
  new Castle(new Hex(0, -4, 4), 'b', 0),
  new Castle(new Hex(-2,4, -2), 'w', 0),
  new Castle(new Hex(2, -4, 2), 'b', 0),
  new Castle(new Hex(-4, 1, 3), 'w', 0),
  new Castle(new Hex(4, -1, -3), 'b', 0),
] as const;
export const TUTORIAL_CASTLES_SMALL = [
  new Castle(new Hex(-3, 3, 0), 'w', 0),
  new Castle(new Hex(3, -3, 0), 'b', 0),
] as const;
export const TUTORIAL_CASTLES_MINI = [
  new Castle(new Hex(-2, 2, 0), 'w', 0),
  new Castle(new Hex(2, -2, 0), 'b', 0),
] as const;

export const TUTORIAL_SANCTUARIES_STANDARD = [
  new Sanctuary(new Hex(4, 1, -5), SanctuaryType.WolfCovenant, 'w', null, 0, false),
  new Sanctuary(new Hex(-4, -1, 5), SanctuaryType.ArcaneRefuge, 'b', null, 0, false),  // Wizard
  // new Sanctuary(new Hex(-5, 4, 1), SanctuaryType.PyreEternal, 'w', null, 0, false),   // Phoenix
  // new Sanctuary(new Hex(5, -4, -1), SanctuaryType.PyreEternal, 'b', null, 0, false),   // Phoenix
] as const;