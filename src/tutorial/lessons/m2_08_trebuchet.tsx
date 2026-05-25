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
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
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
    description: <PieceRules type={PieceType.Trebuchet} intro="The Trebuchet is a long-range attacker. Its range is exact: range 3 normally, or range 4 from high ground. It cannot attack pieces that are closer than that." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: ['Attack the enemy exactly 3 hexes away and notice that the closer enemy is too close.'],
    hints: ['Trebuchets do not attack up to range 3; they attack exactly range 3.', 'Swordsmen on the far side of the river are stronger, so terrain side can change combat math.'],
  };
}
