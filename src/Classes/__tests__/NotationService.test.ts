import { NotationService } from '../NotationService';
import { Hex } from '../Hex';
import { Piece } from '../Piece';
import { Castle } from '../Castle';
import { PieceType } from '../../Constants';

describe('NotationService', () => {
    
    describe('toCoordinate', () => {
        it('should map center hex (0,0,0) to J10', () => {
            const hex = new Hex(0, 0, 0);
            expect(NotationService.toCoordinate(hex)).toBe('J10');
        });

        it('should map neighbor (1,0,-1) correctly', () => {
            // (1,0,-1) is East neighbor
            // In even-q offset: col=1, row=0 + (1 + 1*(1))/2 = 1
            // Col 1 -> 1 + 9 = 10 -> 'K'
            // Row 1 -> 1 + 10 = 11
            // Expect K11
            const hex = new Hex(1, 0, -1);
            expect(NotationService.toCoordinate(hex)).toBe('K11');
        });
    });

    describe('getPieceCode', () => {
        it('should return correct codes', () => {
            expect(NotationService.getPieceCode(PieceType.Swordsman)).toBe('Swo');
            expect(NotationService.getPieceCode(PieceType.Assassin)).toBe('Asn');
        });
    });

    describe('getMoveNotation', () => {
        it('should format simple move', () => {
            const start = new Hex(0, 0, 0);
            const piece = new Piece(start, 'w', PieceType.Archer);
            const target = new Hex(1, -1, 0); // NE neighbor
            // Center is J10
            // Target: col=1, row = -1 + (1+1*1)/2 = 0.
            // Col index 10 -> K. Row 0 -> 10. => K10 ?
            // Let's check math:
            // col = 1. row = -1 + (1+1)/2 = -1 + 1 = 0.
            // row displayed = 0 + 10 = 10.
            // So K10.
            
            expect(NotationService.getMoveNotation(piece, target)).toBe('J10K10');
        });
    });
});
