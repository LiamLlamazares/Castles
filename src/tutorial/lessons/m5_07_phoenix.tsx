import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM5L7(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Phoenix, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l7_phoenix',
    title: '5.7 Phoenix',
    description: <PieceRules type={PieceType.Phoenix} intro="The Phoenix is a flying melee unit with a rebirth rule: the first death sends it away temporarily instead of removing it forever." />,
    board,
    pieces,
    layout,
    objectives: ['Fly the Phoenix over the blocker and compare it with the Eagle.'],
    hints: ['The respawn rule needs an actual death to demonstrate fully.', 'For this lesson, focus on the flying movement and strength.'],
  };
}
