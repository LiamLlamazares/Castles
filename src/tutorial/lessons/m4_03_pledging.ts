import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { Sanctuary } from '../../Classes/Entities/Sanctuary';
import { PieceType, SanctuaryType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM4L3(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-3, 3, 0), 'w', 0), new Castle(new Hex(3, -3, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(-2, 2, 0), 'w'),
  ];
  const sanctuaries = [new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WolfCovenant, 'w', 'w')];
  const layout = getStartingLayout(board);

  return {
    id: 'm4_l3_pledging',
    title: '4.3 Sanctuary pledging',
    description: 'Sanctuaries unlock special units through pledging. Tier 1 sanctuaries are the simplest: occupy the sanctuary during the Castles phase and pledge to unlock their unit.',
    board,
    pieces,
    sanctuaries,
    layout,
    initialTurnCounter: 4,
    objectives: [
      {
        id: 'pledge-wolf-covenant',
        text: 'Pledge the Swordsman standing on the Wolf Covenant.',
        completion: {
          type: 'event',
          eventTypes: ['pledge'],
          phase: 'Recruitment',
          createdPieceType: PieceType.Wolf,
          createdColor: 'w',
          targetHexKey: '1,-1,0',
          sourceSanctuaryHexKey: '0,0,0',
        },
      },
    ],
    hints: [
      'Pledging is separate from castle recruitment.',
      'Cooldown drops at the start of that side\'s turn, plus 1 for each non-Swordsman that side has across the river.',
    ],
    instructions: 'Pledge here to unlock the Wolf. After this, you can start a normal game or continue to the special-unit tour.',
  };
}
