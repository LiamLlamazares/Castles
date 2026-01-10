/**
 * MODULE 3: Combat Mechanics
 * Lesson 3.1: Strength System
 * 
 * Objective: Compare strength outcomes
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM3L1(): TutorialLesson {
  const boardRadius = 2; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Giant, new Hex(-1, 1, 0), 'w'),      // Str 3
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'w'),  // Str 1
    PieceFactory.create(PieceType.Knight, new Hex(1, -1, 0), 'b'),     // Str 2
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm3_l1_strength',
    title: '3.1 Strength System',
    description: 'Learn how piece strength determines combat.',
    board,
    pieces,
    layout,
    objectives: [
      'Compare attack outcomes with different strength',
    ],
    hints: [
      ' Higher strength wins combat',
      ' Equal strength = attacker wins',
      ' Check piece stats with right-click',
    ],
    instructions: 'TODO: Try attacking with different pieces.',
  };
}
