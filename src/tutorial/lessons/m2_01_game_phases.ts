/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.1: Game Phases Overview
 * 
 * Objective: Complete move + attack phase
 */
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
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
  
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(1, -1, 0), 'b'),
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l1_game_phases',
    title: '2.1 Game Phases',
    description: 'Learn the Movement and Attack phases.',
    board,
    pieces,
    layout,
    objectives: [
      'Complete a movement action',
      'Complete an attack action',
    ],
    hints: [
      '🚶 Movement Phase: Move up to 2 pieces',
      '⚔️ Attack Phase: Attack up to 2 times',
      '🏰 Recruitment Phase: Recruit from castles',
    ],
    instructions: 'TODO: Move your piece, then attack the enemy.',
  };
}
