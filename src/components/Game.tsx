import  { Component } from 'react';
import { Piece} from '../Classes/Piece';
import { RenderHex } from '../Classes/RenderHex';
import "../css/Board.css";
import swordsmanImage from "../Assets/Images/fantasy/Swordsman.svg";
import archerImage from "../Assets/Images/fantasy/Archer.svg";


import { startingBoard } from '../Constants';

//Defines the game board component. State property holds data
//that can change over time and affect what is rendered by the component. 
//In React, the state of a component is a source of truth for data that can change. 
//When the state changes, the component re-renders.
//State has a single property called hexagons, which is an array of RenderHex objects.
//The hexagons property is initialized to an empty array.
class GameBoard extends Component {
    state = {
      hexagons: Array<RenderHex>(),
      pieces: Array<Piece>(),
      draggingPiece: null as Piece | null,
    };
  // Image has some event handlers that are used to handle dragging pieces.
  // The onMouseDown, onMouseUp, onMouseMove event handlers 
  // are called when the user clicks, releases, or moves the mouse over the image.
  // When this occurs the below functions are called.

  // Whenn user clicks on a image, we set the dragging piece to the piece on the hex where the image is.
    handleMouseDown = (e: React.MouseEvent, piece: Piece) => {
      // Set the piece as being dragged
      this.setState({ draggingPiece: piece });
    };
    // When the user moves the mouse, we update the position of the dragging piece.
    handleMouseMove = (e: React.MouseEvent) => {
        //Destructuring assignment syntax is a JavaScript expression that makes it possible
        // to unpack values from arrays, or properties from objects, into distinct variables.
        const { draggingPiece } = this.state; 

        if (draggingPiece) {//Calculate new position of dragged piece and rerender.
            const newPosition = { x: e.clientX, y: e.clientY };
            draggingPiece.position = newPosition;
            this.setState({});
        }
    };
  
    handleMouseUp = (e: React.MouseEvent) => {
        const { draggingPiece, hexagons } = this.state;
      
        if (draggingPiece) {
          // Find the hexagon whose center is closest to the current position of the piece
          let closestHex = hexagons[0];
          let minDistance = this.getDistance(draggingPiece.position, closestHex.center);
      
          for (let hex of hexagons) {
            let distance = this.getDistance(draggingPiece.position, hex.center);
            if (distance < minDistance) {
              closestHex = hex;
              minDistance = distance;
            }
          }
      
          // Set the position of the piece to the center of the closest hexagon
          draggingPiece.position = closestHex.center;
      
          // Clear the dragging piece
          this.setState({ draggingPiece: null });
        }
      };
      
      getDistance = (point1: { x: number; y: number }, point2: { x: number; y: number }) => {
        let dx = point1.x - point2.x;
        let dy = point1.y - point2.y;
        return Math.sqrt(dx * dx + dy * dy);
      };
  


  //Performs setup logic when the component is mounted.
  // Pieces are defined to the starting position and the board is created.
  componentDidMount() {
    const board = startingBoard; 
    this.setState({ 
      hexagons: board.renderHexagons(),
      pieces: board.pieces // Access pieces from board, not props
    });
  }


render() {
    return (
        <svg className="board" height="100%" width="100%" onMouseMove={this.handleMouseMove}>
            {this.state.hexagons.map((hex: RenderHex) => {
                
                return (
                    <g key={hex.key}>
                        <polygon points={hex.corners} className={hex.colorClass} />
                        {hex.piece && (
                            <>
                                <image
                                    href={hex.piece.type === "Swordsman" ? swordsmanImage : archerImage}
                                    x={this.state.draggingPiece === hex.piece ? this.state.draggingPiece.position.x -35: hex.center.x - 15}
                                    y={this.state.draggingPiece === hex.piece ? this.state.draggingPiece.position.y -35: hex.center.y - 15}
                                    height="30"
                                    width="30"
                                    onMouseDown={(e) => hex.piece && this.handleMouseDown(e, hex.piece)}
                                    onMouseUp={this.handleMouseUp}
                                />
                                {/* <text
                                    x={hex.center.x}
                                    y={hex.center.y}
                                    textAnchor="middle"
                                    fill="white"
                                    fontSize="10"
                                >
                                    {`${hex.q}, ${hex.r}`}
                                </text> */}
                            </>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
}

export default GameBoard;