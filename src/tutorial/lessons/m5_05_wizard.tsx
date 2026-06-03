import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { AbilityType, PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { PieceRules } from '../lessonContent';
import { TutorialLesson } from '../types';

export function createM5L5(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Wizard, new Hex(-2, 1, 1), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(-2, 3, -1), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(0, 1, -1), 'b'),
    PieceFactory.create(PieceType.Archer, new Hex(0, 0, 0), 'b'),
    PieceFactory.create(PieceType.Swordsman, new Hex(0, -1, 1), 'b'),
    PieceFactory.create(PieceType.Giant, new Hex(1, -1, 0), 'b'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l5_wizard',
    title: '5.5 Wizard',
    description: <PieceRules type={PieceType.Wizard} intro="The Wizard is a ranged unit with once-per-game magical abilities such as Fireball and Teleport." />,
    board,
    pieces,
    layout,
    initialTurnCounter: 2,
    objectives: [
      {
        id: 'fireball-clustered-units',
        text: 'Select the Wizard and use Fireball on the clustered Swordsman and Archers.',
        completion: { type: 'event', eventTypes: ['ability'], phase: 'Attack', abilityType: AbilityType.Fireball, actorPieceType: PieceType.Wizard, actorColor: 'w', targetColor: 'b', targetHexKey: '0,-1,1', pieceRemoved: true },
      },
    ],
    hints: [
      'Wizard abilities are used during the Attack phase and consume that Wizard\'s attack for the turn.',
      'The Wizard normally attacks exactly 2 hexes away.',
      'Fireball targets within range 2 and deals 1 damage to the target and adjacent pieces.',
      'Teleport is also an Attack-phase ability. It moves the Wizard to an empty hex within range 3 instead of making a capture.',
      'Fireball can remove clustered weak pieces at once, while a Giant usually survives with damage.',
      'Teleport is for repositioning rather than direct damage.',
    ],
  };
}
