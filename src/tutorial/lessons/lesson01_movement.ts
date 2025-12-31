/**
 * @file lesson01_movement.ts
 * @description Lesson 1: Basic Movement
 * 
 * Teaches players how pieces move on the hexagonal board.
 * Uses a small board with a few pieces to keep focus on movement patterns.
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

/**
 * Creates Lesson 1: Movement Basics
 * 
 * Small 5x5 board with:
 * - Knight (to show ranged movement)
 * - Swordsman (to show forward-diagonal movement)
 * - Giant (to show single-hex movement)
 */
export function createLesson01(): TutorialLesson {
  const boardRadius = 2; // 5x5 board
  
  // Minimal castles (required by board)
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  // Place a few white pieces to demonstrate movement
  const pieces = [
    // Knight in center - can jump 2 hexes
    PieceFactory.create(PieceType.Knight, new Hex(0, 0, 0), 'w'),
    
    // Swordsman near bottom - moves diagonally forward
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 2, -1), 'w'),
    
    // Giant - simple adjacent movement
    PieceFactory.create(PieceType.Giant, new Hex(1, 0, -1), 'w'),
  ];
  
  // Use standard layout - viewBox handles scaling automatically
  const layout = getStartingLayout(board);
  
  return {
    id: 'lesson01_movement',
    title: 'Lesson 1: Movement',
    description: 'Learn how pieces move on the hexagonal board.',
    board,
    pieces,
    layout,
    objectives: [
      'Click a piece to see its legal moves (green dots)',
      'Move each piece to explore its movement pattern',
      'Notice how different pieces have different movement ranges',
    ],
    hints: [
      '🐴 Knight: Jumps exactly 2 hexes in any direction',
      '⚔️ Swordsman: Moves diagonally forward only',
      '🦣 Giant: Moves 1 hex in any direction',
    ],
    instructions: 'Click on each piece to see how it can move. Green dots show legal destinations.',
  };
}
