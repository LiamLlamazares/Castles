/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.1: Game Phases Overview
 * 
 * Objective: Complete move + attack phase
 */
import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import { TUTORIAL_BOARD_STANDARD_R, TUTORIAL_CASTLES_STANDARD } from '../constants';

// Icons - using the same import pattern as RulesModal.tsx
import bootsIcon from '../../Assets/Images/Banner/boots.svg';
import swordIcon from '../../Assets/Images/Banner/sword.svg';
import castleIcon from '../../Assets/Images/Banner/castle.svg';

export function createM2(): TutorialLesson {
  const boardRadius = TUTORIAL_BOARD_STANDARD_R; // Standard board
  
  const castles: Castle[] = [...TUTORIAL_CASTLES_STANDARD];
  const boardConfig: BoardConfig = { nSquares: boardRadius, riverCrossingLength: 2 };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(5, 0, -5), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 1, 1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -1, 1), 'b'), // Target
  ];
  
  const layout = getStartingLayout(board);
  
  const iconStyle: React.CSSProperties = {
    width: '1.2em',
    height: '1.2em',
    verticalAlign: 'middle',
    marginRight: '8px',
    display: 'inline-block'
  };

  return {
    id: 'm2_game_phases',
    title: '2 Game Phases (overview)',
    description: (
      <div>
        The game is split into three phases:
        <div style={{ marginTop: '12px' }}>
          <div style={{ marginBottom: '8px' }}>
            <img src={bootsIcon} alt="Movement" style={iconStyle} />
            <strong>Movement Phase:</strong> Move up to 2 pieces
          </div>
          <div style={{ marginBottom: '8px' }}>
            <img src={swordIcon} alt="Attack" style={iconStyle} />
            <strong>Attack Phase:</strong> Attack up to 2 times
          </div>
          <div style={{ marginBottom: '8px' }}>
            <img src={castleIcon} alt="Recruitment" style={iconStyle} />
            <strong>Recruitment Phase:</strong> Recruit from captured castles and available sanctuaries
          </div>
        </div>
      </div>
    ),
    board,
    pieces,
    layout,
    objectives: [
      'Move the swordsmen forward',
      'Capture the enemy swordsman and castle',
      'Recruit a new swordsman from the captured castle',
    ],
    hints: [],
    instructions: 'TODO: Move your piece, then attack the enemy.',
  };
}
