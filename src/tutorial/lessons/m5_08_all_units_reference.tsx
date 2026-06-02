import React from 'react';
import { Board, BoardConfig } from '../../Classes/Core/Board';
import { Castle } from '../../Classes/Entities/Castle';
import { Hex } from '../../Classes/Entities/Hex';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { PieceType } from '../../Constants';
import { getStartingLayout } from '../../ConstantImports';
import { getPieceAttackType, getPieceConfig, getPieceDisplayName } from '../../Classes/Config/PieceTypeConfig';
import { TutorialLesson } from '../types';

const standardPieces = [
  PieceType.Swordsman,
  PieceType.Archer,
  PieceType.Knight,
  PieceType.Eagle,
  PieceType.Giant,
  PieceType.Trebuchet,
  PieceType.Assassin,
  PieceType.Dragon,
  PieceType.Monarch,
];

const specialPieces = [
  PieceType.Wolf,
  PieceType.Healer,
  PieceType.Ranger,
  PieceType.Wizard,
  PieceType.Necromancer,
  PieceType.Phoenix,
];

function UnitList({ title, pieces }: { title: string; pieces: PieceType[] }): React.ReactElement {
  return (
    <div style={{ marginTop: '12px' }}>
      <strong>{title}</strong>
      <ul style={{ paddingLeft: '18px', marginTop: '8px' }}>
        {pieces.map((piece) => {
          const config = getPieceConfig(piece);
          return (
            <li key={piece} style={{ marginBottom: '8px' }}>
              <strong>{getPieceDisplayName(piece)}</strong> - strength {config.strength}, {getPieceAttackType(piece)}. {config.description}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function createM5L8(): TutorialLesson {
  const castles: Castle[] = [new Castle(new Hex(-4, 4, 0), 'w', 0), new Castle(new Hex(4, -4, 0), 'b', 0)];
  const boardConfig: BoardConfig = { nSquares: 4, riverCrossingLength: 2, hasHighGround: false };
  const board = new Board(boardConfig, castles);
  const pieces = [
    PieceFactory.create(PieceType.Swordsman, new Hex(-4, 3, 1), 'w'),
    PieceFactory.create(PieceType.Archer, new Hex(-3, 3, 0), 'w'),
    PieceFactory.create(PieceType.Knight, new Hex(-2, 3, -1), 'w'),
    PieceFactory.create(PieceType.Eagle, new Hex(-1, 3, -2), 'w'),
    PieceFactory.create(PieceType.Giant, new Hex(0, 3, -3), 'w'),
    PieceFactory.create(PieceType.Trebuchet, new Hex(1, 2, -3), 'w'),
    PieceFactory.create(PieceType.Assassin, new Hex(2, 1, -3), 'w'),
    PieceFactory.create(PieceType.Dragon, new Hex(3, 0, -3), 'w'),
    PieceFactory.create(PieceType.Monarch, new Hex(4, -1, -3), 'w'),
    PieceFactory.create(PieceType.Wolf, new Hex(-4, 1, 3), 'w'),
    PieceFactory.create(PieceType.Healer, new Hex(-3, 1, 2), 'w'),
    PieceFactory.create(PieceType.Ranger, new Hex(-2, 1, 1), 'w'),
    PieceFactory.create(PieceType.Wizard, new Hex(-1, 1, 0), 'w'),
    PieceFactory.create(PieceType.Necromancer, new Hex(0, 1, -1), 'w'),
    PieceFactory.create(PieceType.Phoenix, new Hex(1, 1, -2), 'w'),
  ];
  const layout = getStartingLayout(board);

  return {
    id: 'm5_l8_all_units_reference',
    title: '5.8 All units reference',
    description: (
      <div>
        <p style={{ marginTop: 0 }}>A compact rule card for every current unit, for checking after the interactive lessons.</p>
        <UnitList title="Standard pieces" pieces={standardPieces} />
        <UnitList title="Sanctuary pieces" pieces={specialPieces} />
      </div>
    ),
    board,
    pieces,
    layout,
    instructions: 'Right-click the pieces, then compare them with the reference text.',
  };
}
