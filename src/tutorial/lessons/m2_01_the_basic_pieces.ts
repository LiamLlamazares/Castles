import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L1(): TutorialLesson {
  const castles: Castle[] = [
    new Castle(new Hex(-4, 4, 0), 'w', 0),
    new Castle(new Hex(4, -4, 0), 'b', 0),
  ];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-4, 3, 1), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(-2, 3, -1), 'w'),
    PieceFactory.create(PieceType.Eagle, new Hex(-1, 3, -2), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(0, 3, -3), 'w'),
    PieceFactory.create(PieceType.Trebuchet, new Hex(1, 2, -3), 'w'),
    PieceFactory.create(PieceType.Assassin, new Hex(2, 1, -3), 'w'),
    PieceFactory.create(PieceType.Dragon, new Hex(3, 0, -3), 'w'),
    PieceFactory.create(PieceType.Monarch, new Hex(4, -1, -3), 'w'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l1_basic_pieces',
    title: '2.1 The basic pieces',
    description: 'Your standard army has nine piece types. The next lessons show them one at a time.',
    board,
    pieces,
    layout,
    instructions: 'Use this as a lineup.',
  };
}
