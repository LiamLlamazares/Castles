/**
 * MODULE 5: Victory
 * Lesson 5.1: Conquest Victory
 * 
 * Objective: Control castles for X turns
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM5L1(): TutorialLesson {
  const boardRadius = 4; // Medium
  
  const castles: Castle[] = [
    new Castle(new Hex(-4, 4, 0), 'w', 0),
    new Castle(new Hex(4, -4, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Knight, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(3, -3, 0), 'b'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm5_l1_conquest',
    title: '5.1 Conquest Victory',
    description: 'Win by controlling all castles.',
    board,
    pieces,
    layout,
    objectives: [
      'Capture both castles',
      'Hold for victory',
    ],
    hints: [
      '🏰 Control all castles = victory',
      '⏱️ Must hold for required turns',
      '⚔️ Defend your castles!',
    ],
    instructions: 'TODO: Capture and hold all castles.',
  };
}
