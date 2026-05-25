import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM3L1(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 2, -1), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(-1, 1, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(2, 1, -3), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(2, 0, -2), 'b'),
    PieceFactory.create(PieceType.Dragon, new Hex(-3, 1, 2), 'w'),
    PieceFactory.create(PieceType.Assassin, new Hex(-2, 1, 1), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm3_l1_strength_puzzle',
    title: '3.1 Strength puzzle',
    description: 'Combat is about whether your available attackers can actually finish the capture this phase. Some attacks are legal because they can lead to capture; impossible attacks are filtered out.',
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: [
      'Find the Giant that needs two Swordsman attacks.',
      'Find the Giant that a lone Swordsman cannot legally attack.',
      'Find the target the Dragon can overpower alone.',
    ],
    hints: [
      'Equal or greater total attacking strength captures.',
      'Enemies heal if the phase ends without capture.',
      'Right-click pieces to compare strength.',
    ],
    instructions: 'Use this like a puzzle board: click your pieces and compare which enemy targets are actually legal.',
  };
}
