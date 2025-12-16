import { Board } from '../Core/Board';
import { GameEngine } from '../Core/GameEngine';
import { Piece } from '../Entities/Piece';
import { Hex } from '../Entities/Hex';
import { PieceType, Color } from '../../Constants';

describe('Board Boundary Constraints', () => {
    let board: Board;
    let gameEngine: GameEngine;

    beforeEach(() => {
        // Create a small board for testing
        // N_SQUARES is usually 4 or 5, but we rely on Board default or passed value
        board = new Board(3); // Small board radius 3
        gameEngine = new GameEngine(board);
    });

    it('should not allow an Archer to move off the board from the edge', () => {
        // Place an Archer at the very edge: q=0, r=-3, s=3 (North edge)
        const edgeHex = new Hex(0, -3, 3);
        const archer = new Piece(edgeHex, 'w', PieceType.Archer);
        const pieces = [archer];
        const castles: any[] = []; // No castles needed for this test

        const legalMoves = gameEngine.getLegalMoves(archer, pieces, castles, 0);
        
        // Archer moves radius 1. 
        // Hex(0, -4, 4) is directly North and valid direction, but OUT OF BOUNDS for radius 3 board.
        const offBoardHex = new Hex(0, -4, 4);
        
        // Sanity check: is offBoardHex actually off board?
        expect(board.hexSet.has(offBoardHex.getKey())).toBe(false);

        // Sanity check: is edgeHex on board?
        expect(board.hexSet.has(edgeHex.getKey())).toBe(true);
        
        const canMoveOffBoard = legalMoves.some(m => m.equals(offBoardHex));
        expect(canMoveOffBoard).toBe(false);
    });

    it('should not allow a Knight to jump off the board', () => {
        // Knight at edge
        const edgeHex = new Hex(3, -3, 0); // East edge
        const knight = new Piece(edgeHex, 'w', PieceType.Knight);
        const pieces = [knight];
        
        // Knights move 2 then 1. 
        // A jump further East would be q=4 or q=5, definitely off board for radius 3
        const legalMoves = gameEngine.getLegalMoves(knight, pieces, [], 0);
        
        // Filter any move that is NOT in the board's hexSet
        const invalidMoves = legalMoves.filter(m => !board.hexSet.has(m.getKey()));
        
        expect(invalidMoves.length).toBe(0);
    });

    it('should not allow sliding pieces (Giant) to slide off board', () => {
        // Giant at center
        const centerHex = new Hex(0, 0, 0);
        const giant = new Piece(centerHex, 'w', PieceType.Giant);
        const pieces = [giant];

        const legalMoves = gameEngine.getLegalMoves(giant, pieces, [], 0);

        // Should be constrained to board hexes
        const invalidMoves = legalMoves.filter(m => !board.hexSet.has(m.getKey()));
        expect(invalidMoves.length).toBe(0);
    });
});
