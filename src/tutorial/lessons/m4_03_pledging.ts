/**
 * MODULE 4: Economy & Control
 * Lesson 4.3: Sanctuary Pledging
 * 
 * Objective: Pledge a piece
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM4L3(): TutorialLesson {
  const boardRadius = 3; // Small
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  // TODO: Add sanctuary to board
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(-1, 2, -1), 'w'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm4_l3_pledging',
    title: '4.3 Sanctuary Pledging',
    description: 'Pledge pieces to sanctuaries.',
    board,
    pieces,
    layout,
    objectives: [
      'Move adjacent to sanctuary',
      'Pledge a piece',
    ],
    hints: [
      '🏛️ Stand adjacent to sanctuary',
      '🙏 Click sanctuary → select piece to pledge',
      '✨ Evolves sanctuary, grants special unit',
    ],
    instructions: 'TODO: Pledge a piece to the sanctuary.',
  };
}
