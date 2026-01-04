/**
 * MODULE 1: Board Basics
 * Lesson 1.1: Terrain: Castles
 * 
 * Overview of the game - no interaction required.
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Piece } from '../../Classes/Entities/Piece';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD } from '../constants';

export function createM1L1(): TutorialLesson {
  const boardRadius = TUTORIAL_BOARD_STANDARD_R; // Standard board
  
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: boardRadius,riverCrossingLength: 100,
  hasHighGround: false };
  const board = new Board(boardConfig, castles);
  
  // TODO: Standard starting positions
  const pieces: Piece[] = [];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l1_introduction',
    title: '1.1 The board: Castles',
    description: 'Each army has three castles under their control. Controlling enemy castles allows recruitment of new pieces and provides a path to victory.',
    board,
    pieces,
    sanctuaries: [],
    layout,
    objectives: [
      // No objectives - overview only
    ],
    instructions: 'Right click on a castle for additional information.',
  };
}
