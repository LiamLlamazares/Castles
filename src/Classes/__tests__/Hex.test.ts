import { Hex } from '../Hex';

describe('Hex', () => {
  describe('constructor', () => {
    it('creates a valid hex with q + r + s = 0', () => {
      const hex = new Hex(1, -1, 0);
      expect(hex.q).toBe(1);
      expect(hex.r).toBe(-1);
      expect(hex.s).toBe(0);
    });

    it('throws error when q + r + s != 0', () => {
      expect(() => new Hex(1, 1, 1)).toThrow('q + r + s must be 0');
    });

    it('accepts optional color_index', () => {
      const hex = new Hex(0, 0, 0, 5);
      expect(hex.color_index).toBe(5);
    });

    it('defaults color_index to 0', () => {
      const hex = new Hex(0, 0, 0);
      expect(hex.color_index).toBe(0);
    });
  });

  describe('equals', () => {
    it('returns true for equal hexes', () => {
      const hex1 = new Hex(1, -1, 0);
      const hex2 = new Hex(1, -1, 0);
      expect(hex1.equals(hex2)).toBe(true);
    });

    it('returns false for different hexes', () => {
      const hex1 = new Hex(1, -1, 0);
      const hex2 = new Hex(0, 0, 0);
      expect(hex1.equals(hex2)).toBe(false);
    });

    it('ignores color_index in equality', () => {
      const hex1 = new Hex(1, -1, 0, 1);
      const hex2 = new Hex(1, -1, 0, 2);
      expect(hex1.equals(hex2)).toBe(true);
    });
  });

  describe('getKey', () => {
    it('returns comma-separated coordinates', () => {
      const hex = new Hex(1, -2, 1);
      expect(hex.getKey()).toBe('1,-2,1');
    });

    it('returns reflected key when isReflected is true', () => {
      const hex = new Hex(1, -2, 1);
      expect(hex.getKey(true)).toBe('-1,2,-1');
    });
  });

  describe('add', () => {
    it('adds two hexes correctly', () => {
      const hex1 = new Hex(1, -1, 0);
      const hex2 = new Hex(0, 1, -1);
      const result = hex1.add(hex2);
      
      expect(result.q).toBe(1);
      expect(result.r).toBe(0);
      expect(result.s).toBe(-1);
    });
  });

  describe('subtract', () => {
    it('subtracts two hexes correctly', () => {
      const hex1 = new Hex(2, -1, -1);
      const hex2 = new Hex(1, 0, -1);
      const result = hex1.subtract(hex2);
      
      expect(result.q).toBe(1);
      expect(result.r).toBe(-1);
      expect(result.s).toBe(0);
    });
  });

  describe('distance', () => {
    it('returns 0 for same hex', () => {
      const hex = new Hex(1, -1, 0);
      expect(hex.distance(hex)).toBe(0);
    });

    it('returns 1 for adjacent hexes', () => {
      const hex1 = new Hex(0, 0, 0);
      const hex2 = new Hex(1, 0, -1);
      expect(hex1.distance(hex2)).toBe(1);
    });

    it('returns correct distance for farther hexes', () => {
      const hex1 = new Hex(0, 0, 0);
      const hex2 = new Hex(3, -3, 0);
      expect(hex1.distance(hex2)).toBe(3);
    });
  });

  describe('cubeRing', () => {
    it('returns 6 hexes for radius 1', () => {
      const center = new Hex(0, 0, 0);
      const ring = center.cubeRing(1);
      expect(ring).toHaveLength(6);
    });

    it('returns 12 hexes for radius 2', () => {
      const center = new Hex(0, 0, 0);
      const ring = center.cubeRing(2);
      expect(ring).toHaveLength(12);
    });

    it('all ring hexes are at correct distance from center', () => {
      const center = new Hex(0, 0, 0);
      const ring = center.cubeRing(3);
      
      ring.forEach(hex => {
        expect(center.distance(hex)).toBe(3);
      });
    });

    it('works with non-origin center', () => {
      const center = new Hex(2, -1, -1);
      const ring = center.cubeRing(1);
      
      expect(ring).toHaveLength(6);
      ring.forEach(hex => {
        expect(center.distance(hex)).toBe(1);
      });
    });
  });

  describe('reflect', () => {
    it('negates all coordinates', () => {
      const hex = new Hex(1, -2, 1);
      const reflected = hex.reflect();
      
      expect(reflected.q).toBe(-1);
      expect(reflected.r).toBe(2);
      expect(reflected.s).toBe(-1);
    });

    it('double reflect returns original', () => {
      const hex = new Hex(3, -1, -2);
      const doubleReflected = hex.reflect().reflect();
      
      expect(hex.equals(doubleReflected)).toBe(true);
    });
  });

  describe('neighbor', () => {
    it('returns correct neighbor in each direction', () => {
      const center = new Hex(0, 0, 0);
      
      // Direction 0: +q, -s
      expect(center.neighbor(0).equals(new Hex(1, 0, -1))).toBe(true);
      // Direction 1: +q, -r
      expect(center.neighbor(1).equals(new Hex(1, -1, 0))).toBe(true);
      // Direction 2: -r, +s
      expect(center.neighbor(2).equals(new Hex(0, -1, 1))).toBe(true);
    });
  });

  describe('scale', () => {
    it('multiplies all coordinates by factor', () => {
      const hex = new Hex(1, -1, 0);
      const scaled = hex.scale(3);
      
      expect(scaled.q).toBe(3);
      expect(scaled.r).toBe(-3);
      expect(scaled.s).toBe(0);
    });
  });
});
