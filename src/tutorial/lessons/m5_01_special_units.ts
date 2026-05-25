import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM5L1(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: true };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Wolf, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Wolf, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Ranger, new Hex(-3, 2, 1), 'w'),
    PieceFactory.create(PieceType.Wizard, new Hex(-2, 3, -1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -1, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l1_special_units',
    title: '5.1 Special units',
    description: 'Special units come from sanctuaries. They are powerful but less central than the core rules, so this section is a reference and practice area after the main tutorial.',
    board,
    pieces,
    layout,
    objectives: ['Try the Wolf pack, Ranger range, and Wizard tools.'],
    hints: ['Special abilities use the ability controls when available.', 'Some special pieces are still being tuned, so treat this section as a playground.'],
    instructions: 'Experiment with the special pieces. You can stop here and play a real game, or continue to the full unit reference.',
  };
}
