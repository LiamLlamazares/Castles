
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { StateMutator } from "../Systems/StateMutator";
import { GameState, GameEngine } from "../Core/GameEngine";
import { Board } from "../Core/Board";
import { PieceType, TurnPhase } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";

describe('Healer Restoration', () => {
    // Mock Board and State
    let board: Board;
    let state: GameState;

    beforeEach(() => {
        board = new Board(new Map()); // Empty board mock
        state = {
            pieces: [],
            pieceMap: new PieceMap([]),
            castles: [],
            sanctuaries: [],
            turnCounter: 0, // Player White, Turn 1
            movingPiece: null,
            history: [],
            moveHistory: []
        };
    });

    test('Healer heals adjacent friendly piece at end of turn (Pass)', () => {
        const healer = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer);
        const wounded = new Piece(new Hex(1, -1, 0), 'w', PieceType.Swordsman, true, true, 2); // 2 Damage
        
        state.pieces = [healer, wounded];
        state.pieceMap = new PieceMap(state.pieces);

        // Pass Turn
        const newState = StateMutator.passTurn(state, board);
        
        const healedPiece = newState.pieces.find(p => p.hex.equals(wounded.hex));
        expect(healedPiece?.damage).toBe(1); // 2 - 1 = 1
    });

    test('Healer does not heal self (unless logic changed, but usually neighbors)', () => {
        // Spec: "Adjacent allies"
        const healer = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer, true, true, 2);
        
        state.pieces = [healer];
        state.pieceMap = new PieceMap(state.pieces);

        const newState = StateMutator.passTurn(state, board);
        
        const after = newState.pieces[0];
        expect(after.damage).toBe(2); // No self-heal
    });

    test('Healer does not heal enemies', () => {
        const healer = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer);
        const enemy = new Piece(new Hex(1, -1, 0), 'b', PieceType.Swordsman, true, true, 2);
        
        state.pieces = [healer, enemy];
        state.pieceMap = new PieceMap(state.pieces);

        const newState = StateMutator.passTurn(state, board);
        
        const afterEnemy = newState.pieces.find(p => p.color === 'b');
        expect(afterEnemy?.damage).toBe(2);
    });

    test('Multiple healers stack healing', () => {
        const h1 = new Piece(new Hex(0, 0, 0), 'w', PieceType.Healer);
        const h2 = new Piece(new Hex(2, -2, 0), 'w', PieceType.Healer);
        // Wounded in between (adjacent to both)
        const wounded = new Piece(new Hex(1, -1, 0), 'w', PieceType.Swordsman, true, true, 3);
        
        state.pieces = [h1, h2, wounded];
        state.pieceMap = new PieceMap(state.pieces);

        const newState = StateMutator.passTurn(state, board);
        
        const afterWounded = newState.pieces.find(p => p.type === PieceType.Swordsman);
        expect(afterWounded?.damage).toBe(1); // 3 - 1 - 1 = 1
    });
});
