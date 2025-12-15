import { Component } from "react";
import { Piece } from "../Classes/Piece";
import { Castle } from "../Classes/Castle";
import { Hex } from "../Classes/Hex";
import {
  PieceType,
  N_SQUARES,
  TurnPhase,
  Color,
  AttackType,
  STARTING_TIME,
  DEFENDED_PIECE_IS_PROTECTED_RANGED,
} from "../Constants";
import { startingBoard, emptyBoard } from "../ConstantImports";
import "../css/Board.css";
import ChessClock from "./Clock";
import TurnBanner from "./Turn_banner";

import wSwordsmanImage from "../Assets/Images/Chess/wSwordsman.svg";
import bSwordsmanImage from "../Assets/Images/Chess/bSwordsman.svg";
import wDragonImage from "../Assets/Images/Chess/wDragon.svg";
import bDragonImage from "../Assets/Images/Chess/bDragon.svg";
import wArcherImage from "../Assets/Images/Chess/wArcher.svg";
import bArcherImage from "../Assets/Images/Chess/bArcher.svg";
import wGiantImage from "../Assets/Images/Chess/wGiant.svg";
import bGiantImage from "../Assets/Images/Chess/bGiant.svg";
import wAssassinImage from "../Assets/Images/Chess/wAssassin.svg";
import bAssassinImage from "../Assets/Images/Chess/bAssassin.svg";
import wMonarchImage from "../Assets/Images/Chess/wMonarch.svg";
import bMonarchImage from "../Assets/Images/Chess/bMonarch.svg";
import wTrebuchetImage from "../Assets/Images/Chess/wTrebuchet.svg";
import bTrebuchetImage from "../Assets/Images/Chess/bTrebuchet.svg";
import wKnightImage from "../Assets/Images/Chess/wKnight.svg";
import bKnightImage from "../Assets/Images/Chess/bKnight.svg";
import wEagleImage from "../Assets/Images/Chess/wEagle.svg";
import bEagleImage from "../Assets/Images/Chess/bEagle.svg";

import { GameEngine } from "../Classes/GameEngine";

class GameBoard extends Component {
  gameEngine = new GameEngine(startingBoard);

  state = {
    history: [] as {
        pieces: Piece[];
        Castles: Castle[];
        turnCounter: number;
    }[],
    pieces: startingBoard.pieces as Piece[], // We need to cast the pieces to Piece type because they are initially created as object literals
    movingPiece: null as Piece | null,
    showCoordinates: false,
    turnCounter: 0 as number,
    Castles: startingBoard.Castles as Castle[],
    cheatMode: false,
    isBoardRotated: false,
  };

