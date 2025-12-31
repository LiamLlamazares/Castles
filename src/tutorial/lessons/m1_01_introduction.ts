/**
 * MODULE 1: Board Basics
 * Lesson 1.1: Introduction
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
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  // TODO: Standard starting positions
  const pieces: Piece[] = [];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l1_introduction',
    title: '1.1 Introduction',
    description: 'Welcome to Castles - a hex-based strategy game.',
    board,
    pieces,
    sanctuaries: [],
    layout,
    objectives: [
      // No objectives - overview only
    ],
    hints: [
      '🎮 This is a turn-based strategy game on a hexagonal board',
      '👑 Each player has a Monarch - protect yours, capture theirs',
      '🏰 Control castles to recruit new pieces',
    ],
    instructions: 'Welcome! Explore the board freely. Click Next when ready.',
  };
}
