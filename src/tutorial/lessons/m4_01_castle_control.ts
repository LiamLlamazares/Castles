/**
 * MODULE 4: Economy & Control
 * Lesson 4.1: Castle Control
 * 
 * Objective: Capture and hold a castle
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM4L1(): TutorialLesson {
  const boardRadius = 3; // Small
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Knight, new Hex(-1, 1, 0), 'w'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm4_l1_castle_control',
    title: '4.1 Castle Control',
    description: 'Learn to capture and hold castles.',
    board,
    pieces,
    layout,
    objectives: [
      'Capture the enemy castle',
    ],
    hints: [
      '🏰 Move onto castle to capture',
      '⏱️ Hold for 1 turn to recruit',
      '🎯 Castles are strategic victory points',
    ],
    instructions: 'TODO: Capture the enemy castle.',
  };
}
