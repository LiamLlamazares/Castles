import React from 'react';
import { Hex } from '../Classes/Entities/Hex';
import { Board } from '../Classes/Core/Board';
import { Castle } from '../Classes/Entities/Castle';

interface TerrainTooltipProps {
  hex: Hex;
  board: Board;
  castle?: Castle;
  position: { x: number, y: number };
}

export const TerrainTooltip: React.FC<TerrainTooltipProps> = ({ hex, board, castle, position }) => {
  const isHighGround = board.highGroundHexSet.has(hex.getKey());
  const isRiver = board.riverHexSet.has(hex.getKey());
  const isCastle = board.castleHexSet.has(hex.getKey());

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
    border: '2px solid #555',
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
  };

  const descStyle: React.CSSProperties = {
    fontSize: '0.9rem',
    lineHeight: '1.4',
    color: '#ccc',
  };

  const badgeStyle = (color: string): React.CSSProperties => ({
    fontSize: '0.7rem',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: color,
    color: 'white',
    display: 'inline-block',
    marginBottom: '8px',
  });

  let title = "Normal Terrain";
  let description = "Standard plains. No special effects on movement or combat.";
  let color = "#7f8c8d";
  let badgeText = "Plains";

  if (isCastle && castle) {
    title = "Castle";
    badgeText = "Strategic Point";
    color = "#f1c40f";
    const ownerName = castle.owner === 'w' ? 'White' : castle.owner === 'b' ? 'Black' : 'Neutral';
    description = `A vital stronghold. Controls recruitment and victory. Currently held by ${ownerName}.`;
  } else if (isHighGround) {
    title = "High Ground";
    badgeText = "Tactical Advantage";
    color = "#e67e22";
    description = "Elevated terrain. Ranged and Long-Ranged units attacking FROM high ground gain +1 Range.";
  } else if (isRiver) {
    title = "River";
    badgeText = "Hazard";
    color = "#3498db";
    description = "Deep waters. Impassable for all ground units. Only Flying units can cross.";
  }

  return (
    <div style={style}>
      <span style={badgeStyle(color)}>{badgeText}</span>
      <h3 style={titleStyle}>{title}</h3>
      <div style={descStyle}>
        {description}
      </div>
      
      <div style={{ marginTop: '12px', fontSize: '0.75rem', color: '#666', borderTop: '1px solid #333', paddingTop: '8px' }}>
        Coordinates: {hex.q}, {hex.r}, {hex.s}
      </div>
    </div>
  );
};
