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
    PieceFactory.create(PieceType.Monarch, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Dragon, new Hex(0, 0, 0), 'w'),
    PieceFactory.create(PieceType.Monarch, new Hex(1, -1, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm0_01_victory_conditions',
    title: '0.1 How to win',
    description: 'There are two default ways to win: capture the enemy Monarch, or control every castle on the board. Some game setups can also enable victory points, but the core tutorial teaches the default rules first.',
    board,
    pieces,
    layout,
    objectives: [
      'Find the enemy Monarch.',
      'Right-click both castles and notice that White controls them.',
      'Notice that controlling an enemy castle matters more than merely standing near it.',
    ],
    hints: [
      'A captured Monarch ends the game immediately.',
      'A castle keeps its current controller even if the occupying piece leaves.',
      'Victory points are an optional setup variant, not the baseline tutorial win condition.',
    ],
    instructions: 'This board shows both win ideas at once: White threatens the black Monarch and already controls the black-side castle.',
  };
}
