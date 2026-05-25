import { getStartingPieces, getStartingBoard } from '../../ConstantImports';

describe('Board Size Debug', () => {
  for (let br = 4; br <= 8; br++) {
    it(`boardRadius=${br}: no pieces off-board`, () => {
      const pieces = getStartingPieces(br);
      const board = getStartingBoard(br);

      const offBoard = pieces.filter(p => !board.hexSet.has(p.hex.getKey()));
      if (offBoard.length > 0) {
        const details = offBoard.map(p =>
          `${p.type} ${p.color} at (${p.hex.q},${p.hex.r},${p.hex.s})`
        ).join('\n');
        throw new Error(`${offBoard.length} pieces off-board (NSquares=${board.NSquares}):\n${details}`);
      }
    });

    it(`boardRadius=${br}: no overlapping pieces`, () => {
      const pieces = getStartingPieces(br);
      const seen = new Map<string, string>();
      const overlaps: string[] = [];

      for (const p of pieces) {
        const key = p.hex.getKey();
        const desc = `${p.type}-${p.color}`;
        if (seen.has(key)) {
          overlaps.push(`${key}: ${seen.get(key)} AND ${desc}`);
        }
        seen.set(key, desc);
      }

      if (overlaps.length > 0) {
        throw new Error(`Overlaps found:\n${overlaps.join('\n')}`);
      }
    });
  }
});
