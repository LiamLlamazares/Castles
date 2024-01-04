import React from 'react';
import '../css/Board.css'; // Make sure the path to your CSS file is correct
import '../HexUtils'; // Adjust the path to HexUtils.js as necessary
import {Layout, Point, Hex, } from '../HexUtils'; // adjust the path as needed from '../HexUtils'; // Adjust the path to HexUtils.js as necessary


// Now you can use the layout instance in your board.tsx file
// Define the hexagon size and center the origin on the screen
const hexnumber = 9;
// Gets the size of the window and divides it by the number of hexagons
// to get the size of each hexagon
const size = Math.min(window.innerWidth, window.innerHeight) / (4*hexnumber);
const hexSize = new Point(size, size);
const centerHexOrigin = {
  x: window.innerWidth  / 2+100,
  y: window.innerHeight  / 2
};
// Adjust the origin based on the number of hexagons
const originOffset = {
  x: centerHexOrigin.x - (hexnumber - 1) * hexSize.x * 3/4,
  y: centerHexOrigin.y
};

const Board = () => {
  // Use the adjusted origin for the layout
  const layout = new Layout(Layout.pointy, hexSize, originOffset);

  const renderHexagons = () => {
    const hexList = [];
    const N = hexnumber -1;
    for (let q = -N; q <= N; q++) {
      let r1 = Math.max(-N,-q-N)
      let r2 = Math.min(N,-q+N)
      for (let r = r1; r <= r2; r++) {
        const s = -q - r;
        const hex = new Hex(q, r, s);
        hexList.push(hex);
      }
    }
  
    // Sort the hexagons first
    hexList.sort((a, b) => {
      let aCenter = layout.hexToPixel(a);
      let bCenter = layout.hexToPixel(b);
  
      // Compare y-coordinates first
      if (aCenter.y < bCenter.y) {
        return -1;
      } else if (aCenter.y > bCenter.y) {
        return 1;
      }
  
      // If y-coordinates are equal, compare x-coordinates
      if (aCenter.x < bCenter.x) {
        return -1;
      } else if (aCenter.x > bCenter.x) {
        return 1;
      }
  
      // If both x and y coordinates are equal
      return 0;
    });
  
    // Then convert them to SVG polygons
    const hexagons = hexList.map(hex => {
      const corners = layout.polygonCorners(hex).map(p => `${p.x},${p.y}`).join(' ');
      
      return (
        <polygon
          key={`${hex.q}-${hex.r}-${hex.s}`}
          points={corners}
          className={layout.hexToPixel(hex).y === originOffset.y ? 'hexagon-blue' : 'hexagon'}
        />
      );
    });
  
    return hexagons;
  };


  

  return (
<svg className="board" height="100%" width="100%">
  {renderHexagons()}
</svg>


  );
};

export default Board;
