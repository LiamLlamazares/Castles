/**
 * ControlPanel component - renders game controls and clocks.
 * Extracted from Game.tsx for better separation of concerns.
 */
import ChessClock from "./Clock";
import TurnBanner from "./Turn_banner";
import { TurnPhase, Color, STARTING_TIME } from "../Constants";

interface ControlPanelProps {
  currentPlayer: Color;
  turnPhase: TurnPhase;
  onPass: () => void;
  onToggleCoordinates: () => void;
  onTakeback: () => void;
  onFlipBoard: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  currentPlayer,
  turnPhase,
  onPass,
  onToggleCoordinates,
  onTakeback,
  onFlipBoard,
}) => {
  return (
    <div className="sidebar">
      {/* Player Clocks & Status */}
      <div className="sidebar-section">
        <div className="player-status">
          <ChessClock
            initialTime={STARTING_TIME}
            isActive={currentPlayer === "b"}
            player="b"
          />
          {currentPlayer === "b" && (
            <div className="turn-banner-container">
               <TurnBanner color={currentPlayer} phase={turnPhase} />
            </div>
          )}
        </div>

        <div className="player-status">
          <ChessClock
            initialTime={STARTING_TIME}
            isActive={currentPlayer === "w"}
            player="w"
          />
          {currentPlayer === "w" && (
            <div className="turn-banner-container">
              <TurnBanner color={currentPlayer} phase={turnPhase} />
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-divider"></div>

      {/* Control Buttons */}
      <div className="sidebar-section control-buttons">
        <button className="game-button" onClick={onPass} title="Pass Turn (Space)">
          Pass Move (Space)
        </button>
        <button className="game-button" onClick={onTakeback} title="Takeback (Z)">
          Takeback (Z)
        </button>
        <button className="game-button" onClick={onToggleCoordinates}>
          Toggle Coordinates
        </button>
        <button className="game-button" onClick={onFlipBoard} title="Flip Board (R)">
          Flip Board (R)
        </button>
      </div>
    </div>
  );
};

export default ControlPanel;
