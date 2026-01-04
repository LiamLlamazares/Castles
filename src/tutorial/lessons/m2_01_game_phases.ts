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
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD } from '../constants';

export function createM2L1(): TutorialLesson {
  const boardRadius = TUTORIAL_BOARD_STANDARD_R; // Standard board
  
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: boardRadius,riverCrossingLength: 2 };
  const board = new Board(boardConfig, castles);
  
  // TODO: Standard starting positions
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(5, 0, -5), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 1, 1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -1, 1), 'b'), // Target
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l1_game_phases',
    title: '2.1 Game Phases',
    description: 'The game is split into three phases: Movement, Attack, and Recruitment.',
    board,
    pieces,
    layout,
    objectives: [
      'Move the swordsmen forward',
      'Capture the enemy swordsman and castle',
      'Recruit a new swordsman from the captured castle',
    ],
    hints: [
      '🚶 Movement Phase: Move up to 2 pieces',
      '⚔️ Attack Phase: Attack up to 2 times',
      '🏰 Recruitment Phase: Recruit from captured castles and available sanctuaries',
    ],
    instructions: 'TODO: Move your piece, then attack the enemy.',
  };
}
