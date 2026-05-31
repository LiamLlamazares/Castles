import React, { useMemo } from 'react';
import HexGrid from "../HexGrid";
import PieceRenderer from "../PieceRenderer";
import LegalMoveOverlay from "../LegalMoveOverlay";
import { LayoutService } from "../../Classes/Systems/LayoutService";
import { Piece } from "../../Classes/Entities/Piece";
import { Sanctuary } from "../../Classes/Entities/Sanctuary";
import { Hex } from "../../Classes/Entities/Hex";
import { PieceFactory } from "../../Classes/Entities/PieceFactory";
import { SanctuaryConfig, PieceTheme, AbilityType } from "../../Constants";
import { useGameState, useGameActions } from "../../contexts/GameContext";
import { useClickHandler } from "../../hooks/useClickHandler";
import { useTooltip } from "../../hooks/useTooltip";
import { useGameView } from "../../hooks/useGameView";
import { AbilitySystem } from "../../Classes/Systems/AbilitySystem";

interface BoardContainerProps {
  layout: LayoutService;
  pieceTheme: PieceTheme;
  isInitialLoad: boolean;
  tooltip: ReturnType<typeof useTooltip>;
  
  // View State Props (passed from parent to ensure sync with Menu)
  viewState: ReturnType<typeof useGameView>;
  
  activeAbility?: AbilityType | null;
  onAbilitySelect?: (ability: AbilityType | null) => void;
  onActiveAbilityChange?: (ability: import("../../Constants").AbilityType | null) => void;
  containerStyle?: React.CSSProperties;
}

