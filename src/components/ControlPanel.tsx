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
import type { OnlineClockStateDTO } from "../online/types";
import type {
  OnlineGameVisibility,
  OnlinePlayerSettableGameVisibility,
} from "../online/visibility";

// SVG import
import trophyIcon from "../Assets/Images/misc/trophy.svg";

interface ControlPanelProps {
  currentPlayer: Color;
  turnPhase: TurnPhase;
  turnCounter: number;
  onPass: () => void;
  onResign: () => void;
  onNewGame: () => void;
  onShare?: () => void;
  onCopyOpponentInvite?: () => void;
  onCopySpectator?: () => void;
  onlineVisibility?: OnlineGameVisibility;
  onUpdateOnlineVisibility?: (visibility: OnlinePlayerSettableGameVisibility) => void;
  isOnlineVisibilityPending?: boolean;
  onSaveGame?: () => void;
  onOpenLibrary?: () => void;
  saveStatusLabel?: string;
  onReturnFromAnalysis?: () => void;
  analysisReturnLabel?: string;
  onEnableAnalysis?: () => void;
  shareLabel?: string;
  shareTitle?: string;
  moveHistory: MoveRecord[];
  moveTree?: MoveTree;
  onJumpToNode?: (nodeId: string) => void;
  hasGameStarted: boolean;
  winner: Color | null;
  timeControl?: { initial: number, increment: number };
  onlineClock?: OnlineClockStateDTO;
  isOnline?: boolean;
  isReadOnly?: boolean;
  isActionPending?: boolean;
  viewNodeId?: string | null;
  victoryPoints?: { w: number, b: number };
}

function formatClockMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
}

const OnlineClock: React.FC<{ clock: OnlineClockStateDTO; player: Color }> = ({ clock, player }) => {
  const [clientNow, setClientNow] = React.useState(() => Date.now());
  const receivedAtRef = React.useRef(clientNow);

  React.useEffect(() => {
    receivedAtRef.current = Date.now();
    setClientNow(receivedAtRef.current);
    const intervalId = window.setInterval(() => {
      setClientNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    clock.activeColor,
    clock.runningSince,
    clock.serverNow,
    clock.remainingMs.w,
    clock.remainingMs.b,
  ]);

  const estimatedServerNow = clock.serverNow + Math.max(0, clientNow - receivedAtRef.current);
  const elapsedMs =
    clock.activeColor === player && clock.runningSince !== null
      ? Math.max(0, estimatedServerNow - clock.runningSince)
      : 0;
  const remainingMs = Math.max(0, clock.remainingMs[player] - elapsedMs);

  return (
    <div
      className={`clock-box ${player} ${clock.activeColor === player ? "active" : ""}`}
      data-testid={`online-clock-${player}`}
    >
      {formatClockMs(remainingMs)}
    </div>
  );
};

const NoClock: React.FC<{ player: Color }> = ({ player }) => (
  <div className={`clock-box ${player}`} data-testid={`online-clock-${player}`}>
    --:--
  </div>
);

const VPTrack: React.FC<{ vp: number, player: Color }> = ({ vp, player }) => {
  const filled = Math.max(0, Math.min(vp, VP_VICTORY_THRESHOLD));
  const playerName = player === "w" ? "White" : "Black";

  return (
    <div
      aria-label={`${playerName} victory points: ${filled} of ${VP_VICTORY_THRESHOLD}`}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 12px)",
        gap: "4px",
      }}
    >
      {Array.from({ length: VP_VICTORY_THRESHOLD }).map((_, index) => {
        const isFilled = index < filled;
        return (
          <span
            key={index}
            data-testid={`vp-pip-${player}`}
            data-filled={isFilled ? "true" : "false"}
            aria-hidden="true"
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "2px",
              border: isFilled
                ? player === "w"
                  ? "1px solid #f7f1c9"
                  : "1px solid #020202"
                : "1px solid rgba(255,255,255,0.2)",
              background: isFilled
                ? player === "w"
                  ? "#fff7cf"
                  : "#050505"
                : "rgba(255,255,255,0.06)",
              boxShadow: isFilled ? "0 0 8px rgba(255, 215, 0, 0.45)" : "none",
            }}
          />
        );
      })}
    </div>
  );
};

