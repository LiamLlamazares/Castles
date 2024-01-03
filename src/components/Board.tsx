import React from 'react';
import '../css/Board.css';
// Assuming you have these functions properly defined in your HexUtils.js
import {
  Hex,
  hex_to_pixel,
  Layout,
  Point,
  layout_flat
} from '../HexUtils'; // Adjust the path to HexUtils.js as necessary
// Define the hexagon size and origin for layout
const hexSize = { x: 100, y: 100 };
const origin = { x: hexSize.x * 0.5, y: hexSize.y * 0.5 };



const Board = () => {
  // Create the layout object for the hex grid
  const layout = Layout(layout_flat, hexSize, origin);

  const renderHexagons = () => {
    const hexagons = [];
    // Define the range for your grid here
    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        const hex = Hex(q, r, -q - r);
        const pixel = hex_to_pixel(layout, hex);
        hexagons.push(
          <div
            className="hexagon"
            key={`${q}-${r}`}
            style={{
              left: `${pixel.x}px`,
              top: `${pixel.y}px`,
              width: `${hexSize.x}px`,
              height: `${hexSize.y}px`,
              // Add additional styles as needed
            }}
          />
        );
      }
    }
    return hexagons;
  };

  return (
    <div className="board">
      {renderHexagons()}
    </div>
  );
};

export default Board;
