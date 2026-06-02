import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L12(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-3, 3, 0), 'w', 0), new Castle(new Hex(3, -3, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -2, 2), 'w'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l12_promotion',
    title: '2.12 Promotion',
    description: (
      <>
        When a Swordsman reaches the opponent&apos;s back edge, it promotes. Choose any standard piece except a Monarch.
      </>
    ),
    board,
    pieces,
    layout,
    objectives: [
      { id: 'promote-swordsman', text: 'Move the Swordsman onto the back edge and choose a promotion.' },
    ],
    hints: ['River hexes cannot be promotion squares.'],
  };
}
