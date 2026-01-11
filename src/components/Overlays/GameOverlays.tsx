import React from 'react';
import RulesModal from "../RulesModal";
import VictoryOverlay from "../VictoryOverlay";
import QuickStartModal, { useQuickStart } from "../QuickStartModal";
import { useGameState } from "../../contexts/GameContext";
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
  showQuickStart: boolean;
  onCloseQuickStart: () => void;
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
  showQuickStart,
  onCloseQuickStart
}) => {
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
          />
      )}

      {showQuickStart && (
        <QuickStartModal onClose={onCloseQuickStart} />
      )}
    </>
  );
};
