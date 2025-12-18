import React from "react";
import ChessClock from "./Clock";
import TurnBanner from "./Turn_banner";
import { TurnPhase, Color, STARTING_TIME } from "../Constants";

interface PlayerHUDProps {
  currentPlayer: Color;
  turnPhase: TurnPhase;
  hasGameStarted: boolean;
  timeControl?: { initial: number, increment: number };
}

const PlayerHUD: React.FC<PlayerHUDProps> = ({ currentPlayer, turnPhase, hasGameStarted, timeControl }) => {
  return (
    <div className="player-hud">
      {/* Black Player Status */}
      <div className="player-status">
        <ChessClock
          initialTime={(timeControl?.initial ?? 20) * 60}
          increment={timeControl?.increment ?? 0}
          isActive={hasGameStarted && currentPlayer === "b"}
          player="b"
        />
        {currentPlayer === "b" && (
          <TurnBanner color={currentPlayer} phase={turnPhase} />
        )}
      </div>

      {/* White Player Status */}
      <div className="player-status">
        <ChessClock
          initialTime={(timeControl?.initial ?? 20) * 60}
          increment={timeControl?.increment ?? 0}
          isActive={hasGameStarted && currentPlayer === "w"}
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
