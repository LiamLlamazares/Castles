import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM2L8(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Trebuchet, new Hex(-3, 2, 1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -1, 1), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l8_trebuchet',
    title: '2.8 Trebuchet',
    description: <PieceRules type={PieceType.Trebuchet} intro="The Trebuchet is a long-range attacker. It is powerful at the right distance but cannot attack enemies that are too close." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: ['Attack the distant enemy and notice that the closer enemy is too close.'],
    hints: ['Trebuchets attack at range 3, or range 4 from high ground.', 'Keep them screened by other pieces.'],
  };
}
