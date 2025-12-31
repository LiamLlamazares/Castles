/**
 * MODULE 3: Combat Mechanics
 * Lesson 3.2: Defense System
 * 
 * Objective: Attack defended vs undefended
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM3L2(): TutorialLesson {
  const boardRadius = 3; // Small
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  // Defended formation
  const pieces = [
    PieceFactory.create(PieceType.Archer, new Hex(-2, 2, 0), 'w'),
    // Defended enemy
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -1, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'), // Adjacent = defender
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm3_l2_defense',
    title: '3.2 Defense System',
    description: 'Learn how adjacent allies provide defense.',
    board,
    pieces,
    layout,
    objectives: [
      'See defended pieces (shield icon)',
      'Try to attack defended vs undefended',
    ],
    hints: [
      '🛡️ Adjacent ally = defended',
      '🏹 Archers cannot attack defended pieces',
      '⚔️ Melee can still attack defended pieces',
    ],
    instructions: 'TODO: Observe how defense blocks ranged attacks.',
  };
}
