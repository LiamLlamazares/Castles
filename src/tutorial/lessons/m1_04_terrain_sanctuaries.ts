import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Piece } from '../../Classes/Entities/Piece';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD, TUTORIAL_SANCTUARIES_STANDARD } from '../constants';

export function createM1L4(): TutorialLesson {
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: TUTORIAL_BOARD_STANDARD_R, riverCrossingLength: 2 };
  const board = new Board(boardConfig, castles);
  const pieces: Piece[] = [];
  const layout = getStartingLayout(board);

  return {
    id: 'm1_l4_terrain_sanctuaries',
    title: '1.4 The board: Sanctuaries',
    description: 'Sanctuaries are special sites that can unlock fantasy units. You do not recruit from them like castles; you pledge to them during the Castles phase when the requirements are met.',
    board,
    pieces,
    sanctuaries: [...TUTORIAL_SANCTUARIES_STANDARD],
    layout,
    instructions: 'Right-click a sanctuary to see which special piece it can produce and what it requires.',
  };
}
