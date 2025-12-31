/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.5: Knight (Cavalry)
 * 
 * Objective: Extended movement capture
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L5(): TutorialLesson {
  const boardRadius = 3; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Knight, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'), // Target
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l5_knight',
    title: '2.5 Knight',
    description: 'Learn the Knight extended movement.',
    board,
    pieces,
    layout,
    objectives: [
      'Use Knight to reach and capture distant enemy',
    ],
    hints: [
      '🐴 Knight: Jumps exactly 2 hexes',
      '➡️ Can jump over other pieces',
      '⚔️ Great for surprise attacks',
    ],
    instructions: 'TODO: Jump to the enemy and capture.',
  };
}
