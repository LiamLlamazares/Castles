import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM2L5(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Knight, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(2, 0, -2), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l5_knight',
    title: '2.5 Knight',
    description: <PieceRules type={PieceType.Knight} intro="The Knight is a fast diagonal slider. It moves along diagonal lanes until blocked, then attacks adjacent enemies like a melee piece." />,
    board,
    pieces,
    layout,
    objectives: [
      { id: 'slide-and-capture', text: 'Slide the Knight along a diagonal lane, then capture the target.' },
    ],
    hints: ['The Knight does not jump over blockers.', 'Use right-click to inspect its actual legal moves if the diagonal geometry feels odd at first.'],
  };
}
