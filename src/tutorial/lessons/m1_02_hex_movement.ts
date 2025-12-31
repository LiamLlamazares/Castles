/**
 * MODULE 1: Board Basics
 * Lesson 1.2: Hex Grid & Movement
 * 
 * Objective: Move a piece to target hex
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM1L2(): TutorialLesson {
  const boardRadius = 2; // 7-hex cluster
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    // TODO: Single piece to move to target
    PieceFactory.create(PieceType.Knight, new Hex(0, 0, 0), 'w'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l2_hex_movement',
    title: '1.2 Hex Grid & Movement',
    description: 'Learn how to move pieces on the hexagonal board.',
    board,
    pieces,
    layout,
    objectives: [
      'Move the Knight to the target hex',
    ],
    hints: [
      '🔷 Click a piece to select it',
      '🟢 Green dots show where you can move',
      '👆 Click a green dot to move there',
    ],
    instructions: 'TODO: Move the Knight to the marked target hex.',
  };
}
