
import { Board } from '../Core/Board';
import { GameEngine } from '../Core/GameEngine';
import { GameState } from '../Core/GameState';
import { Piece } from '../Entities/Piece';
import { Sanctuary } from '../Entities/Sanctuary';
import { Hex } from '../Entities/Hex';
import { PieceType, SanctuaryType, Color, PHASES_PER_TURN } from '../../Constants';
import { createPieceMap } from '../../utils/PieceMap';
import { MoveTree } from '../Core/MoveTree';

describe('Gameplay Adjustments Validation', () => {
    let board: Board;
    let gameEngine: GameEngine;

    beforeEach(() => {
        board = new Board({ nSquares: 8 });
        gameEngine = new GameEngine(board);
    });

    const createGameState = (pieces: Piece[], sanctuaries: Sanctuary[], turnCounter: number = 0): GameState => ({
        pieces,
        pieceMap: createPieceMap(pieces),
        castles: [],
        sanctuaries,
        sanctuaryPool: [SanctuaryType.WardensWatch], // Use Tier 2 in pool
        turnCounter,
        movingPiece: null,
        moveTree: new MoveTree(),
        graveyard: [], // Add required properties
        phoenixRecords: [],
        viewNodeId: null
    });

    // 1. SWORDSMAN STRENGTH
    test('Swordsman strength increases to 2 when crossing the river', () => {
        // White starts at bottom (r > 0). River is r=0. Enemy side is r < 0.
        const whiteBase = new Piece(new Hex(0, 5, -5), 'w', PieceType.Swordsman); // Friendly side
        const whiteAcross = new Piece(new Hex(0, -1, 1), 'w', PieceType.Swordsman); // Enemy side

        // Black starts at top (r < 0). Enemy side is r > 0.
        const blackBase = new Piece(new Hex(0, -5, 5), 'b', PieceType.Swordsman); // Friendly side
        const blackAcross = new Piece(new Hex(0, 1, -1), 'b', PieceType.Swordsman); // Enemy side

        expect(whiteBase.Strength).toBe(1);
        expect(whiteAcross.Strength).toBe(2);
        
        expect(blackBase.Strength).toBe(1);
        expect(blackAcross.Strength).toBe(2);
    });

    // 2. SANCTUARY ISOLATION
    test('Pledging only evolves the pledged sanctuary, not its mirror', () => {
        const whiteSanc = new Sanctuary(new Hex(0, 5, -5), SanctuaryType.WolfCovenant, 'w');
        const blackSanc = new Sanctuary(new Hex(0, -5, 5), SanctuaryType.WolfCovenant, 'b'); // Mirror
        
        let state = createGameState(
            [new Piece(whiteSanc.hex, 'w', PieceType.Swordsman)], // Occupant
            [whiteSanc, blackSanc],
            114 // Turn 114 (White Castles phase, Turn > 100 for unlock)
        );

        // Pledge White's sanctuary
        // Needs spawn hex
        const spawnHex = new Hex(1, 4, -5);
        
        // Execute Pledge
        const newState = gameEngine.pledge(state, whiteSanc.hex, spawnHex);

        // Check White's sanctuary evolved
        const newWhiteSanc = newState.sanctuaries.find(s => s.hex.equals(whiteSanc.hex));
        expect(newWhiteSanc?.type).toBe(SanctuaryType.WardensWatch); // Evolved

        // Check Black's sanctuary did NOT evolve
        const newBlackSanc = newState.sanctuaries.find(s => s.hex.equals(blackSanc.hex));
        expect(newBlackSanc?.type).toBe(SanctuaryType.WolfCovenant); // Unchanged
    });

    // 3. COOLDOWN REDUCTION
    test('Invaders reduce sanctuary cooldowns by extra amount', () => {
        // Setup White Sanctuary on cooldown (5 turns)
        const whiteSanc = new Sanctuary(new Hex(0, 5, -5), SanctuaryType.WolfCovenant, 'w', null, 5, true);
        
        // Setup White Invaders (Crossed River r < 0)
        const invader1 = new Piece(new Hex(0, -1, 1), 'w', PieceType.Archer); // Invader (r=-1)
        const invader2 = new Piece(new Hex(1, -2, 1), 'w', PieceType.Dragon); // Invader (r=-2)
        const defender = new Piece(new Hex(0, 4, -4), 'w', PieceType.Archer); // Defender (r=4, friendly side)
        const swordsman = new Piece(new Hex(0, -3, 3), 'w', PieceType.Swordsman); // Swordsman Invader (Should NOT count)

        // Turn boundary is multiple of PHASES_PER_TURN (e.g. 10, 20)
        // Let's transition from 9 to 10 via StateMutator?
        // GameEngine.passTurn or similar calls checkTurnTransitions.
        // Or directly call resetTurnFlags if exposed?
        // Actually, passTurn increments counter.
        // We can manually invoke StateMutator logic if accessible, OR sim via passTurn loop.
        // But passTurn does increment turnCounter.
        // StateMutator.checkTurnTransitions is private.
        // GameEngine.passTurn calls StateMutator.passTurn -> checkTurnTransitions.
        
        // Let's maximize turnCounter to 9 (end of Turn 1). Next pass -> 10.
        const state = createGameState(
            [invader1, invader2, defender, swordsman],
            [whiteSanc],
            9 // Last phase of Turn 1
        );

        // Pass turn to trigger new turn logic (Turn 10)
        const newState = gameEngine.passTurn(state);

        // Expectation:
        // Base reduction: 1
        // Bonus: 2 invaders (invader1, invader2). Swordsman ignored. Defender ignored.
        // Total reduction: 1 + 2 = 3.
        // New cooldown: 5 - 3 = 2.
        
        const newSanc = newState.sanctuaries[0];
        expect(newSanc.cooldown).toBe(2);
    });

});
