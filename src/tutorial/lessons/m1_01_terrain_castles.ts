import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Piece } from '../../Classes/Entities/Piece';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD } from '../constants';

export function createM1L1(): TutorialLesson {
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: TUTORIAL_BOARD_STANDARD_R, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces: Piece[] = [];
  const layout = getStartingLayout(board);

  return {
    id: 'm1_l1_introduction',
    title: '1.1 The board: Castles',
    description: 'Castles can be captured and controlled. Control every castle to win; captured enemy castles can recruit.',
    board,
    pieces,
    sanctuaries: [],
    layout,
    instructions: 'Inspect each castle controller.',
  };
}
