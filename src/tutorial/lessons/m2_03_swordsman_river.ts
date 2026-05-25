import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L3(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-3, 3, 0), 'w', 0), new Castle(new Hex(3, -3, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 1, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -1, 1), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(1, -2, 1), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm2_l3_swordsman_river',
    title: '2.3 Swordsman river bonus',
    description: 'A Swordsman on the enemy side of the river has strength 2 instead of strength 1. That lets it threaten pieces it could not normally capture alone.',
    board,
    pieces,
    layout,
    objectives: ['Use the advanced Swordsman to capture the Giant.'],
    hints: ['White Swordsmen become stronger on the black side of the board.', 'River hexes themselves are not valid promotion or recruitment squares.'],
  };
}
