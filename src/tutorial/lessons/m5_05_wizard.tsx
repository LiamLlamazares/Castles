import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM5L5(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Wizard, new Hex(-2, 0, 2), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -2, 1), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l5_wizard',
    title: '5.5 Wizard',
    description: <PieceRules type={PieceType.Wizard} intro="The Wizard is a ranged unit with once-per-game magical abilities such as Fireball and Teleport." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: ['Try a normal ranged attack, then inspect the ability controls.'],
    hints: ['Fireball is strongest when enemies are clustered.', 'Teleport is for repositioning rather than direct damage.'],
  };
}
