import { Board } from '../Core/Board';
import { GameEngine } from '../Core/GameEngine';
import { GameState } from '../Core/GameState';
import { Piece } from '../Entities/Piece';
import { Hex } from '../Entities/Hex';
import { PieceType, Color } from '../../Constants';
import { createPieceMap } from '../../utils/PieceMap';
import { MoveTree } from '../Core/MoveTree';

// Helper to create mock game state
const createMockState = (pieces: Piece[], turnCounter: number = 0): GameState => ({
    pieces,
    pieceMap: createPieceMap(pieces),
    castles: [],
    sanctuaries: [],
    sanctuaryPool: [],
    turnCounter,
    movingPiece: null,
    history: [],
    moveHistory: [],
    moveTree: new MoveTree(),
    graveyard: [],
    phoenixRecords: []
});

describe('Board Boundary Constraints', () => {
    let board: Board;
    let gameEngine: GameEngine;

    beforeEach(() => {
        // Create a small board for testing
        board = new Board({ nSquares: 3 }); // Small board radius 3
        gameEngine = new GameEngine(board);
    });

    it('should not allow an Archer to move off the board from the edge', () => {
        // Place an Archer at the very edge: q=0, r=-3, s=3 (North edge)
        const edgeHex = new Hex(0, -3, 3);
        const archer = new Piece(edgeHex, 'w', PieceType.Archer);
        const state = createMockState([archer], 0);

        const legalMoves = gameEngine.getLegalMoves(state, archer);
        
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
        const state = createMockState([knight], 0);
        
        // Knights move diagonally (slide)
        const legalMoves = gameEngine.getLegalMoves(state, knight);
        
        // Filter any move that is NOT in the board's hexSet
        const invalidMoves = legalMoves.filter(m => !board.hexSet.has(m.getKey()));
        
        expect(invalidMoves.length).toBe(0);
    });

    it('should not allow sliding pieces (Giant) to slide off board', () => {
        // Giant at center
        const centerHex = new Hex(0, 0, 0);
        const giant = new Piece(centerHex, 'w', PieceType.Giant);
        const state = createMockState([giant], 0);

        const legalMoves = gameEngine.getLegalMoves(state, giant);

        // Should be constrained to board hexes
        const invalidMoves = legalMoves.filter(m => !board.hexSet.has(m.getKey()));
        expect(invalidMoves.length).toBe(0);
    });
});

