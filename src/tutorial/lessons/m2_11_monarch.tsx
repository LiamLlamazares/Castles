import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM2L11(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-3, 3, 0), 'w', 0), new Castle(new Hex(3, -3, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Monarch, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'w'),
    PieceFactory.create(PieceType.Monarch, new Hex(1, -1, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l11_monarch',
    title: '2.11 Monarch',
    description: <PieceRules type={PieceType.Monarch} intro="The Monarch is your most important piece. It is strong, but if it is captured, the game ends immediately." />,
    board,
    pieces,
    layout,
    objectives: ['Protect your Monarch and threaten the enemy Monarch.'],
    hints: ['Capturing the enemy Monarch is one of the default win conditions.', 'Assassins are especially dangerous to Monarchs.'],
  };
}
