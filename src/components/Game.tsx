import { Component } from 'react';
import { Piece } from '../Classes/Piece';
import { RenderHex } from '../Classes/RenderHex';
import "../css/Board.css";
import swordsmanImage from "../Assets/Images/fantasy/Swordsman.svg";
import dragonImage from "../Assets/Images/fantasy/dragon.png";
import archerImage from "../Assets/Images/fantasy/Archer.svg";
import { PieceType } from '../Constants';
import { startingBoard } from '../ConstantImports';
import { NSquaresc } from '../Constants';

class GameBoard extends Component {
  state = {
    hexagons: Array<RenderHex>(),
    pieces: Array<Piece>(),
    selectedPiece: null as Piece | null,
  };

  handlePieceClick = (piece: Piece) => {
    const { selectedPiece, hexagons } = this.state;
  
    if (selectedPiece) {
      const updatedHexagons = hexagons.map(h => {
        if (h.piece === selectedPiece) {
          // Remove the piece from its old hexagon
          return { ...h, piece: undefined };
        } else if (h.piece === piece) {
          // Add the piece to the new hexagon and capture any existing piece
          return { ...h, piece: selectedPiece };
        } else {
          return h;
        }
      });
  
      this.setState({ selectedPiece: null, hexagons: updatedHexagons });
    } else {
      this.setState({ selectedPiece: piece });
    }
  };

handleHexClick = (hex: RenderHex) => {
  const { selectedPiece, hexagons } = this.state;

  if (selectedPiece) {
    const updatedHexagons = hexagons.map(h => {
      if (h.piece === selectedPiece) {
        // Remove the piece from its old hexagon
        return { ...h, piece: undefined };
      } else if (h === hex) {
        // Add the piece to the new hexagon
        return { ...h, piece: selectedPiece };
      } else {
        return h;
      }
    });

    this.setState({ selectedPiece: null, hexagons: updatedHexagons });
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