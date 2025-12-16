import { useState, useMemo, useCallback, useEffect } from "react";
import { Piece } from "../Classes/Piece";
import { Castle } from "../Classes/Castle";
import { Hex } from "../Classes/Hex";
import {
  TurnPhase,
  Color,
  HistoryEntry,
} from "../Constants";
import { startingBoard, allPieces, startingLayout } from "../ConstantImports";
import "../css/Board.css";

import { GameEngine, GameState } from "../Classes/GameEngine";
import HexGrid from "./HexGrid";
import PieceRenderer from "./PieceRenderer";
import ControlPanel from "./ControlPanel";
import PlayerHUD from "./PlayerHUD";

/** Extended state for UI-specific properties */
interface GameBoardState extends GameState {
  showCoordinates: boolean;
  cheatMode: boolean;
  isBoardRotated: boolean;
  resizeVersion: number;
}

// Create game engine instance (stable reference)
const gameEngine = new GameEngine(startingBoard);

/**
 * Main game board component.
 * Renders the hex grid, pieces, and handles user interactions.
 */
const GameBoard = () => {
  // =========== STATE ===========
  const [state, setState] = useState<GameBoardState>({
    history: [],
    pieces: allPieces,
    movingPiece: null,
    turnCounter: 0,
    castles: startingBoard.castles as Castle[],
    showCoordinates: false,
    cheatMode: false,
    isBoardRotated: false,
    resizeVersion: 0,
  });

  const { pieces, castles, turnCounter, movingPiece, history, showCoordinates, isBoardRotated, resizeVersion } = state;



  // =========== COMPUTED VALUES (useMemo) ===========
  
  const turnPhase = useMemo<TurnPhase>(
    () => gameEngine.getTurnPhase(turnCounter),
    [turnCounter]
  );

  const currentPlayer = useMemo<Color>(
    () => gameEngine.getCurrentPlayer(turnCounter),
    [turnCounter]
  );

  const hexagons = useMemo(() => startingBoard.hexes, []);

  const legalMoves = useMemo(
    () => gameEngine.getLegalMoves(movingPiece, pieces, castles, turnCounter),
    [movingPiece, pieces, castles, turnCounter]
  );

  const legalAttacks = useMemo(
    () => gameEngine.getLegalAttacks(movingPiece, pieces, castles, turnCounter),
    [movingPiece, pieces, castles, turnCounter]
  );

  const victoryMessage = useMemo(
    () => gameEngine.getVictoryMessage(pieces, castles),
    [pieces, castles]
  );

  const winner = useMemo(
    () => gameEngine.getWinner(pieces, castles),
    [pieces, castles]
  );

  const controlledCastlesActivePlayer = useMemo(
    () => gameEngine.getControlledCastlesActivePlayer(castles, pieces, turnCounter),
    [castles, pieces, turnCounter]
  );

  const emptyUnusedHexesAdjacentToControlledCastles = useMemo(() => {
    return gameEngine.getRecruitmentHexes(pieces, castles, turnCounter);
  }, [pieces, castles, turnCounter]);

  // Sets for O(1) lookup in render
  const legalMoveSet = useMemo(
    () => new Set(legalMoves.map(h => h.getKey())),
    [legalMoves]
  );

  const legalAttackSet = useMemo(
    () => new Set(legalAttacks.map(h => h.getKey())),
    [legalAttacks]
  );

  // =========== HELPER FUNCTIONS ===========

  const isLegalMove = useCallback(
    (hex: Hex): boolean => legalMoves.some((move) => move.equals(hex)),
    [legalMoves]
  );

  const isLegalAttack = useCallback(
    (hex: Hex): boolean => legalAttacks.some((attack) => attack.equals(hex)),
    [legalAttacks]
  );

  const isRecruitmentSpot = useCallback(
    (hex: Hex): boolean => emptyUnusedHexesAdjacentToControlledCastles.some(
      (adjacentHex) => hex.equals(adjacentHex)
    ),
    [emptyUnusedHexesAdjacentToControlledCastles]
  );

  // =========== HISTORY ===========

  const saveHistory = useCallback(() => {
    const currentState: HistoryEntry = {
      pieces: pieces.map((p) => p.clone()),
      castles: castles.map((c) => c.clone()),
      turnCounter: turnCounter,
    };
    setState(prev => ({
      ...prev,
      history: [...prev.history, currentState]
    }));
  }, [pieces, castles, turnCounter]);

  // =========== EVENT HANDLERS ===========

  const handleFlipBoard = useCallback(() => {
    setState(prev => ({ ...prev, isBoardRotated: !prev.isBoardRotated }));
  }, []);

  const handlePass = useCallback(() => {
    saveHistory();
    setState(prev => {
      const newState = gameEngine.passTurn(prev);
      return { ...prev, ...newState };
    });
  }, [saveHistory]);

  const handleTakeback = useCallback(() => {
    if (history.length > 0) {
      const newHistory = [...history];
      const previousState = newHistory.pop();
      if (previousState) {
        setState(prev => ({
          ...prev,
          pieces: previousState.pieces,
          castles: previousState.castles,
          turnCounter: previousState.turnCounter,
          history: newHistory,
          movingPiece: null
        }));
      }
    }
  }, [history]);

  const handlePieceClick = useCallback((pieceClicked: Piece) => {
    // CASE 1: Deselect currently selected piece
    if (movingPiece === pieceClicked) {
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    // CASE 2: Switch to different friendly piece
    if (movingPiece && pieceClicked.color === currentPlayer) {
      setState(prev => ({ ...prev, movingPiece: pieceClicked }));
      return;
    }

    // CASE 3: Attack enemy piece
    if (
      movingPiece &&
      turnPhase === "Attack" &&
      pieceClicked.color !== currentPlayer &&
      isLegalAttack(pieceClicked.hex)
    ) {
      saveHistory();
      setState(prev => {
        const newState = gameEngine.applyAttack(prev, movingPiece, pieceClicked.hex);
        return { ...prev, ...newState };
      });
      return;
    }

    // CASE 4: Select own piece (if valid for current phase)
    const canSelectForMovement = turnPhase === "Movement" && pieceClicked.canMove;
    const canSelectForAttack = turnPhase === "Attack" && pieceClicked.canAttack;
    const isOwnPiece = pieceClicked.color === currentPlayer;

    if (isOwnPiece && (canSelectForMovement || canSelectForAttack)) {
      setState(prev => ({ ...prev, movingPiece: pieceClicked }));
      return;
    }

    // Default: Invalid click, deselect
    setState(prev => ({ ...prev, movingPiece: null }));
  }, [movingPiece, currentPlayer, turnPhase, isLegalAttack, saveHistory]);

  const handleHexClick = useCallback((hex: Hex) => {
    // CASE 1: Movement - move piece to empty hex
    if (turnPhase === "Movement" && movingPiece?.canMove) {
      if (isLegalMove(hex)) {
        saveHistory();
        setState(prev => {
          const newState = gameEngine.applyMove(prev, movingPiece, hex);
          return { ...prev, ...newState };
        });
        return;
      }
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    // CASE 2: Attack - attack piece or capture castle
    if (turnPhase === "Attack" && movingPiece?.canAttack) {
      if (isLegalAttack(hex)) {
        saveHistory();
        const targetPiece = pieces.find(p => p.hex.equals(hex));
        setState(prev => {
          if (targetPiece) {
            const newState = gameEngine.applyAttack(prev, movingPiece, hex);
            return { ...prev, ...newState };
          } else {
            const newState = gameEngine.applyCastleAttack(prev, movingPiece, hex);
            return { ...prev, ...newState };
          }
        });
        return;
      }
      setState(prev => ({ ...prev, movingPiece: null }));
      return;
    }

    // CASE 3: Castles phase - recruit new piece
    if (isRecruitmentSpot(hex)) {
      const castle = castles.find(c => c.isAdjacent(hex));
      if (castle) {
        saveHistory();
        setState(prev => {
          const newState = gameEngine.recruitPiece(prev, castle, hex);
          return { ...prev, ...newState };
        });
        return;
      }
    }

    // Default: Invalid click, deselect
    setState(prev => ({ ...prev, movingPiece: null }));
  }, [turnPhase, movingPiece, pieces, castles, isLegalMove, isLegalAttack, isRecruitmentSpot, saveHistory]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Avoid triggering if user is typing in an input (though we don't have inputs yet, good practice)
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.code) {
      case "Space":
        event.preventDefault(); // Prevent scrolling
        handlePass();
        break;
      case "KeyR":
        handleFlipBoard();
        break;
      case "KeyZ":
        handleTakeback();
        break;
      case "KeyQ": // Keep legacy binding if desired, or remove. Keeping for now as hidden feature.
        handlePass();
        break;
    }
  }, [handlePass, handleFlipBoard, handleTakeback]);

  const handleResize = useCallback(() => {
    // Subtract sidebar width (200px) AND Right HUD width (~280px)
    startingLayout.updateDimensions(window.innerWidth - 550, window.innerHeight);
    // Force re-render by incrementing resizeVersion
    setState(prev => ({ ...prev, resizeVersion: prev.resizeVersion + 1 }));
  }, []);

  // =========== LIFECYCLE (useEffect) ===========

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    
    // Initial resize to set correct dimensions immediately
    handleResize();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [handleKeyDown, handleResize]);

  // =========== RENDER ===========

  return (
    <>
      <ControlPanel
        currentPlayer={currentPlayer}
        turnPhase={turnPhase}
        onPass={handlePass}
        onToggleCoordinates={() => setState(prev => ({ ...prev, showCoordinates: !prev.showCoordinates }))}
        onTakeback={handleTakeback}
        onFlipBoard={handleFlipBoard}
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
        />
        <PieceRenderer
          pieces={pieces}
          isBoardRotated={isBoardRotated}
          onPieceClick={handlePieceClick}
          resizeVersion={resizeVersion}
        />
      </svg>

      {/* Victory Overlay */}
      {victoryMessage && (
        <div className="victory-overlay">
          <div className={`victory-banner ${winner}`}>
            <h1>{victoryMessage}</h1>
            <button onClick={() => window.location.reload()}>Play Again</button>
          </div>
        </div>
      )}
    </>
  );
};

export default GameBoard;
