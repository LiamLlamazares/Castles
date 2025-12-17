
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { PieceType } from "../../Constants";
import { wolfMoves, rangerMoves } from "../Strategies/MoveStrategies";

describe('Special Movement Strategies', () => {
    // Mock Sets
    const validHexSet = new Set<string>();
    const blockedHexSet = new Set<string>();
    
    // Add 3-ring around 0,0,0 to valid set
    new Hex(0,0,0).cubeRing(1).forEach(h => validHexSet.add(h.getKey()));
    new Hex(0,0,0).cubeRing(2).forEach(h => validHexSet.add(h.getKey()));
    new Hex(0,0,0).cubeRing(3).forEach(h => validHexSet.add(h.getKey()));
    validHexSet.add("0,0,0");

    test('Wolf moves up to 3 hexes (BFS)', () => {
        const wolfHex = new Hex(0, 0, 0);
        const moves = wolfMoves(wolfHex, blockedHexSet, validHexSet);
        
        // Radius 3 should have man moves.
        // Ring 1: 6, Ring 2: 12, Ring 3: 18. Total 36.
        expect(moves.length).toBeGreaterThan(30);
    });

    test('Wolf movement blocked by obstacles', () => {
        const wolfHex = new Hex(0, 0, 0);
        
        // Block all neighbors
        wolfHex.cubeRing(1).forEach(h => blockedHexSet.add(h.getKey()));
        
        const moves = wolfMoves(wolfHex, blockedHexSet, validHexSet);
        expect(moves.length).toBe(0); // Trapped
    });

    test('Ranger moves up to 2 hexes', () => {
        // Reset blocked
        blockedHexSet.clear();
        
        const hex = new Hex(0, 0, 0);
        const moves = rangerMoves(hex, blockedHexSet, validHexSet);
        
        // Ring 1(6) + Ring 2(12) = 18
        expect(moves.length).toBe(18);
    });
});
