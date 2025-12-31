/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.7: Monarch
 * 
 * Objective: Understanding the VIP
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L7(): TutorialLesson {
  const boardRadius = 2; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Monarch, new Hex(0, 0, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w'), // Defender
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l7_monarch',
    title: '2.7 Monarch',
    description: 'Your most important piece - protect it!',
    board,
    pieces,
    layout,
    objectives: [
      'Move your Monarch safely',
      'Keep it protected',
    ],
    hints: [
      '👑 Monarch: Moves 1 hex any direction',
      '💀 Lose your Monarch = lose the game',
      '🛡️ Keep defenders nearby',
    ],
    instructions: 'TODO: Practice keeping your Monarch safe.',
  };
}
