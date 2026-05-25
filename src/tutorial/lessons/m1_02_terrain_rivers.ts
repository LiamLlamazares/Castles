import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Piece } from '../../Classes/Entities/Piece';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD } from '../constants';

export function createM1L2(): TutorialLesson {
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: TUTORIAL_BOARD_STANDARD_R, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces: Piece[] = [];
  const layout = getStartingLayout(board);

  return {
    id: 'm1_l2_terrain_rivers',
    title: '1.2 The board: Rivers',
    description: 'Rivers divide the battlefield. Ground pieces cannot stop on river hexes, but fords and flying movement create crossing routes.',
    board,
    pieces,
    sanctuaries: [],
    layout,
    instructions: 'Right-click a river hex and a normal hex beside it. Recruitment and promotion cannot happen on river hexes.',
  };
}
