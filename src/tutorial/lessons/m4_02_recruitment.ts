import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM4L2(): TutorialLesson {
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 3, false, 'w'),
  ];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 1, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [PieceFactory.create(PieceType.Swordsman, new Hex(1, -1, 0), 'w')];
  const layout = getStartingLayout(board);

  return {
    id: 'm4_l2_recruitment',
    title: '4.2 Recruitment cycle',
    description: 'Recruitment happens only from enemy castles you have captured. Your own starting castles do not produce recruits, even if you lose and retake them later.',
    board,
    pieces,
    layout,
    initialTurnCounter: 4,
    objectives: [
      'Reach the Castles phase.',
      'Recruit beside the captured black-side castle, not the white-side castle.',
      'Notice river hexes are not legal recruitment targets.',
    ],
    hints: [
      'The captured castle stays under White control even if the Swordsman leaves.',
      'The next recruitment piece comes from the castle cycle shown in its tooltip.',
      'Only empty, non-river adjacent hexes are valid recruitment squares.',
    ],
    instructions: 'Pass to the Castles phase if needed, then recruit from the captured enemy castle on the black side.',
  };
}
