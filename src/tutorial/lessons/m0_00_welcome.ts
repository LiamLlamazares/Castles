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
    description: 'Castles is a fantasy strategy game on a hex board. Protect your Monarch, take castles, and use terrain well.',
    board,
    pieces,
    layout,
    hints: ['Right-click pieces, castles, rivers, high ground, and sanctuaries for details.'],
    instructions: 'Look around the board, then continue.',
  };
}
