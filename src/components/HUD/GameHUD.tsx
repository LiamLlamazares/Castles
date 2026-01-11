import React from 'react';
import AbilityBar from "../AbilityBar";
import { SanctuaryTooltip } from "../SanctuaryTooltip";
import { PieceTooltip } from "../PieceTooltip";
import { TerrainTooltip } from "../TerrainTooltip";
import TurnBanner from "../Turn_banner"; // Note: File name is Turn_banner.tsx
import lightbulbIcon from "../../Assets/Images/misc/lightbulb.svg";
import { useGameState, useGameActions } from "../../contexts/GameContext";
import { useTooltip } from "../../hooks/useTooltip";
import { Sanctuary } from "../../Classes/Entities/Sanctuary";
import { AbilityType } from "../../Constants";
import { Board } from "../../Classes/Core/Board";

interface GameHUDProps {
  tooltip: ReturnType<typeof useTooltip>;
  activeAbility: AbilityType | null;
  onAbilitySelect: (ability: AbilityType | null) => void;
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
}

export const GameHUD: React.FC<GameHUDProps> = ({
  tooltip,
  activeAbility,
  onAbilitySelect,
  sanctuarySettings
}) => {
  const {
      sanctuaries,
      turnCounter,
      movingPiece,
      victoryMessage,
      turnPhase,
      currentPlayer,
      board
  } = useGameState();

  const {
      isHexDefended
  } = useGameActions();

  // Tooltip Discovery Hint
  const [showTooltipHint, setShowTooltipHint] = React.useState(() => {
    return !localStorage.getItem('hasSeenTooltipHint');
  });
  
  const dismissTooltipHint = () => {
    localStorage.setItem('hasSeenTooltipHint', 'true');
    setShowTooltipHint(false);
  };

  return (
    <>
      {/* Ability Bar */}
      {movingPiece && !victoryMessage && (
          <AbilityBar
            movingPiece={movingPiece}
            activeAbility={activeAbility}
            onAbilitySelect={onAbilitySelect}
          />
      )}
      
      {/* Sanctuary Tooltip (Hover) */}
      {tooltip.hoveredHex && sanctuaries && (
          (() => {
              const sanctuary = sanctuaries.find((s: Sanctuary) => s.hex.equals(tooltip.hoveredHex!));
              return sanctuary ? (
                  <SanctuaryTooltip 
                    sanctuary={sanctuary} 
                    position={tooltip.mousePosition} 
                    turnCounter={turnCounter}
                    sanctuarySettings={sanctuarySettings}
                  />
              ) : null;
          })()
      )}

      {/* Piece info tooltip (Right-click) */}
      {tooltip.piece && (
        <PieceTooltip 
          piece={tooltip.piece} 
          isDefended={isHexDefended(
            tooltip.piece.hex, 
            tooltip.piece.color === 'w' ? 'b' : 'w'
          )}
          isPreview={tooltip.isSanctuaryPreview}
        />
      )}

      {/* Terrain info tooltip (Right-click on empty hex) */}
      {tooltip.hex && (
        <TerrainTooltip 
          hex={tooltip.hex} 
          board={board} 
          castle={undefined} // Simplified for now, or fetch castle from state if needed
          position={tooltip.mousePosition} 
        />
      )}
      
      {/* Tooltip Discovery Hint Banner */}
      {showTooltipHint && (
        <div className="tooltip-hint-banner">
          <img src={lightbulbIcon} alt="" style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginRight: '4px', filter: 'invert(1)' }} /> Tip: Right-click any piece or hex for detailed information!
          <button className="hint-dismiss-btn" onClick={dismissTooltipHint}>
            Got it
          </button>
        </div>
      )}
    </>
  );
};
