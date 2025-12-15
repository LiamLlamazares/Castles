import { GameEngine } from '../GameEngine';
import { Board } from '../Board';
import { Piece } from '../Piece';
import { Hex } from '../Hex';
import { PieceType, Color } from '../../Constants';

// Create a minimal board for testing
const createTestBoard = () => {
  const pieces: Piece[] = [];
  return new Board(pieces, 7); // N_SQUARES - 1 = 7
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
      // River hexes are at r=0
      const riverHex = new Hex(0, 0, 0);
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
});