const VPScoreRow: React.FC<{ label: string; vp: number; player: Color }> = ({ label, vp, player }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "48px 1fr 44px",
    alignItems: "center",
    gap: "10px",
  }}>
    <span style={{ fontSize: "0.8rem", color: "#f1ead0", fontWeight: 700 }}>{label}</span>
    <VPTrack vp={vp} player={player} />
    <span style={{ fontSize: "0.8rem", color: "#ffd700", textAlign: "right", fontWeight: 700 }}>
      {Math.min(vp, VP_VICTORY_THRESHOLD)}/{VP_VICTORY_THRESHOLD}
    </span>
  </div>
);

const VPScoreboard: React.FC<{ victoryPoints: { w: number; b: number } }> = ({ victoryPoints }) => (
  <div className="vp-scoreboard" style={{
    margin: "10px 0",
    padding: "12px",
    background: "linear-gradient(135deg, rgba(56, 48, 26, 0.86), rgba(25, 24, 20, 0.92))",
    border: "1px solid rgba(255, 215, 0, 0.28)",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  }}>
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      color: "#ffd700",
      fontSize: "0.82rem",
      fontWeight: 800,
      letterSpacing: "0.8px",
      textTransform: "uppercase",
    }}>
      <span><img src={trophyIcon} alt="" style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginRight: '6px', filter: 'invert(1)' }} />Victory Points</span>
      <span style={{ color: "#d8cfa7", fontSize: "0.72rem" }}>First to {VP_VICTORY_THRESHOLD}</span>
    </div>
    <VPScoreRow label="White" vp={victoryPoints.w} player="w" />
    <VPScoreRow label="Black" vp={victoryPoints.b} player="b" />
  </div>
);

