import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L3(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-3, 3, 0), 'w', 0), new Castle(new Hex(3, -3, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 1, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(2, -2, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l3_swordsman_river',
    title: '2.3 Swordsman river bonus',
    description: 'A Swordsman on the enemy side of the river has strength 2 instead of strength 1. Move from the centre toward the black side, then use the river bonus to capture the Giant.',
    board,
    pieces,
    layout,
    objectives: [
      {
        id: 'cross-river-and-capture-giant',
        text: 'Move the Swordsman one hex up from the centre, then capture the Giant.',
        completion: { type: 'event', eventTypes: ['capture'], phase: 'Attack', actorPieceType: PieceType.Swordsman, actorColor: 'w', targetPieceType: PieceType.Giant, targetColor: 'b' },
      },
    ],
    hints: ['White Swordsmen become stronger on the black side of the board.'],
  };
}
