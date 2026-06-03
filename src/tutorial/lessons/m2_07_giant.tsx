import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM2L7(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Giant, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l7_giant',
    title: '2.7 Giant',
    description: <PieceRules type={PieceType.Giant} intro="The Giant is a strong orthogonal slider. It is harder to kill than most basic pieces because it has strength 2." />,
    board,
    pieces,
    layout,
    objectives: [
      {
        id: 'slide-and-overpower',
        text: 'Slide the Giant along a straight lane and overpower the enemy.',
        completion: { type: 'event', eventTypes: ['capture'], phase: 'Attack', actorPieceType: PieceType.Giant, actorColor: 'w', targetPieceType: PieceType.Knight, targetColor: 'b' },
      },
    ],
    hints: ['The Giant cannot slide through occupied hexes.', 'Strength 2 means a lone strength-1 piece usually cannot capture it.'],
  };
}
