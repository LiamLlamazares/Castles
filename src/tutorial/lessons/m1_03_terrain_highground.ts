import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Piece } from '../../Classes/Entities/Piece';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD } from '../constants';

export function createM1L3(): TutorialLesson {
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: TUTORIAL_BOARD_STANDARD_R, riverCrossingLength: 2, hasHighGround: true };
  const board = new Board(boardConfig, castles);
  const pieces: Piece[] = [];
  const layout = getStartingLayout(board);

  return {
    id: 'm1_l3_terrain_highground',
    title: '1.3 The board: High Ground',
    description: 'High ground extends ranged attacks. Archers attack at range 2 normally and range 3 from high ground; trebuchets attack at range 3 normally and range 4 from high ground.',
    board,
    pieces,
    sanctuaries: [],
    layout,
    instructions: 'Right-click a high ground hex. Later range lessons let you test the extra reach directly.',
  };
}