  getPieceCenter = (piece: Piece) => {
    return startingBoard.hexCenters[
      piece.hex.getKey(this.state.isBoardRotated)
    ];
  };
  getHexCenter = (hex: Hex) => {
    return startingBoard.layout.hexToPixelReflected(
      hex,
      this.state.isBoardRotated
    );
  };
  getPolygonPoints = (hex: Hex) => {
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
  get blockedHexes(): Hex[] {
    return this.gameEngine.getBlockedHexes(this.state.pieces, this.state.Castles);
  }
  get occupiedHexes(): Hex[] {
    return this.gameEngine.getOccupiedHexes(this.state.pieces);
  }
  get enemyCastleHexes(): Hex[] {
    return this.gameEngine.getEnemyCastleHexes(this.state.Castles, this.currentPlayer);
  }

  get enemyHexes(): Hex[] {
    return this.gameEngine.getEnemyHexes(this.state.pieces, this.currentPlayer);
  }
  get attackableHexes(): Hex[] {
    return this.gameEngine.getAttackableHexes(this.state.pieces, this.state.Castles, this.currentPlayer);
  }

  get legalMoves(): Hex[] {
    const { movingPiece, pieces, Castles, turnCounter } = this.state;
    return this.gameEngine.getLegalMoves(movingPiece, pieces, Castles, turnCounter);
  }
  
  get defendedHexes(): Hex[] {
     return this.gameEngine.getDefendedHexes(this.state.pieces, this.currentPlayer);
  }
  
  get legalAttacks(): Hex[] {
    const { movingPiece, pieces, Castles, turnCounter } = this.state;
    return this.gameEngine.getLegalAttacks(movingPiece, pieces, Castles, turnCounter);
  }

  get futureLegalAttacks(): Hex[] {
    return this.gameEngine.getFutureLegalAttacks(this.state.pieces, this.state.Castles, this.state.turnCounter);
  }

  get controlledCastlesActivePlayer(): Castle[] {
    return this.gameEngine.getControlledCastlesActivePlayer(this.state.Castles, this.state.pieces, this.state.turnCounter);
  }

  get futurecontrolledCastlesActivePlayer(): Castle[] {
    return this.gameEngine.getFutureControlledCastlesActivePlayer(this.state.Castles, this.state.pieces, this.state.turnCounter);
  }

  get turnCounterIncrement(): number {
    return this.gameEngine.getTurnCounterIncrement(this.state.pieces, this.state.Castles, this.state.turnCounter);
  }

  get emptyUnusedHexesAdjacentToControlledCastles(): Hex[] {
    const adjacentHexes = this.controlledCastlesActivePlayer
      .filter((castle) => !castle.used_this_turn)
      .map((castle) => castle.hex.cubeRing(1))
      .flat(1);
    return adjacentHexes.filter(
      (hex) =>
        !this.occupiedHexes.some((occupiedHex) => occupiedHex.equals(hex))
    );
  }
  public castleIsControlledByActivePlayer = (castle: Castle) => {
    return this.gameEngine.castleIsControlledByActivePlayer(castle, this.state.pieces, this.currentPlayer);
  };

  public hexisLegalMove = (hex: Hex) => {
    const legalMoves = this.legalMoves;
    return legalMoves.some((move) => move.equals(hex));
  };

  public hexisLegalAttack = (hex: Hex) => {
    const legalAttacks = this.legalAttacks;
    return legalAttacks.some((attack) => attack.equals(hex));
  };
  public hexisAdjacentToControlledCastle = (hex: Hex) => {
    const hexesAdjacentToControlledCastles =
      this.emptyUnusedHexesAdjacentToControlledCastles;
    return hexesAdjacentToControlledCastles.some((adjacentHex) =>
      hex.equals(adjacentHex)
    );
  };
  handleFlipBoard = () => {
    this.setState({ isBoardRotated: !this.state.isBoardRotated });
  };
  // Add this method to your GameBoard component
  handlePass = () => {
    this.saveHistory();
    const newState = this.gameEngine.passTurn(this.state);
    this.setState(newState);
  };
  handleKeyDown = (event: KeyboardEvent) => {
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
  //Avoids memory leak
  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("resize", this.handleResize);
  }

  getImageByPieceType = (type: PieceType, color: string) => {
    const images: { [key in PieceType]: string } = {
      Swordsman: color === "w" ? wSwordsmanImage : bSwordsmanImage,
      Dragon: color === "w" ? wDragonImage : bDragonImage,
      Archer: color === "w" ? wArcherImage : bArcherImage,
      Giant: color === "w" ? wGiantImage : bGiantImage,
      Assassin: color === "w" ? wAssassinImage : bAssassinImage,
      Monarch: color === "w" ? wMonarchImage : bMonarchImage,
      Trebuchet: color === "w" ? wTrebuchetImage : bTrebuchetImage,
      Knight: color === "w" ? wKnightImage : bKnightImage,
      Eagle: color === "w" ? wEagleImage : bEagleImage,
    };
    return images[type];
  };

  render() {
    // Optimization: Calculate legal moves/attacks ONCE per render
    const legalMoveSet = new Set(this.legalMoves.map(h => h.getKey()));
    const legalAttackSet = new Set(this.legalAttacks.map(h => h.getKey()));
    
    return (
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
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            {this.currentPlayer === "b" && (
              <TurnBanner color={this.currentPlayer} phase={this.turn_phase} />
            )}
            <ChessClock
              initialTime={STARTING_TIME}
              isActive={this.currentPlayer === "b"}
              player="b"
            />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
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
        <svg className="board" height="100%" width="100%">
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
                  startingBoard.colorClassMap[hex.getKey()] ===
                  "hexagon-high-ground"
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
          {/* Render dots for legal moves */}
          {this.hexagons.map((hex: Hex) => {
            const key = hex.getKey();
            if (legalMoveSet.has(key)) {
              return this.renderCircle(hex, "legalMoveDot");
            } else if (legalAttackSet.has(key)) {
              return this.renderCircle(hex, "legalAttackDot");
            }
            return null;
          })}

          {/* Render all pieces */}
          {/* We loop over pieces instead of hexagons  */}
          {this.state.pieces.map((piece: Piece) => {
            const center = this.getPieceCenter(piece);
            return (
              <image
                key={piece.hex.getKey()}
                href={this.getImageByPieceType(piece.type, piece.color)}
                x={center.x - 145 / N_SQUARES}
                y={center.y - 145 / N_SQUARES}
                height={275 / N_SQUARES}
                width={275 / N_SQUARES}
                className="piece"
                onClick={() => this.handlePieceClick(piece)}
              />
            );
          })}
        </svg>
      </>
    );
  }
  componentDidUpdate() {
    // console.log(`The turn counter is ${this.state.turnCounter}. The turn phase is ${this.turn_phase}. It is ${this.currentPlayer}'s turn`);
    // console.log('The highground hexes are', this.hexagons.filter(hex => startingBoard.colorClassMap[hex.getKey()] === 'hexagon-high-ground'));
    // console.log('The occupied hexes are', this.occupiedHexes);
    // console.log('The blocked hexes are', this.blockedHexes);
    // console.log('The legal moves are', this.legalMoves);
    // console.log('The legal attacks are', this.legalAttacks);
    // console.log('The future legal attacks are', this.futureLegalAttacks);
    console.log("The defended hexes are", this.defendedHexes);
    // console.log(
    //   "The controlled castles are",
    //   this.controlledCastlesActivePlayer
    // );
    // console.log(
    //   "The hexes adjacent to controlled castles are",
    //   this.emptyUnusedHexesAdjacentToControlledCastles
    // );
    this.hexagons.forEach((hex) => {
      if (this.hexisAdjacentToControlledCastle(hex)) {
        // console.log(`Hex ${hex.getKey()} is adjacent to a controlled castle.`);
      }
    });
    // console.log('The future controlled castles are', this.futurecontrolledCastlesActivePlayer);
    // console.log('The enemy hexes are', this.enemyHexes);
    // console.log('The enemy castle hexes are', this.enemyCastleHexes);
    // console.log('The attackable hexes are', this.attackableHexes);
    // console.log('The pieces are', this.state.pieces);
  }
}

export default GameBoard;
