import { GameEngine } from '../GameEngine';
import { Board } from '../Board';
import { Piece } from '../Piece';
import { Hex } from '../Hex';
import { Castle } from '../Castle';
import { PieceType, Color } from '../../Constants';

// Create a minimal board for testing
const createTestBoard = () => {
  return new Board(7); // N_SQUARES - 1 = 7
};

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
      expect(gameEngine.getOccupiedHexes([])).toEqual([]);
    });

    it('returns hex positions of all pieces', () => {
      const hex1 = new Hex(0, 1, -1);
      const hex2 = new Hex(1, 0, -1);
      const pieces = [
        new Piece(hex1, 'w', PieceType.Swordsman),
        new Piece(hex2, 'b', PieceType.Archer),
      ];

      const occupied = gameEngine.getOccupiedHexes(pieces);
      
      expect(occupied).toHaveLength(2);
      expect(occupied[0].equals(hex1)).toBe(true);
      expect(occupied[1].equals(hex2)).toBe(true);
    });
  });

  describe('getBlockedHexSet', () => {
    it('returns a Set for O(1) lookups', () => {
      const blockedSet = gameEngine.getBlockedHexSet([], []);
      expect(blockedSet).toBeInstanceOf(Set);
    });

    it('contains river hexes', () => {
      const blockedSet = gameEngine.getBlockedHexSet([], []);
      // River pattern: 2 crossing (q=0,1), 2 river (q=2,3), repeat
      // q=2 is always river (first river hex in pattern)
      const riverHex = new Hex(2, 0, -2);
      expect(blockedSet.has(riverHex.getKey())).toBe(true);
    });

    it('contains piece positions', () => {
      const hex = new Hex(1, 2, -3);
      const pieces = [new Piece(hex, 'w', PieceType.Knight)];
      
      const blockedSet = gameEngine.getBlockedHexSet(pieces, []);
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

      const enemyHexes = gameEngine.getEnemyHexes(pieces, 'w');
      
      expect(enemyHexes).toHaveLength(1);
      expect(enemyHexes[0].equals(blackHex)).toBe(true);
    });

    it('returns empty array when no enemies', () => {
      const whiteHex = new Hex(0, 1, -1);
      const pieces = [new Piece(whiteHex, 'w', PieceType.Swordsman)];

      const enemyHexes = gameEngine.getEnemyHexes(pieces, 'w');
      expect(enemyHexes).toHaveLength(0);
    });
  });

  describe('recruitPiece', () => {
    it('adds a new piece and updates castle', () => {
      // Mock state
      const castleHex = new Hex(0, -6, 6); // Mock location
      const spawnHex = new Hex(0, -5, 5);  // Adjacent
      
      // Create a castle owned by white
      const castle = new Castle(castleHex, 'w', 0);
      castle.owner = 'w';
      
      const pieces: Piece[] = [];
      const castles = [castle];
      
      const state = {
        pieces,
        Castles: castles,
        turnCounter: 4, // Castles phase
        movingPiece: null,
        history: [],
      };
      
      const newState = gameEngine.recruitPiece(state, castle, spawnHex);
      
      // Check piece added
      expect(newState.pieces).toHaveLength(1);
      expect(newState.pieces[0].hex.equals(spawnHex)).toBe(true);
      expect(newState.pieces[0].type).toBe(PieceType.Swordsman); // Default first piece
      
      // Check castle updated
      const updatedCastle = newState.Castles[0];
      expect(updatedCastle.used_this_turn).toBe(true);
      expect(updatedCastle.turns_controlled).toBe(1);
      
      // Check turn counter incremented
      // With 1 castle used and no others, it should advance
      expect(newState.turnCounter).toBeGreaterThan(4);
    });
  });

  describe('getRecruitmentHexes', () => {
    it('returns empty array if no castles controlled', () => {
      const pieces: Piece[] = [];
      const castles: Castle[] = []; // No castles
      const recruitHexes = gameEngine.getRecruitmentHexes(pieces, castles, 4);
      expect(recruitHexes).toEqual([]);
    });

    it('returns empty array if only starting castles held', () => {
      const castleHex = new Hex(0, -6, 6); 
      // Starting castle: Owner 'w' matches Color 'w'
      const castle = new Castle(castleHex, 'w', 0); 
      castle.owner = 'w';

      const castles = [castle];
      const pieces: Piece[] = [];

      const recruitHexes = gameEngine.getRecruitmentHexes(pieces, castles, 4);
      expect(recruitHexes).toEqual([]);
    });

    it('returns adjacent hexes to CAPTURED castle', () => {
      // Setup a castle far from edges/river to ensure all 6 neighbors valid
      const castleHex = new Hex(0, -6, 6); 
      // Captured castle: Color 'b' (originally black), Owner 'w' (now white)
      const castle = new Castle(castleHex, 'b', 0); 
      castle.owner = 'w';

      const castles = [castle];
      const pieces: Piece[] = [];

      // Turn 4 = Castles phase for White
      const recruitHexes = gameEngine.getRecruitmentHexes(pieces, castles, 4);
      
      const expectedNeighbor = new Hex(0, -5, 5);
      
      expect(recruitHexes.length).toBeGreaterThan(0);
      expect(recruitHexes.some(h => h.equals(expectedNeighbor))).toBe(true);
    });

    it('excludes occupied hexes', () => {
      const castleHex = new Hex(0, -6, 6); 
      const castle = new Castle(castleHex, 'w', 0);
      castle.owner = 'w';

      const blockingHex = new Hex(0, -5, 5); // Adjacent
      const blockingPiece = new Piece(blockingHex, 'w', PieceType.Swordsman);

      const castles = [castle];
      const pieces = [blockingPiece];

      const recruitHexes = gameEngine.getRecruitmentHexes(pieces, castles, 4);

      // Should NOT contain the blocking hex
      const hasBlocked = recruitHexes.some(h => h.equals(blockingHex));
      expect(hasBlocked).toBe(false);
    });

    it('returns empty if castle used this turn', () => {
      const castleHex = new Hex(0, -6, 6); 
      const castle = new Castle(castleHex, 'w', 0);
      castle.owner = 'w';
      castle.used_this_turn = true;

      const castles = [castle];
      const pieces: Piece[] = [];

      const recruitHexes = gameEngine.getRecruitmentHexes(pieces, castles, 4);
      expect(recruitHexes).toEqual([]);
    });

    it('returns empty if not Castles phase', () => {
      const castleHex = new Hex(0, -6, 6); 
      const castle = new Castle(castleHex, 'w', 0);
      castle.owner = 'w';

      const castles = [castle];
      const pieces: Piece[] = [];

      // Turn 0 = Movement phase
      const recruitHexes = gameEngine.getRecruitmentHexes(pieces, castles, 0);
      expect(recruitHexes).toEqual([]);
    });
  });
});
