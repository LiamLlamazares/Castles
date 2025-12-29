import React from 'react';
import { Piece } from '../Classes/Entities/Piece';
import { PieceType, AttackType } from '../Constants';

interface PieceTooltipProps {
  piece: Piece;
  position: { x: number, y: number };
}

// Piece info data based on rules.md
const PIECE_INFO: Record<PieceType, {
  movement: string;
  attackType: string;
  range?: string;
  heavy: boolean;
  flying: boolean;
  special?: string;
}> = {
  [PieceType.Swordsman]: { movement: '1 (forward diag)', attackType: 'Diagonal', heavy: false, flying: false },
  [PieceType.Archer]: { movement: '1 (any)', attackType: 'Ranged', range: '2 hexes', heavy: false, flying: false },
  [PieceType.Knight]: { movement: '∞ diagonal', attackType: 'Melee', heavy: false, flying: false },
  [PieceType.Trebuchet]: { movement: '1 (any)', attackType: 'Long-Range', range: '3 hexes', heavy: true, flying: false },
  [PieceType.Eagle]: { movement: '3 (flying)', attackType: 'Melee', heavy: false, flying: true },
  [PieceType.Giant]: { movement: '∞ orthogonal', attackType: 'Melee', heavy: true, flying: false },
  [PieceType.Assassin]: { movement: '∞ any direction', attackType: 'Melee', heavy: false, flying: false, special: 'Instant kill on Monarch' },
  [PieceType.Dragon]: { movement: 'L-jump', attackType: 'Melee', heavy: true, flying: true },
  [PieceType.Monarch]: { movement: '1 (any)', attackType: 'Melee', heavy: true, flying: false, special: 'Must protect!' },
  [PieceType.Wolf]: { movement: '3 (walk)', attackType: 'Melee', heavy: false, flying: false, special: '+1 STR per adjacent Wolf' },
  [PieceType.Healer]: { movement: '1 (any)', attackType: 'None', heavy: false, flying: false, special: '+1 STR to adjacent allies' },
  [PieceType.Ranger]: { movement: '2 (walk)', attackType: 'Long-Range', range: '3 hexes', heavy: false, flying: false },
  [PieceType.Wizard]: { movement: '1 (any)', attackType: 'Ranged', range: '2 hexes', heavy: false, flying: false, special: 'Fireball (AoE damage)' },
  [PieceType.Necromancer]: { movement: '1 (any)', attackType: 'Melee', heavy: false, flying: false, special: 'Raise Dead (revive ally)' },
  [PieceType.Phoenix]: { movement: '3 (flying)', attackType: 'Melee', heavy: false, flying: true, special: 'Rebirth after 3 turns' },
};

export const PieceTooltip: React.FC<PieceTooltipProps> = ({ piece, position }) => {
  const info = PIECE_INFO[piece.type];
  if (!info) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: 20,
    bottom: 20,
    zIndex: 1000,
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    color: '#eee',
    padding: '16px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    border: `2px solid ${piece.color === 'w' ? '#ddd' : '#555'}`,
    minWidth: '220px',
    maxWidth: '280px',
    backdropFilter: 'blur(4px)',
  };

  const titleStyle: React.CSSProperties = {
    margin: '0 0 12px 0',
    fontSize: '1.2rem',
    fontWeight: 'bold',
    color: '#fff',
    borderBottom: '2px solid #4a90e2',
    paddingBottom: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9rem',
    marginBottom: '6px',
    color: '#aaa',
  };

  const valueStyle: React.CSSProperties = {
    color: '#fff',
    fontWeight: 500,
  };

  const badgeStyle = (color: string): React.CSSProperties => ({
    fontSize: '0.7rem',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: color,
    color: 'white',
    marginLeft: '4px',
  });

  return (
    <div style={style}>
      <h3 style={titleStyle}>
        <span>{piece.type}</span>
        <span style={{ fontSize: '0.9rem', color: piece.color === 'w' ? '#eee' : '#888' }}>
          {piece.color === 'w' ? 'White' : 'Black'}
        </span>
      </h3>

      <div style={rowStyle}>
        <span>Movement:</span>
        <span style={valueStyle}>{info.movement}</span>
      </div>

      <div style={rowStyle}>
        <span>Attack:</span>
        <span style={valueStyle}>
          {info.attackType}
          {info.range && ` (${info.range})`}
        </span>
      </div>

      <div style={rowStyle}>
        <span>Strength:</span>
        <span style={valueStyle}>{piece.Strength}</span>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
        {info.heavy && <span style={badgeStyle('#8e44ad')}>Heavy</span>}
        {info.flying && <span style={badgeStyle('#3498db')}>Flying</span>}
        {piece.canMove && <span style={badgeStyle('#27ae60')}>Can Move</span>}
        {piece.canAttack && <span style={badgeStyle('#e74c3c')}>Can Attack</span>}
      </div>

      {info.special && (
        <div style={{ 
          marginTop: '12px', 
          padding: '8px', 
          backgroundColor: 'rgba(255,255,255,0.08)', 
          borderRadius: '4px',
          fontSize: '0.85rem',
          color: '#f1c40f'
        }}>
          <strong>Special:</strong> {info.special}
        </div>
      )}

      {piece.damage > 0 && (
        <div style={{ 
          marginTop: '8px', 
          color: '#e74c3c',
          fontSize: '0.85rem'
        }}>
          Damage: {piece.damage}/{piece.Strength}
        </div>
      )}
    </div>
  );
};

export default PieceTooltip;
