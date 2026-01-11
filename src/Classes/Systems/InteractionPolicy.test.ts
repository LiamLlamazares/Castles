
import { InteractionPolicy, InteractionContext } from './InteractionPolicy';
import { Hex } from '../Entities/Hex';
import { Board } from '../Core/Board';
import { GameState } from '../Core/GameState';
import { Piece } from '../Entities/Piece';
import { Sanctuary } from '../Entities/Sanctuary';
import { PieceMap } from '../../utils/PieceMap';
import { AbilityType, Color, PieceType, SanctuaryType } from '../../Constants';
import { MoveTree } from '../Core/MoveTree';

// Mock Dependencies
jest.mock('../Services/SanctuaryService', () => ({
  SanctuaryService: {
    canPledge: jest.fn().mockReturnValue(true)
  }
}));

describe('InteractionPolicy', () => {
  let mockBoard: Board;
  let mockGameState: GameState;
  let ctx: InteractionContext;

  beforeEach(() => {
    // Setup minimal mock state
    mockBoard = new Board(); // Assuming default constructor works or is mocked
    // Mock Board methods if necessary
    mockBoard.isRiver = jest.fn().mockReturnValue(false);
    mockBoard.isCastle = jest.fn().mockReturnValue(false);
    
    mockGameState = {
      pieceMap: new PieceMap([]),
      pieces: [],
      castles: [],
      sanctuaries: [],
      turnCounter: 0,
      moveTree: new MoveTree(),
      sanctuaryPool: [],
      graveyard: [],
      phoenixRecords: [],
      movingPiece: null,
      viewNodeId: null
    } as unknown as GameState;

    ctx = {
      board: mockBoard,
      gameState: mockGameState
    };
  });

  describe('isValidAbilityTarget', () => {
    // Fireball Range: 2
    const source = new Hex(0, 0, 0);

    it('should return true for valid range target', () => {
      const target = new Hex(1, -1, 0); // Distance 1
      expect(InteractionPolicy.isValidAbilityTarget(source, target, AbilityType.Fireball)).toBe(true);
      
      const target2 = new Hex(2, -2, 0); // Distance 2
      expect(InteractionPolicy.isValidAbilityTarget(source, target2, AbilityType.Fireball)).toBe(true);
    });

    it('should return false for out of range target', () => {
      const target = new Hex(3, -3, 0); // Distance 3
      expect(InteractionPolicy.isValidAbilityTarget(source, target, AbilityType.Fireball)).toBe(false);
    });
  });

  describe('isValidPledgeSpawn', () => {
    const sanctuaryHex = new Hex(0, 0, 0);

    it('should return true for valid adjacent spawn', () => {
      const target = new Hex(1, -1, 0); // Neighbor
      
      // Mock validation helpers if they used external calls, but here logic is imported.
      // We need to ensure helper imports act as expected or are mocked. 
      // Integration style testing for imported utils is fine here.
      
      expect(InteractionPolicy.isValidPledgeSpawn(ctx, sanctuaryHex, target)).toBe(true);
    });

    it('should return false for non-adjacent hex', () => {
      const target = new Hex(2, -2, 0);
      expect(InteractionPolicy.isValidPledgeSpawn(ctx, sanctuaryHex, target)).toBe(false);
    });

    it('should return false if target is occupied', () => {
      const target = new Hex(1, -1, 0);
      const piece = new Piece(target, "w", PieceType.Swordsman);
      mockGameState.pieceMap = new PieceMap([piece]); // Occupy target

      expect(InteractionPolicy.isValidPledgeSpawn(ctx, sanctuaryHex, target)).toBe(false);
    });
  });
});
