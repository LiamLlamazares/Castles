/**
 * MODULE 1: Board Basics
 * Lesson 1.4: Terrain: Sanctuaries
 * 
 * Overview of the game - no interaction required.
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Piece } from '../../Classes/Entities/Piece';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD, TUTORIAL_SANCTUARIES_STANDARD } from '../constants';

export function createM1L4(): TutorialLesson {
  const boardRadius = TUTORIAL_BOARD_STANDARD_R; // Standard board
  
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: boardRadius,riverCrossingLength: 2 };
  const board = new Board(boardConfig, castles);
  
  // TODO: Standard starting positions
  const pieces: Piece[] = [];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l4_terrain_sanctuaries',
    title: '1.4 Terrain: Sanctuaries',
    description: 'Interspersed across the battlefield are sanctuaries. Control of them allows for the recruitment of special units such as wolves, mages, and other mystical creatures.',
    board,
    pieces,
    sanctuaries: [...TUTORIAL_SANCTUARIES_STANDARD],
    layout,
    objectives: [
      // No objectives - overview only
    ],
    instructions: 'Hover and right click on a sanctuary for additional information.',
  };
}
