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
    PieceFactory.create(PieceType.Healer, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -1, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l3_healer',
    title: '5.3 Healer',
    description: <PieceRules type={PieceType.Healer} intro="The Healer does not attack. Its job is to stand near friendly pieces and make nearby combat safer." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: ['Right-click the Healer, then attack with the nearby Swordsman.'],
    hints: ['The Healer itself has no attack targets.', 'Its value comes from positioning next to friendly pieces.'],
  };
}
