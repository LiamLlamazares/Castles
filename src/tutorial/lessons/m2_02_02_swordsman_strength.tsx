/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.1: Swordsman
 * 
 * Objective: Capture target piece
 */
import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L2_01(): TutorialLesson {
  const boardRadius = 2; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-1,2, -1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, 1, -2), 'w'), 
    PieceFactory.create(PieceType.Giant, new Hex(0, 0, 0), 'b'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l2_01_swordsman_strength',
    title: '3.1.1 Swordsman: Strength',
    description: (
      <div>
        <p style={{ marginTop: 0 }}>The strength of a piece determines what pieces it can capture. A piece can only be captured when it is attacked by pieces whose strength is greater than or equal to its own strength.</p>
        <p>Enemy pieces heal at the end of turn, so don't waste your attacks if you can't capture the piece!</p>
      </div>
    ),
    board,
    pieces,
    layout,
    objectives: [
      'Capture the enemy giant',
    ],
    instructions: 'The giant has strength 2, so you need two swordmen to attack it. Fortunately, you have two attacks available each turn.',
  };
}
