/**
 * MODULE 1: Board Basics
 * Lesson 1.5: Terrain - Sanctuaries
 * 
 * Objective: Approach a sanctuary
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM1L4(): TutorialLesson {
  const boardRadius = 6; // Full board
  
  const castles: Castle[] = [
    new Castle(new Hex(-6, 6, 0), 'w', 0),
    new Castle(new Hex(6, -6, 0), 'b', 0),
    new Castle(new Hex(0, -6, 6), 'w', 0),
    new Castle(new Hex(0, 6, -6), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  // TODO: Add sanctuary to board
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l6_terrain_sanctuaries',
    title: '1.6 Terrain: Sanctuaries',
    description: 'Learn about sanctuary hexes.',
    board,
    pieces,
    layout,
    objectives: [
      'Move adjacent to a sanctuary',
    ],
    hints: [
      '🏛️ Sanctuaries grant special units',
      '🙏 Pledge pieces to activate them',
      '⏳ They have cooldowns after use',
    ],
    instructions: 'TODO: Get your piece adjacent to the sanctuary.',
  };
}
