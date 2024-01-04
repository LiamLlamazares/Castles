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
    const hexagons = [];
    const N = hexnumber -1;
    for (let q = -N; q <= N; q++) {
        let r1 = Math.max(-N,-q-N)
        let r2 = Math.min(N,-q+N)
      for (let r = r1; r <= r2; r++) {
        const s = -q - r;
        const hex = new Hex(q, r, s);
        const corners = layout.polygonCorners(hex).map(p => `${p.x},${p.y}`).join(' ');

        // Add the hexagon to the list of hexagons alternating between white and black
           hexagons.push(
          <polygon
            key={`${q}-${r}-${s}`}
            points={corners}
            // Creates a river marked by blue hexagons using the y coord of the origin
            //The river separates both sides of the board
            className={layout.hexToPixel(hex).y === originOffset.y ? 'hexagon-blue' : 'hexagon'}
          />
        );
        
      }
    }
  // The hexagons form a hexagonal grid. We now sort them first by the y coordinate of their first element
  // and then by the x coordinate of their first element. This makes it easier to access them
  // later when we want to assign colors to them.
 
    

  
  
    return hexagons;
  };


  

  return (
<svg className="board" height="100%" width="100%">
  {renderHexagons()}
</svg>


  );
};

export default Board;
