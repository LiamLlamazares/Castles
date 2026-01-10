/**
 * MODULE 5: Victory
 * Lesson 5.2: Elimination Victory
 * 
 * Objective: Eliminate enemy Monarch
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM5L2(): TutorialLesson {
  const boardRadius = 4; // Medium
  
  const castles: Castle[] = [
    new Castle(new Hex(-4, 4, 0), 'w', 0),
    new Castle(new Hex(4, -4, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Knight, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Monarch, new Hex(2, -2, 0), 'b'),  // Target
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -1, 0), 'b'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm5_l2_elimination',
    title: '5.2 Elimination Victory',
    description: 'Win by capturing the enemy Monarch.',
    board,
    pieces,
    layout,
    objectives: [
      'Capture the enemy Monarch',
    ],
    hints: [
      'Capture enemy Monarch = instant win',
      'Coordinate your pieces',
      'Watch for defenders',
    ],
    instructions: 'TODO: Eliminate the enemy Monarch.',
  };
}
