import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM2L6(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Eagle, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 3, -1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l6_eagle',
    title: '2.6 Eagle',
    description: <PieceRules type={PieceType.Eagle} intro="The Eagle is a flying melee piece. It can pass over blockers and rivers, but still captures only by attacking adjacent enemies." />,
    board,
    pieces,
    layout,
    objectives: [
      {
        id: 'fly-past-blockers',
        text: 'Fly past the friendly blockers to the open hex beside the enemy Swordsman.',
        completion: {
          type: 'event',
          eventTypes: ['move'],
          phase: 'Movement',
          actorPieceType: PieceType.Eagle,
          actorColor: 'w',
          sourceHexKey: '-3,3,0',
          targetHexKey: '-1,1,0',
        },
      },
    ],
    hints: [
      'Flying ignores blockers on the route.',
      'The landing hex still must be empty and legal.',
      'After moving the Eagle, use your remaining movement action or press Pass before the Attack phase begins.',
    ],
  };
}
