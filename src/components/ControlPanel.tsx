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
      <button className="pass-button" onClick={onPass}>
        Pass
      </button>
      <button className="coordinates-button" onClick={onToggleCoordinates}>
        Toggle Coordinates
      </button>
      <button className="takeback-button" onClick={onTakeback}>
        Takeback
      </button>
      <button className="pass-button" onClick={onFlipBoard}>
        Flip Board
      </button>

      {/* Player clocks and turn banners */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "20%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
          {currentPlayer === "b" && (
            <TurnBanner color={currentPlayer} phase={turnPhase} />
          )}
          <ChessClock
            initialTime={STARTING_TIME}
            isActive={currentPlayer === "b"}
            player="b"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
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
