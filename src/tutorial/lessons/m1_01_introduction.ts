/**
 * MODULE 1: Board Basics
 * Lesson 1.1: Introduction
 * 
 * Overview of the game - no interaction required.
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM1L1(): TutorialLesson {
  const boardRadius = 7; // Full board
  
  const castles: Castle[] = [
    new Castle(new Hex(-7, 7, 0), 'w', 0),
    new Castle(new Hex(7, -7, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  // TODO: Standard starting positions
  const pieces = [
    PieceFactory.create(PieceType.Monarch, new Hex(-5, 5, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-4, 4, 0), 'w'),
    PieceFactory.create(PieceType.Monarch, new Hex(5, -5, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(4, -4, 0), 'b'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm1_l1_introduction',
    title: '1.1 Introduction',
    description: 'Welcome to Castles - a hex-based strategy game.',
    board,
    pieces,
    layout,
    objectives: [
      // No objectives - overview only
    ],
    hints: [
      '🎮 This is a turn-based strategy game on a hexagonal board',
      '👑 Each player has a Monarch - protect yours, capture theirs',
      '🏰 Control castles to recruit new pieces',
    ],
    instructions: 'Welcome! Explore the board freely. Click Next when ready.',
  };
}
