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
    <>
      {/* Control buttons */}
      <div className="control-panel-buttons">
        <button className="game-button" onClick={onPass} title="Pass Turn (Space)">
          Pass (Space)
        </button>
        <button className="game-button" onClick={onToggleCoordinates}>
          Toggle Coordinates
        </button>
        <button className="game-button" onClick={onTakeback} title="Takeback (Z)">
          Takeback (Z)
        </button>
        <button className="game-button" onClick={onFlipBoard} title="Flip Board (R)">
          Flip Board (R)
        </button>
      </div>

      {/* Player clocks and turn banners */}
      <div className="clock-container">
        <div className="player-clock-row">
          {currentPlayer === "b" && (
            <TurnBanner color={currentPlayer} phase={turnPhase} />
          )}
          <ChessClock
            initialTime={STARTING_TIME}
            isActive={currentPlayer === "b"}
            player="b"
          />
        </div>

        <div className="player-clock-row">
          {currentPlayer === "w" && (
            <TurnBanner color={currentPlayer} phase={turnPhase} />
          )}
          <ChessClock
            initialTime={STARTING_TIME}
            isActive={currentPlayer === "w"}
            player="w"
          />
        </div>
      </div>
    </>
  );
};

export default ControlPanel;
