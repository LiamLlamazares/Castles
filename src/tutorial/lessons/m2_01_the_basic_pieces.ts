/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.1: The Basic Pieces
 * 
 * Objective: Capture target piece
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L1(): TutorialLesson {
  const boardRadius = 2; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -1, 1), 'b'), // Target
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l1_basic_pieces',
    title: '2.1 The Basic Pieces',
    description: 'Learn how the Swordsman moves and attacks.',
    board,
    pieces,
    layout,
    objectives: [
      'Capture the enemy Swordsman',
    ],
    hints: [
      '⚔️ Swordsman: Moves diagonally forward',
      '🎯 Attack by moving onto enemy hex',
      '💪 Strength 1 - basic infantry unit',
    ],
    instructions: 'TODO: Capture the enemy piece with your Swordsman.',
  };
}
