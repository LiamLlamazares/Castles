/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.3: Knight (Cavalry)
 * 
 * Objective: Extended movement capture
 */
import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L5(): TutorialLesson {
  const boardRadius = 3; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Knight, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'), // Target
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l5_knight',
    title: '3.3 Knight',
    description: (
      <div>
        <p style={{ marginTop: 0 }}>The Knight is a mobile melee unit that can leap over other pieces.</p>
        <div style={{ marginTop: '12px' }}>
          <div style={{ marginBottom: '6px' }}>
            <strong>Type:</strong> Melee
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Movement:</strong> Exactly 2 hexes in any direction (can jump over pieces)
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Attack:</strong> Adjacent hex (standard melee)
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Strength:</strong> 2
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Special:</strong> Leaps over pieces; great for surprise attacks
          </div>
        </div>
      </div>
    ),
    board,
    pieces,
    layout,
    objectives: [
      'Use Knight to reach and capture the enemy',
    ],
    hints: [
      'Knights can jump over other pieces to reach their target',
    ],
    instructions: 'Jump to the enemy and capture.',
  };
}
