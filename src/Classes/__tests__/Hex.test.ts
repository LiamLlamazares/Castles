import { Hex } from '../Entities/Hex';

describe('Hex Math', () => {
    describe('Construction and Equality', () => {
        it('should throw error if coordinates do not sum to 0', () => {
            expect(() => new Hex(1, 1, 1)).toThrow("q + r + s must be 0");
        });

        it('should compare equality correctly', () => {
            const h1 = new Hex(1, -1, 0);
            const h2 = new Hex(1, -1, 0);
            const h3 = new Hex(0, 0, 0);
            
            expect(h1.equals(h2)).toBe(true);
            expect(h1.equals(h3)).toBe(false);
        });

        it('should generate valid keys', () => {
            const h = new Hex(1, -2, 1);
            expect(h.getKey()).toBe('1,-2,1');
        });
    });

    describe('Arithmetic', () => {
        it('should add hexes correctly', () => {
            const h1 = new Hex(1, -2, 1);
            const h2 = new Hex(2, -1, -1);
            const result = h1.add(h2);
            
            expect(result.q).toBe(3);
            expect(result.r).toBe(-3);
            expect(result.s).toBe(0);
        });

        it('should should subtract hexes correctly', () => {
             const h1 = new Hex(1, -2, 1);
             const h2 = new Hex(2, -1, -1);
             const result = h1.subtract(h2);
             
             expect(result.q).toBe(-1);
             expect(result.r).toBe(-1);
             expect(result.s).toBe(2);
        });
    });

    describe('Distance', () => {
        it('should calculate distance correctly', () => {
            const h1 = new Hex(0, 0, 0);
            const h2 = new Hex(1, -1, 0);   // Neighbor
            const h3 = new Hex(2, -2, 0);   // 2 steps away
            
            expect(h1.distance(h2)).toBe(1);
            expect(h1.distance(h3)).toBe(2);
        });
    });

    describe('Line Drawing', () => {
        it('should include start and end points', () => {
            const start = new Hex(0, 0, 0);
            const end = new Hex(2, -2, 0);
            const line = start.linedraw(end);
            
            expect(line[0].equals(start)).toBe(true);
            expect(line[line.length - 1].equals(end)).toBe(true);
        });

        it('should have length equal to distance + 1', () => {
            const start = new Hex(0, 0, 0);
            const end = new Hex(2, -2, 0);
            const line = start.linedraw(end);
            const dist = start.distance(end);
            
            expect(line.length).toBe(dist + 1);
        });

        it('should be continuous (neighbors)', () => {
             const start = new Hex(0, 0, 0);
             const end = new Hex(3, -1, -2);
             const line = start.linedraw(end);
             
             for (let i = 0; i < line.length - 1; i++) {
                 const dist = line[i].distance(line[i + 1]);
                 expect(dist).toBe(1);
             }
        });
    });

    describe('Rotation', () => {
         it('rotateLeft should rotate 60 degress CCW', () => {
             // (1, -1, 0) rotated left -> (0, -1, 1) ? 
             // Formula: (-s, -q, -r)
             // s=0 -> 0
             // q=1 -> -1
             // r=-1 -> 1
             // Result: (0, -1, 1). Correct.
             const h = new Hex(1, -1, 0);
             const rotated = h.rotateLeft();
             expect(rotated.q).toBe(0);
             expect(rotated.r).toBe(-1);
             expect(rotated.s).toBe(1);
         });
    });
});
