import React, { useMemo } from 'react';
import HexGrid from "../HexGrid";
import PieceRenderer from "../PieceRenderer";
import LegalMoveOverlay from "../LegalMoveOverlay";
import { LayoutService } from "../../Classes/Systems/LayoutService";
import { Piece } from "../../Classes/Entities/Piece";
import { Sanctuary } from "../../Classes/Entities/Sanctuary";
import { Hex } from "../../Classes/Entities/Hex";
import { PieceFactory } from "../../Classes/Entities/PieceFactory";
import { SanctuaryConfig, PieceTheme } from "../../Constants";
import { useGameState, useGameActions } from "../../contexts/GameContext";
import { useClickHandler } from "../../hooks/useClickHandler";
import { useTooltip } from "../../hooks/useTooltip";
import { useGameView } from "../../hooks/useGameView";

interface BoardContainerProps {
  layout: LayoutService;
  pieceTheme: PieceTheme;
  isInitialLoad: boolean;
  tooltip: ReturnType<typeof useTooltip>;
  
  // View State Props (passed from parent to ensure sync with Menu)
  viewState: ReturnType<typeof useGameView>;
  
  onActiveAbilityChange?: (ability: import("../../Constants").AbilityType | null) => void;
  containerStyle?: React.CSSProperties;
}

export const BoardContainer: React.FC<BoardContainerProps> = ({
  layout,
  pieceTheme,
  isInitialLoad,
  tooltip,
  viewState,
  onActiveAbilityChange,
  containerStyle
}) => {
  const {
      pieces,
      castles,
      sanctuaries,
      currentPlayer,
      hexagons,
      legalMoveSet,
      legalAttackSet,
      isRecruitmentSpot,
      board,
      movingPiece,
      winner
  } = useGameState();

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
    onEngineHexClick,
    board,
    gameState: useGameState() as unknown as import("../../Classes/Core/GameState").GameState // Context state is compatible enough for Policy needs
  });

  // Notify parent of active ability changes if needed (for AbilityBar)
  React.useEffect(() => {
    onActiveAbilityChange?.(activeAbility);
  }, [activeAbility, onActiveAbilityChange]);

  const handleBoardClick = (hex: Hex) => {
    tooltip.clearAll();
    onEngineBoardClick(hex);
  };

  const handleHexHover = React.useCallback((hex: Hex | null, event?: React.MouseEvent) => {
    tooltip.setHovered(hex, event);
  }, [tooltip]);

  const handlePieceClickWrapper = (piece: Piece) => {
    if (activeAbility) {
        handleBoardClick(piece.hex);
    } else {
        handlePieceClick(piece);
    }
  };

  const viewBox = useMemo(() => {
    return layout.calculateViewBox();
  }, [layout]);

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
          isPledgeTarget={isPledgeTarget}
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
          legalMoveSet={legalMoveSet}
          legalAttackSet={legalAttackSet}
          isBoardRotated={viewState.isBoardRotated}
          onHexClick={handleBoardClick}
          layout={layout}
        />
        </svg>
      </div>
  );
};
