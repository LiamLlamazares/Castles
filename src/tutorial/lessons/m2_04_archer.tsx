/**
 * MODULE 2: Your Army (Basic Pieces)
 * Lesson 2.2: Archer
 * 
 * Objective: Ranged attack demonstration
 */
import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM2L4(): TutorialLesson {
  const boardRadius = 3; // Mini
  
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  
  const boardConfig: BoardConfig = { nSquares: boardRadius };
  const board = new Board(boardConfig, castles);
  
  const pieces = [
    PieceFactory.create(PieceType.Archer, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'), // Target at range
  ];
  
  const layout = getStartingLayout(board);
  
  return {
    id: 'm2_l4_archer',
    title: '3.2 Archer',
    description: (
      <div>
        <p style={{ marginTop: 0 }}>The Archer is a ranged unit that attacks from a distance without moving.</p>
        <div style={{ marginTop: '12px' }}>
          <div style={{ marginBottom: '6px' }}>
            <strong>Type:</strong> Ranged
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Movement:</strong> 1 hex forward in any direction
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Attack:</strong> 2-3 hexes away (cannot attack adjacent)
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Strength:</strong> 1
          </div>
          <div style={{ marginBottom: '6px' }}>
            <strong>Special:</strong> Attacks without moving; cannot attack adjacent enemies
          </div>
        </div>
      </div>
    ),
    board,
    pieces,
    layout,
    objectives: [
      'Attack the enemy from range',
    ],
    hints: [
      'Select the Archer, then click the red attack indicator',
    ],
    instructions: 'Use your Archer to attack at range.',
  };
}
