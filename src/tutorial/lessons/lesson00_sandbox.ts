/**
 * @file lesson00_sandbox.ts
 * @description Sandbox Mode: Full standard board for free exploration.
 * 
 * This is the default lesson - a complete game board with all pieces
 * for players who want to explore freely or already know the basics.
 */
import { N_SQUARES } from '../../Constants';
import { getStartingPieces, getStartingBoard, getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

/**
 * Creates Sandbox Mode: Full game board for free exploration.
 */
export function createLesson00(): TutorialLesson {
  const board = getStartingBoard(N_SQUARES);
  const pieces = getStartingPieces(N_SQUARES);
  const layout = getStartingLayout(board);
  
  return {
    id: 'lesson00_sandbox',
    title: 'Welcome',
    description: 'Castles is a hex-based strategy game. Each player controls a Monarch and their army. Victory is achieved by capturing the other player\'s Monarch or castles.',
    board,
    pieces,
    layout,
    hints: [
      'Right-click any piece for detailed info',
      'Right-click terrain to learn about it',
      'Press Space or click Pass to skip phases',
      'Press Next when ready',
    ],
    instructions: 'All boards are interactive, click to move freely',
  };
}
