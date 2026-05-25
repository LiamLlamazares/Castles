import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM5L1(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: true };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Wolf, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Healer, new Hex(-2, 3, -1), 'w'),
    PieceFactory.create(PieceType.Ranger, new Hex(-1, 3, -2), 'w'),
    PieceFactory.create(PieceType.Wizard, new Hex(0, 3, -3), 'w'),
    PieceFactory.create(PieceType.Necromancer, new Hex(1, 2, -3), 'w'),
    PieceFactory.create(PieceType.Phoenix, new Hex(2, 1, -3), 'w'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l1_special_units',
    title: '5.1 Special units overview',
    description: 'Special units come from sanctuaries. This section is optional, but useful once you understand movement, attacks, castles, recruitment, and pledging.',
    board,
    pieces,
    layout,
    objectives: ['Right-click each special unit to preview its role.'],
    hints: ['The next lessons isolate each special unit one at a time.'],
    instructions: 'This is a lineup, not a puzzle. Continue for individual special-unit lessons.',
  };
}