export const BoardContainer: React.FC<BoardContainerProps> = ({
  layout,
  pieceTheme,
  isInitialLoad,
  tooltip,
  viewState,
  activeAbility: controlledActiveAbility,
  onAbilitySelect,
  onActiveAbilityChange,
  containerStyle
}) => {
  const gameState = useGameState();
  const {
      pieces,
      castles,
      sanctuaries,
      currentPlayer,
      hexagons,
      legalMoveSet,
      legalAttackSet,
      isRecruitmentSpot,
      isPledgeSpot,
      board,
      movingPiece,
      winner,
      onlineSession
  } = gameState;
  const isReadOnly = onlineSession?.role === "spectator";

  const {
      handlePieceClick,
      handleHexClick: onEngineHexClick,
      pledge,
      canPledge,
      triggerAbility,
      isHexDefended
  } = useGameActions();

  // Click handler logic
  const {
    handleBoardClick: onEngineBoardClick,
    isPledgeTarget,
    activeAbility,
    setActiveAbility,
    pledgingSanctuary,
  } = useClickHandler({
    movingPiece,
    sanctuaries,
    pieces,
    canPledge,
    pledge,
    triggerAbility: (sourceHex, targetHex, ability) => {
        const piece = pieces.find(p => p.hex.equals(sourceHex));
        if (piece) {
            triggerAbility(piece, targetHex, ability);
        }
    },
    activeAbility: controlledActiveAbility,
    setActiveAbility: onAbilitySelect,
    onEngineHexClick,
    isReadOnly,
    board,
    gameState // Context state aligns with GameState interface
  });

  const boardHexKeySet = useMemo(
    () => new Set(hexagons.map((hex) => hex.getKey())),
    [hexagons]
  );

  const emptyOverlaySet = useMemo(() => new Set<string>(), []);

  const abilityTargetSet = useMemo(() => {
    if (isReadOnly || !activeAbility || !movingPiece) return emptyOverlaySet;

    return new Set(
      AbilitySystem.getValidTargets(movingPiece, activeAbility, gameState)
        .filter((hex) => boardHexKeySet.has(hex.getKey()))
        .map((hex) => hex.getKey())
    );
  }, [activeAbility, boardHexKeySet, emptyOverlaySet, gameState, isReadOnly, movingPiece]);

  // Notify parent of active ability changes if needed (for AbilityBar)
  React.useEffect(() => {
    onActiveAbilityChange?.(activeAbility);
  }, [activeAbility, onActiveAbilityChange]);

  const handleBoardClick = React.useCallback((hex: Hex) => {
    tooltip.clearAll();
    onEngineBoardClick(hex);
  }, [tooltip, onEngineBoardClick]);

  const handleHexHover = React.useCallback((hex: Hex | null, event?: React.MouseEvent) => {
    tooltip.setHovered(hex, event);
  }, [tooltip]);

  const isVisiblePledgeTarget = React.useCallback(
    (hex: Hex): boolean => !isReadOnly && (isPledgeTarget(hex) || isPledgeSpot(hex)),
    [isReadOnly, isPledgeTarget, isPledgeSpot]
  );

  const handlePieceClickWrapper = React.useCallback((piece: Piece) => {
    if (activeAbility) {
        handleBoardClick(piece.hex);
    } else {
        handlePieceClick(piece);
    }
  }, [activeAbility, handleBoardClick, handlePieceClick]);

  const viewBox = useMemo(() => {
    return layout.calculateViewBox();
  }, [layout]);

  const occupiedSanctuaryCooldownBadges = useMemo(() => {
    const occupiedHexKeys = new Set(pieces.map((piece) => piece.hex.getKey()));
    return sanctuaries.filter(
      (sanctuary) => sanctuary.cooldown > 0 && occupiedHexKeys.has(sanctuary.hex.getKey())
    );
  }, [pieces, sanctuaries]);

  const renderOccupiedSanctuaryCooldownBadges = () => {
    const iconSize = layout.size_image * 0.35;
    const offsetX = iconSize * 1.1;
    const badgeRadius = Math.max(12, iconSize * 0.34);

    return occupiedSanctuaryCooldownBadges.map((sanctuary) => {
      const center = layout.layout.hexToPixelReflected(sanctuary.hex, viewState.isBoardRotated);
      const x = center.x + offsetX + iconSize * 0.42;
      const y = center.y - iconSize * 0.42;

      return (
        <g key={`sanctuary-cooldown-${sanctuary.hex.getKey()}`} style={{ pointerEvents: 'none' }}>
          <circle
            cx={x}
            cy={y}
            r={badgeRadius}
            fill="#1d2130"
            stroke="#ffd700"
            strokeWidth={2}
          />
          <text
            x={x}
            y={y + badgeRadius * 0.34}
            textAnchor="middle"
            style={{
              fontSize: `${Math.max(11, badgeRadius * 0.95)}px`,
              fill: "#ffd700",
              fontWeight: 900,
              pointerEvents: "none",
            }}
          >
            {sanctuary.cooldown}
          </text>
        </g>
      );
    });
  };

  const defaultStyle: React.CSSProperties = { 
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%', 
    height: '100vh',
    overflow: 'hidden'
  };

  return (
      <div style={{ ...defaultStyle, ...containerStyle }}
      onClick={() => {
        tooltip.clearAll();
      }}
      >
        <svg 
          className={`board ${isInitialLoad ? 'no-transition' : ''}`} 
          width="100%"
          height="100%"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
            <feOffset dx="-2" dy="-2" result="offsetblur" />
            <feFlood floodColor="rgba(0,0,0,0.5)" />
            <feComposite in2="offsetblur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        <HexGrid
          hexagons={hexagons}
          castles={castles}
          sanctuaries={sanctuaries}
          showCoordinates={viewState.showCoordinates}
          isBoardRotated={viewState.isBoardRotated}
          isAdjacentToControlledCastle={isRecruitmentSpot}
          onHexClick={handleBoardClick}
          onHexRightClick={(hex) => {
            tooltip.clearPiece();
            const sanctuary = sanctuaries.find(s => s.hex.equals(hex));
            if (sanctuary) {
              const pieceType = SanctuaryConfig[sanctuary.type].pieceType;
              const dummyPiece = PieceFactory.create(pieceType, hex, currentPlayer);
              tooltip.showPieceTooltip(dummyPiece, true);
            } else {
              tooltip.toggleHexTooltip(hex);
            }
          }}
          onHexHover={handleHexHover}
          resizeVersion={viewState.resizeVersion}
          layout={layout}
          board={board}
          isPledgeTarget={isVisiblePledgeTarget}
          pledgingSanctuary={pledgingSanctuary}
          showCastleRecruitment={viewState.showCastleRecruitment}
          showTerrainIcons={viewState.showTerrainIcons}
          showSanctuaryIcons={viewState.showSanctuaryIcons}
        />
        <PieceRenderer
          pieces={pieces}
          isBoardRotated={viewState.isBoardRotated}
          onPieceClick={handlePieceClickWrapper}
          onPieceRightClick={(piece) => {
            if (piece) tooltip.togglePieceTooltip(piece);
          }}
          resizeVersion={viewState.resizeVersion}
          layout={layout}
          board={board}
          showShields={viewState.showShields}
          pieceTheme={pieceTheme}
        />
        <LegalMoveOverlay
          hexagons={hexagons}
          legalMoveSet={activeAbility ? emptyOverlaySet : legalMoveSet}
          legalAttackSet={activeAbility ? emptyOverlaySet : legalAttackSet}
          abilityTargetSet={abilityTargetSet}
          isBoardRotated={viewState.isBoardRotated}
          onHexClick={handleBoardClick}
          layout={layout}
        />
        {renderOccupiedSanctuaryCooldownBadges()}
        </svg>
      </div>
  );
};
