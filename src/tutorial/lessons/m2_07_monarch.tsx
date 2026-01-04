/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.5: Monarch
 * 
 * Objective: Understanding the VIP
 */
import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L7(): TutorialLesson {
  const boardRadius = 2; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Monarch, new Hex(0, 0, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w'), // Defender
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l7_monarch',
    title: '3.5 Monarch',
    description: (
      <div>
        <p style={{ marginTop: 0 }}>The Monarch is your most important piece. Lose it, and you lose the game!</p>
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
            <strong>Strength:</strong> 2
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Special:</strong> If captured, you lose the game instantly
          </div>
        </div>
      </div>
    ),
    board,
    pieces,
    layout,
    objectives: [
      'Keep your Monarch protected',
    ],
    hints: [
      'Always keep defenders near your Monarch',
    ],
    instructions: 'Practice keeping your Monarch safe.',
  };
}
