import React from 'react';
import RulesModal from "../RulesModal";
import VictoryOverlay from "../VictoryOverlay";
import PromotionModal from "../PromotionModal";
import { useGameState, useGameActions } from "../../contexts/GameContext";
import { Color } from "../../Constants";

interface GameOverlaysProps {
  showRules: boolean;
  onCloseRules: () => void;
  victoryMessage: string | null;
  winner: Color | null;
  isOverlayDismissed: boolean;
  onDismissOverlay: () => void;
  onRestart: () => void;
  onSetup: () => void;
  onRematch?: () => void;
  rematchLabel?: string;
  onEnableAnalysis: () => void;
  canRestart?: boolean;
  showTooltipHint: boolean;
  onDismissTooltipHint: () => void;
  isAnalysisMode?: boolean;
}

export const GameOverlays: React.FC<GameOverlaysProps> = ({
  showRules,
  onCloseRules,
  victoryMessage,
  winner,
  isOverlayDismissed,
  onDismissOverlay,
  onRestart,
  onSetup,
  onRematch,
  rematchLabel,
  onEnableAnalysis,
  canRestart = true,
  isAnalysisMode = false
}) => {
  const gameState = useGameState();
  const { promotePiece } = useGameActions();

  return (
    <>
      <RulesModal
        isOpen={showRules}
        onClose={onCloseRules}
      />

      {!isAnalysisMode && !isOverlayDismissed && (
          <VictoryOverlay
            victoryMessage={victoryMessage}
            winner={winner}
            onRestart={onRestart}
            onSetup={onSetup}
            onRematch={onRematch}
            rematchLabel={rematchLabel}
            onAnalyze={onDismissOverlay}
            onEnableAnalysis={onEnableAnalysis}
            canRestart={canRestart}
          />
      )}

      {gameState.promotionPending && (
        <PromotionModal
          color={gameState.promotionPending.color}
          onSelect={promotePiece}
        />
      )}
    </>
  );
};
