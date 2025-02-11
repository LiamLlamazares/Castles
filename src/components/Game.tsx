import { Component } from "react";
import { Piece } from "../Classes/Piece";
import { Castle } from "../Classes/Castle";
import { Hex } from "../Classes/Hex";
import {
  PieceType,
  NSquaresc,
  turnPhase,
  Color,
  AttackType,
  startingTime,
  defendedPieceIsProtectedRanged,
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

class GameBoard extends Component {
  state = {
    history: [],
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
        r={90 / NSquaresc}
        className={className}
        onClick={() => this.handleHexClick(hex)}
      />
    );
  };
  get turn_phase(): turnPhase {
    return this.state.turnCounter % 5 < 2
      ? "Movement"
      : this.state.turnCounter % 5 < 4
      ? "Attack"
      : "Castles";
  }
  get currentPlayer(): Color {
    return this.state.turnCounter % 10 < 5 ? "w" : "b";
  }
  get hexagons(): Hex[] {
    return startingBoard.hexes;
  }
  get blockedHexes(): Hex[] {
    return [
      ...startingBoard.riverHexes,
      ...startingBoard.castleHexes,
      ...this.occupiedHexes,
    ];
  }
  get occupiedHexes(): Hex[] {
    return this.state.pieces.map((piece) => piece.hex);
  }
  get enemyCastleHexes(): Hex[] {
    return this.state.Castles.filter(
      (castle) => castle.color !== this.currentPlayer
    ).map((castle) => castle.hex);
  }

  get enemyHexes(): Hex[] {
    return this.state.pieces
      .filter((piece) => piece.color !== this.currentPlayer)
      .map((piece) => piece.hex);
  }
  get attackableHexes(): Hex[] {
    return [...this.enemyHexes, ...this.enemyCastleHexes];
  }

  get legalMoves(): Hex[] {
    const { movingPiece } = this.state;
    if (movingPiece && this.turn_phase === "Movement" && movingPiece.canMove) {
      const color = movingPiece.color;
      return movingPiece.legalmoves(this.blockedHexes, color);
    }
    return [];
  }
  //Necessary to know who ranged pieces can attack
  get defendedHexes(): Hex[] {
    if (defendedPieceIsProtectedRanged) {
      let enemyMeleePieces = this.state.pieces.filter(
        (piece) =>
          piece.color !== this.currentPlayer &&
          piece.AttackType === AttackType.Melee
      );
      //Gets squares attacked by enemy pieces
      return enemyMeleePieces
        .map((piece) => piece.legalAttacks(this.hexagons))
        .flat(1);
    }
    return [];
  }
  //Necessary to display attacks in attack phase
  get legalAttacks(): Hex[] {
    const { movingPiece } = this.state;
    if (movingPiece && this.turn_phase === "Attack" && movingPiece.canAttack) {
      if (movingPiece.AttackType === AttackType.Ranged) {
        // Hexes can only be attacked by ranged pieces if they are not defended by enemy melee pieces
        return movingPiece
          .legalAttacks(this.attackableHexes)
          .filter(
            (hex) =>
              !this.defendedHexes.some((defendedHex) => defendedHex.equals(hex))
          );
      }
      return movingPiece.legalAttacks(this.attackableHexes);
    }
    return [];
  }
  //Necessary to know if attack phase can be skipped, looks over every piece to see if it can attack something
  get futureLegalAttacks(): Hex[] {
    return this.state.pieces
      .filter((piece) => piece.color === this.currentPlayer && piece.canAttack)
      .flatMap((piece) =>
        piece.AttackType === AttackType.Ranged
          ? piece
              .legalAttacks(this.attackableHexes)
              .filter(
                (hex) =>
                  !this.defendedHexes.some((defendedHex) =>
                    defendedHex.equals(hex)
                  )
              )
          : piece.legalAttacks(this.attackableHexes)
      );
  }

  //Necessary to display castle information in castles phase
  get controlledCastlesActivePlayer(): Castle[] {
    return this.state.Castles.filter((castle) => {
      const piece = this.state.pieces.find((piece) =>
        piece.hex.equals(castle.hex)
      );
      return (
        piece &&
        piece.color !== castle.color &&
        castle.color !== this.currentPlayer &&
        this.turn_phase === "Castles"
      );
    });
  }
  //Necessary to know if castles phase can be skipped
  get futurecontrolledCastlesActivePlayer(): Castle[] {
    return this.state.Castles.filter((castle) => {
      const piece = this.state.pieces.find((piece) =>
        piece.hex.equals(castle.hex)
      );
      return (
        piece &&
        piece.color !== castle.color &&
        castle.color !== this.currentPlayer
      );
    });
  }

  // Necessary to know by how much to increment turn counter
  get turnCounterIncrement(): number {
    // calculate if there are potential attacks
    const hasFutureAttacks = this.futureLegalAttacks.length > 0;
    const hasFutureControlledCastles =
      this.futurecontrolledCastlesActivePlayer.length > 0;

    if (
      !hasFutureAttacks &&
      !hasFutureControlledCastles &&
      this.state.turnCounter % 5 === 1
    ) {
      return 4;
    } else if (
      !hasFutureAttacks &&
      hasFutureControlledCastles &&
      this.state.turnCounter % 5 === 1
    ) {
      return 3;
    } else if (
      !hasFutureAttacks &&
      !hasFutureControlledCastles &&
      this.state.turnCounter % 5 === 2
    ) {
      return 3;
    } else if (
      !hasFutureAttacks &&
      hasFutureControlledCastles &&
      this.state.turnCounter % 5 === 2
    ) {
      return 2;
    } else if (
      !hasFutureControlledCastles &&
      this.state.turnCounter % 5 === 3
    ) {
      return 2;
    } else if (
      this.turn_phase === "Castles" &&
      this.state.Castles.filter(
        (castle) =>
          this.castleIsControlledByActivePlayer(castle) &&
          !castle.used_this_turn
      ).length === 0
    ) {
      return 1;
    } else if (this.turn_phase === "Castles") {
      // all castles are not used
      return 0;
    } else {
      return 1;
    }
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
    const piece = this.state.pieces.find((piece) =>
      piece.hex.equals(castle.hex)
    );
    return (
      piece &&
      piece.color !== castle.color &&
      castle.color !== this.currentPlayer
    );
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
    // let turnCounter = this.state.turnCounter;
    // console.log('Passing. The turn counter is', turnCounter);

    // // Check if there are any legal attacks for the current player's pieces
    // const hasLegalAttacks = this.state.pieces.some(piece =>
    //   piece.color === this.currentPlayer && piece.legalAttacks(this.attackableHexes).length > 0
    // );

    // // If there are no legal attacks, increment the turn counter to reach the castles phase
    // if (!hasLegalAttacks && (turnCounter % 5 === 2 || turnCounter % 5 === 3)) {
    //   turnCounter += 2;
    // } else {
    //   turnCounter += 1;
    // }

    this.setState({
      movingPiece: null,
      turnCounter: this.state.turnCounter + this.turnCounterIncrement,
    });
  };
  handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === "KeyQ") {
      this.handlePass();
    }
  };

  handleTakeback = () => {
    if (this.state.history.length > 0) {
      const previousState: GameBoard | undefined = this.state.history.pop();
      if (previousState) {
        this.setState({ current: previousState });
      }
    }
  };

  handlePieceClick = (pieceClicked: Piece) => {
    const { movingPiece } = this.state;
    let turnCounter = this.state.turnCounter;
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
      //Checks if attack is legal, if it is, attack

      pieceClicked.damage = pieceClicked.damage + movingPiece.Strength;
      let pieces = this.state.pieces;
      if (
        pieceClicked.damage >= pieceClicked.Strength ||
        (pieceClicked.type === "Monarch" && movingPiece.type === "Assassin")
      ) {
        pieces = this.state.pieces.filter((piece) => piece !== pieceClicked);
        if (
          movingPiece.AttackType === AttackType.Melee ||
          movingPiece.AttackType === AttackType.Swordsman
        ) {
          movingPiece.hex = pieceClicked.hex;
        } else {
        }
      } else {
        pieces = this.state.pieces;
      }
      // Update the Pieces
      movingPiece.canAttack = false;

      //When set state is called an update is scheduled, but not executed immediately.
      // As a result, need to use a callback function to ensure
      //that the state is updated before the next line of code is executed.
      this.setState({ movingPiece: null, pieces }, () => {
        this.setState({
          turnCounter: this.state.turnCounter + this.turnCounterIncrement,
        });
      });
    }
  }; //*********END OF PIECE CLICK LOGIC********//

  handleHexClick = (hex: Hex) => {
    const { movingPiece, turnCounter } = this.state;
    //*****MOVEMENT LOGIC TO HEX**************//
    if (movingPiece?.canMove && this.turn_phase === "Movement") {
      if (this.legalMoves.some((move) => move.equals(hex))) {
        //Makes a legal move
        if (turnCounter % 5 === 1) {
          //Resets all pieces and castles in movement phase
          this.state.pieces.forEach((piece) => (piece.canMove = true));
          this.state.pieces.forEach((piece) => (piece.canAttack = true));
          this.state.pieces.forEach((piece) => (piece.damage = 0));
          this.state.Castles.forEach(
            (castle) => (castle.used_this_turn = false)
          );
        }
        movingPiece.hex = hex; //Update piece position
        movingPiece.canMove = false;
        this.setState({
          movingPiece: null,
          turnCounter: turnCounter + this.turnCounterIncrement,
        });
      } else {
        this.setState({ movingPiece: null });
      } //Illegal move, snap back to original position
    } //*********END OF MOVEMENT LOGIC************//
    //Captures castle
    else if (this.turn_phase === "Attack" && movingPiece?.canAttack) {
      if (this.legalAttacks.some((attack) => attack.equals(hex))) {
        //Makes a legal attack
        this.setState({ movingPiece: null });
        movingPiece.hex = hex; //Update piece position
        movingPiece.canAttack = false;
        const pieces = this.state.pieces;
        this.setState({ movingPiece: null, pieces }, () => {
          this.setState({
            turnCounter: this.state.turnCounter + this.turnCounterIncrement,
          });
        });
      } else {
        this.setState({ movingPiece: null });
      } //Illegal move, snap back to original position
    }
    //Adds a swordsman to clicked adjacent hex and increments the turns controlled counter of all castles controlled
    // by the player by 1
    else if (this.hexisAdjacentToControlledCastle(hex)) {
      const castle = this.state.Castles.find((castle) =>
        castle.isAdjacent(hex)
      );
      if (castle) {
        const pieces = this.state.pieces;
        const pieceTypes = Object.values(PieceType);
        const pieceType =
          pieceTypes[castle.turns_controlled % pieceTypes.length];
        pieces.push(new Piece(hex, this.currentPlayer, pieceType));
        castle.turns_controlled += 1;
        castle.used_this_turn = true;
        // console.log(
        //   "The unused castles are",
        //   this.state.Castles.filter((castle) => !castle.used_this_turn)
        // );
        this.setState({
          movingPiece: null,
          pieces,
          turnCounter: turnCounter + this.turnCounterIncrement,
        });
      }
    } else {
      this.setState({ movingPiece: null });
    } //Illegal move, snap back to original position
  };

  componentDidMount() {
    window.addEventListener("keydown", this.handleKeyDown);
  }
  //Avoids memory leak
  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
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
              initialTime={startingTime}
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
              initialTime={startingTime}
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
            if (this.hexisLegalMove(hex)) {
              return this.renderCircle(hex, "legalMoveDot");
            } else if (this.hexisLegalAttack(hex)) {
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
                x={center.x - 145 / NSquaresc}
                y={center.y - 145 / NSquaresc}
                height={275 / NSquaresc}
                width={275 / NSquaresc}
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
