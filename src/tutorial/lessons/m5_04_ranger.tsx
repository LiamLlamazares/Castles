import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM5L4(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: true };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Ranger, new Hex(-3, 0, 3), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l4_ranger',
    title: '5.4 Ranger',
    description: <PieceRules type={PieceType.Ranger} intro="The Ranger is an enhanced long-ranged attacker. It moves more flexibly than a Trebuchet and attacks at long range." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: ['Attack the enemy from long range with the Ranger.'],
    hints: ['Like other ranged pieces, distance matters.', 'High ground can extend ranged attacks.'],
  };
}
