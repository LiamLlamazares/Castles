import { useGameLogic } from "../hooks/useGameLogic";
import { useInputHandler } from "../hooks/useInputHandler";
import HexGrid from "./HexGrid";
import PieceRenderer from "./PieceRenderer";
import ControlPanel from "./ControlPanel";
import PlayerHUD from "./PlayerHUD";
import VictoryOverlay from "./VictoryOverlay";
import { Board } from "../Classes/Core/Board";
import { Piece } from "../Classes/Entities/Piece";
import { LayoutService } from "../Classes/Systems/LayoutService";
import { startingLayout, startingBoard, allPieces } from "../ConstantImports";
import "../css/Board.css";

interface GameBoardProps {
  initialBoard?: Board;
  initialPieces?: Piece[];
  initialLayout?: LayoutService;
  onResign?: () => void;
}

/**
 * Main game board component.
 * Renders the hex grid, pieces, and handles user interactions.
 */
const GameBoard: React.FC<GameBoardProps> = ({ 
  initialBoard = startingBoard, 
  initialPieces = allPieces, 
  initialLayout = startingLayout,
  onResign = () => {}
}) => {
    
  const {
    // State
    pieces,
    castles,
    showCoordinates,
    isBoardRotated,
    resizeVersion,
    
    // Computed
    turnPhase,
    currentPlayer,
    hexagons,
    legalMoveSet,
    legalAttackSet,
    victoryMessage,
    winner,
    isRecruitmentSpot,
    moveHistory,

    // Actions
    handlePass,
    handleTakeback,
    handleFlipBoard,
    toggleCoordinates,
    incrementResizeVersion,
    handlePieceClick,
    handleHexClick
  } = useGameLogic(initialBoard, initialPieces);

  useInputHandler({
    onPass: handlePass,
    onFlipBoard: handleFlipBoard,
    onTakeback: handleTakeback,
    onResize: incrementResizeVersion
  });

  // =========== RENDER ===========

  return (
    <>
      <ControlPanel
        currentPlayer={currentPlayer}
        turnPhase={turnPhase}
        onPass={handlePass}
        onToggleCoordinates={toggleCoordinates}
        onTakeback={handleTakeback}
        onFlipBoard={handleFlipBoard}
        onResign={onResign}
        moveHistory={moveHistory || []}
      />
      
      <PlayerHUD 
        currentPlayer={currentPlayer} 
        turnPhase={turnPhase} 
      />
      
      <svg className="board" height="100%" width="100%">
        {/* SVG filter for high-ground shadow effect */}
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
          legalMoveSet={legalMoveSet}
          legalAttackSet={legalAttackSet}
          showCoordinates={showCoordinates}
          isBoardRotated={isBoardRotated}
          isAdjacentToControlledCastle={isRecruitmentSpot}
          onHexClick={handleHexClick}
          resizeVersion={resizeVersion}
          layout={initialLayout}
          board={initialBoard}
        />
        <PieceRenderer
          pieces={pieces}
          isBoardRotated={isBoardRotated}
          onPieceClick={handlePieceClick}
          resizeVersion={resizeVersion}
          layout={initialLayout}
        />
      </svg>

      <VictoryOverlay victoryMessage={victoryMessage} winner={winner} />
    </>
  );
};

export default GameBoard;
