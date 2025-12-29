import React from 'react';
import { Piece } from '../Classes/Entities/Piece';
import { PieceType, AttackType } from '../Constants';
import { getImageByPieceType } from './PieceImages';

interface PieceTooltipProps {
  piece: Piece;
  position: { x: number, y: number };
  isDefended?: boolean;
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

export const PieceTooltip: React.FC<PieceTooltipProps> = ({ piece, position, isDefended }) => {
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

  const titleAreaStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
    borderBottom: '2px solid #4a90e2',
    paddingBottom: '8px',
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    flex: 1,
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
      <div style={titleAreaStyle}>
        <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <img 
            src={getImageByPieceType(piece.type, piece.color)} 
            alt={piece.type} 
            style={{ width: '32px', height: '32px' }} 
          />
        </div>
        <div style={titleStyle}>
           <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>{piece.type}</h3>
           <span style={{ fontSize: '0.8rem', color: piece.color === 'w' ? '#aaa' : '#888' }}>
             {piece.color === 'w' ? 'White' : 'Black'} Team
           </span>
        </div>
      </div>

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
        {isDefended && <span style={badgeStyle('#f39c12')}>Defended 🛡️</span>}
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

      {/* Ranged Protection Note */}
      {(info.attackType === 'Ranged' || info.attackType === 'Long-Range') && (
        <div style={{ 
          marginTop: '8px', 
          fontSize: '0.75rem', 
          color: '#3498db',
          fontStyle: 'italic',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: '8px'
        }}>
          Note: Cannot attack "Defended" pieces (those adjacent to enemy melee units).
        </div>
      )}
    </div>
  );
};

export default PieceTooltip;
