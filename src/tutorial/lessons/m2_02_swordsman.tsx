import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM2L2(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-2, 2, 0), 'w', 0), new Castle(new Hex(2, -2, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 2, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l2_swordsman',
    title: '2.2 Swordsman',
    description: <PieceRules type={PieceType.Swordsman} intro="The Swordsman is the basic forward-moving melee piece. It is weak at home but becomes stronger after crossing into enemy territory." />,
    board,
    pieces,
    layout,
    objectives: [
      {
        id: 'move-and-capture-swordsman',
        text: 'Move into position, then capture the enemy Swordsman.',
        completion: { type: 'event', eventTypes: ['capture'], phase: 'Attack', actorPieceType: PieceType.Swordsman, actorColor: 'w', targetPieceType: PieceType.Swordsman, targetColor: 'b' },
      },
    ],
    hints: ['Swordsmen move forward and attack forward diagonally.', 'If you cannot attack yet, pass through movement until the attack phase.'],
  };
}
