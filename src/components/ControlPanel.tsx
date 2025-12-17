/**
 * ControlPanel component - Lichess-style right panel.
 * Shows clocks, phase indicators, notation, and game controls.
 */
import React from "react";
import ChessClock from "./Clock";
import TurnBanner from "./Turn_banner";
import HistoryTable from "./HistoryTable";
import { TurnPhase, Color, MoveRecord, STARTING_TIME } from "../Constants";

interface ControlPanelProps {
  currentPlayer: Color;
  turnPhase: TurnPhase;
  onPass: () => void;
  onResign: () => void;
  onNewGame: () => void;
  moveHistory: MoveRecord[];
  hasGameStarted: boolean;
  winner: Color | null;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  currentPlayer,
  turnPhase,
  onPass,
  onResign,
  onNewGame,
  moveHistory,
  hasGameStarted,
  winner,
}) => {
  // New Game should only be enabled before game starts OR after someone wins
  const isNewGameDisabled = hasGameStarted && !winner;

  return (
    <div className="game-panel">
      {/* Black Player Section (Top) */}
      <div className="player-section black">
        {currentPlayer === "b" && !winner && (
          <TurnBanner color={currentPlayer} phase={turnPhase} />
        )}
        <ChessClock
          initialTime={STARTING_TIME}
          isActive={hasGameStarted && currentPlayer === "b" && !winner}
          player="b"
        />
      </div>

      {/* Move History (Middle) */}
      <div className="notation-section">
        <HistoryTable moveHistory={moveHistory} currentPlayer={currentPlayer} />
      </div>

      {/* White Player Section (Bottom) */}
      <div className="player-section white">
        <ChessClock
          initialTime={STARTING_TIME}
          isActive={hasGameStarted && currentPlayer === "w" && !winner}
          player="w"
        />
        {currentPlayer === "w" && !winner && (
          <TurnBanner color={currentPlayer} phase={turnPhase} />
        )}
      </div>

      {/* Game Controls */}
      <div className="game-controls">
        <button className="control-button pass" onClick={onPass} title="Pass Turn (Space)">
          Pass
        </button>
        <button className="control-button resign" onClick={onResign}>
          Resign
        </button>
        <button 
          className="control-button new-game" 
          onClick={onNewGame}
          disabled={isNewGameDisabled}
          title={isNewGameDisabled ? "Game in progress" : "Start new game (N)"}
        >
          New Game
        </button>
      </div>
    </div>
  );
};

export default ControlPanel;
