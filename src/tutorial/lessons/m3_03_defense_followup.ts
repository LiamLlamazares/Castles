import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM3L3(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Archer, new Hex(0, 0, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -1, 1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -2, 1), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(2, -2, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm3_l3_defense_followup',
    title: '3.3 Breaking a defense',
    description: 'Defense is positional. If a melee piece removes one defender, a ranged piece may suddenly have a clean shot at the remaining enemy.',
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: [
      'Use the Swordsman to capture one adjacent defender.',
      'Then use the Archer against the enemy that is no longer defended.',
    ],
    hints: [
      'Do not start with the Archer if the target is still defended.',
      'Melee attacks can open ranged attacks for later in the phase.',
    ],
    instructions: 'This is a small tactic: break the shield with melee, then let the Archer fire.',
  };
}
