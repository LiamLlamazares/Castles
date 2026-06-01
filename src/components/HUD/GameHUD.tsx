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
import { AbilityType, PieceType } from "../../Constants";
import { Board } from "../../Classes/Core/Board";
import { CombatSystem } from "../../Classes/Systems/CombatSystem";

interface GameHUDProps {
  tooltip: ReturnType<typeof useTooltip>;
  activeAbility: AbilityType | null;
  onAbilitySelect: (ability: AbilityType | null) => void;
  sanctuarySettings?: { unlockTurn: number, cooldown: number };
  showDiscoveryHint?: boolean;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  tooltip,
  activeAbility,
  onAbilitySelect,
  sanctuarySettings,
  showDiscoveryHint = true
}) => {
  const {
      sanctuaries,
      castles,
      turnCounter,
      movingPiece,
      victoryMessage,
      turnPhase,
      currentPlayer,
      board,
      pieceMap,
      pieces
  } = useGameState();

  const {
      isHexDefended,
      canPledge
  } = useGameActions();

  // Tooltip Discovery Hint
  const [showTooltipHint, setShowTooltipHint] = React.useState(() => {
    return showDiscoveryHint && !localStorage.getItem('hasSeenTooltipHint');
  });

  React.useEffect(() => {
    if (!showDiscoveryHint) {
      setShowTooltipHint(false);
      return;
    }

    if (!localStorage.getItem('hasSeenTooltipHint')) {
      setShowTooltipHint(true);
    }
  }, [showDiscoveryHint]);
  
  const dismissTooltipHint = () => {
    localStorage.setItem('hasSeenTooltipHint', 'true');
    setShowTooltipHint(false);
  };

  return (
    <>
      {/* Ability Bar */}
      {turnPhase === "Attack" && movingPiece && !victoryMessage && (
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
              const occupant = sanctuary ? pieceMap.getByKey(sanctuary.hex.getKey()) : null;
              const currentPlayerOccupies = !!occupant && occupant.color === currentPlayer;
              const friendlyNeighbors = sanctuary
                ? sanctuary.hex.cubeRing(1)
                    .map((hex) => pieceMap.getByKey(hex.getKey()))
                    .filter((piece) => piece && piece.color === currentPlayer)
                : [];
              const cooldownSide = sanctuary?.controller ?? sanctuary?.territorySide;
              const cooldownAccelerators = cooldownSide
                ? pieces.filter((piece) =>
                    piece.type !== PieceType.Swordsman &&
                    piece.color === cooldownSide &&
                    (cooldownSide === 'w' ? piece.hex.r < 0 : piece.hex.r > 0)
                  ).length
                : 0;
              const currentPledgeStrength = sanctuary && currentPlayerOccupies
                ? occupant.Strength + friendlyNeighbors.reduce((sum, piece) => sum + (piece?.Strength ?? 0), 0)
                : 0;
              return sanctuary ? (
                  <SanctuaryTooltip 
                    sanctuary={sanctuary} 
                    position={tooltip.mousePosition} 
                    turnCounter={turnCounter}
                    sanctuarySettings={sanctuarySettings}
                    canPledgeNow={canPledge(sanctuary.hex)}
                    currentPhase={turnPhase}
                    currentPledgeStrength={currentPledgeStrength}
                    currentPlayerOccupies={currentPlayerOccupies}
                    cooldownSide={cooldownSide}
                    cooldownAccelerators={cooldownAccelerators}
                    cooldownReduction={1 + cooldownAccelerators}
                  />
              ) : null;
          })()
      )}

      {/* Piece info tooltip (Right-click) */}
      {tooltip.piece && (
        <PieceTooltip 
          piece={tooltip.piece} 
          combatStrength={
            tooltip.isSanctuaryPreview
              ? undefined
              : CombatSystem.getCombatStrength(tooltip.piece, pieceMap)
          }
          combatBonusLabels={
            tooltip.isSanctuaryPreview
              ? []
              : CombatSystem.getCombatBonusLabels(tooltip.piece, pieceMap)
          }
          isDefended={isHexDefended(
            tooltip.piece.hex, 
            tooltip.piece.color === 'w' ? 'b' : 'w'
          )}
          isPreview={tooltip.isSanctuaryPreview}
        />
      )}

      {/* Terrain info tooltip (Right-click on empty hex) */}
      {tooltip.hex && (
        (() => {
          const castle = castles.find(c => c.hex.equals(tooltip.hex!));
          return (
            <TerrainTooltip 
              hex={tooltip.hex} 
              board={board} 
              castle={castle}
              position={tooltip.mousePosition} 
            />
          );
        })()
      )}
      
      {/* Tooltip Discovery Hint Banner */}
      {showDiscoveryHint && showTooltipHint && (
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
