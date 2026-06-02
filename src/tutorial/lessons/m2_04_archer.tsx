import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM2L4(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-3, 3, 0), 'w', 0), new Castle(new Hex(3, -3, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Archer, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l4_archer',
    title: '2.4 Archer',
    description: <PieceRules type={PieceType.Archer} intro="The Archer attacks from a fixed distance instead of capturing by moving onto the target." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: [
      { id: 'attack-at-range-two', text: 'Use the Archer to attack the enemy at range 2.' },
    ],
    hints: ['Archers cannot attack adjacent enemies.', 'Defended enemies can block ranged attacks; the defense lessons cover that soon.'],
  };
}
