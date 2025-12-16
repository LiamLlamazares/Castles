import { Hex } from '../Entities/Hex';

describe('Hex Math', () => {
    describe('Construction and Equality', () => {
        it('should throw error if coordinates do not sum to 0', () => {
            expect(() => new Hex(1, 1, 1)).toThrow(/Constraint q \+ r \+ s = 0 not satisfied/);
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

    describe('Property-Based Tests (Fuzzing)', () => {
        const NUM_ITERATIONS = 1000;

        // Helper to generate random valid hex (integer)
        const randomHex = (maxCoord = 100): Hex => {
            const q = Math.floor(Math.random() * (2 * maxCoord + 1)) - maxCoord;
            const r = Math.floor(Math.random() * (2 * maxCoord + 1)) - maxCoord;
            return new Hex(q, r, -q - r);
        };

        // Helper to generate random float hex (on the plane q+r+s=0)
        const randomFloatHex = (maxCoord = 100): Hex => {
            const q = (Math.random() * 2 - 1) * maxCoord;
            const r = (Math.random() * 2 - 1) * maxCoord;
            return new Hex(q, r, -q - r, 0, true);
        };

        it('should maintain q + r + s = 0 after rounding random float hexes', () => {
            for (let i = 0; i < NUM_ITERATIONS; i++) {
                const h = randomFloatHex();
                const rounded = h.round();
                const sum = rounded.q + rounded.r + rounded.s;
                
                // Expect strictly 0 (integers)
                expect(sum).toBe(0);
                
                // Verify integer coordinates
                expect(Number.isInteger(rounded.q)).toBe(true);
                expect(Number.isInteger(rounded.r)).toBe(true);
                expect(Number.isInteger(rounded.s)).toBe(true);
            }
        });

        it('should verify distance symmetry: dist(a,b) === dist(b,a)', () => {
            for (let i = 0; i < NUM_ITERATIONS; i++) {
                const a = randomHex();
                const b = randomHex();
                expect(a.distance(b)).toBe(b.distance(a));
            }
        });

        it('should verify lerp endpoints: lerp(a, b, 0) == a, lerp(a, b, 1) == b', () => {
             for (let i = 0; i < NUM_ITERATIONS; i++) {
                 const a = randomHex();
                 const b = randomHex();
                 
                 // lerp returns floats, we check nearness or exactness if no rounding
                 // The implementation of lerp sets allowFloat=true
                 const l0 = a.lerp(b, 0.0);
                 const l1 = a.lerp(b, 1.0);
                 
                 // Ideally precise floating point matches
                 expect(l0.q).toBeCloseTo(a.q);
                 expect(l0.r).toBeCloseTo(a.r);
                 expect(l0.s).toBeCloseTo(a.s);

                 expect(l1.q).toBeCloseTo(b.q);
                 expect(l1.r).toBeCloseTo(b.r);
                 expect(l1.s).toBeCloseTo(b.s);
             }
        });

        it('should ensure Hex.round(lerp(a, b, t)) is always valid', () => {
             for (let i = 0; i < NUM_ITERATIONS; i++) {
                 const a = randomHex();
                 const b = randomHex();
                 const t = Math.random(); 
                 
                 const interpolated = a.lerp(b, t);
                 const rounded = interpolated.round();
                 
                 expect(rounded.q + rounded.r + rounded.s).toBe(0);
             }
        });
    });
});
