import { getStartingPieces } from '../../ConstantImports';

describe('Starting Pieces', () => {
  describe('No overlapping pieces at any board radius', () => {
    for (let radius = 4; radius <= 12; radius++) {
      it(`should have no duplicate hex positions at radius ${radius}`, () => {
        const pieces = getStartingPieces(radius);
        const hexKeys = pieces.map(p => p.hex.getKey());
        const uniqueKeys = new Set(hexKeys);

        // Find duplicates for a useful error message
        if (uniqueKeys.size !== hexKeys.length) {
          const counts = new Map<string, string[]>();
          for (const piece of pieces) {
            const key = piece.hex.getKey();
            const existing = counts.get(key) ?? [];
            existing.push(`${piece.color}-${piece.type}`);
            counts.set(key, existing);
          }
          const dupes = Array.from(counts.entries())
            .filter(([, v]) => v.length > 1)
            .map(([k, v]) => `${k}: [${v.join(', ')}]`);
          fail(`Duplicate positions found:\n${dupes.join('\n')}`);
        }

        expect(uniqueKeys.size).toBe(hexKeys.length);
      });
    }
  });

  describe('Known collision cases are resolved by dedup', () => {
    it('at n=7, Giants should replace Swordsmen at (-5,6,-1) and (5,1,-6)', () => {
      const pieces = getStartingPieces(7);
      const atNeg5_6 = pieces.filter(p => p.hex.q === -5 && p.hex.r === 6);
      const at5_1 = pieces.filter(p => p.hex.q === 5 && p.hex.r === 1);

      // Should be exactly 1 piece at each hex (Giant, not Swordsman)
      expect(atNeg5_6).toHaveLength(1);
      expect(atNeg5_6[0].type).toBe('Giant');
      expect(at5_1).toHaveLength(1);
      expect(at5_1[0].type).toBe('Giant');
    });
  });

  describe('Piece counts scale with board size', () => {
    it('should produce fewer pieces on smaller boards', () => {
      const small = getStartingPieces(4);
      const large = getStartingPieces(8);
      expect(small.length).toBeLessThan(large.length);
    });

    it('should always have exactly 2 monarchs', () => {
      for (let radius = 4; radius <= 12; radius++) {
        const pieces = getStartingPieces(radius);
        const monarchs = pieces.filter(p => p.type === 'Monarch');
        expect(monarchs).toHaveLength(2);
      }
    });

    it('should have equal piece counts per color', () => {
      for (let radius = 4; radius <= 12; radius++) {
        const pieces = getStartingPieces(radius);
        const white = pieces.filter(p => p.color === 'w');
        const black = pieces.filter(p => p.color === 'b');
        expect(white.length).toBe(black.length);
      }
    });
  });
});
