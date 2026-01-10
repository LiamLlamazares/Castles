/**
 * MODULE 5: Victory
 * Lesson 5.3: Full Game Walkthrough
 * 
 * Objective: Complete a guided mini-game
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM5L3(): TutorialLesson {
  const boardRadius = 7; // Full
  
  const castles: Castle[] = [
    new Castle(new Hex(-7, 7, 0), 'w', 0),
    new Castle(new Hex(7, -7, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  // TODO: Standard starting positions
  const pieces = [
    // White army
    PieceFactory.create(PieceType.Monarch, new Hex(-5, 5, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-4, 4, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-4, 5, -1), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(-5, 6, -1), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(-6, 6, 0), 'w'),
    // Black army
    PieceFactory.create(PieceType.Monarch, new Hex(5, -5, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(4, -4, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(4, -5, 1), 'b'),
    PieceFactory.create(PieceType.Archer, new Hex(5, -6, 1), 'b'),
    PieceFactory.create(PieceType.Knight, new Hex(6, -6, 0), 'b'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm5_l3_walkthrough',
    title: '5.3 Full Game Walkthrough',
    description: 'Apply everything in a guided game.',
    board,
    pieces,
    layout,
    objectives: [
      'Complete a full practice game',
      'Use all skills learned',
    ],
    hints: [
      'Use all phases each turn',
      'Control castles for advantage',
      'Protect your Monarch!',
      'Aim for enemy Monarch',
    ],
    instructions: 'Play a complete guided game using all your skills!',
  };
}
