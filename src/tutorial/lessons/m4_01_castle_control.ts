import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { TutorialLesson } from '../types';

export function createM4L1(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-3, 3, 0), 'w', 0), new Castle(new Hex(3, -3, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 3, riverCrossingLength: 100, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [PieceFactory.create(PieceType.Knight, new Hex(1, -1, 0), 'w')];
  const layout = getStartingLayout(board);

  return {
    id: 'm4_l1_castle_control',
    title: '4.1 Castle control',
    description: 'Castles change controller when an enemy piece captures them. Once captured, the castle remains controlled even if the piece later moves away.',
    board,
    pieces,
    layout,
    objectives: [
      {
        id: 'capture-black-side-castle',
        text: 'Capture the black-side castle with the Knight.',
        completion: {
          type: 'event',
          eventTypes: ['capture'],
          phase: 'Movement',
          actorPieceType: PieceType.Knight,
          actorColor: 'w',
          sourceHexKey: '1,-1,0',
          targetHexKey: '3,-3,0',
          castleControlChanged: true,
        },
      },
    ],
    hints: ['Opponent-controlled castles block ordinary movement until captured.', 'Right-click the castle after capture to confirm the controller changed.'],
    instructions: 'First take an enemy castle; later you can recruit from it.',
  };
}
