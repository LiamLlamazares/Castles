/**
 * MODULE 1: Board Basics
 * Lesson 1.3: Terrain - High Ground
 * 
 * Objective: Position on high ground
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM1L3(): TutorialLesson {
  const boardRadius = 3; // Small + highlands
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    // TODO: Piece near high ground
    PieceFactory.create(PieceType.Archer, new Hex(-1, 1, 0), 'w'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l5_terrain_highground',
    title: '1.5 Terrain: High Ground',
    description: 'Learn the defensive advantage of high ground.',
    board,
    pieces,
    layout,
    objectives: [
      'Move your piece onto high ground',
    ],
    hints: [
      '⛰️ High ground gives defensive bonuses',
      '🛡️ Pieces on high ground are harder to attack',
      '👁️ Great position for Archers',
    ],
    instructions: 'TODO: Position your Archer on the high ground.',
  };
}
