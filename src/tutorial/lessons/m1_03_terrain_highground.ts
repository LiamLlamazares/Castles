/**
 * MODULE 1: Board Basics
 * Lesson 1.3: Terrain: High Ground
 * 
 * Overview of the game - no interaction required.
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Piece } from '../../Classes/Entities/Piece';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD } from '../constants';

export function createM1L3(): TutorialLesson {
  const boardRadius = TUTORIAL_BOARD_STANDARD_R; // Standard board
  
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: boardRadius,riverCrossingLength: 2 };
  const board = new Board(boardConfig, castles);
  
  // TODO: Standard starting positions
  const pieces: Piece[] = [];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l3_terrain_highground',
    title: '1.3 The board: High Ground',
    description: 'High ground on the battlefield gives ranged pieces a strategic advantage, allowing them to reach further with their attacks.',
    board,
    pieces,
    sanctuaries: [],
    layout,
    objectives: [
      // No objectives - overview only
    ],
    instructions: 'Right click on a high ground hex for additional information.',
  };
}
