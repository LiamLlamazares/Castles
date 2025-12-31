/**
 * MODULE 1: Board Basics
 * Lesson 1.3: Terrain - Rivers
 * 
 * Objective: Learn river restrictions
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM1L2(): TutorialLesson {
  const boardRadius = 3; // Small + river
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    // TODO: Pieces on either side of river
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Eagle, new Hex(-2, 2, 0), 'w'),  // Can fly over
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l3_terrain_rivers',
    title: '1.3 Terrain: Rivers',
    description: 'Learn how rivers affect movement.',
    board,
    pieces,
    layout,
    objectives: [
      'See how rivers block ground movement',
      'Watch Eagles fly over rivers',
    ],
    hints: [
      '🌊 Rivers block all ground units',
      '🦅 Eagles can fly over any terrain',
      '🎯 Plan routes around rivers',
    ],
    instructions: 'TODO: Try to cross the river with different pieces.',
  };
}
