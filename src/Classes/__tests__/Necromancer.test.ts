
import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { StateMutator } from "../Systems/StateMutator";
import { GameState } from "../Core/GameEngine";
import { Board } from "../Core/Board";
import { PieceType } from "../../Constants";
import { PieceMap } from "../../utils/PieceMap";
import { CombatSystem } from "../Systems/CombatSystem";

describe('Necromancer Mechanics', () => {
    let board: Board;
    let state: GameState;

    beforeEach(() => {
        board = new Board(8);
        state = {
            pieces: [],
            pieceMap: new PieceMap([]),
            castles: [],
            sanctuaries: [],
            turnCounter: 0,
            movingPiece: null,
            history: [],
            moveHistory: [],
            graveyard: [],
            phoenixRecords: [],
        };
    });

    test('Soul Harvest: Necromancer gains soul upon capturing', () => {
        const necro = new Piece(new Hex(0, 0, 0), 'w', PieceType.Necromancer);
        const victim = new Piece(new Hex(0, 1, -1), 'b', PieceType.Swordsman); // Adjacent

        // CombatSystem handles attack resolution. 
        // We need to verify if CombatSystem or StateMutator updates the Necromancer's soul count.
        // Assuming we implement this in CombatSystem.resolveAttack or StateMutator.applyMove
        
        // Let's create a manual move/attack simulation if we can't easily mock CombatSystem internals
        // Actually, we should test the INTEGRATION.
        
        state.pieces = [necro, victim];
        // Attacker moves to victim hex (Melee)
        // This test depends on Implementation logic which is NOT yet written.
        // So we write the test to FAIL or to Define behavior.
        
        // We will need to update CombatSystem to increment souls.
        const combatResult = CombatSystem.resolveAttack(state.pieces, necro, victim.hex);
        
        const newNecro = combatResult.pieces.find(p => p.type === PieceType.Necromancer);
        expect(newNecro?.souls).toBe(1);
    });

    test('Raise Dead: Necromancer spends soul to spawn ally', () => {
        // Setup: Necromancer with 1 soul
        const necro = new Piece(new Hex(0, 0, 0), 'w', PieceType.Necromancer, true, true, 0, false, 1); // 1 Soul
        // Setup: Dead friendly unit in graveyard
        const deadSwordsman = new Piece(new Hex(0, 0, 0), 'w', PieceType.Swordsman);
        
        state.pieces = [necro];
        state.pieceMap = new PieceMap(state.pieces);
        state.graveyard = [deadSwordsman];

        const spawnHex = new Hex(0, 1, -1);
        
        // Use Ability: Raise Dead
        const newState = StateMutator.activateAbility(state, necro, spawnHex, "RaiseDead", board);

        const newNecro = newState.pieces.find(p => p.hex.equals(necro.hex));
        const raisedUnit = newState.pieces.find(p => p.hex.equals(spawnHex));

        expect(newNecro?.souls).toBe(0); // Spent soul
        expect(raisedUnit?.color).toBe('w'); // Friendly
        expect(raisedUnit?.type).toBe(PieceType.Swordsman); // Same type
        expect(raisedUnit?.isRevived).toBe(true); // Marked as revived
        
        // Removed from graveyard
        expect(newState.graveyard?.length).toBe(0);
    });
});
