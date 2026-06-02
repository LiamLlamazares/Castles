import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM5L9(): TutorialLesson {
  const castles: Castle[] = [
    new Castle(new Hex(-4, 4, 0), 'w', 0),
    new Castle(new Hex(4, -4, 0), 'b', 0),
    new Castle(new Hex(-4, 1, 3), 'w', 0),
    new Castle(new Hex(4, -1, -3), 'b', 0),
  ];
  const boardConfig: BoardConfig = { nSquares: 5, riverCrossingLength: 2, hasHighGround: true };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Monarch, new Hex(-2, 4, -2), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 3, -1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 3, -2), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(-4, 3, 1), 'w'),
    PieceFactory.create(PieceType.Monarch, new Hex(2, -4, 2), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(2, -3, 1), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -3, 2), 'b'),
    PieceFactory.create(PieceType.Archer, new Hex(3, -3, 0), 'b'),
    PieceFactory.create(PieceType.Knight, new Hex(4, -3, -1), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l9_walkthrough',
    title: '5.9 Practice game',
    description: 'A compact practice position that uses the core concepts together: phases, terrain, attacks, castles, and Monarch safety.',
    board,
    pieces,
    layout,
    objectives: [
      { id: 'play-both-sides', text: 'Play a few turns from both sides.' },
      { id: 'capture-and-recruit', text: 'Try to capture an enemy castle and then recruit from it.' },
      { id: 'protect-monarchs-and-castles', text: 'Keep both Monarch safety and castle control in mind.' },
    ],
    hints: [
      'You now know enough to use the normal game screen.',
      'If something feels surprising, right-click the piece or terrain before assuming it is a bug.',
    ],
    instructions: 'This is the final tutorial sandbox: play naturally and test the systems together.',
  };
}
