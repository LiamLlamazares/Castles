import { Component } from "react";
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

import { GameEngine } from "../Classes/GameEngine";
import HexGrid from "./HexGrid";
import PieceRenderer from "./PieceRenderer";
import ControlPanel from "./ControlPanel";

/** State interface for the GameBoard component */
interface GameBoardState {
  history: HistoryEntry[];
  pieces: Piece[];
  movingPiece: Piece | null;
  showCoordinates: boolean;
  turnCounter: number;
  Castles: Castle[];
  cheatMode: boolean;
  isBoardRotated: boolean;
}

/**
 * Main game board component.
 * Renders the hex grid, pieces, and handles user interactions.
 */
class GameBoard extends Component<{}, GameBoardState> {
  gameEngine = new GameEngine(startingBoard);

  state: GameBoardState = {
    history: [],
    pieces: allPieces,
    movingPiece: null,
    showCoordinates: false,
    turnCounter: 0,
    Castles: startingBoard.Castles as Castle[],
    cheatMode: false,
    isBoardRotated: false,
  };

  get turn_phase(): TurnPhase {
    return this.gameEngine.getTurnPhase(this.state.turnCounter);
  }
  get currentPlayer(): Color {
    return this.gameEngine.getCurrentPlayer(this.state.turnCounter);
  }
  get hexagons(): Hex[] {
    return startingBoard.hexes;
  }


  get legalMoves(): Hex[] {
    const { movingPiece, pieces, Castles, turnCounter } = this.state;
    return this.gameEngine.getLegalMoves(movingPiece, pieces, Castles, turnCounter);
  }


  get legalAttacks(): Hex[] {
    const { movingPiece, pieces, Castles, turnCounter } = this.state;
    return this.gameEngine.getLegalAttacks(movingPiece, pieces, Castles, turnCounter);
  }

  get controlledCastlesActivePlayer(): Castle[] {
    return this.gameEngine.getControlledCastlesActivePlayer(this.state.Castles, this.state.pieces, this.state.turnCounter);
  }

  get emptyUnusedHexesAdjacentToControlledCastles(): Hex[] {
    const occupiedHexes = this.gameEngine.getOccupiedHexes(this.state.pieces);
    const adjacentHexes = this.controlledCastlesActivePlayer
      .filter((castle) => !castle.used_this_turn)
      .map((castle) => castle.hex.cubeRing(1))
      .flat(1);
    return adjacentHexes.filter(
      (hex) =>
        !occupiedHexes.some((occupiedHex) => occupiedHex.equals(hex))
    );
  }

  public castleIsControlledByActivePlayer = (castle: Castle): boolean => {
    return this.gameEngine.castleIsControlledByActivePlayer(castle, this.state.pieces, this.currentPlayer);
  };

  public hexisLegalMove = (hex: Hex): boolean => {
    return this.legalMoves.some((move) => move.equals(hex));
  };

  public hexisLegalAttack = (hex: Hex): boolean => {
    return this.legalAttacks.some((attack) => attack.equals(hex));
  };

  public hexisAdjacentToControlledCastle = (hex: Hex): boolean => {
    return this.emptyUnusedHexesAdjacentToControlledCastles.some(
      (adjacentHex) => hex.equals(adjacentHex)
    );
  };

  handleFlipBoard = (): void => {
    this.setState({ isBoardRotated: !this.state.isBoardRotated });
  };

  handlePass = (): void => {
    this.saveHistory();
    const newState = this.gameEngine.passTurn(this.state);
    this.setState(newState);
  };

  handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "KeyQ") {
      this.handlePass();
    }
  };

  saveHistory = () => {
      const currentState = {
          pieces: this.state.pieces.map((p) => p.clone()),
          Castles: this.state.Castles.map((c) => c.clone()),
          turnCounter: this.state.turnCounter,
      };
      this.setState({
          history: [...this.state.history, currentState]
      });
  };

  handleTakeback = () => {
    if (this.state.history.length > 0) {
      const history = [...this.state.history];
      const previousState = history.pop();
      if (previousState) {
        this.setState({ 
            pieces: previousState.pieces, 
            Castles: previousState.Castles,
            turnCounter: previousState.turnCounter,
            history: history,
            movingPiece: null // Reset selection
        });
      }
    }
  };

  /**
   * Handles clicks on game pieces.
   * - Clicking own piece: select/deselect for movement or attack
   * - Clicking enemy piece while attacking: execute attack
   */
  handlePieceClick = (pieceClicked: Piece): void => {
    const { movingPiece } = this.state;

    // CASE 1: Deselect currently selected piece
    if (movingPiece === pieceClicked) {
      this.setState({ movingPiece: null });
      return;
    }

    // CASE 2: Switch to different friendly piece
    if (movingPiece && pieceClicked.color === this.currentPlayer) {
      this.setState({ movingPiece: pieceClicked });
      return;
    }

    // CASE 3: Attack enemy piece
    if (
      movingPiece &&
      this.turn_phase === "Attack" &&
      pieceClicked.color !== this.currentPlayer &&
      this.hexisLegalAttack(pieceClicked.hex)
    ) {
      this.saveHistory();
      const newState = this.gameEngine.applyAttack(this.state, movingPiece, pieceClicked.hex);
      this.setState(newState);
      return;
    }

    // CASE 4: Select own piece (if valid for current phase)
    const canSelectForMovement = this.turn_phase === "Movement" && pieceClicked.canMove;
    const canSelectForAttack = this.turn_phase === "Attack" && pieceClicked.canAttack;
    const isOwnPiece = pieceClicked.color === this.currentPlayer;

    if (isOwnPiece && (canSelectForMovement || canSelectForAttack)) {
      this.setState({ movingPiece: pieceClicked });
      return;
    }

    // Default: Invalid click, deselect
    this.setState({ movingPiece: null });
  };

  /**
   * Handles clicks on empty hexes (or hexes with castles).
   * - Movement phase: move selected piece to hex
   * - Attack phase: attack castle on hex
   * - Castle phase: recruit at hex adjacent to controlled castle
   */
  handleHexClick = (hex: Hex): void => {
    const { movingPiece } = this.state;

    // CASE 1: Movement - move piece to empty hex
    if (this.turn_phase === "Movement" && movingPiece?.canMove) {
      if (this.hexisLegalMove(hex)) {
        this.saveHistory();
        const newState = this.gameEngine.applyMove(this.state, movingPiece, hex);
        this.setState(newState);
        return;
      }
      this.setState({ movingPiece: null });
      return;
    }

    // CASE 2: Attack - attack piece or capture castle
    if (this.turn_phase === "Attack" && movingPiece?.canAttack) {
      if (this.hexisLegalAttack(hex)) {
        this.saveHistory();
        const targetPiece = this.state.pieces.find(p => p.hex.equals(hex));
        if (targetPiece) {
          // Attack enemy piece
          const newState = this.gameEngine.applyAttack(this.state, movingPiece, hex);
          this.setState(newState);
        } else {
          // Capture castle (move onto it)
          const newState = this.gameEngine.applyCastleAttack(this.state, movingPiece, hex);
          this.setState(newState);
        }
        return;
      }
      this.setState({ movingPiece: null });
      return;
    }

    // CASE 3: Castles phase - recruit new piece
    if (this.hexisAdjacentToControlledCastle(hex)) {
      const castle = this.state.Castles.find(c => c.isAdjacent(hex));
      if (castle) {
        this.saveHistory();
        const newState = this.gameEngine.recruitPiece(this.state, castle, hex);
        this.setState(newState);
        return;
      }
    }

    // Default: Invalid click, deselect
    this.setState({ movingPiece: null });
  };

  handleResize = () => {
    startingBoard.updateDimensions(window.innerWidth, window.innerHeight);
    this.forceUpdate();
  };

  componentDidMount() {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("resize", this.handleResize);
    // Ensure board is synced with current window on mount
    startingBoard.updateDimensions(window.innerWidth, window.innerHeight); 
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("resize", this.handleResize);
  }

  // =========== RENDER ===========

  render() {
    // Optimization: Calculate legal moves/attacks ONCE per render
    const legalMoveSet = new Set(this.legalMoves.map(h => h.getKey()));
    const legalAttackSet = new Set(this.legalAttacks.map(h => h.getKey()));

    return (
      <>
        <ControlPanel
          currentPlayer={this.currentPlayer}
          turnPhase={this.turn_phase}
          onPass={this.handlePass}
          onToggleCoordinates={() => this.setState({ showCoordinates: !this.state.showCoordinates })}
          onTakeback={this.handleTakeback}
          onFlipBoard={this.handleFlipBoard}
        />
        
        <svg className="board" height="100%" width="100%">
          {/* SVG filter for high-ground shadow effect */}
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
              <feOffset dx="-2" dy="-2" result="offsetblur" />
              <feFlood flood-color="rgba(0,0,0,0.5)" />
              <feComposite in2="offsetblur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          <HexGrid
            hexagons={this.hexagons}
            legalMoveSet={legalMoveSet}
            legalAttackSet={legalAttackSet}
            showCoordinates={this.state.showCoordinates}
            isBoardRotated={this.state.isBoardRotated}
            isAdjacentToControlledCastle={this.hexisAdjacentToControlledCastle}
            onHexClick={this.handleHexClick}
          />
          <PieceRenderer
            pieces={this.state.pieces}
            isBoardRotated={this.state.isBoardRotated}
            onPieceClick={this.handlePieceClick}
          />
        </svg>
      </>
    );
  }
  componentDidUpdate() {
    // Debug logging can be enabled by uncommenting below:
    // console.log(`Turn: ${this.state.turnCounter}, Phase: ${this.turn_phase}, Player: ${this.currentPlayer}`);
  }
}

export default GameBoard;
