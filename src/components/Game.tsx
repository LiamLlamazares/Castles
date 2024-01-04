import React, { Component } from 'react';
import { Board } from '../Classes/Board';
import { Piece } from '../Classes/Piece'; // Assuming you have a Piece class
import { Hex, Point } from '../Classes/Hex'; // adjust the path as needed
import "../css/Board.css";
interface HexagonToRender extends Hex {
  key: string;
  corners: string;
  colorClass: string;
  center: Point;
}

class GameBoard extends Component {
  state = {
    hexagons: Array<HexagonToRender>(),
  };

  componentDidMount() {
    const pieces: Piece[] = []; // Replace with your actual pieces
    const board = new Board(pieces, 10); // Adjust as necessary
    this.setState({ hexagons: board.renderHexagons() });
  }

  render() {
    return (
      <svg className="board" height="100%" width="100%">
        {this.state.hexagons.map((hex: HexagonToRender) => (
          <g key={hex.key}>
            <polygon points={hex.corners} className={hex.colorClass} />
            <text
              x={hex.center.x}
              y={hex.center.y}
              textAnchor="middle"
              fill="white"
              fontSize="10"
            >
              {/* Display hex coordinates or other info if needed */}
            </text>
          </g>
        ))}
      </svg>
    );
  }
}

export default GameBoard;