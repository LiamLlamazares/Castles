import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { CASTLE_RECRUITMENT_COOLDOWN_LABEL, PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM4L2(): TutorialLesson {
  const castles: Castle[] = [
    new Castle(new Hex(-3, 3, 0), 'w', 0),
    new Castle(new Hex(3, -3, 0), 'b', 0, false, 'w'),
  ];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 1, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [PieceFactory.create(PieceType.Swordsman, new Hex(3, -3, 0), 'w')];
  const layout = getStartingLayout(board);
  const cycleText = 'Swordsman -> Archer -> Knight -> Eagle -> Giant -> Trebuchet -> Assassin -> Dragon -> Monarch';

  return {
    id: 'm4_l2_recruitment',
    title: '4.2 Recruitment cycle',
    description: `Recruitment happens only from enemy castles you have captured. Your own starting castles do not produce recruits, even if you lose and retake them later. After recruiting, that castle waits ${CASTLE_RECRUITMENT_COOLDOWN_LABEL} before it can recruit again. Capturing a castle clears any current recruitment cooldown for the new controller. The castle cycle is ${cycleText}, then repeats.`,
    board,
    pieces,
    layout,
    initialTurnCounter: 4,
    objectives: [
      {
        id: 'recruit-from-captured-castle',
        text: 'Recruit beside the captured black-side castle, not the white-side castle.',
        completion: {
          type: 'event',
          eventTypes: ['recruitment'],
          phase: 'Recruitment',
          createdPieceType: PieceType.Swordsman,
          createdColor: 'w',
          targetHexKey: '2,-2,0',
          sourceCastleHexKey: '3,-3,0',
        },
      },
    ],
    hints: [
      'You are already in the Castles phase from the captured black-side castle.',
      'River hexes are not legal recruitment targets.',
      'The captured castle stays under White control even if the Swordsman leaves.',
      `After this recruitment, the captured castle waits ${CASTLE_RECRUITMENT_COOLDOWN_LABEL} before it can recruit again.`,
      `The cycle is ${cycleText}, then repeats.`,
      'Only empty, non-river adjacent hexes are valid recruitment squares.',
    ],
    instructions: `You are already in the Castles phase. Recruit from the captured enemy castle on the black side and check the piece-symbol -> piece-symbol cycle in the tooltip. The castle then enters cooldown for ${CASTLE_RECRUITMENT_COOLDOWN_LABEL}.`,
  };
}
