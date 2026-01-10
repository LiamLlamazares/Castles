
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { CombatSystem } from "../Systems/CombatSystem";
import { PieceType } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";

describe('Healer Strength Buff', () => {
    test('Healer provides +1 STR to adjacent friendly piece', () => {
        const healer = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer);
        const ally = new Piece(new Hex(1, 0, -1), 'w', PieceType.Archer);
        
        const pieces = [healer, ally];
        const pieceMap = new PieceMap(pieces);

        const allyStrength = CombatSystem.getCombatStrength(ally, pieceMap);
        expect(allyStrength).toBe(2); // Base 1 + 1 from Healer
    });

    test('Healer does not buff self', () => {
        const healer = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer);
        
        const pieces = [healer];
        const pieceMap = new PieceMap(pieces);

        const healerStrength = CombatSystem.getCombatStrength(healer, pieceMap);
        expect(healerStrength).toBe(1); // Base strength only
    });

    test('Healer does not buff enemies', () => {
        const healer = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer);
        const enemy = new Piece(new Hex(1, -1, 0), 'b', PieceType.Swordsman);
        
        const pieces = [healer, enemy];
        const pieceMap = new PieceMap(pieces);

        const enemyStrength = CombatSystem.getCombatStrength(enemy, pieceMap);
        expect(enemyStrength).toBe(1); // No buff from enemy Healer
    });

    test('Multiple Healers stack buffs', () => {
        const h1 = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer);
        const h2 = new Piece(new Hex(2, -1, -1), 'w', PieceType.Healer);
        const ally = new Piece(new Hex(1, 0, -1), 'w', PieceType.Archer);
        
        const pieces = [h1, h2, ally];
        const pieceMap = new PieceMap(pieces);

        const allyStrength = CombatSystem.getCombatStrength(ally, pieceMap);
        expect(allyStrength).toBe(3); // Base 1 + 1 + 1 from two Healers
    });

    test('Healer buff works with pieces of different strength', () => {
        const healer = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer);
        const dragon = new Piece(new Hex(1, -1, 0), 'w', PieceType.Dragon);
        
        const pieces = [healer, dragon];
        const pieceMap = new PieceMap(pieces);

        const dragonStrength = CombatSystem.getCombatStrength(dragon, pieceMap);
        expect(dragonStrength).toBe(4); // Base 3 + 1 from Healer
    });

    test('Healer only buffs pieces within radius 1', () => {
        const healer = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer);
        const nearAlly = new Piece(new Hex(1, -1, 0), 'w', PieceType.Archer);
        const farAlly = new Piece(new Hex(0, -2, 2), 'w', PieceType.Archer); // Distance 2      
        const pieces = [healer, nearAlly, farAlly];
        const pieceMap = new PieceMap(pieces);

        const nearStrength = CombatSystem.getCombatStrength(nearAlly, pieceMap);
        const farStrength = CombatSystem.getCombatStrength(farAlly, pieceMap);
        
        expect(nearStrength).toBe(2); // Buffed
        expect(farStrength).toBe(1); // Not buffed (too far)
    });
});
