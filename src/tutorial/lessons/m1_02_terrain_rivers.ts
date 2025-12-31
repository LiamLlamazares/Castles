/**
 * MODULE 1: Board Basics
 * Lesson 1.2: Terrain: Rivers
 * 
 * Overview of the game - no interaction required.
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Piece } from '../../Classes/Entities/Piece';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD } from '../constants';

export function createM1L2(): TutorialLesson {
  const boardRadius = TUTORIAL_BOARD_STANDARD_R; // Standard board
  
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: boardRadius,riverCrossingLength: 2,
  hasHighGround: false };
  const board = new Board(boardConfig, castles);
  
  // TODO: Standard starting positions
  const pieces: Piece[] = [];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l2_terrain_rivers',
    title: '1.2 Terrain: Rivers',
    description: 'The board is cut in two by a river. Fords in it allow units to pass.',
    board,
    pieces,
    sanctuaries: [],
    layout,
    objectives: [
      // No objectives - overview only
    ],
    instructions: 'Right click on a river for additional information.',
  };
}
