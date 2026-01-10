import React from 'react';
import { Hex } from '../Classes/Entities/Hex';
import { Board } from '../Classes/Core/Board';
import { Castle } from '../Classes/Entities/Castle';
import { PieceType } from '../Constants';
import { getImageByPieceType } from './PieceImages';

// SVG icons for terrain types
import castleSvg from '../Assets/Images/misc/wcastle.svg';
import mountainSvg from '../Assets/Images/Board/mountain.svg';
import riverSvg from '../Assets/Images/Board/river.svg';
import grassSvg from '../Assets/Images/Board/grass.svg';

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
    backgroundColor: 'rgba(20, 20, 20, 0.75)',
    color: '#eee',
    padding: '16px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    border: '2px solid rgba(85, 85, 85, 0.5)',
    minWidth: '240px',
    maxWidth: '300px',
    backdropFilter: 'blur(8px)',
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
    fontSize: '1.2rem',
    fontWeight: 'bold',
    color: '#fff',
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

  const infoRowStyle: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '0.85rem',
      marginTop: '8px',
      color: '#aaa',
  };

  let title = "Normal Terrain";
  let description = "Standard plains. No special effects on movement or combat.";
  let color = "#7f8c8d";
  let badgeText = "Plains";
  let icon: React.ReactNode = null;

  // Official recruitment cycle from rules.md
  const RECRUITMENT_CYCLE = [
    PieceType.Swordsman,
    PieceType.Archer,
    PieceType.Knight,
    PieceType.Eagle,
    PieceType.Giant,
    PieceType.Trebuchet,
    PieceType.Assassin,
    PieceType.Dragon,
    PieceType.Monarch
  ];

  let nextPieceType: PieceType | null = null;
  if (isCastle && castle) {
    title = "Castle";
    badgeText = "Strategic Point";
    // Match the vibrant highlight colors from Board.css
    color = castle.owner === 'w' ? '#00fbff' : '#8000ff';
    const ownerName = castle.owner === 'w' ? 'White' : castle.owner === 'b' ? 'Black' : 'Neutral';
    description = `A vital stronghold. Controls recruitment and victory. Currently held by ${ownerName}.`;
    
    // Use the official recruitment cycle
    nextPieceType = RECRUITMENT_CYCLE[castle.turns_controlled % RECRUITMENT_CYCLE.length];
    
    // Castle gets its own distinct icon, but NO piece icon here
    icon = <div style={{ width: '32px', height: '32px', borderRadius: '4px', border: '2px solid #f1c40f', background: 'rgba(241, 196, 15, 0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><img src={castleSvg} alt="" style={{ width: '20px', height: '20px', filter: 'invert(1)' }} /></div>;
  } else if (isHighGround) {
    title = "High Ground";
    badgeText = "Tactical Advantage";
    color = "#e67e22";
    description = "Elevated terrain. Ranged and Long-Ranged units attacking FROM high ground gain +1 Range.";
    icon = <div style={{ width: '32px', height: '32px', borderRadius: '4px', border: '2px solid #e67e22', background: 'rgba(230, 126, 34, 0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><img src={mountainSvg} alt="" style={{ width: '20px', height: '20px', filter: 'invert(1)' }} /></div>;
  } else if (isRiver) {
    title = "River";
    badgeText = "Hazard";
    color = "#3498db";
    description = "Deep waters. Impassable for all ground units. Only Flying units can cross.";
    icon = <div style={{ width: '32px', height: '32px', borderRadius: '4px', border: '2px solid #3498db', background: 'rgba(52, 152, 219, 0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><img src={riverSvg} alt="" style={{ width: '20px', height: '20px', filter: 'invert(1)' }} /></div>;
  } else {
    icon = <div style={{ width: '32px', height: '32px', borderRadius: '4px', border: '2px solid #7f8c8d', background: 'rgba(127, 140, 141, 0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><img src={grassSvg} alt="" style={{ width: '20px', height: '20px', filter: 'invert(1)' }} /></div>;
  }

  return (
    <div style={style}>
      <div style={titleAreaStyle}>
        {icon}
        <h3 style={{ ...titleStyle, fontSize: '1.1rem' }}>{title}</h3>
        
        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '6px', alignItems: 'center' }}>
          <span style={{ ...badgeStyle(color), marginBottom: 0, marginLeft: 0 }}>{badgeText}</span>
          <span style={{ fontSize: '0.7rem', color: '#666', whiteSpace: 'nowrap' }}>
            [{hex.q}, {hex.r}, {hex.s}]
          </span>
        </div>
      </div>
      
      <div style={descStyle}>
        {description}
      </div>

      {isCastle && castle && nextPieceType && (
          <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
              <div style={infoRowStyle}>
                  <span>Held For:</span>
                  <span style={{ color: '#fff' }}>{castle.turns_controlled} Full Rounds</span>
              </div>
              <div style={infoRowStyle}>
                  <span>Next Recruitment:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <img 
                            src={getImageByPieceType(nextPieceType, castle.owner)} 
                            alt={nextPieceType} 
                            style={{ width: '18px', height: '18px' }} 
                        />
                      </div>
                      <span style={{ color: castle.owner === 'w' ? '#eee' : '#bbb', fontWeight: 'bold' }}>
                          {nextPieceType}
                      </span>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