const ControlPanel: React.FC<ControlPanelProps> = ({
  currentPlayer,
  turnPhase,
  turnCounter,
  onPass,
  onResign,
  onNewGame,
  onShare,
  onCopyOpponentInvite,
  onCopySpectator,
  onlineVisibility,
  onUpdateOnlineVisibility,
  isOnlineVisibilityPending = false,
  onSaveGame,
  onOpenLibrary,
  saveStatusLabel,
  onReturnFromAnalysis,
  analysisReturnLabel = "Return to Game",
  onEnableAnalysis,
  shareLabel = "Share",
  shareTitle = "Share Game URL",
  moveHistory,
  moveTree,
  onJumpToNode,
  hasGameStarted,
  winner,
  timeControl,
  onlineClock,
  isOnline = false,
  isReadOnly = false,
  isActionPending = false,
  viewNodeId,
  victoryPoints,
}) => {
  // Calculate phase index within current player's turn (0-4)
  const phaseIndex = turnCounter % PHASE_CYCLE_LENGTH;
  const isGameOver = !!winner;
  const arePlayControlsDisabled = isGameOver || isReadOnly || isActionPending;
  const moveCount = moveHistory.length;
  const renderHistory = () => (
    <HistoryTable
      moveHistory={moveHistory}
      moveTree={moveTree}
      onJumpToNode={onJumpToNode}
      currentPlayer={currentPlayer}
      viewNodeId={viewNodeId}
    />
  );

  return (
    <div className="game-panel" aria-label="Game sidebar">
      {/* Black Player Section (Top) */}
      <div className="player-section black">
        {currentPlayer === "b" && !winner && (
          <TurnBanner color={currentPlayer} phase={turnPhase} phaseIndex={phaseIndex} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
          {onlineClock ? (
            <OnlineClock clock={onlineClock} player="b" />
          ) : isOnline ? (
            <NoClock player="b" />
          ) : (
            <ChessClock
              initialTime={(timeControl?.initial ?? 20) * 60}
              increment={timeControl?.increment ?? 0}
              isActive={hasGameStarted && currentPlayer === "b" && !isGameOver}
              player="b"
            />
          )}
        </div>
      </div>

      {victoryPoints && (
        <VPScoreboard victoryPoints={victoryPoints} />
      )}

      {/* Move History (Middle) */}
      <div className="notation-section" aria-label="Move history">
        {renderHistory()}
      </div>

      {/* White Player Section (Bottom) */}
      <div className="player-section white">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
          {onlineClock ? (
            <OnlineClock clock={onlineClock} player="w" />
          ) : isOnline ? (
            <NoClock player="w" />
          ) : (
            <ChessClock
              initialTime={(timeControl?.initial ?? 20) * 60}
              increment={timeControl?.increment ?? 0}
              isActive={hasGameStarted && currentPlayer === "w" && !isGameOver}
              player="w"
            />
          )}
        </div>
        {currentPlayer === "w" && !winner && (
          <TurnBanner color={currentPlayer} phase={turnPhase} phaseIndex={phaseIndex} />
        )}
      </div>

      {/* Game Controls */}
      <details className="mobile-move-history">
        <summary role="button" aria-label="Move history">
          Move history
          <span>{moveCount} {moveCount === 1 ? "move" : "moves"}</span>
        </summary>
        <div className="mobile-move-history-body">
          {renderHistory()}
        </div>
      </details>

      <div className="game-controls" aria-label="Game controls">
        <section className="control-section turn-controls" role="group" aria-label="Turn controls">
          <div className="control-section-label">Turn</div>
          <div className="control-button-row">
            <button
              className="control-button pass"
              onClick={onPass}
              title="Pass Turn (Space)"
              disabled={arePlayControlsDisabled}
            >
              Pass
            </button>
            <button className="control-button resign" onClick={onResign} disabled={arePlayControlsDisabled}>
              Resign
            </button>
          </div>
        </section>

        <section className="control-section save-controls" role="group" aria-label="Local Library and review">
          <div className="control-section-header">
            <div className="control-section-label">Local Library</div>
            {saveStatusLabel && (
              <span className="save-status-chip" aria-label={`Save status: ${saveStatusLabel}`}>
                {saveStatusLabel}
              </span>
            )}
          </div>
          <div className="control-button-row">
            {onSaveGame && (
              <>
                <button
                  className="control-button save"
                  onClick={onSaveGame}
                  title="Name this game and save it to Library"
                  aria-describedby="save-game-control-help"
                >
                  Save Game
                </button>
                <span id="save-game-control-help" className="visually-hidden">
                  Name this game and save it to Library.
                </span>
              </>
            )}
            {onOpenLibrary && (
              <>
                <button
                  className="control-button library"
                  onClick={onOpenLibrary}
                  title="Open saved games"
                  aria-describedby="library-control-help"
                >
                  Library
                </button>
                <span id="library-control-help" className="visually-hidden">
                  Open saved games in Library.
                </span>
              </>
            )}
            {onReturnFromAnalysis && (
              <button
                type="button"
                className="control-button analysis-return"
                onClick={onReturnFromAnalysis}
                title={analysisReturnLabel}
              >
                {analysisReturnLabel}
              </button>
            )}
            {onEnableAnalysis && (
              <button
                type="button"
                className="control-button analysis"
                onClick={onEnableAnalysis}
                title="Open local analysis board"
              >
                Analysis
              </button>
            )}
            {!onCopyOpponentInvite && !onCopySpectator && !onUpdateOnlineVisibility && (
              <button className="control-button share" onClick={onShare} title={shareTitle}>
                {shareLabel}
              </button>
            )}
          </div>
        </section>

        {(onCopyOpponentInvite || onCopySpectator || onUpdateOnlineVisibility) && (
          <section className="control-section online-link-controls" role="group" aria-label="Online links">
            <div className="control-section-label">Online links</div>
            <div className="control-button-row">
              {onCopyOpponentInvite && (
                <button
                  className="control-button share"
                  onClick={onCopyOpponentInvite}
                  aria-label="Copy Opponent Invite"
                  title="Copy move-enabled opponent invite link"
                >
                  Invite
                </button>
              )}
              {onCopySpectator && (
                <button
                  className="control-button share"
                  onClick={onCopySpectator}
                  aria-label="Copy Spectator Link"
                  title="Copy read-only spectator link"
                >
                  Spectator Link
                </button>
              )}
              {onUpdateOnlineVisibility && (
                <button
                  className={`control-button share visibility-${onlineVisibility === "public" ? "public" : "unlisted"}`}
                  onClick={() =>
                    onUpdateOnlineVisibility(onlineVisibility === "public" ? "unlisted" : "public")
                  }
                  aria-label={
                    onlineVisibility === "public"
                      ? "Remove Game from Watch"
                      : "Publish Game to Watch"
                  }
                  title={
                    onlineVisibility === "public"
                      ? "Remove this game from Watch"
                      : "List this game in Watch"
                  }
                  disabled={isOnlineVisibilityPending}
                >
                  {isOnlineVisibilityPending
                    ? "Saving"
                    : onlineVisibility === "public"
                      ? "Unlist"
                      : "Publish"}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="control-section play-controls" role="group" aria-label="Play">
          <div className="control-section-label">Play</div>
          <div className="control-button-row">
            <button
              className="control-button new-game"
              onClick={onNewGame}
              title="Start new game (N)"
            >
              New Game
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ControlPanel;
