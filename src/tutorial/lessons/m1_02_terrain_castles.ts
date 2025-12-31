/**
 * MODULE 1: Board Basics
 * Lesson 1.2: Terrain - Castles
 * 
 * Objective: Stand on a castle
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM1L2(): TutorialLesson {
  const boardRadius = 3; // Small + 3 castles
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(0, 0, 0), 'w', 0),  // Center castle
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    // TODO: Piece near castle to capture
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l2_terrain_castles',
    title: '1.2 Terrain: Castles',
    description: 'Learn about castle hexes and how to capture them.',
    board,
    pieces,
    layout,
    objectives: [
      'Move your piece onto a castle',
    ],
    hints: [
      '🏰 Castles are special hexes with strategic value',
      '🚶 Move onto a castle to control it',
      '📍 Controlled castles let you recruit new pieces',
    ],
    instructions: 'TODO: Move your Swordsman onto the center castle.',
  };
}
