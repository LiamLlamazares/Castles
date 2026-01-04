/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.4: Giant
 * 
 * Objective: High strength capture
 */
import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L6(): TutorialLesson {
  const boardRadius = 2; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Giant, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(1, -1, 0), 'b'), // Target
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l6_giant',
    title: '3.4 Giant',
    description: (
      <div>
        <p style={{ marginTop: 0 }}>The Giant is a slow but powerful melee unit with the highest base strength.</p>
        <div style={{ marginTop: '12px' }}>
          <div style={{ marginBottom: '6px' }}>
            <strong>Type:</strong> Melee
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Movement:</strong> 1 hex in any direction
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Attack:</strong> Adjacent hex (standard melee)
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Strength:</strong> 3
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Special:</strong> Highest base strength; can overpower most units
          </div>
        </div>
      </div>
    ),
    board,
    pieces,
    layout,
    objectives: [
      'Use Giant to overpower the enemy',
    ],
    hints: [
      'Giants are powerful but slow - position them carefully',
    ],
    instructions: 'Advance and capture with your Giant.',
  };
}
