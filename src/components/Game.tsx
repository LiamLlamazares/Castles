import  { Component } from 'react';
import { Piece} from '../Classes/Piece';
import { RenderHex } from '../Classes/RenderHex';
import "../css/Board.css";
import swordsmanImage from "../Assets/Images/fantasy/Swordsman.svg";
import archerImage from "../Assets/Images/fantasy/Archer.svg";


import { PieceType } from '../Constants';
import { startingBoard } from '../ConstantImports';

class GameBoard extends Component {
  state = {
    hexagons: Array<RenderHex>(),
    pieces: Array<Piece>(),
    draggingPiece: null as Piece | null,
  };

  handleMouseDown = (e: React.MouseEvent, piece: Piece) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    this.setState({ draggingPiece: piece, dragOffset: { x: offsetX, y: offsetY } });
  };
  handleMouseMove = (e: React.MouseEvent) => {
    const { draggingPiece } = this.state;

    if (draggingPiece) {
      const newPosition = { x: e.clientX, y: e.clientY };
      draggingPiece.position = newPosition;
      this.setState({ draggingPiece });
    }
  };

  handleMouseUp = (e: React.MouseEvent) => {
    const { draggingPiece, hexagons } = this.state;

    if (draggingPiece) {
      const closestHex = hexagons.reduce((closest, hex) => {
        const distance = this.getDistance(draggingPiece.position, hex.center);
        if (distance < closest.distance) {
          return { hex, distance };
        }
        return closest;
      }, { hex: hexagons[0], distance: this.getDistance(draggingPiece.position, hexagons[0].center) }).hex;

      draggingPiece.position = closestHex.center;

      this.setState({ draggingPiece: null });
    }
  };

  getDistance = (point1: { x: number; y: number }, point2: { x: number; y: number }) => {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  componentDidMount() {
    const board = startingBoard;
    this.setState({
      hexagons: board.renderHexagons(),
      pieces: board.pieces,
    });
  }

  getImageByPieceType = (type: PieceType) => {
    return type === PieceType.Swordsman ? swordsmanImage : archerImage;
  };

  render() {
    return (
      <svg className="board" height="100%" width="100%" onMouseMove={this.handleMouseMove}>
        {/* Render all hexagons */}
        {this.state.hexagons.map((hex: RenderHex) => (
          <polygon key={hex.key} points={hex.corners} className={hex.colorClass} />
        ))}

        {/* Render all pieces */}
        {this.state.hexagons.map((hex: RenderHex) => {
          if (hex.piece) {
            return (
              <image
                key={hex.key}
                href={this.getImageByPieceType(hex.piece.type)}
                x={this.state.draggingPiece === hex.piece ? this.state.draggingPiece.position.x -35 : hex.center.x - 15}
                y={this.state.draggingPiece === hex.piece ? this.state.draggingPiece.position.y -35 : hex.center.y - 15}
                height="30"
                width="30"
                onMouseDown={(e) => hex.piece && this.handleMouseDown(e, hex.piece)}
                onMouseUp={this.handleMouseUp}
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
