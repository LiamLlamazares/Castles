import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM2L9(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Assassin, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Monarch, new Hex(0, 0, 0), 'b'),
    PieceFactory.create(PieceType.Giant, new Hex(1, -1, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l9_assassin',
    title: '2.9 Assassin',
    description: <PieceRules type={PieceType.Assassin} intro="The Assassin has huge mobility and a very specific job: threaten Monarchs. It is still only strength 1 against ordinary pieces." />,
    board,
    pieces,
    layout,
    objectives: [
      {
        id: 'threaten-monarch',
        text: 'Move the Assassin toward the Monarch instead of wasting it on the Giant.',
        completion: { type: 'manual' },
      },
    ],
    hints: ['Assassins instantly kill Monarchs.', 'Against non-Monarchs, they still use normal strength rules.'],
  };
}
