import React from 'react';
import '../css/Board.css'; // Make sure the path to your CSS file is correct
import {Layout, Point, Hex} from '../HexUtils'; // adjust the path as needed

// Define the hexagon size and center the origin on the screen
const hexnumber = 9;
const size = Math.min(window.innerWidth, window.innerHeight) / (4*hexnumber);
const hexSize = new Point(size, size);
const centerHexOrigin = {
  x: window.innerWidth  / 2+100,
  y: window.innerHeight  / 2
};
const originOffset = {
  x: centerHexOrigin.x - (hexnumber - 1) * hexSize.x * 3/4,
  y: centerHexOrigin.y
};

const Board = () => {
  const layout = new Layout(Layout.flat, hexSize, originOffset);

  const renderHexagons = () => {
    const hexList = [];
    const N = hexnumber -1;
    for (let q = -N; q <= N; q++) {
      let r1 = Math.max(-N,-q-N)
      let r2 = Math.min(N,-q+N)
      let color_index = q >= 1 ? -q : q; // Set color_index to q+1 when q >= 1
      for (let r = r1; r <= r2; r++) {
        const s = -q - r;
        const hex = new Hex(q, r, s);
        hex.color_index = color_index; // Add color_index as a property
        hexList.push(hex);
        color_index = color_index + 1;
      }
    }

    hexList.sort((a, b) => {
      let aCenter = layout.hexToPixel(a);
      let bCenter = layout.hexToPixel(b);
      if (aCenter.y < bCenter.y) {
        return -1;
      } else if (aCenter.y > bCenter.y) {
        return 1;
      }
      if (aCenter.x < bCenter.x) {
        return -1;
      } else if (aCenter.x > bCenter.x) {
        return 1;
      }
      return 0;
    });

    const hexagons = hexList.map(hex => {
      const corners = layout.polygonCorners(hex).map(p => `${p.x},${p.y}`).join(' ');
      const colorClass = ['hexagon-dark', 'hexagon-mid', 'hexagon-light'][(hex.color_index % 3 + 3) % 3]; // Determine the color of the hexagon
      const center = layout.hexToPixel(hex);

      return (
        <g key={`${hex.q}-${hex.r}-${hex.s}`}>
          <polygon
            points={corners}
            className={colorClass}
          />
          <text x={center.x} y={center.y} textAnchor="middle" fill="white" fontSize="10">
            {/* {`${hex.q},${hex.r},${hex.s},${(hex.color_index % 3 + 3) % 3}`} */}
          </text>
        </g>
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