import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';
import bootsIcon from '../../Assets/Images/Banner/boots.svg';
import swordIcon from '../../Assets/Images/Banner/sword.svg';
import castleIcon from '../../Assets/Images/Banner/castle.svg';

export function createM2L0(): TutorialLesson {
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0),
  ];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 2, 0), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(-2, 1, 1), 'w'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'b'),
  ];
  const layout = getStartingLayout(board);
  const iconStyle: React.CSSProperties = { width: '1.2em', height: '1.2em', verticalAlign: 'middle', marginRight: '8px', display: 'inline-block' };

  return {
    id: 'm2_00_game_phases_overview',
    title: '2 Turn phases overview',
    description: (
      <div>
        <p style={{ marginTop: 0 }}>Each player turn is split into three parts. This lesson is only a preview, so do not worry about perfect play yet.</p>
        <div style={{ marginTop: '12px' }}>
          <div style={{ marginBottom: '8px' }}><img src={bootsIcon} alt="Movement" style={iconStyle} /><strong>Movement:</strong> move up to two pieces.</div>
          <div style={{ marginBottom: '8px' }}><img src={swordIcon} alt="Attack" style={iconStyle} /><strong>Attack:</strong> capture opponent pieces if legal attacks are available.</div>
          <div style={{ marginBottom: '8px' }}><img src={castleIcon} alt="Castles" style={iconStyle} /><strong>Castles:</strong> recruit from captured enemy castles or pledge at sanctuaries.</div>
        </div>
      </div>
    ),
    board,
    pieces,
    layout,
    objectives: [
      'Move one or two white Swordsmen toward the black Swordsmen.',
      'Reach the Attack phase by moving or passing.',
      'Pass during Attack to continue through the phase.',
    ],
    hints: [
      'If the game waits in the Attack phase, it may be because a capture is available.',
      'You can press Pass to move through phases when you do not want to use the remaining action.',
      'Later lessons teach attacks, recruitment, and pledging in detail.',
    ],
    instructions: 'Try moving a Swordsman so it can attack diagonally on the next phase. In tutorial positions you may move both sides if you want to see the turn cycle from both perspectives.',
  };
}
