import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM5L3(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Healer, new Hex(1, 1, -2), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l3_healer',
    title: '5.3 Healer',
    description: <PieceRules type={PieceType.Healer} intro="The Healer does not attack. Its passive aura stands near friendly pieces and makes them stronger." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 0,
    objectives: ['Move the Swordsman and Healer so both stand beside the Giant, then use the strengthened Swordsman to capture it.'],
    hints: [
      'You do not activate the Healer. The strength bonus is passive.',
      'The Swordsman begins on White\'s side of the river, so its strength 2 comes from the Healer aura, not the river bonus.',
      'Move the Swordsman to the owner-side hex beside the Giant, and move the Healer next to that Swordsman.',
    ],
  };
}
