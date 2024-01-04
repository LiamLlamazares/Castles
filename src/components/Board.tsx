import React from 'react';
import '../css/Board.css'; // Make sure the path to your CSS file is correct
import '../css/Hexagons.css';
import {
  Hex,
  Layout,
  Point,
  layout_flat,
  layout_pointy,
  polygon_corners
} from '../HexUtils'; // Adjust the path to HexUtils.js as necessary

// Define the hexagon size and center the origin on the screen
const hexSize = { x: 40, y: 40 };
const hexnumber = 9;
const hexRadius = hexSize.x / Math.sqrt(3) * 2; // Calculate the hex radius based on the width
const centerHexOrigin = {
  x: (window.innerWidth - hexRadius) / 2,
  y: (window.innerHeight - hexRadius / 2) / 2
};

// Adjust the origin based on the number of hexagons
const originOffset = {
  x: centerHexOrigin.x - (hexnumber - 1) * hexSize.x * 3/4,
  y: centerHexOrigin.y
};

const Board = () => {
  // Use the adjusted origin for the layout
  const layout = Layout(layout_pointy, hexSize, originOffset);

  const renderHexagons = () => {
    const hexagons = [];
    const N = hexnumber -1;
    for (let q = -N; q <= N; q++) {
        let r1 = Math.max(-N,-q-N)
        let r2 = Math.min(N,-q+N)
      for (let r = r1; r <= r2; r++) {
        const s = -q - r;
        const hex = Hex(q, r, s);
        const corners = polygon_corners(layout, hex).map(p => `${p.x},${p.y}`).join(' ');

        hexagons.push(
          <polygon
            key={`${q}-${r}-${s}`}
            points={corners}
            className= "hexagon"
          />
        );
        
      }
    }
    return hexagons;
  };
  

  return (
<svg className="board" height="100%" width="100%">
  {renderHexagons()}
</svg>


  );
};

export default Board;
