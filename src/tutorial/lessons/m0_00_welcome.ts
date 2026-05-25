import { N_SQUARES } from '../../Constants';
import { getStartingBoard, getStartingLayout, getStartingPieces } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM0L0(): TutorialLesson {
  const board = getStartingBoard(N_SQUARES);
  const pieces = getStartingPieces(N_SQUARES);
  const layout = getStartingLayout(board);

  return {
    id: 'm0_00_welcome',
    title: '0 Welcome',
    description: 'Castles is a fantasy strategy game on a hex board. You command a Monarch, capture castles, recruit new pieces, and use terrain and sanctuaries to build an advantage.',
    board,
    pieces,
    layout,
    hints: [
      'Every tutorial board is interactive.',
      'Right-click pieces, castles, rivers, high ground, and sanctuaries for details.',
      'Use Previous and Next to move through lessons.',
      'You do not need to solve the whole starting position here; this first board is just for orientation.',
    ],
    instructions: 'Look around the full board. When you are ready, go next to learn what you are trying to achieve.',
  };
}
