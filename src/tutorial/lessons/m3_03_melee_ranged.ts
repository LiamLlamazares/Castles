/**
 * MODULE 3: Combat Mechanics
 * Lesson 3.3: Melee vs Ranged
 * 
 * Objective: Understand range differences
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM3L3(): TutorialLesson {
  const boardRadius = 3; // Small
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w'),  // Melee
    PieceFactory.create(PieceType.Archer, new Hex(-2, 2, 0), 'w'),     // Ranged
    PieceFactory.create(PieceType.Trebuchet, new Hex(-2, 1, 1), 'w'),  // Long range
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -1, 0), 'b'),  // Target
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm3_l3_melee_ranged',
    title: '3.3 Melee vs Ranged',
    description: 'Understand attack range differences.',
    board,
    pieces,
    layout,
    objectives: [
      'Attack with melee piece',
      'Attack with ranged piece',
    ],
    hints: [
      '⚔️ Melee: Attack adjacent enemies',
      '🏹 Ranged: Attack at distance 2-3',
      '🎯 Long Range: Attack at distance 3-5',
    ],
    instructions: 'TODO: Try attacking from different ranges.',
  };
}
