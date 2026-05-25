import React from 'react';
import { PieceType } from '../Constants';
import { getPieceAttackType, getPieceConfig, getPieceDisplayName } from '../Classes/Config/PieceTypeConfig';

interface PieceRulesProps {
  type: PieceType;
  intro: string;
  notes?: React.ReactNode;
}

const statRowStyle: React.CSSProperties = {
  marginBottom: '6px',
};

export function PieceRules({ type, intro, notes }: PieceRulesProps): React.ReactElement {
  const config = getPieceConfig(type);
  const name = getPieceDisplayName(type);

  return (
    <div>
      <p style={{ marginTop: 0 }}>{intro}</p>
      <div style={{ marginTop: '12px' }}>
        <div style={statRowStyle}>
          <strong>Piece:</strong> {name}
        </div>
        <div style={statRowStyle}>
          <strong>Strength:</strong> {config.strength}
        </div>
        <div style={statRowStyle}>
          <strong>Attack type:</strong> {getPieceAttackType(type)}
        </div>
        <div style={statRowStyle}>
          <strong>Rules:</strong> {config.description}
        </div>
        {notes && <div style={{ marginTop: '10px' }}>{notes}</div>}
      </div>
    </div>
  );
}
