import React from 'react';
import { Sanctuary } from '../Classes/Entities/Sanctuary';
import { SanctuaryConfig } from '../Constants';

interface SanctuaryTooltipProps {
  sanctuary: Sanctuary;
  position: { x: number, y: number };
  turnCounter: number;
}

export const SanctuaryTooltip: React.FC<SanctuaryTooltipProps> = ({ sanctuary, position, turnCounter }) => {
  const config = SanctuaryConfig[sanctuary.type];

  // Position slight offset from mouse/hex center
  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.x + 20,
    top: position.y - 40,
    zIndex: 1000,
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    color: '#eee',
    padding: '12px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.1)',
    pointerEvents: 'none', // Allow clicking through
    minWidth: '200px',
    backdropFilter: 'blur(4px)',
  };

  const titleStyle: React.CSSProperties = {
    margin: '0 0 8px 0',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    color: '#fff',
    borderBottom: `2px solid ${config.tier === 3 ? '#e74c3c' : config.tier === 2 ? '#9b59b6' : '#bdc3c7'}`,
    paddingBottom: '4px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const tierBadgeStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: config.tier === 3 ? 'rgba(231, 76, 60, 0.2)' : config.tier === 2 ? 'rgba(155, 89, 182, 0.2)' : 'rgba(189, 195, 199, 0.2)',
    color: config.tier === 3 ? '#e74c3c' : config.tier === 2 ? '#9b59b6' : '#bdc3c7',
  };

  const infoRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9rem',
    marginBottom: '4px',
    color: '#aaa',
  };

  const valueStyle: React.CSSProperties = {
    color: '#fff',
    fontWeight: 500,
  };

  // Turn Lock Logic
  const TURN_UNLOCK = 10;
  const isTurnLocked = turnCounter < TURN_UNLOCK;

  // Determine status color / text
  let statusColor = sanctuary.isReady ? '#2ecc71' : '#e74c3c';
  let statusText = sanctuary.hasPledgedThisGame 
    ? "Already Pledged" 
    : sanctuary.cooldown > 0 
      ? `Cooldown (${sanctuary.cooldown} turns)` 
      : "READY TO PLEDGE";

  // Override if locked by turn
  if (!sanctuary.hasPledgedThisGame && isTurnLocked) {
      statusText = `Unlocks Turn ${TURN_UNLOCK}`;
      statusColor = "#e67e22"; // Orange
  }

  const statusStyle: React.CSSProperties = {
    marginTop: '8px',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    color: statusColor,
    textAlign: 'center',
    padding: '4px',
    backgroundColor: `${statusColor}20`,
    borderRadius: '4px',
  };

  return (
    <div style={style}>
      <h3 style={titleStyle}>
        {sanctuary.type}
        <span style={tierBadgeStyle}>Tier {config.tier}</span>
      </h3>
      
      <div style={infoRowStyle}>
        <span>Reward:</span>
        <span style={valueStyle}>{config.pieceType}</span>
      </div>
      
      <div style={infoRowStyle}>
        <span>Requirements:</span>
        <span style={valueStyle}>
           {config.tier === 1 ? "Occupancy" : `Str ${config.requiredStrength}+ ${config.requiresSacrifice ? "+ Sacrifice" : ""}`}
        </span>
      </div>

      <div style={statusStyle}>
        {statusText}
      </div>
    </div>
  );
};
