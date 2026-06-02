import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM2L10(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Dragon, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l10_dragon',
    title: '2.10 Dragon',
    description: <PieceRules type={PieceType.Dragon} intro="The Dragon is the strongest standard recruitable piece. It flies in long L-shaped jumps, ignores blockers on the way, and attacks adjacent enemies." />,
    board,
    pieces,
    layout,
    objectives: [
      { id: 'jump-and-capture-giant', text: 'Use the Dragon jump to get next to the Giant, then capture it.' },
    ],
    hints: ['The Dragon flies over blockers but cannot land on an occupied hex.', 'Strength 3 makes it dangerous even to Giants and Monarchs.'],
  };
}
