/**
 * MODULE 3: Your Army (Basic Pieces)
 * Lesson 3.1.2: Swordsman River Bonus
 * 
 * Objective: Capture Giant after crossing river
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L3(): TutorialLesson {
  const boardRadius = 3; // Mini + river
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  // TODO: Position swordsman to cross river and attack Giant
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(2, -2, 0), 'b'), // Target
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l3_swordsman_river',
    title: '3.1.2 Swordsman River Bonus',
    description: 'Swordsmen get a strength bonus of +1 when on the other side of the river, becoming a powerful menace.',
    board,
    pieces,
    layout,
    objectives: [
      'Cross the river with your Swordsman',
      'Capture the Giant',
    ]
  };
}
