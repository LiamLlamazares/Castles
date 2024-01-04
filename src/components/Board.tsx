import "../css/Board.css"; // Make sure the path to your CSS file is correct
import {
  Layout,
  Point,
  generateHexagons,
  isRiver,
  isCastle,
} from "../HexUtils"; // adjust the path as needed

// CONSTANTS: Size of board, hexagons and how much drid is moved
const HEXNUMBER = 10;
const HEX_SIZE_FACTOR = 4;
const X_OFFSET = 100;
const N = HEXNUMBER - 1;

// Define the hexagon sizes and centers the origin on the screen
const size_hexes =
  Math.min(window.innerWidth, window.innerHeight) /
  (HEX_SIZE_FACTOR * HEXNUMBER);
const hexSize = new Point(size_hexes, size_hexes);
const origin = {
  x: window.innerWidth / 2 + X_OFFSET,
  y: window.innerHeight / 2,
};

const Board = () => {
  const layout = new Layout(Layout.flat, hexSize, origin);
  const renderHexagons = () => {
    const hexList = generateHexagons(N);
    layout.sortHexList(hexList);

    const hexagons = hexList.map((hex) => {
      //Gets the corners of the hexagon and the center
      const corners = layout
        .polygonCorners(hex)
        .map((p) => `${p.x},${p.y}`)
        .join(" ");
      const center = layout.hexToPixel(hex);

      //Determine the color of the hexagon
      let colorClass = ["hexagon-dark", "hexagon-mid", "hexagon-light"][
        ((hex.color_index % 3) + 3) % 3
      ]; // Determine the color of the hexagon
      const hexisaRiver = isRiver(center, origin);
      const hexisaCastle = isCastle(hex, N);
      if (hexisaRiver) {
        colorClass = "hexagon-river"; // Color the river
      } else if (hexisaCastle) {
        colorClass = "hexagon-castles"; // Color the castles
      }

      return (
        <g key={`${hex.q}-${hex.r}-${hex.s}`}>
          <polygon points={corners} className={colorClass} />
          <text
            x={center.x}
            y={center.y}
            textAnchor="middle"
            fill="white"
            fontSize="10"
          >
            {/* Shows hex coordinates if uncommented */}
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
