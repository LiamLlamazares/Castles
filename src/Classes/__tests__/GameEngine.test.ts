import { GameEngine, GameState } from '../Core/GameEngine';
import { Board } from '../Core/Board';
import { Piece } from '../Entities/Piece';
import { Hex } from '../Entities/Hex';
import { Castle } from '../Entities/Castle';
import { PieceType, Color } from '../../Constants';
import { createPieceMap } from '../../utils/PieceMap';
import { MoveTree } from '../Core/MoveTree';

// Create a minimal board for testing
const createTestBoard = () => {
  return new Board({ nSquares: 7 }); // N_SQUARES - 1 = 7
};

// Helper to create mock state
const createMockState = (pieces: Piece[], castles: Castle[] = [], turnCounter: number = 0): GameState => ({
    pieces,
    pieceMap: createPieceMap(pieces),
    castles,
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

describe('GameEngine', () => {
  let gameEngine: GameEngine;

  beforeEach(() => {
    gameEngine = new GameEngine(createTestBoard());
  });

  describe('getTurnPhase', () => {
    it('returns Movement for turn 0', () => {
      expect(gameEngine.getTurnPhase(0)).toBe('Movement');
    });

    it('returns Movement for turn 1', () => {
      expect(gameEngine.getTurnPhase(1)).toBe('Movement');
    });

    it('returns Attack for turn 2', () => {
      expect(gameEngine.getTurnPhase(2)).toBe('Attack');
    });

    it('returns Attack for turn 3', () => {
      expect(gameEngine.getTurnPhase(3)).toBe('Attack');
    });

    it('returns Castles for turn 4', () => {
      expect(gameEngine.getTurnPhase(4)).toBe('Castles');
    });

    it('cycles correctly after turn 5', () => {
      expect(gameEngine.getTurnPhase(5)).toBe('Movement');
      expect(gameEngine.getTurnPhase(6)).toBe('Movement');
      expect(gameEngine.getTurnPhase(7)).toBe('Attack');
      expect(gameEngine.getTurnPhase(8)).toBe('Attack');
      expect(gameEngine.getTurnPhase(9)).toBe('Castles');
    });
  });

  describe('getCurrentPlayer', () => {
    it('returns white for turns 0-4', () => {
      for (let i = 0; i < 5; i++) {
        expect(gameEngine.getCurrentPlayer(i)).toBe('w');
      }
    });

    it('returns black for turns 5-9', () => {
      for (let i = 5; i < 10; i++) {
        expect(gameEngine.getCurrentPlayer(i)).toBe('b');
      }
    });

    it('cycles back to white for turn 10', () => {
      expect(gameEngine.getCurrentPlayer(10)).toBe('w');
    });

    it('cycles back to black for turn 15', () => {
      expect(gameEngine.getCurrentPlayer(15)).toBe('b');
    });
  });

  describe('getOccupiedHexes', () => {
    it('returns empty array for no pieces', () => {
      const state = createMockState([]);
      expect(gameEngine.getOccupiedHexes(state)).toEqual([]);
    });

    it('returns hex positions of all pieces', () => {
      const hex1 = new Hex(0, 1, -1);
      const hex2 = new Hex(1, 0, -1);
      const pieces = [
        new Piece(hex1, 'w', PieceType.Swordsman),
        new Piece(hex2, 'b', PieceType.Archer),
      ];
      const state = createMockState(pieces);

      const occupied = gameEngine.getOccupiedHexes(state);
      
      expect(occupied).toHaveLength(2);
      expect(occupied[0].equals(hex1)).toBe(true);
      expect(occupied[1].equals(hex2)).toBe(true);
    });
  });

  describe('getBlockedHexSet', () => {
    it('returns a Set for O(1) lookups', () => {
      const state = createMockState([], []);
      const blockedSet = gameEngine.getBlockedHexSet(state);
      expect(blockedSet).toBeInstanceOf(Set);
    });

    it('contains river hexes', () => {
      const state = createMockState([], []);
      const blockedSet = gameEngine.getBlockedHexSet(state);
      // River pattern: 2 crossing (q=0,1), 2 river (q=2,3), repeat
      // q=2 is always river await(first river hex in pattern)
      const riverHex = new Hex(2, 0, -2);
      expect(blockedSet.has(riverHex.getKey())).toBe(true);
    });

    it('contains piece positions', () => {
      const hex = new Hex(1, 2, -3);
      const pieces = [new Piece(hex, 'w', PieceType.Knight)];
      const state = createMockState(pieces, []);
      
      const blockedSet = gameEngine.getBlockedHexSet(state);
      expect(blockedSet.has(hex.getKey())).toBe(true);
    });
  });

  describe('getEnemyHexes', () => {
    it('returns only enemy piece hexes', () => {
      const whiteHex = new Hex(0, 1, -1);
      const blackHex = new Hex(0, -1, 1);
      const pieces = [
        new Piece(whiteHex, 'w', PieceType.Swordsman),
        new Piece(blackHex, 'b', PieceType.Swordsman),
      ];
      const state = createMockState(pieces);

      const enemyHexes = gameEngine.getEnemyHexes(state, 'w');
      
      expect(enemyHexes).toHaveLength(1);
      expect(enemyHexes[0].equals(blackHex)).toBe(true);
    });

    it('returns empty array when no enemies', () => {
      const whiteHex = new Hex(0, 1, -1);
      const pieces = [new Piece(whiteHex, 'w', PieceType.Swordsman)];
      const state = createMockState(pieces);

      const enemyHexes = gameEngine.getEnemyHexes(state, 'w');
      expect(enemyHexes).toHaveLength(0);
    });
  });

  describe('recruitPiece', () => {
    it('adds a new piece and updates castle', () => {
      // Mock state
      const castleHex = new Hex(0, -6, 6); // Mock location
      const spawnHex = new Hex(0, -5, 5);  // Adjacent
      
      // Create a captured castle owned by white (color 'b' means originally black, owner 'w' means captured by white)
      const castle = new Castle(castleHex, 'b', 0, false, 'w');
      
      const pieces: Piece[] = [];
      const castles = [castle];
      
      const state = createMockState(pieces, castles, 4); // Turn 4 = Castles
      
      const newState = gameEngine.recruitPiece(state, castle, spawnHex);
      
      // Check piece added
      expect(newState.pieces).toHaveLength(1);
      expect(newState.pieces[0].hex.equals(spawnHex)).toBe(true);
      expect(newState.pieces[0].type).toBe(PieceType.Swordsman); // Default first piece
      
      // Check castle updated - turns_controlled should increase
      const updatedCastle = newState.castles[0];
      expect(updatedCastle.turns_controlled).toBe(1);
            
      // Check turn counter incremented
      // With 1 castle used and no others, it should advance to next player's turn
      expect(newState.turnCounter).toBeGreaterThan(4);
    });
  });

  describe('getRecruitmentHexes', () => {
    it('returns empty array if no castles controlled', () => {
      const state = createMockState([], [], 4);
      const recruitHexes = gameEngine.getRecruitmentHexes(state);
      expect(recruitHexes).toEqual([]);
    });

    it('returns empty array if only starting castles held', () => {
      const castleHex = new Hex(0, -6, 6); 
      // Starting castle: Owner 'w' matches Color 'w' (not captured)
      const castle = new Castle(castleHex, 'w', 0, false, 'w');
      const state = createMockState([], [castle], 4);

      const recruitHexes = gameEngine.getRecruitmentHexes(state);
      expect(recruitHexes).toEqual([]);
    });

    it('returns adjacent hexes to CAPTURED castle', () => {
      // Setup a castle far from edges/river to ensure all 6 neighbors valid
      const castleHex = new Hex(0, -6, 6); 
      // Captured castle: Color 'b' (originally black), Owner 'w' (now white)
      const castle = new Castle(castleHex, 'b', 0, false, 'w');

      const state = createMockState([], [castle], 4);

      // Turn 4 = Castles phase for White
      const recruitHexes = gameEngine.getRecruitmentHexes(state);
      
      const expectedNeighbor = new Hex(0, -5, 5);
      
      expect(recruitHexes.length).toBeGreaterThan(0);
      expect(recruitHexes.some(h => h.equals(expectedNeighbor))).toBe(true);
    });

    it('excludes occupied hexes', () => {
      const castleHex = new Hex(0, -6, 6); 
      const castle = new Castle(castleHex, 'b', 0, false, 'w');

      const blockingHex = new Hex(0, -5, 5); // Adjacent
      const blockingPiece = new Piece(blockingHex, 'w', PieceType.Swordsman);

      const state = createMockState([blockingPiece], [castle], 4);

      const recruitHexes = gameEngine.getRecruitmentHexes(state);

      // Should NOT contain the blocking hex
      const hasBlocked = recruitHexes.some(h => h.equals(blockingHex));
      expect(hasBlocked).toBe(false);
    });

    it('returns empty if castle used this turn', () => {
      const castleHex = new Hex(0, -6, 6); 
      // Castle already used this turn
      const castle = new Castle(castleHex, 'b', 0, true, 'w');
      const state = createMockState([], [castle], 4);

      const recruitHexes = gameEngine.getRecruitmentHexes(state);
      expect(recruitHexes).toEqual([]);
    });

    it('returns empty if not Castles phase', () => {
      const castleHex = new Hex(0, -6, 6); 
      const castle = new Castle(castleHex, 'b', 0, false, 'w');
      const state = createMockState([], [castle], 0);

      // Turn 0 = Movement phase
      const recruitHexes = gameEngine.getRecruitmentHexes(state);
      expect(recruitHexes).toEqual([]);
    });
  });

  describe('getLegalMoves', () => {
    it('returns valid moves for a piece', () => {
        const hex = new Hex(0, 0, 0); // Center
        const piece = new Piece(hex, 'w', PieceType.Archer); // Moves 1 hex
        const state = createMockState([piece], [], 0);

        const moves = gameEngine.getLegalMoves(state, piece);
        
        // Archer has 6 neighbors, all valid on empty board
        expect(moves.length).toBe(6);
    });

    it('returns empty if phase is not Movement', () => {
        const hex = new Hex(0, 0, 0); 
        const piece = new Piece(hex, 'w', PieceType.Archer);
        const state = createMockState([piece], [], 2);

        // Turn 2 is Attack phase
        const moves = gameEngine.getLegalMoves(state, piece);
        expect(moves).toEqual([]);
    });
  });

  describe('getLegalAttacks', () => {
      it('returns valid attacks for a piece', () => {
          const attackerHex = new Hex(0, 0, 0);
          // White Swordsman attacks (q+1, r-1, s) or (q-1, r, s+1)
          // Target (1, -1, 0) is valid.
          const targetHex = new Hex(1, -1, 0);
          const attacker = new Piece(attackerHex, 'w', PieceType.Swordsman);
          const victim = new Piece(targetHex, 'b', PieceType.Archer);
          
          const state = createMockState([attacker, victim], [], 2);
          
          // Turn 2 is Attack phase
          const attacks = gameEngine.getLegalAttacks(state, attacker);
          
          expect(attacks.length).toBeGreaterThan(0);
          expect(attacks.some(h => h.equals(targetHex))).toBe(true);
      });
  });
});
