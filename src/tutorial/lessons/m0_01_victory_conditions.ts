import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM0L1(): TutorialLesson {
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 2),
    new Castle(new Hex(3, -3, 0), 'b', 2, false, 'w'),
  ];
  const boardConfig: BoardConfig = { nSquares: 3 };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(3, -3, 0), 'w'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm0_01_victory_conditions',
    title: '0.1 How to win',
    description: 'One default way to win is to control every castle on the board. This position is already won for White: White controls both castles, including the black-side castle occupied by the white Swordsman.',
    board,
    pieces,
    layout,
    initialTurnCounter: 5,
    objectives: [
      'Right-click both castles and notice that White controls them. Because White controls every castle, White has won.',
    ],
    instructions: 'No need to move here. Just inspect the castles and notice their controller.',
  };
}
