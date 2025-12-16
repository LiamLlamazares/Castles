/**
 * ControlPanel component - renders game controls and clocks.
 * Extracted from Game.tsx for better separation of concerns.
 */
import HistoryTable from "./HistoryTable";
import { TurnPhase, Color,MoveRecord } from "../Constants";

interface ControlPanelProps {
  currentPlayer: Color;
  turnPhase: TurnPhase;
  onPass: () => void;
  onToggleCoordinates: () => void;
  onTakeback: () => void;
  onFlipBoard: () => void;
  onResign: () => void;
  onNewGame: () => void;
  moveHistory: MoveRecord[];
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  currentPlayer,
  turnPhase,
  onPass,
  onToggleCoordinates,
  onTakeback,
  onFlipBoard,
  onResign,
  onNewGame,
  moveHistory,
}) => {
  return (
    <div className="sidebar">
      {/* Control Buttons */}
      <div className="sidebar-section control-buttons">
        <button className="game-button" onClick={onPass} title="Pass Turn (Space)">
          Pass Move (Space)
        </button>
        <button className="game-button" onClick={onResign} style={{ background: '#c0392b' }}>
          Resign
        </button>
        <button className="game-button" onClick={onNewGame} style={{ background: '#3498db' }}>
          New Game
        </button>
         {/* Hidden/Debug buttons can be added back if needed, but user requested simplified UI */}
        {/* <button className="game-button" onClick={onTakeback} title="Takeback (Z)">
          Takeback (Z)
        </button> */}
      </div>
      
      {/* Move History */}
      <div className="sidebar-section move-history">
          <h3>Move History</h3>
          <HistoryTable moveHistory={moveHistory} currentPlayer={currentPlayer} />
      </div>

      {/* Settings / Extra Controls (Optional) */}
      <div style={{ marginTop: 'auto', padding: '10px', display: 'flex', gap: '10px', opacity: 0.5 }}>
          <button onClick={onFlipBoard} style={iconButtonStyle} title="Flip Board">🔄</button>
          <button onClick={onToggleCoordinates} style={iconButtonStyle} title="Coordinates">#</button>
      </div>
    </div>
  );
};

const iconButtonStyle = {
    background: 'none',
    border: '1px solid #666',
    color: '#888',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px'
};

export default ControlPanel;
