import React from 'react';
import RulesModal from "../RulesModal";
import VictoryOverlay from "../VictoryOverlay";
import QuickStartModal from "../QuickStartModal";
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
  onEnableAnalysis: () => void;
  canRestart?: boolean;
  showQuickStart: boolean;
  onCloseQuickStart: () => void;
  onOpenTutorial?: () => void;
  showTooltipHint: boolean;
  onDismissTooltipHint: () => void;
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
  onEnableAnalysis,
  canRestart = true,
  showQuickStart,
  onCloseQuickStart,
  onOpenTutorial
}) => {
  const gameState = useGameState();
  const { promotePiece } = useGameActions();

  return (
    <>
      <RulesModal
        isOpen={showRules}
        onClose={onCloseRules}
      />

      {!isOverlayDismissed && (
          <VictoryOverlay
            victoryMessage={victoryMessage}
            winner={winner}
            onRestart={onRestart}
            onSetup={onSetup}
            onAnalyze={onDismissOverlay}
            onEnableAnalysis={onEnableAnalysis}
            canRestart={canRestart}
          />
      )}

      {showQuickStart && (
        <QuickStartModal onClose={onCloseQuickStart} onOpenTutorial={onOpenTutorial} />
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
