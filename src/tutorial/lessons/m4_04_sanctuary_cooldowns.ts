import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { Sanctuary } from '../../Classes/Entities/Sanctuary';
import { PieceType, SanctuaryType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM4L4(): TutorialLesson {
  const castles: Castle[] = [
    new Castle(new Hex(-4, 4, 0), 'w', 0),
    new Castle(new Hex(4, -4, 0), 'b', 0),
  ];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Archer, new Hex(0, -1, 1), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(1, -1, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, -1, 2), 'w'),
  ];
  const sanctuaries = [
    new Sanctuary(new Hex(0, 0, 0), SanctuaryType.ArcaneRefuge, 'w', 'w', 6),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm4_l4_sanctuary_cooldowns',
    title: '4.4 Sanctuary cooldowns',
    description: 'After a sanctuary is pledged, it goes on cooldown. At the start of that sanctuary side\'s turn, cooldown drops by 1 plus 1 for each non-Swordsman that side has across the river.',
    board,
    pieces,
    sanctuaries,
    layout,
    objectives: [
      'Right-click the cooldown sanctuary.',
      'Right-click the non-Swordsman pieces across the river.',
    ],
    hints: [
      'Archers, Knights, Eagles, Giants, Trebuchets, Assassins, Dragons, Monarchs, and sanctuary pieces all accelerate cooldown if they are across the river for their side.',
      'Swordsmen do not accelerate sanctuary cooldown.',
      'The bonus is checked at the start of the sanctuary side\'s turn, not immediately when a piece crosses the river.',
    ],
    instructions: 'Right-click the sanctuary and inspect why the non-Swordsmen across the river reduce cooldown later while the Swordsman does not.',
  };
}
