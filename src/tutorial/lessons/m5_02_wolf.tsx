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
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Wolf, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Wolf, new Hex(-1, 2, -1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l2_wolf',
    title: '5.2 Wolf',
    description: <PieceRules type={PieceType.Wolf} intro="Wolves are fast melee pieces that are best when they hunt together." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: ['Attack with a Wolf and compare the clustered pack position.'],
    hints: ['Wolf strength is easiest to understand by keeping Wolves near each other.', 'Right-click both Wolves before attacking.'],
  };
}
