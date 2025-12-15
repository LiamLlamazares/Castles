import { Component } from "react";
import { Piece } from "../Classes/Piece";
import { Castle } from "../Classes/Castle";
import { Hex, Point } from "../Classes/Hex";
import {
  PieceType,
  N_SQUARES,
  TurnPhase,
  Color,
  STARTING_TIME,
  HistoryEntry,
} from "../Constants";
import { startingBoard } from "../ConstantImports";
import "../css/Board.css";
import ChessClock from "./Clock";
import TurnBanner from "./Turn_banner";
import { getImageByPieceType } from "./PieceImages";

import { GameEngine } from "../Classes/GameEngine";

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
    pieces: startingBoard.pieces as Piece[],
    movingPiece: null,
    showCoordinates: false,
    turnCounter: 0,
    Castles: startingBoard.Castles as Castle[],
    cheatMode: false,
    isBoardRotated: false,
  };

  getPieceCenter = (piece: Piece): Point => {
    return startingBoard.hexCenters[
      piece.hex.getKey(this.state.isBoardRotated)
    ];
  };

  getHexCenter = (hex: Hex): Point => {
    return startingBoard.layout.hexToPixelReflected(
      hex,
      this.state.isBoardRotated
    );
  };

  getPolygonPoints = (hex: Hex): string => {
    return startingBoard.hexCornerString[
      hex.reflect().getKey(!this.state.isBoardRotated)
    ];
  };

  renderCircle = (hex: Hex, className: string) => {
    const center = this.getHexCenter(hex);
    return (
      <circle
        key={hex.getKey()}
        cx={center.x}
        cy={center.y}
        r={90 / N_SQUARES}
        className={className}
        onClick={() => this.handleHexClick(hex)}
      />
    );
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

  handlePieceClick = (pieceClicked: Piece) => {
    const { movingPiece } = this.state;
    // Allow to swap the moving piece
    if (movingPiece === pieceClicked) {
      //Deselecets piece
      this.setState({ movingPiece: null });
    } else if (movingPiece && pieceClicked.color === this.currentPlayer) {
      //Switches selected piece
      this.setState({ movingPiece: pieceClicked });
      return;
    }
    //******** PIECE SELECTION LOGIC *******//
    else if (
      ((this.turn_phase === "Movement" && pieceClicked.canMove) ||
        (this.turn_phase === "Attack" &&
          pieceClicked.color === this.currentPlayer &&
          pieceClicked.canAttack)) &&
      pieceClicked.color === this.currentPlayer
    ) {
      //Piece is selected
      this.setState({ movingPiece: pieceClicked });
    } else {
      this.setState({ movingPiece: null });
    } //Illegal move, snap back to original position

    //************ATTACK LOGIC************//
    if (
      movingPiece &&
      this.turn_phase === "Attack" &&
      pieceClicked.color !== this.currentPlayer &&
      this.legalAttacks.some((attack) => attack.equals(pieceClicked.hex))
    ) {
      this.saveHistory();
      // Use GameEngine for attack
      const newState = this.gameEngine.applyAttack(this.state, movingPiece, pieceClicked.hex);
      this.setState(newState);
    }
  }; //*********END OF PIECE CLICK LOGIC********//

  handleHexClick = (hex: Hex) => {
    const { movingPiece } = this.state;
    //*****MOVEMENT LOGIC TO HEX**************//
    if (movingPiece?.canMove && this.turn_phase === "Movement") {
      if (this.legalMoves.some((move) => move.equals(hex))) {
        this.saveHistory();
        // Use GameEngine for move
        const newState = this.gameEngine.applyMove(this.state, movingPiece, hex);
        this.setState(newState);
      } else {
        this.setState({ movingPiece: null });
      } 
    } //*********END OF MOVEMENT LOGIC************//
    //Captures castle
    else if (this.turn_phase === "Attack" && movingPiece?.canAttack) {     
       if (this.legalAttacks.some((attack) => attack.equals(hex))) {
           this.saveHistory();
           // Is it a piece or a castle?
           const targetPiece = this.state.pieces.find(p => p.hex.equals(hex));
           if (targetPiece) {
               const newState = this.gameEngine.applyAttack(this.state, movingPiece, hex);
               this.setState(newState);
           } else {
                // Capturing a castle by moving onto it - uses applyCastleAttack which consumes canAttack flag
                const newState = this.gameEngine.applyCastleAttack(this.state, movingPiece, hex);
                this.setState(newState);
           }
       } else {
         this.setState({ movingPiece: null });
       }
    }
    //Adds a piece to clicked adjacent hex (Recruit)
    else if (this.hexisAdjacentToControlledCastle(hex)) {
      const castle = this.state.Castles.find((castle) =>
        castle.isAdjacent(hex)
      );
      if (castle) {
        this.saveHistory();
        const newState = this.gameEngine.recruitPiece(this.state, castle, hex);
        this.setState(newState);
      }
    } else {
      this.setState({ movingPiece: null });
    } //Illegal move, snap back to original position
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

  // =========== RENDER HELPERS ===========

  /** Returns the SVG image path for a piece */
  // getImageByPieceType is now imported from PieceImages.ts

  /** Renders the control buttons (Pass, Coordinates, Takeback, Flip) */
  renderControlButtons = (): JSX.Element => (
    <>
      <button className="pass-button" onClick={this.handlePass}>
        Pass
      </button>
      <button
        className="coordinates-button"
        onClick={() =>
          this.setState({ showCoordinates: !this.state.showCoordinates })
        }
      >
        Toggle Coordinates
      </button>
      <button className="takeback-button" onClick={this.handleTakeback}>
        Takeback
      </button>
      <button className="pass-button" onClick={this.handleFlipBoard}>
        Flip Board
      </button>
    </>
  );

  /** Renders the chess clocks and turn banners for both players */
  renderPlayerClocks = (): JSX.Element => (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "20%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
        {this.currentPlayer === "b" && (
          <TurnBanner color={this.currentPlayer} phase={this.turn_phase} />
        )}
        <ChessClock
          initialTime={STARTING_TIME}
          isActive={this.currentPlayer === "b"}
          player="b"
        />
      </div>

      <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
        {this.currentPlayer === "w" && (
          <TurnBanner color={this.currentPlayer} phase={this.turn_phase} />
        )}
        <ChessClock
          initialTime={STARTING_TIME}
          isActive={this.currentPlayer === "w"}
          player="w"
        />
      </div>
    </div>
  );

  /** Renders the hexagonal grid with legal move/attack indicators */
  renderHexGrid = (legalMoveSet: Set<string>, legalAttackSet: Set<string>): JSX.Element => (
    <>
      {/* Render all hexagons */}
      {this.hexagons.map((hex: Hex) => (
        <g key={hex.getKey()}>
          <polygon
            points={this.getPolygonPoints(hex)}
            className={`${startingBoard.colorClassMap[hex.getKey()]} ${
              this.hexisAdjacentToControlledCastle(hex)
                ? "hexagon-castle-adjacent"
                : ""
            }`}
            onClick={() => this.handleHexClick(hex)}
            filter={
              startingBoard.colorClassMap[hex.getKey()] === "hexagon-high-ground"
                ? "url(#shadow)"
                : ""
            }
          />
          {this.state.showCoordinates && (
            <text
              x={this.getHexCenter(hex).x}
              y={this.getHexCenter(hex).y + 5}
              textAnchor="middle"
              style={{ fontSize: "15px", color: "black" }}
            >
              {`${-hex.q}, ${-hex.s}`}
            </text>
          )}
        </g>
      ))}
      {/* Render dots for legal moves and attacks */}
      {this.hexagons.map((hex: Hex) => {
        const key = hex.getKey();
        if (legalMoveSet.has(key)) {
          return this.renderCircle(hex, "legalMoveDot");
        } else if (legalAttackSet.has(key)) {
          return this.renderCircle(hex, "legalAttackDot");
        }
        return null;
      })}
    </>
  );

  /** Renders all pieces on the board */
  renderPieces = (): JSX.Element => (
    <>
      {this.state.pieces.map((piece: Piece) => {
        const center = this.getPieceCenter(piece);
        return (
          <image
            key={piece.hex.getKey()}
            href={getImageByPieceType(piece.type, piece.color)}
            x={center.x - 145 / N_SQUARES}
            y={center.y - 145 / N_SQUARES}
            height={275 / N_SQUARES}
            width={275 / N_SQUARES}
            className="piece"
            onClick={() => this.handlePieceClick(piece)}
          />
        );
      })}
    </>
  );

  render() {
    // Optimization: Calculate legal moves/attacks ONCE per render
    const legalMoveSet = new Set(this.legalMoves.map(h => h.getKey()));
    const legalAttackSet = new Set(this.legalAttacks.map(h => h.getKey()));

    return (
      <>
        {this.renderControlButtons()}
        {this.renderPlayerClocks()}
        
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
          
          {this.renderHexGrid(legalMoveSet, legalAttackSet)}
          {this.renderPieces()}
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
