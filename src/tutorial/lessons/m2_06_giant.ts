/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.6: Giant
 * 
 * Objective: High strength capture
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L6(): TutorialLesson {
  const boardRadius = 2; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Giant, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(1, -1, 0), 'b'), // Target
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l6_giant',
    title: '2.6 Giant',
    description: 'The Giant has high strength.',
    board,
    pieces,
    layout,
    objectives: [
      'Use Giant to overpower the enemy',
    ],
    hints: [
      '🦣 Giant: Moves 1 hex only',
      '💪 Strength 3 - very powerful',
      '🐢 Slow but strong',
    ],
    instructions: 'TODO: Advance and capture with your Giant.',
  };
}
