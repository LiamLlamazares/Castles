import { Component } from 'react';
import { Piece } from '../Classes/Piece';
import { RenderHex } from '../Classes/RenderHex';
import { Hex } from '../Classes/Hex';
import "../css/Board.css";
import swordsmanImage from "../Assets/Images/fantasy/Swordsman.svg";
import dragonImage from "../Assets/Images/fantasy/dragon.png";
import archerImage from "../Assets/Images/fantasy/Archer.svg";
import { PieceType } from '../Constants';
import { startingBoard } from '../ConstantImports';
import { NSquaresc } from '../Constants';
import { Move } from '../Classes/Move';

class GameBoard extends Component {
  state = {
    hexagons: Array<RenderHex>(),
    pieces: Array<Piece>(),
    movingPiece: null as Piece | null,
    legalMoves: Array<Move>(),
  };

  handlePieceClick = (pieceClicked: Piece) => {
    //Obtain the selected piece and the hexagons from the game state
    const { movingPiece, hexagons } = this.state;
  
    if (movingPiece) {
      //Updates hexagons by making them contain the right piece once a piece is clicked
      const updatedHexagons = hexagons.map(h => {
        if (h.piece === movingPiece && h.piece != pieceClicked) {//Removes the selectedpiece if it doesn't click itself
          return { ...h, piece: undefined };
        } else if (h.piece === pieceClicked) {// Capture the pieceClicked if not the selected piece
          return { ...h, piece: movingPiece };
        } else {
          return h;
        }
      });
      //Move is completed, so there is no selected piece, hexagons are updated with the new pieceClicked and legal moves are reset
      this.setState({ movingPiece: null, hexagons: updatedHexagons, legalMoves: [] });
    } else {
      //Select the pieceClicked if there is no selected piece and update the legal moves
      const legalMoves = pieceClicked.legalmoves(startingBoard);
      this.setState({ movingPiece: pieceClicked, legalMoves });
    }
  };

handleHexClick = (hex: RenderHex) => {
  const { movingPiece, hexagons } = this.state;

  if (movingPiece) {
    const updatedHexagons = hexagons.map(h => {
      if (h.piece === movingPiece) {
        // Remove the piece from its old hexagon
        return { ...h, piece: undefined };
        
      } else if (h === hex) {
        // Add the piece to the new hexagon
        return { ...h, piece: movingPiece };
      } else {
        return h;
      }
    });

    this.setState({ movingPiece: null, hexagons: updatedHexagons, legalMoves: [] });
    //We also need to update the piece's position
    console.log("Hi the moving pieces hex was " + movingPiece.hex.q + " " + movingPiece.hex.r);
    console.log("The piece moved to " + hex.q + " " + hex.r);
    console.log("The legal moves should be " + [movingPiece.hex.q + 1, movingPiece.hex.r - 1, movingPiece.hex.s] + " " + [movingPiece.hex.q, movingPiece.hex.s - 1, movingPiece.hex.r + 1] + " " + [movingPiece.hex.q - 1, movingPiece.hex.r, movingPiece.hex.s + 1]);
    movingPiece.hex = new Hex(hex.q, hex.r, hex.s);
  }
};

  componentDidMount() {
    const board = startingBoard;
    this.setState({
      hexagons: board.renderHexagons(),
      pieces: board.pieces,
    });
  }

  getImageByPieceType = (type: PieceType) => {
    const pieceImages = {
      [PieceType.Swordsman]: swordsmanImage,
      [PieceType.Archer]: archerImage,
      [PieceType.Knight]: swordsmanImage,
      [PieceType.Eagle]: swordsmanImage,
      [PieceType.Giant]: swordsmanImage,
      [PieceType.Assassin]: swordsmanImage,
      [PieceType.Dragon]: dragonImage,
      [PieceType.Monarch]: swordsmanImage,

    };

    return pieceImages[type];
  };

  render() {
    console.log(this.state.legalMoves);
    return (
      <svg className="board" height="100%" width="100%">
        {/* Render all hexagons */}
        {this.state.hexagons.map((hex: RenderHex) => (
          <polygon 
            key={hex.key} 
            points={hex.corners} 
            className={hex.colorClass} 
            onClick={() => this.handleHexClick(hex)}
          />
        ))}
      {/* Render dots for legal moves */}
      {this.state.hexagons.map((hex: RenderHex) => {
         
        // Check if the hexagon is a legal move
        //console.log(this.state.legalMoves);
        const isLegalMove = this.state.legalMoves.some(move => move.end.q === hex.q && move.end.r === hex.r);
        if (isLegalMove) {
          return (
            <circle 
              key={hex.key}
              cx={hex.center.x} 
              cy={hex.center.y} 
              r={10} 
              fill="red" 
              onClick={() => this.handleHexClick(hex)}
            />
          );
        }
        return null;
      })}


        {/* Render all pieces */}
        {this.state.hexagons.map((hex: RenderHex) => {
          if (hex.piece) {
            return (
<image
  key={hex.key}
  href={this.getImageByPieceType(hex.piece.type)}
  x={hex.center.x - 150/NSquaresc}
  y={hex.center.y - 150/NSquaresc}
  height={275 / NSquaresc}
  width={275 / NSquaresc}
  onClick={() => hex.piece && this.handlePieceClick(hex.piece)}
/>
            );
          }
          return null;
        })}
      </svg>
    );
  }
}

export default GameBoard;