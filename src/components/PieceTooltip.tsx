import React from 'react';
import { Piece } from '../Classes/Entities/Piece';
import { PieceType, AttackType } from '../Constants';
import { getImageByPieceType } from './PieceImages';

// SVG icons
import shieldSvg from '../Assets/Images/Board/shield.svg';
import skullSvg from '../Assets/Images/misc/skull.svg';

interface PieceTooltipProps {
  piece: Piece;
  position?: { x: number, y: number };
  isDefended?: boolean;
  isPreview?: boolean;  // True when showing generic piece info (e.g., from sanctuary)
  style?: React.CSSProperties;
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
  [PieceType.Swordsman]: { movement: '1 (forward diag)', attackType: 'Diagonal', heavy: false, flying: false, special: '+1 STR when on enemy side of board' },
  [PieceType.Archer]: { movement: '1 (any)', attackType: 'Ranged', range: '2 hexes', heavy: false, flying: false, special: 'Cannot attack defended pieces' },
  [PieceType.Knight]: { movement: '∞ diagonal', attackType: 'Melee', heavy: false, flying: false },
  [PieceType.Trebuchet]: { movement: '1 (any)', attackType: 'Long-Range', range: '3 hexes', heavy: true, flying: false, special: 'Cannot attack defended pieces' },
  [PieceType.Eagle]: { movement: '3 (flying)', attackType: 'Melee', heavy: false, flying: true },
  [PieceType.Giant]: { movement: '∞ orthogonal', attackType: 'Melee', heavy: true, flying: false },
  [PieceType.Assassin]: { movement: '∞ any direction', attackType: 'Melee', heavy: false, flying: false, special: 'Instant kill on Monarch (ignores strength)' },
  [PieceType.Dragon]: { movement: 'L-jump', attackType: 'Melee', heavy: true, flying: true },
  [PieceType.Monarch]: { movement: '1 (any)', attackType: 'Melee', heavy: true, flying: false, special: 'Capture loses the game!' },
  [PieceType.Wolf]: { movement: '3 (walk)', attackType: 'Melee', heavy: false, flying: false, special: '+1 STR per adjacent ally Wolf' },
  [PieceType.Healer]: { movement: '1 (any)', attackType: 'None', heavy: false, flying: false, special: '+1 STR to all adjacent allies' },
  [PieceType.Ranger]: { movement: '2 (walk)', attackType: 'Long-Range', range: '3 hexes', heavy: false, flying: false, special: 'Cannot attack defended pieces' },
  [PieceType.Wizard]: { movement: '1 (any)', attackType: 'Ranged', range: '2 hexes', heavy: false, flying: false, special: 'Fireball: deals 1 damage to target + neighbors. Teleport: move anywhere.' },
  [PieceType.Necromancer]: { movement: '1 (any)', attackType: 'Melee', heavy: false, flying: false, special: 'Starts with 1 soul. Gains +1 soul per capture. Raise Dead: spend 1 soul to revive a dead ally.' },
  [PieceType.Phoenix]: { movement: '3 (flying)', attackType: 'Melee', heavy: false, flying: true, special: 'Rebirth: respawns at your castle 3 rounds after death' },
};

export const PieceTooltip: React.FC<PieceTooltipProps> = ({ piece, position, isDefended, isPreview, style }) => {
  const info = PIECE_INFO[piece.type];
  if (!info) return null;

  const baseStyle: React.CSSProperties = {
    position: 'fixed',
    left: position?.x ?? 20,
    top: position?.y || undefined, // Use top if provided (0 treated as undefined)
    bottom: position?.y ? undefined : 20, // Default to bottom 20 if no y provided
    zIndex: 1000,
    backgroundColor: 'rgba(20, 20, 20, 0.75)',
    color: '#eee',
    padding: '10px',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    border: `2px solid ${piece.color === 'w' ? 'rgba(221, 221, 221, 0.4)' : 'rgba(85, 85, 85, 0.4)'}`,
    minWidth: '220px',
    maxWidth: '280px',
    backdropFilter: 'blur(2px)',
    pointerEvents: 'none', // Prevent tooltip from capturing mouse events (fixes flickering)
    ...style, // Merge custom styles
  };

  const titleAreaStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    borderBottom: '2px solid #4a90e2',
    paddingBottom: '4px',
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    marginBottom: '2px',
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
    <div style={baseStyle}>
      <div style={titleAreaStyle}>
        <div style={{ width: '24px', height: '24px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <img 
            src={getImageByPieceType(piece.type, piece.color)} 
            alt={piece.type} 
            style={{ width: '20px', height: '20px' }} 
          />
        </div>
        <div style={titleStyle}>
           <h3 style={{ margin: 0, fontSize: '1.0rem', color: '#fff' }}>{piece.type}</h3>
           {!isPreview && (
             <span style={{ 
               fontSize: '0.65rem', 
               fontWeight: 'bold', 
               backgroundColor: piece.color === 'w' ? '#00fbff' : '#8000ff',
               color: '#fff',
               padding: '2px 6px',
               borderRadius: '4px',
               textTransform: 'uppercase',
               marginLeft: '8px'
             }}>
               {piece.color === 'w' ? 'White' : 'Black'}
             </span>
           )}
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
        <span style={valueStyle}>
          {piece.Strength}
          {piece.type === PieceType.Swordsman && piece.Strength > 1 && (
            <span style={{ fontSize: '0.7em', color: '#00ff00', marginLeft: '4px' }}>(River Bonus)</span>
          )}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
        {info.heavy && <span style={badgeStyle('#8e44ad')}>Heavy</span>}
        {info.flying && <span style={badgeStyle('#3498db')}>Flying</span>}
        {!isPreview && piece.canMove && <span style={badgeStyle('#27ae60')}>Can Move</span>}
        {!isPreview && piece.canAttack && <span style={badgeStyle('#e74c3c')}>Can Attack</span>}
        {isDefended && <span style={badgeStyle('#f39c12')}>Defended <img src={shieldSvg} alt="" style={{ width: '12px', height: '12px', verticalAlign: 'middle' }} /></span>}
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

      {!isPreview && piece.damage > 0 && (
        <div style={{ 
          marginTop: '8px', 
          color: '#e74c3c',
          fontSize: '0.85rem'
        }}>
          Damage: {piece.damage}/{piece.Strength}
        </div>
      )}

      {/* Necromancer souls display */}
      {!isPreview && piece.type === PieceType.Necromancer && (
        <div style={{ 
          marginTop: '8px', 
          color: '#9b59b6',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span><img src={skullSvg} alt="" style={{ width: '14px', height: '14px', verticalAlign: 'middle', marginRight: '4px' }} />Souls:</span>
          <span style={{ fontWeight: 'bold', color: '#e74c3c' }}>{piece.souls}</span>
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
