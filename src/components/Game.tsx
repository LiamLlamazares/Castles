import { Component } from 'react';
import { Piece } from '../Classes/Piece';
import { RenderHex } from '../Classes/RenderHex';
import { Hex } from '../Classes/Hex';
import { PieceType, NSquaresc } from '../Constants';
import { startingBoard } from '../ConstantImports';
import { Move } from '../Classes/Move';
import "../css/Board.css";

import wswordsmanImage from '../Assets/Images/fantasyd/wSwordsman.svg';
import bswordsmanImage from '../Assets/Images/fantasyd/bSwordsman.svg';
import wdragonImage from '../Assets/Images/fantasyd/wDragon.svg';
import bdragonImage from '../Assets/Images/fantasyd/bDragon.svg';
import warcherImage from '../Assets/Images/fantasyd/wArcher.svg';
import barcherImage from '../Assets/Images/fantasyd/bArcher.svg';
import wgiantImage from '../Assets/Images/fantasyd/wGiant.svg';
import bgiantImage from '../Assets/Images/fantasyd/bGiant.svg';
import wassassinImage from '../Assets/Images/fantasyd/wAssassin.svg';
import bassassinImage from '../Assets/Images/fantasyd/bAssassin.svg';
import wmonarchImage from '../Assets/Images/fantasyd/wMonarch.svg';
import bmonarchImage from '../Assets/Images/fantasyd/bMonarch.svg';
import wtrebuchetImage from '../Assets/Images/fantasyd/wTrebuchet.svg';
import btrebuchetImage from '../Assets/Images/fantasyd/bTrebuchet.svg';
import wknightImage from '../Assets/Images/fantasyd/wKnight.svg';
import bknightImage from '../Assets/Images/fantasyd/bKnight.svg';
import weagleImage from '../Assets/Images/fantasyd/wEagle.svg';
import beagleImage from '../Assets/Images/fantasyd/bEagle.svg';





class GameBoard extends Component {
  state = {
    hexagons: Array<RenderHex>(),
    pieces: Array<Piece>(),
    movingPiece: null as Piece | null,
    legalMoves: Array<Move>(),
    occupiedHexes: Array<RenderHex>(),
    riverHexes: Array<RenderHex>(),
    showCoordinates: false,
  };

  handlePieceClick = (pieceClicked: Piece) => {
    //Obtain the selected piece and the hexagons from the game state
    const { movingPiece, hexagons } = this.state;
  
    if (movingPiece) {
      //Updates hexagons by making them contain the right piece once a piece is clicked
      const updatedHexagons = hexagons.map(h => {
        if (h.piece === movingPiece && h.piece !== pieceClicked) {//Removes the selectedpiece if it doesn't click itself
          return { ...h, piece: undefined };
        } else if (h.piece === pieceClicked) {// Capture the pieceClicked if not the selected piece
          return { ...h, piece: movingPiece };
        } else {
          return h;
        }
      });
      //Move is completed, so there is no selected piece, hexagons are updated with the new pieceClicked and legal moves are reset
      this.setState({ movingPiece: null, hexagons: updatedHexagons, legalMoves: [] }, this.updateOccupiedHexes);
    } else {
      //Select the pieceClicked if there is no selected piece and update the legal moves
      const legalMoves = pieceClicked.legalmoves();
      this.setState({ movingPiece: pieceClicked, legalMoves }, this.updateOccupiedHexes);
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

    this.setState({ movingPiece: null, hexagons: updatedHexagons, legalMoves: [] }, this.updateOccupiedHexes);
    //We also need to update the piece's position
    console.log("Hi the moving pieces hex was " + movingPiece.hex.q + " " + movingPiece.hex.r);
    console.log("The piece moved to " + hex.q + " " + hex.r);
    console.log("The legal moves should be " + [movingPiece.hex.q + 1, movingPiece.hex.r - 1, movingPiece.hex.s] + " " + [movingPiece.hex.q, movingPiece.hex.s - 1, movingPiece.hex.r + 1] + " " + [movingPiece.hex.q - 1, movingPiece.hex.r, movingPiece.hex.s + 1]);
    console.log("The occupied hexes are " + this.state.occupiedHexes);
    console.log("The river hexes are " + this.state.riverHexes);
    movingPiece.hex = new Hex(hex.q, hex.r, hex.s);
  }
};

//Needed to calculate piece movement
updateOccupiedHexes = () => {
  const occupiedHexes = this.state.hexagons.filter(hex => hex.piece !== undefined);
  

  this.setState({ occupiedHexes});
};

componentDidMount() {
  const board = startingBoard;
  this.setState({
    hexagons: board.renderHexagons(),
    pieces: board.pieces,
  }, () => {
    const riverHexes = this.state.hexagons.filter(hex => hex.colorClass === 'hexagon-river'); // replace 'river' with the correct class for river hexes
    this.setState({ riverHexes }, this.updateOccupiedHexes);
  });
}

  getImageByPieceType = (type: PieceType, color: string) => {
    const images: { [key in PieceType]: string } = {
      'Swordsman': color === 'w' ? wswordsmanImage : bswordsmanImage,
      'Dragon': color === 'w' ? wdragonImage : bdragonImage,
      'Archer': color === 'w' ? warcherImage : barcherImage,
      'Giant': color === 'w' ? wgiantImage : bgiantImage,
      'Assassin': color === 'w' ? wassassinImage : bassassinImage,
      'Monarch': color === 'w' ? wmonarchImage : bmonarchImage,
      'Trebuchet': color === 'w' ? wtrebuchetImage : btrebuchetImage,
      'Knight': color === 'w' ? wknightImage : bknightImage,
      'Eagle': color === 'w' ? weagleImage : beagleImage,
    };
    return images[type];
  };

  render() {
    console.log(this.state.legalMoves);
    return (
      <>
      <button onClick={() => this.setState({ showCoordinates: !this.state.showCoordinates })}>
        Toggle Coordinates
      </button>
      <svg className="board" height="100%" width="100%">
        {/* Render all hexagons */}
        {this.state.hexagons.map((hex: RenderHex) => (
          <g key={hex.key}>
            <polygon 
              points={hex.corners} 
              className={hex.colorClass} 
              onClick={() => this.handleHexClick(hex)}
            />
            {this.state.showCoordinates && (
              <text 
                x={hex.center.x} 
                y={hex.center.y+5} 
                textAnchor="middle" 
                style={{ fontSize: '15px', color: 'black' }}
              >
                {`${hex.q}, ${hex.s}`}
              </text>
            )}
          </g>
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
  href={this.getImageByPieceType(hex.piece.type, hex.piece.color)}
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
      </>
    );
  }
}

export default GameBoard;