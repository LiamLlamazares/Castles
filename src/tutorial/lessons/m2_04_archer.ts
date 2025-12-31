/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.4: Archer
 * 
 * Objective: Ranged attack demonstration
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L4(): TutorialLesson {
  const boardRadius = 3; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Archer, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'), // Target at range
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l4_archer',
    title: '2.4 Archer',
    description: 'Learn ranged attacks with the Archer.',
    board,
    pieces,
    layout,
    objectives: [
      'Attack the enemy from range',
    ],
    hints: [
      '🏹 Archer: Attacks at range 2-3',
      '❌ Cannot attack adjacent enemies',
      '🎯 Select Archer, click red dot to attack',
    ],
    instructions: 'TODO: Use your Archer to attack at range.',
  };
}
