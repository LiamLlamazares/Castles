import { GameEngine } from '../Core/GameEngine';
import { Board } from '../Core/Board';
import { Piece } from '../Entities/Piece';
import { Hex } from '../Entities/Hex';
import { Sanctuary } from '../Entities/Sanctuary';
import { PieceType, SanctuaryType } from '../../Constants';
import { createPieceMap } from '../../utils/PieceMap';
import { MoveTree } from '../Core/MoveTree';

describe('Pledge Mechanics', () => {
  let gameEngine: GameEngine;
  let board: Board;
  let pieces: Piece[];
  let sanctuaries: Sanctuary[];

  beforeEach(() => {
    board = new Board({ nSquares: 8 }); // Standard board
    pieces = [];
    gameEngine = new GameEngine(board);
    
    // Create a Tier 1 Sanctuary (Wolf Covenant) at 0,-5,5 (near bottom)
    sanctuaries = [
        new Sanctuary(new Hex(0, -5, 5), SanctuaryType.WolfCovenant, 'w', null, 0)
    ];
  });

  const createGameState = (currentPieces: Piece[], currentSanctuaries: Sanctuary[], overrideTurnCounter?: number) => ({
    pieces: currentPieces,
    pieceMap: createPieceMap(currentPieces),
    castles: [],
    sanctuaries: currentSanctuaries,
    sanctuaryPool: [], // Empty pool for basic tests
    turnCounter: overrideTurnCounter ?? 14, // White's Castles phase, Turn 10+ (turnCounter % 10 = 4)
    movingPiece: null,
    moveTree: new MoveTree(),
    graveyard: [],
    phoenixRecords: [],
    viewNodeId: null,
    sanctuarySettings: { unlockTurn: 0, cooldown: 5 }, // Unlock immediately for tests
  });
  
  // Helper to place a piece
  const placePiece = (hex: Hex, type: PieceType, owner: 'w' | 'b') => {
      pieces.push(new Piece(hex, owner, type));
  };

  test('Tier 1 pledge requires occupancy by CURRENT PLAYER piece', () => {
    const sanctuary = sanctuaries[0]; // Tier 1
    
    // 1. Empty sanctuary -> False
    let state = createGameState(pieces, sanctuaries);
    expect(gameEngine.canPledge(state, sanctuary.hex)).toBe(false);

    // 2. Enemy piece (Black piece but it's White's turn at turnCounter=4) -> False
    placePiece(sanctuary.hex, PieceType.Swordsman, 'b');
    state = createGameState(pieces, sanctuaries);
    expect(gameEngine.canPledge(state, sanctuary.hex)).toBe(false);

    // 3. Current player's piece (White at turnCounter=4) -> True
    pieces = [];
    placePiece(sanctuary.hex, PieceType.Swordsman, 'w');
    state = createGameState(pieces, sanctuaries);
    expect(gameEngine.canPledge(state, sanctuary.hex)).toBe(true);
  });

  test('Cannot pledge when it is not your turn', () => {
    const sanctuary = sanctuaries[0];
    
    // White piece occupies sanctuary
    placePiece(sanctuary.hex, PieceType.Swordsman, 'w');
    
    // At turnCounter=14, it's White's Castles phase (14 % 10 = 4) -> can pledge
    let state = createGameState(pieces, sanctuaries);
    expect(gameEngine.canPledge(state, sanctuary.hex)).toBe(true);
    
    // At turnCounter=15 (or any Black turn), White cannot pledge
    state = createGameState(pieces, sanctuaries, 15); // Black's Movement phase
    expect(gameEngine.canPledge(state, sanctuary.hex)).toBe(false);
    
    // At turnCounter=19 (Black's Castles), White still cannot pledge
    state = createGameState(pieces, sanctuaries, 19);
    expect(gameEngine.canPledge(state, sanctuary.hex)).toBe(false);
  });

  test('Pledge spawns new piece and sanctuary becomes inactive with empty pool', () => {
    const sanctuary = sanctuaries[0];
    const spawnHex = new Hex(1, -5, 4);
    
    // Setup valid pledge state (empty pool = no evolution possible)
    placePiece(sanctuary.hex, PieceType.Swordsman, 'w');
    const state = createGameState(pieces, sanctuaries);

    const newState = gameEngine.pledge(state, sanctuary.hex, spawnHex);

    // Check piece spawned
    const spawned = newState.pieces.find(p => p.hex.equals(spawnHex));
    expect(spawned).toBeDefined();
    expect(spawned?.type).toBe(PieceType.Wolf);
    expect(spawned?.color).toBe('w');

    // With empty pool, sanctuary becomes permanently inactive
    const newSanctuary = newState.sanctuaries.find(s => s.hex.equals(sanctuary.hex));
    expect(newSanctuary?.hasPledgedThisGame).toBe(true);
    expect(newSanctuary?.cooldown).toBe(0); // No cooldown for inactive sanctuary
  });

  test('Pledge evolves sanctuary to higher tier when pool has types', () => {
    const sanctuary = sanctuaries[0]; // Wolf Covenant (Tier 1)
    const spawnHex = new Hex(1, -5, 4);
    
    placePiece(sanctuary.hex, PieceType.Swordsman, 'w');
    // Include Tier 2 type in pool
    const stateWithPool = {
      ...createGameState(pieces, sanctuaries),
      sanctuaryPool: [SanctuaryType.WardensWatch] // Tier 2
    };

    const newState = gameEngine.pledge(stateWithPool, sanctuary.hex, spawnHex);

    // Check sanctuary evolved to Tier 2
    const evolvedSanctuary = newState.sanctuaries.find(s => s.hex.equals(sanctuary.hex));
    expect(evolvedSanctuary?.type).toBe(SanctuaryType.WardensWatch);
    expect(evolvedSanctuary?.cooldown).toBe(5); // Evolution cooldown
    expect(evolvedSanctuary?.hasPledgedThisGame).toBe(false); // Can pledge again after cooldown
    
    // Pool should be reduced
    expect(newState.sanctuaryPool).not.toContain(SanctuaryType.WardensWatch);
  });

  test('Cannot pledge if already pledged this game', () => {
    const sanctuary = sanctuaries[0].with({ hasPledgedThisGame: true });
    placePiece(sanctuary.hex, PieceType.Swordsman, 'w');
    const state = createGameState(pieces, [sanctuary]);

    expect(gameEngine.canPledge(state, sanctuary.hex)).toBe(false);
  });

  test('Cannot pledge if on cooldown', () => {
    const sanctuary = sanctuaries[0].with({ cooldown: 3 });
    placePiece(sanctuary.hex, PieceType.Swordsman, 'w');
    const state = createGameState(pieces, [sanctuary]);

    expect(gameEngine.canPledge(state, sanctuary.hex)).toBe(false);
  });

  test('Tier 2 pledge requires surrounding strength >= 3', () => {
    const t2Sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.WardensWatch, 'w', null, 0); // Tier 2
    
    // 1. Occupied but no support -> False
    placePiece(t2Sanctuary.hex, PieceType.Swordsman, 'w'); // Str 1
    let state = createGameState(pieces, [t2Sanctuary]);
    expect(gameEngine.canPledge(state, t2Sanctuary.hex)).toBe(false); // 1 < 3

    // 2. Add adjacent support
    placePiece(new Hex(1, -1, 0), PieceType.Dragon, 'w'); // Str 3. Total 1+3=4 >= 3.
    state = createGameState(pieces, [t2Sanctuary]);
    expect(gameEngine.canPledge(state, t2Sanctuary.hex)).toBe(true);
  });

  test('Tier 3 pledge requires sacrifice', () => {
    const t3Sanctuary = new Sanctuary(new Hex(0, 0, 0), SanctuaryType.PyreEternal, 'w', null, 0); // Tier 3
    
    // Setup Strength 4+ (Swordsman(1) + Dragon(4) = 5)
    placePiece(t3Sanctuary.hex, PieceType.Swordsman, 'w'); // The one on the hex
    placePiece(new Hex(1, -1, 0), PieceType.Dragon, 'w'); // Adjacent support
    
    const state = createGameState(pieces, [t3Sanctuary]);
    
    // canPledge should return true if conditions met
    expect(gameEngine.canPledge(state, t3Sanctuary.hex)).toBe(true);
    
    // Perform pledge with sacrifice
    // We sacrifice the piece ON the sanctuary? Or any piece?
    // Design said: "Tie 3: Surrounding Strength 4+ AND sacrifice 1 piece"
    // Usually logic implies the piece invoking it might be sacrificed or one nearby.
    // Let's assume for now the piece ON the sanctuary is sacrificed, or the user picks?
    // "Sacrifice 1 piece" usually implies cost. 
    // PROPOSAL: The piece *occupying* the sanctuary is sacrificed to summon the avatar.
    
    const spawnHex = new Hex(-1, 0, 1);
    const newState = gameEngine.pledge(state, t3Sanctuary.hex, spawnHex);
    
    // Check old piece is gone (sacrificed)
    const occupant = newState.pieces.find(p => p.hex.equals(t3Sanctuary.hex));
    expect(occupant).toBeUndefined(); // Should be gone if sacrificed
    
    // Check new piece (Phoenix) is spawned at spawnHex
    const phoenix = newState.pieces.find(p => p.hex.equals(spawnHex));
    expect(phoenix?.type).toBe(PieceType.Phoenix);
  });

  test('Cannot pledge onto a river or blocked hex', () => {
    // Setup sanctuary next to a river (e.g., at 0, -2, 2 ? Rivers are usually at r=0... wait, let's just mock the board having a river there)
    // Board defaults: simple river at r=0 usually?
    // Let's rely on Board's riverSet.
    // Standard board: q + r + s = 0.
    // River at r=0 (horizontal center).
    
    // River is at r=0. Pattern: Crossing (q 0,1), River (q 2,3).
    // So Hex(2, 0, -2) is a valid River hex.
    
    // Valid sanctuary at (2, -1, -1), adjacent to (2, 0, -2)
    const riverSanctuary = new Sanctuary(new Hex(2, -1, -1), SanctuaryType.WolfCovenant, 'w', null, 0);
    placePiece(riverSanctuary.hex, PieceType.Swordsman, 'w');
    
    const state = createGameState(pieces, [riverSanctuary]);
    
    // Attempt to pledge onto (2, 0, -2) which is a River hex
    const riverHex = new Hex(2, 0, -2);
    
    // Check canPledge first (should be TRUE if there are OTHER valid spots, but FALSE if ONLY river exists? 
    // canPledge currently only checks for EMPTY. River is EMPTY. So canPledge likely returns true.
    // But pledge() should fail.
    
    expect(board.isRiver(riverHex)).toBe(true);
    
    // canPledge logic update: Should ensure at least one NON-BLOCKED neighbor exists. (0,0,0) is blocked.
    // If (0, -1, 1) has other neighbors, canPledge might be true.
    // But pledge() specifically onto riverHex should throw error.
    
    expect(() => {
        gameEngine.pledge(state, riverSanctuary.hex, riverHex);
    }).toThrow("Invalid spawn location");
  });

  test('Auto-passes Recruitment phase if sanctuary is completely surrounded/blocked', () => {
      // Setup: Tier 1 Sanctuary at (0,0,0) - wait, (0,0,0) is river crossing maybe?
      // Let's use a normal hex (0, -5, 5) from before.
      // We will surround it completely with "Rivers" or Occupied pieces.
      
      const sanctuaryHex = new Hex(0, -5, 5);
      const sanctuary = new Sanctuary(sanctuaryHex, SanctuaryType.WolfCovenant, 'w', null, 0);
      placePiece(sanctuaryHex, PieceType.Swordsman, 'w');
      
      // Surround it!
      const neighbors = sanctuaryHex.cubeRing(1);
      neighbors.forEach(n => {
          placePiece(n, PieceType.Swordsman, 'w'); // Use valid type and args
      });
      
      const state = createGameState(pieces, [sanctuary]);
      
      // Verify canPledge is FALSE because no valid spawn
      expect(gameEngine.canPledge(state, sanctuaryHex)).toBe(false);
      
      // Verify Turn Increment is > 0 (should skip Recruitment)
      const increment = gameEngine.getTurnCounterIncrement(state);
      expect(increment).toBeGreaterThan(0);
  });
});
