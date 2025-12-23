
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { StateMutator } from "../Systems/StateMutator";
import { GameState, PhoenixRecord } from "../Core/GameEngine";
import { Board } from "../Core/Board";
import { PieceType, PLAYER_CYCLE_LENGTH } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";
import { Castle } from "../Entities/Castle";
import { MoveTree } from "../Core/MoveTree";

describe('Phoenix Rebirth Logic', () => {
    let board: Board;
    let state: GameState;

    beforeEach(() => {
        board = new Board({ nSquares: 8 });
        state = {
            pieces: [],
            pieceMap: new PieceMap([]),
            castles: [],
            sanctuaries: [],
            turnCounter: 0,
            movingPiece: null,
            history: [],
            moveHistory: [],
            moveTree: new MoveTree(),
            graveyard: [],
            phoenixRecords: []
        };
    });


    test('Phoenix death creates a respawn record', () => {
        // Mock CombatSystem or simulate death via applyAttack
        // But applyAttack uses CombatSystem.resolveAttack which we can't easily mock return values of here without integration.
        // INTEGRATION TEST style:
        
        const attacker = new Piece(new Hex(0, 0, 0), 'b', PieceType.Dragon); // Strong
        const phoenix = new Piece(new Hex(0, 1, -1), 'w', PieceType.Phoenix); // Weak (HP 2) vs Dragon (Str 3)
        // Combat: Dragon (3) > Phoenix (2) -> Kill.

        state.pieces = [attacker, phoenix];
        state.pieceMap = new PieceMap(state.pieces);

        const newState = StateMutator.applyAttack(state, attacker, phoenix.hex, board);
        
        // Verify Phoenix is gone
        const deadPhoenix = newState.pieces.find(p => p.type === PieceType.Phoenix);
        expect(deadPhoenix).toBeUndefined();

        // Verify Record created
        expect(newState.phoenixRecords.length).toBe(1);
        expect(newState.phoenixRecords[0].owner).toBe('w');
        expect(newState.phoenixRecords[0].respawnTurn).toBeGreaterThan(0);
        // Correct calculation: 0 + 3 rounds (30) = 30?
        // Note: applyAttack might increment turn counter.
        // Turn increment logic depends on phase.
    });

    test('Phoenix respawns at castle when timer met', () => {
        const castle = new Castle(new Hex(0, 0, 0), 'w', 0); // Owned by white
        state.castles = [castle];
        state.phoenixRecords = [{ respawnTurn: 10, owner: 'w' }];
        state.turnCounter = 10; // Timer met

        // Trigger transition check via passTurn or just applyMove?
        // checkTurnTransitions is private. We can call resetTurnFlags? No.
        // We can call passTurn to trigger logic.
        
        const newState = StateMutator.passTurn(state, board);
        
        const phoenix = newState.pieces.find(p => p.type === PieceType.Phoenix);
        expect(phoenix).toBeDefined();
        // Should spawn at castle hex (0,0,0) or neighbor
        // Since castle hex was empty (castles list doesn't imply piece occupancy), it should be there.
        expect(phoenix?.hex.equals(castle.hex)).toBe(true);
        
        expect(newState.phoenixRecords.length).toBe(0);
    });

    test('Fireball killing Phoenix schedules respawn (Task 2.1 fix)', () => {
        // Setup: Wizard has Fireball ability, Phoenix at target hex
        const wizard = new Piece(new Hex(0, 0, 0), 'w', PieceType.Wizard);
        // Phoenix placed at target hex, pre-damaged so Fireball kills it (2 HP - 1 damage = 1 remaining, then +1 from Fireball = dead)
        const phoenix = new Piece(new Hex(1, -1, 0), 'b', PieceType.Phoenix).with({ damage: 1 });
        
        state.pieces = [wizard, phoenix];
        state.pieceMap = new PieceMap(state.pieces);
        state.turnCounter = 2; // Attack phase for White
        
        // Use Fireball ability targeting Phoenix's hex (pass wizard Piece, not hex)
        const result = StateMutator.activateAbility(state, wizard, phoenix.hex, 'Fireball', board);
        
        // Verify Phoenix is dead (1 existing damage + 1 Fireball = 2 = HP, killed)
        const deadPhoenix = result.pieces.find(p => p.type === PieceType.Phoenix);
        expect(deadPhoenix).toBeUndefined();
        
        // Verify phoenixRecords updated (the bug fix from Task 2.1)
        expect(result.phoenixRecords).toBeDefined();
        expect(result.phoenixRecords.length).toBe(1);
        expect(result.phoenixRecords[0].owner).toBe('b');
    });
});
