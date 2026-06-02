import React from 'react';
import { Sanctuary } from '../Classes/Entities/Sanctuary';
import { Color, SanctuaryConfig } from '../Constants';

interface SanctuaryTooltipProps {
  sanctuary: Sanctuary;
  position: { x: number, y: number };
  turnCounter: number;
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
  canPledgeNow?: boolean;
  currentPhase?: string;
  currentPledgeStrength?: number;
  currentPlayerOccupies?: boolean;
  cooldownSide?: Color;
  cooldownAccelerators?: number;
  cooldownReduction?: number;
}

export const SanctuaryTooltip: React.FC<SanctuaryTooltipProps> = ({
  sanctuary,
  position,
  canPledgeNow = false,
  currentPhase,
  currentPledgeStrength = 0,
  currentPlayerOccupies = false,
  cooldownSide,
  cooldownAccelerators = 0,
  cooldownReduction = 1,
}) => {
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


  let statusColor = '#2ecc71';
  let statusText = "READY TO PLEDGE";

  if (sanctuary.cooldown > 0) {
    statusColor = '#e67e22';
    statusText = `Cooldown: ${sanctuary.cooldown}`;
  } else if (!currentPlayerOccupies) {
    statusColor = '#f1c40f';
    statusText = "Needs your piece on the sanctuary";
  } else if (config.requiredStrength > 1 && currentPledgeStrength < config.requiredStrength) {
    statusColor = '#f1c40f';
    statusText = `Need pledge strength ${config.requiredStrength}; you have ${currentPledgeStrength}`;
  } else if (currentPhase !== "Recruitment") {
    statusColor = '#f1c40f';
    statusText = "Ready in the Castles phase";
  } else if (!canPledgeNow) {
    statusColor = '#f1c40f';
    statusText = "Ready, but no adjacent spawn hex";
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
        {config.displayName}
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

      {config.requiredStrength > 1 && (
        <div style={infoRowStyle}>
          <span>Your pledge strength:</span>
          <span style={valueStyle}>{currentPledgeStrength}</span>
        </div>
      )}

      {sanctuary.cooldown > 0 && (
        <>
          <div style={infoRowStyle}>
            <span>Cooldown for:</span>
            <span style={valueStyle}>{cooldownSide === 'w' ? 'White' : 'Black'}</span>
          </div>
          <div style={infoRowStyle}>
            <span>Across-river pieces:</span>
            <span style={valueStyle}>{cooldownAccelerators}</span>
          </div>
          <div style={infoRowStyle}>
            <span>Next reduction:</span>
            <span style={valueStyle}>{cooldownReduction}</span>
          </div>
        </>
      )}

      <div style={statusStyle}>
        {statusText}
      </div>
    </div>
  );
};
