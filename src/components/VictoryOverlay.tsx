import React from 'react';
import { Color } from '../Constants';

interface VictoryOverlayProps {
  victoryMessage: string | null;
  winner: Color | null;
}

const VictoryOverlay: React.FC<VictoryOverlayProps> = ({ victoryMessage, winner }) => {
  if (!victoryMessage) return null;

  return (
    <div className="victory-overlay">
      <div className={`victory-banner ${winner}`}>
        <h1>{victoryMessage}</h1>
        <button onClick={() => window.location.reload()}>Play Again</button>
      </div>
    </div>
  );
};

export default VictoryOverlay;
