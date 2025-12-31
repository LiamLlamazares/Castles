/**
 * MODULE 4: Economy & Control
 * Lesson 4.2: Recruitment Cycle
 * 
 * Objective: See recruitment trigger
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM4L2(): TutorialLesson {
  const boardRadius = 3; // Small
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 2),  // Ready to recruit
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 2, 0), 'w'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm4_l2_recruitment',
    title: '4.2 Recruitment Cycle',
    description: 'Learn the piece recruitment cycle.',
    board,
    pieces,
    layout,
    objectives: [
      'Recruit a piece from your castle',
      'See the cycle indicator change',
    ],
    hints: [
      '🔄 Cycle: Swordsman → Archer → Knight → ...',
      '📍 Click empty hex adjacent to castle',
      '🏰 Only during Castles phase',
    ],
    instructions: 'TODO: Recruit during the Castles phase.',
  };
}
