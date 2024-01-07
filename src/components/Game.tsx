import { Component } from 'react';
import { Piece } from '../Classes/Piece';
import { RenderHex } from '../Classes/RenderHex';
import { Hex } from '../Classes/Hex';
import "../css/Board.css";
import { PieceType, imagePaths } from '../Constants';
import { startingBoard } from '../ConstantImports';
import { NSquaresc } from '../Constants';
import { Move } from '../Classes/Move';


// const IMAGE_FOLDER = 'fantasy';
// import swordsmanImageW from '../Assets/Images/'+IMAGE_FOLDER+'/SwordsmanW2.svg';
// import dragonImageW from '../Assets/Images/fantasy/dragonW.png';
// import dragonImageB from '../Assets/Images/fantasy/DragonW.svg';
// import archerImageW from '../Assets/Images/fantasy/ArcherW2.svg';
// import archerImageB from '../Assets/Images/fantasy/ArcherW2.svg';
// import giantImageW from '../Assets/Images/fantasy/GiantW.svg';
// import giantImageB from '../Assets/Images/fantasy/GiantW.svg';
// import assassinImageW from '../Assets/Images/fantasy/AssassinW2.svg';
// import assassinImageB from '../Assets/Images/fantasy/AssassinW2.svg';
// import monarchImageW from '../Assets/Images/fantasy/MonarchW2.svg';
// import monarchImageB from '../Assets/Images/fantasy/MonarchW2.svg';
// import trebuchetImageW from '../Assets/Images/fantasy/bN.svg';
// import trebuchetImageB from '../Assets/Images/fantasy/bN.svg';

class GameBoard extends Component {
  state = {
    hexagons: Array<RenderHex>(),
    pieces: Array<Piece>(),
    movingPiece: null as Piece | null,
    legalMoves: Array<Move>(),
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
      this.setState({ movingPiece: null, hexagons: updatedHexagons, legalMoves: [] });
    } else {
      //Select the pieceClicked if there is no selected piece and update the legal moves
      const legalMoves = pieceClicked.legalmoves();
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

  getImageByPieceType = (type: PieceType, color: string) => {
    return imagePaths[type][color === 'W' ? 'white' : 'black'];
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
                {`${hex.q},${hex.r}, ${hex.s}`}
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
              console.log(this.getImageByPieceType(hex.piece.type, hex.piece.color)),
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