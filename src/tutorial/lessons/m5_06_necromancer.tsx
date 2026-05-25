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
    PieceFactory.create(PieceType.Necromancer, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l6_necromancer',
    title: '5.6 Necromancer',
    description: <PieceRules type={PieceType.Necromancer} intro="The Necromancer is a melee unit that becomes more interesting after pieces have died, because it can spend souls to raise a dead friendly piece." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: ['Use the Necromancer as a melee attacker, then inspect its ability text.'],
    hints: ['Raise Dead needs a real game history with dead friendly pieces.', 'This board focuses on its baseline melee role and tooltip information.'],
  };
}
