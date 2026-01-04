/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.1: The Basic Pieces
 * 
 * Objective: Capture target piece
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { Piece } from '../../Classes/Entities/Piece';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L1(): TutorialLesson {
  const boardRadius = 2; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces: Piece[] = [];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l1_basic_pieces',
    title: '3 The Basic Pieces',
    description: 'Each army is made up of 7 basic pieces. Each piece is characterised by their strength, movement and special abilities.',
    board,
    pieces,
    layout,
  };
}
