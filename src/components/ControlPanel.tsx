/**
 * ControlPanel component - Lichess-style right panel.
 * Shows clocks, phase indicators, notation, and game controls.
 */
import React from "react";
import ChessClock from "./Clock";
import TurnBanner from "./Turn_banner";
import HistoryTable from "./HistoryTable";
import { TurnPhase, Color, MoveRecord, PHASE_CYCLE_LENGTH } from "../Constants";
import { MoveTree } from "../Classes/Core/MoveTree";
import { VP_VICTORY_THRESHOLD } from "../Classes/Systems/WinCondition";

// SVG import
import trophyIcon from "../Assets/Images/misc/trophy.svg";

interface ControlPanelProps {
  currentPlayer: Color;
  turnPhase: TurnPhase;
  turnCounter: number;
  onPass: () => void;
  onResign: () => void;
  onNewGame: () => void;
  moveHistory: MoveRecord[];
  moveTree?: MoveTree;
  onJumpToNode?: (nodeId: string) => void;
  hasGameStarted: boolean;
  winner: Color | null;
  timeControl?: { initial: number, increment: number };
  viewNodeId?: string | null;
  victoryPoints?: { w: number, b: number };
}

// VP Badge component for displaying victory points
const VPBadge: React.FC<{ vp: number, player: Color }> = ({ vp, player }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: player === 'w' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: vp >= VP_VICTORY_THRESHOLD ? '#27ae60' : '#ffd700'
  }}>
    <span><img src={trophyIcon} alt="" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }} /></span>
    <span>{vp}/{VP_VICTORY_THRESHOLD} VP</span>
  </div>
);

const ControlPanel: React.FC<ControlPanelProps> = ({
  currentPlayer,
  turnPhase,
  turnCounter,
  onPass,
  onResign,
  onNewGame,
  moveHistory,
  moveTree,
  onJumpToNode,
  hasGameStarted,
  winner,
  timeControl,
  viewNodeId,
  victoryPoints,
}) => {
  // New Game should only be enabled before game starts OR after someone wins
  const isNewGameDisabled = hasGameStarted && !winner;
  
  // Calculate phase index within current player's turn (0-4)
  const phaseIndex = turnCounter % PHASE_CYCLE_LENGTH;

  return (
    <div className="game-panel">
      {/* Black Player Section (Top) */}
      <div className="player-section black">
        {currentPlayer === "b" && !winner && (
          <TurnBanner color={currentPlayer} phase={turnPhase} phaseIndex={phaseIndex} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
          <ChessClock
            initialTime={(timeControl?.initial ?? 20) * 60}
            increment={timeControl?.increment ?? 0}
            isActive={hasGameStarted && currentPlayer === "b" && !winner}
            player="b"
          />
          {victoryPoints && (
            <VPBadge vp={victoryPoints.b} player="b" />
          )}
        </div>
      </div>

      {/* Move History (Middle) */}
      <div className="notation-section">
        <HistoryTable 
          moveHistory={moveHistory} 
          moveTree={moveTree}
          onJumpToNode={onJumpToNode}
          currentPlayer={currentPlayer}
          viewNodeId={viewNodeId}
        />
      </div>

      {/* White Player Section (Bottom) */}
      <div className="player-section white">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
          <ChessClock
            initialTime={(timeControl?.initial ?? 20) * 60}
            increment={timeControl?.increment ?? 0}
            isActive={hasGameStarted && currentPlayer === "w" && !winner}
            player="w"
          />
          {victoryPoints && (
            <VPBadge vp={victoryPoints.w} player="w" />
          )}
        </div>
        {currentPlayer === "w" && !winner && (
          <TurnBanner color={currentPlayer} phase={turnPhase} phaseIndex={phaseIndex} />
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
