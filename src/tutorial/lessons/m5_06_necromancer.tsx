import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM5L6(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Necromancer, new Hex(-2, 1, 1), 'w'),
  ];
  const graveyard = [PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w')];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l6_necromancer',
    title: '5.6 Necromancer',
    description: <PieceRules type={PieceType.Necromancer} intro="The Necromancer starts with 1 soul, gains another soul when it captures, and can spend 1 soul to raise any one dead friendly piece." />,
    board,
    pieces,
    graveyard,
    layout,
    initialTurnCounter: 2,
    objectives: [
      { id: 'raise-dead-adjacent-hex', text: 'Select the Necromancer and use Raise Dead on an adjacent empty hex.' },
    ],
    hints: [
      'Raise Dead is an Attack-phase ability. It is not a capture, but it spends the Necromancer\'s attack action.',
      'If no other attacks remain after Raise Dead, the game may automatically advance out of the Attack phase.',
      'Raise Dead costs exactly 1 soul, no matter the revived piece\'s strength.',
      'A Necromancer starts with 1 soul and gains +1 more only when the Necromancer itself captures.',
      'The raised piece comes from the friendly graveyard and is exiled if it dies again.',
    ],
  };
}
