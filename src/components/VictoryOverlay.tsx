import React from 'react';
import { Color } from '../Constants';

interface VictoryOverlayProps {
  victoryMessage: string | null;
  winner: Color | null;
  onRestart: () => void;
  onSetup: () => void;
}

const VictoryOverlay: React.FC<VictoryOverlayProps> = ({ victoryMessage, winner, onRestart, onSetup }) => {
  if (!victoryMessage) return null;

  return (
    <div className="victory-overlay">
      <div className={`victory-banner ${winner}`}>
        <h1>{victoryMessage}</h1>
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <button onClick={onRestart} style={{ padding: '10px 20px', fontSize: '1.2rem' }}>
                Reset Board
            </button>
            <button onClick={onSetup} style={{ padding: '10px 20px', fontSize: '1.2rem' }}>
                Configure New Game
            </button>
        </div>
      </div>
    </div>
  );
};

export default VictoryOverlay;
