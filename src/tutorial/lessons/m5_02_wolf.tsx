import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM5L2(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Wolf, new Hex(-3, 2, 1), 'w'),
    PieceFactory.create(PieceType.Wolf, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l2_wolf',
    title: '5.2 Wolf',
    description: <PieceRules type={PieceType.Wolf} intro="Wolves are fast melee pieces that are best when they hunt together." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 0,
    objectives: [
      { id: 'pack-wolves-and-capture', text: 'Move the left Wolf beside the other Wolf, then capture the Giant during the Attack phase.' },
    ],
    hints: [
      'A Wolf moves up to 3 hexes, so it can join the pack quickly.',
      'A Wolf beside another friendly Wolf reaches strength 2 and can defeat a Giant.',
      'Right-click the clustered Wolf before attacking to see the pack bonus.',
    ],
  };
}
