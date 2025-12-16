import React from "react";
import ChessClock from "./Clock";
import TurnBanner from "./Turn_banner";
import { TurnPhase, Color, STARTING_TIME } from "../Constants";

interface PlayerHUDProps {
  currentPlayer: Color;
  turnPhase: TurnPhase;
}

const PlayerHUD: React.FC<PlayerHUDProps> = ({ currentPlayer, turnPhase }) => {
  return (
    <div className="player-hud">
      {/* Black Player Status */}
      <div className="player-status">
        <ChessClock
          initialTime={STARTING_TIME}
          isActive={currentPlayer === "b"}
          player="b"
        />
        {currentPlayer === "b" && (
          <TurnBanner color={currentPlayer} phase={turnPhase} />
        )}
      </div>

      {/* White Player Status */}
      <div className="player-status">
        <ChessClock
          initialTime={STARTING_TIME}
          isActive={currentPlayer === "w"}
          player="w"
        />
        {currentPlayer === "w" && (
          <TurnBanner color={currentPlayer} phase={turnPhase} />
        )}
      </div>
    </div>
  );
};

export default PlayerHUD;
