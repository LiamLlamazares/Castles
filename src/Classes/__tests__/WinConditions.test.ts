import { GameEngine } from '../Core/GameEngine';
import { Board } from '../Core/Board';
import { Piece } from '../Entities/Piece';
import { Castle } from '../Entities/Castle';
import { Hex } from '../Entities/Hex';
import { PieceType } from '../../Constants';
import { createPieceMap } from '../../utils/PieceMap';
import { MoveTree } from '../Core/MoveTree';

// Create a minimal board for testing
const createTestBoard = () => new Board({ nSquares: 7 });

// Helper to create test castle
const createCastle = (q: number, r: number, s: number, color: 'w' | 'b', owner?: 'w' | 'b') => {
  return new Castle(new Hex(q, r, s), color, 0, false, owner ?? color);
};

describe('GameEngine - Win Conditions', () => {
  let gameEngine: GameEngine;

  beforeEach(() => {
    gameEngine = new GameEngine(createTestBoard());
  });

  describe('checkMonarchCapture / getWinner', () => {
    it('returns null when both monarchs are alive', () => {
      const pieces = [
        new Piece(new Hex(0, 5, -5), 'w', PieceType.Monarch),
        new Piece(new Hex(0, -5, 5), 'b', PieceType.Monarch),
      ];
      const castles = gameEngine.board.castles;

      expect(gameEngine.getWinner(pieces, castles)).toBeNull();
    });

    it('returns black when white monarch is captured', () => {
      const pieces = [
        // White monarch is missing
        new Piece(new Hex(0, -5, 5), 'b', PieceType.Monarch),
      ];
      const castles = gameEngine.board.castles;

      expect(gameEngine.getWinner(pieces, castles)).toBe('b');
    });

    it('returns white when black monarch is captured', () => {
      const pieces = [
        new Piece(new Hex(0, 5, -5), 'w', PieceType.Monarch),
        // Black monarch is missing
      ];
      const castles = gameEngine.board.castles;

      expect(gameEngine.getWinner(pieces, castles)).toBe('w');
    });
  });

  describe('Castle control victory', () => {
    it('returns null when castles are split between players', () => {
      const pieces = [
        new Piece(new Hex(0, 5, -5), 'w', PieceType.Monarch),
        new Piece(new Hex(0, -5, 5), 'b', PieceType.Monarch),
      ];
      // Default: each player owns their 3 home castles
      const castles = gameEngine.board.castles;

      expect(gameEngine.getWinner(pieces, castles)).toBeNull();
    });

    it('returns white when white owns all 6 castles', () => {
      const pieces = [
        new Piece(new Hex(0, 5, -5), 'w', PieceType.Monarch),
        new Piece(new Hex(0, -5, 5), 'b', PieceType.Monarch),
      ];
      // All castles owned by white
      const castles = gameEngine.board.castles.map(c => c.with({ owner: 'w' }));

      expect(gameEngine.getWinner(pieces, castles)).toBe('w');
    });

    it('returns black when black owns all 6 castles', () => {
      const pieces = [
        new Piece(new Hex(0, 5, -5), 'w', PieceType.Monarch),
        new Piece(new Hex(0, -5, 5), 'b', PieceType.Monarch),
      ];
      // All castles owned by black
      const castles = gameEngine.board.castles.map(c => c.with({ owner: 'b' }));

      expect(gameEngine.getWinner(pieces, castles)).toBe('b');
    });
  });

  describe('getVictoryMessage', () => {
    it('returns null when game is ongoing', () => {
      const pieces = [
        new Piece(new Hex(0, 5, -5), 'w', PieceType.Monarch),
        new Piece(new Hex(0, -5, 5), 'b', PieceType.Monarch),
      ];
      const castles = gameEngine.board.castles;

      expect(gameEngine.getVictoryMessage(pieces, castles)).toBeNull();
    });

    it('returns monarch capture message when monarch is captured', () => {
      const pieces = [
        new Piece(new Hex(0, -5, 5), 'b', PieceType.Monarch),
        // White monarch missing
      ];
      const castles = gameEngine.board.castles;

      const message = gameEngine.getVictoryMessage(pieces, castles);
      expect(message).toContain('Black');
      expect(message).toContain('Monarch');
    });

    it('returns castle control message when all castles captured', () => {
      const pieces = [
        new Piece(new Hex(0, 5, -5), 'w', PieceType.Monarch),
        new Piece(new Hex(0, -5, 5), 'b', PieceType.Monarch),
      ];
      const castles = gameEngine.board.castles.map(c => c.with({ owner: 'w' }));

      const message = gameEngine.getVictoryMessage(pieces, castles);
      expect(message).toContain('White');
      expect(message).toContain('castles');
    });
  });

  describe('applyCastleAttack ownership transfer', () => {
    it('transfers castle ownership when capturing', () => {
      const attackerHex = new Hex(1, 0, -1);
      const castleHex = new Hex(7, 0, -7); // White-side castle at r=0
      
      const pieces = [
        new Piece(attackerHex, 'b', PieceType.Knight), // Black piece attacking
        new Piece(new Hex(0, 5, -5), 'w', PieceType.Monarch),
        new Piece(new Hex(0, -5, 5), 'b', PieceType.Monarch),
      ];
      
      // Castle starts owned by white
      const castles = [createCastle(7, 0, -7, 'w', 'w')];
      
      const state = {
        pieces,
        pieceMap: createPieceMap(pieces),
        castles: castles,
        sanctuaries: [],
        turnCounter: 7, // Black's turn (attack phase)
        movingPiece: pieces[0],
        history: [],
        moveHistory: [],
        moveTree: new MoveTree(),
        graveyard: [],
        phoenixRecords: [],
      };
      
      const newState = gameEngine.applyCastleAttack(state, pieces[0], castleHex);
      
      // Castle should now be owned by black
      const capturedCastle = newState.castles.find(c => c.hex.equals(castleHex));
      expect(capturedCastle?.owner).toBe('b');
    });
  });
});
