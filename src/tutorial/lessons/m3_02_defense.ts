import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM3L2(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Archer, new Hex(-2, 0, 2), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(0, -2, 2), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -2, 1), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, -2, 4), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm3_l2_defense',
    title: '3.2 Defense system',
    description: 'A friendly melee piece defends any adjacent friendly piece, including an Archer. The Archer can be protected by that melee defender, but the Archer itself does not protect adjacent allies. Ranged pieces cannot attack a melee-protected target, but undefended targets remain available.',
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: [
      {
        id: 'compare-defended-archer',
        text: 'Compare the shield marker on the defended Archer with the undefended enemy.',
        completion: { type: 'manual' },
      },
      {
        id: 'try-archer-targets',
        text: 'Try the Archer against both targets.',
        completion: { type: 'manual' },
      },
    ],
    hints: [
      'The protected piece can be an Archer; only the adjacent melee piece is providing the defense.',
      'The separated black Swordsman is undefended.',
      'Archers and other ranged pieces do not create defense for adjacent allies.',
      'Melee pieces can still attack defended enemies; ranged pieces cannot.',
    ],
    instructions: 'Click the Archer and notice that one enemy is protected while the separated enemy is a legal ranged target.',
  };
}
