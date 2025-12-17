
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { CombatSystem } from "../Systems/CombatSystem";
import { PieceType } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";

describe('Wolf Pack Tactics', () => {
    // Helper to create pieces
    const createWolf = (q: number, r: number, s: number, color: 'w'|'b' = 'w') => 
        new Piece(new Hex(q, r, s), color, PieceType.Wolf);
    
    const createEnemy = (q: number, r: number, s: number, hp: number = 3) => 
        new Piece(new Hex(q, r, s), 'b', PieceType.Swordsman); // HP 3 normally

    test('Lone wolf has base strength (1)', () => {
        const wolf = createWolf(0, 0, 0);
        const map = new PieceMap([wolf]);
        
        expect(CombatSystem.getCombatStrength(wolf, map)).toBe(1);
    });

    test('Wolf gains +1 strength for each adjacent friendly wolf', () => {
        const center = createWolf(0, 0, 0);
        const friend1 = createWolf(1, -1, 0); // Adjacent
        
        const pieces = [center, friend1];
        const map = new PieceMap(pieces);

        // Center wolf has 1 friend -> Strength 2
        expect(CombatSystem.getCombatStrength(center, map)).toBe(2);
        // Friend has 1 friend -> Strength 2
        expect(CombatSystem.getCombatStrength(friend1, map)).toBe(2);
    });

    test('Wolf gains +2 strength for two adjacent friendly wolves', () => {
        const center = createWolf(0, 0, 0);
        const friend1 = createWolf(1, -1, 0);
        const friend2 = createWolf(-1, 1, 0);
        
        const pieces = [center, friend1, friend2];
        const map = new PieceMap(pieces);

        expect(CombatSystem.getCombatStrength(center, map)).toBe(3);
    });

    test('Wolf does NOT gain strength from non-wolf friends', () => {
        const center = createWolf(0, 0, 0);
        const friend = new Piece(new Hex(1, -1, 0), 'w', PieceType.Swordsman);
        
        const pieces = [center, friend];
        const map = new PieceMap(pieces);

        expect(CombatSystem.getCombatStrength(center, map)).toBe(1);
    });

    test('Wolf does NOT gain strength from enemy wolves', () => {
        const center = createWolf(0, 0, 0, 'w');
        const enemy = createWolf(1, -1, 0, 'b');
        
        const pieces = [center, enemy];
        const map = new PieceMap(pieces);

        expect(CombatSystem.getCombatStrength(center, map)).toBe(1);
    });

    test('Combat uses enhanced strength', () => {
        // Setup: Wolf (1) + Friend (1) = 2 Str vs Enemy (HP 3)
        // Attack should do 2 damage.
        const wolf = createWolf(0, 0, 0);
        const friend = createWolf(1, -1, 0);
        const enemy = new Piece(new Hex(0, 1, -1), 'b', PieceType.Dragon); // HP 3
        
        const pieces = [wolf, friend, enemy];
        
        const result = CombatSystem.resolveAttack(pieces, wolf, enemy.hex);
        
        const damagedEnemy = result.pieces.find(p => p.hex.equals(enemy.hex));
        expect(damagedEnemy?.damage).toBe(2); // Base 1 + 1 Bonus
    });
});
