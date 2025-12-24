
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { StateMutator } from "../Systems/StateMutator";
import { GameState } from "../Core/GameEngine";
import { Board } from "../Core/Board";
import { PieceType, AbilityType } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";
import { MoveTree } from "../Core/MoveTree";

describe('Wizard Active Abilities', () => {
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
            phoenixRecords: [],
        };
    });


    test('Fireball deals 1 damage to target and neighbors', () => {
        const wizard = new Piece(new Hex(0, 0, 0), 'w', PieceType.Wizard);
        const target = new Piece(new Hex(0, 2, -2), 'b', PieceType.Giant); // HP 2
        const neighbor = new Piece(new Hex(0, 3, -3), 'b', PieceType.Giant); // HP 2

        state.pieces = [wizard, target, neighbor];
        state.pieceMap = new PieceMap(state.pieces);

        // Wizard casts Fireball at target hex
        const newState = StateMutator.activateAbility(state, wizard, target.hex, AbilityType.Fireball, board);

        const newTarget = newState.pieces.find(p => p.hex.equals(target.hex));
        const newNeighbor = newState.pieces.find(p => p.hex.equals(neighbor.hex));
        const newWizard = newState.pieces.find(p => p.hex.equals(wizard.hex));

        expect(newTarget?.damage).toBe(1);
        expect(newNeighbor?.damage).toBe(1);
        expect(newWizard?.abilityUsed).toBe(true);
    });

    test('Teleport moves wizard to empty hex', () => {
        const wizard = new Piece(new Hex(0, 0, 0), 'w', PieceType.Wizard);
        const targetHex = new Hex(2, -2, 0); // Empty hex

        state.pieces = [wizard];
        state.pieceMap = new PieceMap(state.pieces);

        const newState = StateMutator.activateAbility(state, wizard, targetHex, AbilityType.Teleport, board);

        const movedWizard = newState.pieces.find((p: Piece) => p.hex.equals(targetHex));
        expect(movedWizard).toBeDefined();
        expect(movedWizard?.type).toBe(PieceType.Wizard);
        expect(movedWizard?.abilityUsed).toBe(true);
        
        // Old position empty
        expect(newState.pieceMap.has(wizard.hex)).toBe(false);
    });
});
