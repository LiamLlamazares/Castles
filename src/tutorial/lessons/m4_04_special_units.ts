/**
 * MODULE 4: Economy & Control
 * Lesson 4.4: Special Units
 * 
 * Objective: Use a special ability
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM4L4(): TutorialLesson {
  const boardRadius = 3; // Small
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Wizard, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -1, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, 0, -1), 'b'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm4_l4_special_units',
    title: '4.4 Special Units',
    description: 'Use special unit abilities.',
    board,
    pieces,
    layout,
    objectives: [
      'Use Wizard ability',
    ],
    hints: [
      'Wizard: Fireball (AoE) or Teleport',
      'Click ability bar to activate',
      'Each special unit has unique powers',
    ],
    instructions: 'TODO: Use the Wizard Fireball ability.',
  };
}
