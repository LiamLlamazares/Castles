import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM3L4(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: true };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Archer, new Hex(-3, 1, 2), 'w'),
    PieceFactory.create(PieceType.Trebuchet, new Hex(-3, 0, 3), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -1, 1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 1, 1), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, -1, 2), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -3, 3), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -2, 1), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm3_l4_range_practice',
    title: '3.4 Range practice',
    description: 'Archers, Trebuchets, and melee pieces want different distances. This board gives you nearby, medium, and long targets to compare.',
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: [
      'Find the enemy too close for the Archer.',
      'Find the enemy at Archer range.',
      'Find the enemy at Trebuchet range.',
      'Move onto high ground and compare extended range.',
    ],
    hints: [
      'Archer: range 2, or 3 from high ground.',
      'Trebuchet: range 3, or 4 from high ground.',
      'Melee pieces attack adjacent enemies only.',
    ],
    instructions: 'Move the ranged pieces around and click targets. The useful lesson here is what does not light up as much as what does.',
  };
}
