/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.1: Swordsman
 * 
 * Objective: Capture target piece
 */
import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L2_01(): TutorialLesson {
  const boardRadius = 2; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-2, 2, 0), 'w', 0),
    new Castle(new Hex(2, -2, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'), // Target
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l2_01_swordsman_strength',
    title: '3.1.1 Swordsman: Strength',
    description: (
      <div>
        <p style={{ marginTop: 0 }}>The strength of a piece determines what piices it can capture. A piece can only be captured when it is attacked by pieces whose strength is greater than or equal to its own strength.</p>
            <div style={{ marginTop: '12px' }}>
             <div style={{ marginBottom: '6px' }}>
            <strong>Type:</strong> Melee
          </div>   
          <div style={{ marginBottom: '6px' }}>
            <strong>Movement:</strong> 1 hex forward in any direction
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Attack:</strong> An adjacent hex forward diagonally
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Strength:</strong> 1
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Special:</strong> +1 STR when on enemy side of board
          </div>
        </div>
      </div>
    ),
    board,
    pieces,
    layout,
    objectives: [
      'Capture the enemy Swordsman',
    ],
    hints: [
      'You need to move first.',
    ],
    instructions: 'TODO: Capture the enemy piece with your Swordsman.',
  };
}
