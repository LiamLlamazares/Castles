import { useState, useMemo, useCallback, useEffect } from "react";
import { Piece } from "../Classes/Piece";
import { Castle } from "../Classes/Castle";
import { Hex } from "../Classes/Hex";
import {
  TurnPhase,
  Color,
  HistoryEntry,
} from "../Constants";
import { startingBoard, allPieces } from "../ConstantImports";
import "../css/Board.css";

import { GameEngine, GameState } from "../Classes/GameEngine";
import HexGrid from "./HexGrid";
import PieceRenderer from "./PieceRenderer";
import ControlPanel from "./ControlPanel";

/** Extended state for UI-specific properties */
interface GameBoardState extends GameState {
  showCoordinates: boolean;
  cheatMode: boolean;
  isBoardRotated: boolean;
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
    Castles: startingBoard.Castles as Castle[],
    showCoordinates: false,
    cheatMode: false,
    isBoardRotated: false,
  });

  const { pieces, Castles, turnCounter, movingPiece, history, showCoordinates, isBoardRotated } = state;

  // =========== COMPUTED VALUES (useMemo) ===========
  
  const turn_phase = useMemo<TurnPhase>(
    () => gameEngine.getTurnPhase(turnCounter),
    [turnCounter]
  );

  const currentPlayer = useMemo<Color>(
    () => gameEngine.getCurrentPlayer(turnCounter),
    [turnCounter]
  );

  const hexagons = useMemo(() => startingBoard.hexes, []);

  const legalMoves = useMemo(
    () => gameEngine.getLegalMoves(movingPiece, pieces, Castles, turnCounter),
    [movingPiece, pieces, Castles, turnCounter]
  );

  const legalAttacks = useMemo(
    () => gameEngine.getLegalAttacks(movingPiece, pieces, Castles, turnCounter),
    [movingPiece, pieces, Castles, turnCounter]
  );

  const victoryMessage = useMemo(
    () => gameEngine.getVictoryMessage(pieces, Castles),
    [pieces, Castles]
  );

  const winner = useMemo(
    () => gameEngine.getWinner(pieces, Castles),
    [pieces, Castles]
  );

  const controlledCastlesActivePlayer = useMemo(
    () => gameEngine.getControlledCastlesActivePlayer(Castles, pieces, turnCounter),
    [Castles, pieces, turnCounter]
  );

  const emptyUnusedHexesAdjacentToControlledCastles = useMemo(() => {
    const occupiedHexes = gameEngine.getOccupiedHexes(pieces);
    const adjacentHexes = controlledCastlesActivePlayer
      .filter((castle) => !castle.used_this_turn)
      .map((castle) => castle.hex.cubeRing(1))
      .flat(1);
    return adjacentHexes.filter(
      (hex) => !occupiedHexes.some((occupiedHex) => occupiedHex.equals(hex))
    );
  }, [pieces, controlledCastlesActivePlayer]);

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

  const hexisLegalMove = useCallback(
    (hex: Hex): boolean => legalMoves.some((move) => move.equals(hex)),
    [legalMoves]
  );

  const hexisLegalAttack = useCallback(
    (hex: Hex): boolean => legalAttacks.some((attack) => attack.equals(hex)),
    [legalAttacks]
  );

  const hexisAdjacentToControlledCastle = useCallback(
    (hex: Hex): boolean => emptyUnusedHexesAdjacentToControlledCastles.some(
      (adjacentHex) => hex.equals(adjacentHex)
    ),
    [emptyUnusedHexesAdjacentToControlledCastles]
  );

  // =========== HISTORY ===========

  const saveHistory = useCallback(() => {
    const currentState: HistoryEntry = {
      pieces: pieces.map((p) => p.clone()),
      Castles: Castles.map((c) => c.clone()),
      turnCounter: turnCounter,
    };
    setState(prev => ({
      ...prev,
      history: [...prev.history, currentState]
    }));
  }, [pieces, Castles, turnCounter]);

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
          Castles: previousState.Castles,
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
      turn_phase === "Attack" &&
      pieceClicked.color !== currentPlayer &&
      hexisLegalAttack(pieceClicked.hex)
    ) {
      saveHistory();
      setState(prev => {
        const newState = gameEngine.applyAttack(prev, movingPiece, pieceClicked.hex);
        return { ...prev, ...newState };
      });
      return;
    }

    // CASE 4: Select own piece (if valid for current phase)
    const canSelectForMovement = turn_phase === "Movement" && pieceClicked.canMove;
    const canSelectForAttack = turn_phase === "Attack" && pieceClicked.canAttack;
    const isOwnPiece = pieceClicked.color === currentPlayer;

    if (isOwnPiece && (canSelectForMovement || canSelectForAttack)) {
      setState(prev => ({ ...prev, movingPiece: pieceClicked }));
      return;
    }

    // Default: Invalid click, deselect
    setState(prev => ({ ...prev, movingPiece: null }));
  }, [movingPiece, currentPlayer, turn_phase, hexisLegalAttack, saveHistory]);

  const handleHexClick = useCallback((hex: Hex) => {
    // CASE 1: Movement - move piece to empty hex
    if (turn_phase === "Movement" && movingPiece?.canMove) {
      if (hexisLegalMove(hex)) {
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
    if (turn_phase === "Attack" && movingPiece?.canAttack) {
      if (hexisLegalAttack(hex)) {
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
    if (hexisAdjacentToControlledCastle(hex)) {
      const castle = Castles.find(c => c.isAdjacent(hex));
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
  }, [turn_phase, movingPiece, pieces, Castles, hexisLegalMove, hexisLegalAttack, hexisAdjacentToControlledCastle, saveHistory]);

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
    startingBoard.updateDimensions(window.innerWidth, window.innerHeight);
    // Force re-render by updating a dummy state
    setState(prev => ({ ...prev }));
  }, []);

  // =========== LIFECYCLE (useEffect) ===========

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    startingBoard.updateDimensions(window.innerWidth, window.innerHeight);

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
        turnPhase={turn_phase}
        onPass={handlePass}
        onToggleCoordinates={() => setState(prev => ({ ...prev, showCoordinates: !prev.showCoordinates }))}
        onTakeback={handleTakeback}
        onFlipBoard={handleFlipBoard}
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
          castles={Castles}
          legalMoveSet={legalMoveSet}
          legalAttackSet={legalAttackSet}
          showCoordinates={showCoordinates}
          isBoardRotated={isBoardRotated}
          isAdjacentToControlledCastle={hexisAdjacentToControlledCastle}
          onHexClick={handleHexClick}
        />
        <PieceRenderer
          pieces={pieces}
          isBoardRotated={isBoardRotated}
          onPieceClick={handlePieceClick}
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
