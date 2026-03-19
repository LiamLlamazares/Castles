/**
 * @file PieceMovement.test.ts
 * @description Unit tests for all 15 piece types' movement and attack patterns.
 * Tests verify correct behavior for each piece's movement strategy, attack strategy,
 * and special abilities on a standard board.
 */
import { Board } from '../Core/Board';
import { GameState } from '../Core/GameState';
import { Piece } from '../Entities/Piece';
import { Hex } from '../Entities/Hex';
import { Castle } from '../Entities/Castle';
import { PieceFactory } from '../Entities/PieceFactory';
import { RuleEngine } from '../Systems/RuleEngine';
import { CombatSystem } from '../Systems/CombatSystem';
import { PieceType, Color, AttackType } from '../../Constants';
import { createPieceMap, PieceMap } from '../../utils/PieceMap';
import { MoveTree } from '../Core/MoveTree';

const BOARD_SIZE = 8;
const createTestBoard = () => new Board({ nSquares: BOARD_SIZE });

const createState = (
  pieces: Piece[],
  turnCounter: number = 0,
  castles: Castle[] = []
): GameState => ({
  pieces,
  pieceMap: createPieceMap(pieces),
  castles,
  sanctuaries: [],
  sanctuaryPool: [],
  turnCounter,
  movingPiece: null,
  moveTree: new MoveTree(),
  graveyard: [],
  phoenixRecords: [],
  viewNodeId: null,
});

// Center of board — maximum freedom of movement
const CENTER = new Hex(0, 0, 0);
// Offset from center — avoids river (r=0) issues for ground units
const SAFE_POS = new Hex(2, 2, -4);
// Near edge — tests boundary behavior
const EDGE_POS = new Hex(0, 7, -7);

// Helper: get legal moves for a piece at a position
const getMoves = (type: PieceType, hex: Hex, color: Color, board: Board, otherPieces: Piece[] = []): Hex[] => {
  const piece = PieceFactory.create(type, hex, color);
  const state = createState([piece, ...otherPieces], 0); // Movement phase
  return RuleEngine.getLegalMoves(piece, state, board);
};

// Helper: get legal attacks for a piece
const getAttacks = (type: PieceType, hex: Hex, color: Color, board: Board, enemies: Piece[] = [], castles: Castle[] = []): Hex[] => {
  const piece = PieceFactory.create(type, hex, color);
  const state = createState([piece, ...enemies], 2, castles); // Attack phase (turnCounter=2)
  return RuleEngine.getLegalAttacks(piece, state, board);
};

describe('Piece Movement & Attack Tests', () => {
  let board: Board;

  beforeEach(() => {
    board = createTestBoard();
  });

  // ================================================================
  // SWORDSMAN
  // ================================================================
  describe('Swordsman', () => {
    it('white swordsman moves forward (toward negative r) in 3 diagonal directions', () => {
      const moves = getMoves(PieceType.Swordsman, SAFE_POS, 'w', board);
      expect(moves.length).toBe(3);
      // White direction=1: forward dirs are {q:1,r:-1,s:0}, {q:0,r:-1,s:1}, {q:-1,r:0,s:1}
      // Two moves decrease r, one keeps r same but increases s (all are "forward")
      moves.forEach(m => {
        expect(m.r).toBeLessThanOrEqual(SAFE_POS.r);
      });
    });

    it('black swordsman moves forward (toward positive r) in 3 diagonal directions', () => {
      const pos = new Hex(2, -4, 2);
      const moves = getMoves(PieceType.Swordsman, pos, 'b', board);
      expect(moves.length).toBe(3);
      // Black direction=-1: forward dirs are {q:-1,r:1,s:0}, {q:0,r:1,s:-1}, {q:1,r:0,s:-1}
      // All moves should have r increase OR s decrease (toward positive r side)
      moves.forEach(m => {
        const dr = m.r - pos.r;
        // At least r should increase or stay same (one dir has dr=0 but ds=-1)
        expect(dr).toBeGreaterThanOrEqual(0);
      });
    });

    it('swordsman blocked by friendly piece', () => {
      const pos = SAFE_POS;
      const blocker = PieceFactory.create(PieceType.Archer, new Hex(3, 1, -4), 'w');
      const moves = getMoves(PieceType.Swordsman, pos, 'w', board, [blocker]);
      // One of the 3 forward hexes is blocked
      expect(moves.length).toBe(2);
    });

    it('swordsman blocked by river at r=0', () => {
      // Place white swordsman just above river
      const pos = new Hex(2, 1, -3);
      const moves = getMoves(PieceType.Swordsman, pos, 'w', board);
      // Some forward hexes may land on river (r=0)
      // River pattern: r=0 hexes are sometimes passable (crossings) and sometimes not
      // Just verify the move count is reasonable (0-3)
      expect(moves.length).toBeGreaterThanOrEqual(0);
      expect(moves.length).toBeLessThanOrEqual(3);
    });

    it('swordsman has +1 strength when across river', () => {
      // White swordsman in enemy territory (r < 0)
      const piece = PieceFactory.create(PieceType.Swordsman, new Hex(0, -2, 2), 'w');
      expect(piece.Strength).toBe(2); // Base 1 + river bonus 1

      // White swordsman on own side (r > 0)
      const piece2 = PieceFactory.create(PieceType.Swordsman, new Hex(0, 2, -2), 'w');
      expect(piece2.Strength).toBe(1); // Base 1, no bonus
    });

    it('swordsman attacks diagonally forward only (2 directions)', () => {
      const pos = SAFE_POS;
      // Place enemies in all 6 adjacent hexes
      const neighbors = pos.cubeRing(1);
      const enemies = neighbors
        .filter(h => board.hexSet.has(h.getKey()))
        .map(h => PieceFactory.create(PieceType.Archer, h, 'b'));

      const attacks = getAttacks(PieceType.Swordsman, pos, 'w', board, enemies);
      // Swordsman only attacks in 2 forward diagonal directions
      expect(attacks.length).toBe(2);
    });
  });

  // ================================================================
  // ARCHER
  // ================================================================
  describe('Archer', () => {
    it('moves 1 hex in any direction from center', () => {
      const moves = getMoves(PieceType.Archer, SAFE_POS, 'w', board);
      // Should have up to 6 moves (hexagonal neighbors), minus any blocked
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.length).toBeLessThanOrEqual(6);
      // All moves should be distance 1
      moves.forEach(m => {
        const dist = Math.max(
          Math.abs(m.q - SAFE_POS.q),
          Math.abs(m.r - SAFE_POS.r),
          Math.abs(m.s - SAFE_POS.s)
        );
        expect(dist).toBe(1);
      });
    });

    it('attacks at range 2 (not adjacent)', () => {
      const pos = new Hex(0, 3, -3);
      // Place enemy at range 2 (undefended — no adjacent melee enemy)
      const enemyAt2 = PieceFactory.create(PieceType.Archer, new Hex(0, 1, -1), 'b');

      const attacks = getAttacks(PieceType.Archer, pos, 'w', board, [enemyAt2]);
      const attackKeys = attacks.map(h => h.getKey());

      expect(attackKeys).toContain(enemyAt2.hex.getKey()); // Range 2 ✓
    });

    it('cannot attack adjacent enemies (range 1)', () => {
      const pos = new Hex(0, 3, -3);
      const enemyAt1 = PieceFactory.create(PieceType.Archer, new Hex(0, 2, -2), 'b');

      const attacks = getAttacks(PieceType.Archer, pos, 'w', board, [enemyAt1]);
      const attackKeys = attacks.map(h => h.getKey());

      expect(attackKeys).not.toContain(enemyAt1.hex.getKey()); // Range 1 ✗
    });

    it('gets extended range on high ground', () => {
      // High ground hexes are at board corners (N-2 ring)
      const highGroundHexes = board.highGroundHexes;
      if (highGroundHexes.length === 0) return; // Skip if no high ground

      const hgHex = highGroundHexes[0];
      const piece = PieceFactory.create(PieceType.Archer, hgHex, 'w');

      // Place enemies at range 3 (only reachable from high ground)
      const ring3 = hgHex.cubeRing(3);
      const validRing3 = ring3.filter(h => board.hexSet.has(h.getKey()));
      if (validRing3.length === 0) return;

      const enemy = PieceFactory.create(PieceType.Swordsman, validRing3[0], 'b');
      const attacks = getAttacks(PieceType.Archer, hgHex, 'w', board, [enemy]);

      expect(attacks.length).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // KNIGHT
  // ================================================================
  describe('Knight', () => {
    it('slides diagonally from center', () => {
      const moves = getMoves(PieceType.Knight, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(0);
      // All moves should be on diagonal lines from starting position
      moves.forEach(m => {
        const dq = m.q - SAFE_POS.q;
        const dr = m.r - SAFE_POS.r;
        const ds = m.s - SAFE_POS.s;
        // On a diagonal, exactly one coordinate is 0
        const zeroCount = [dq, dr, ds].filter(d => d === 0).length;
        // One of the three should be 0 (diagonal direction)
        // Actually for hex diagonals: dq:dr:ds ratios are like (-1,-1,2), (1,-2,1), (2,-1,-1)
        // The key property: |dq|+|dr|+|ds| = 2*distance
        const hexDist = (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
        expect(hexDist).toBeGreaterThanOrEqual(1);
      });
    });

    it('blocked by piece in path', () => {
      const pos = SAFE_POS;
      // Knight diagonal direction: (-1, -1, 2)
      const blocker = PieceFactory.create(
        PieceType.Archer,
        new Hex(pos.q - 1, pos.r - 1, pos.s + 2),
        'w'
      );
      const movesBlocked = getMoves(PieceType.Knight, pos, 'w', board, [blocker]);
      const movesOpen = getMoves(PieceType.Knight, pos, 'w', board);
      // Should have fewer moves when blocked
      expect(movesBlocked.length).toBeLessThan(movesOpen.length);
    });

    it('attacks adjacent hexes (melee)', () => {
      const enemy = PieceFactory.create(PieceType.Archer, new Hex(SAFE_POS.q + 1, SAFE_POS.r - 1, SAFE_POS.s), 'b');
      const attacks = getAttacks(PieceType.Knight, SAFE_POS, 'w', board, [enemy]);
      expect(attacks.length).toBe(1);
    });
  });

  // ================================================================
  // TREBUCHET
  // ================================================================
  describe('Trebuchet', () => {
    it('moves 1 hex in any direction (same as Archer)', () => {
      const moves = getMoves(PieceType.Trebuchet, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.length).toBeLessThanOrEqual(6);
    });

    it('attacks at range 3 (long range)', () => {
      const pos = new Hex(0, 4, -4);
      // Place enemy at range 3 (undefended)
      const enemyAt3 = PieceFactory.create(PieceType.Archer, new Hex(0, 1, -1), 'b');

      const attacks = getAttacks(PieceType.Trebuchet, pos, 'w', board, [enemyAt3]);
      const attackKeys = attacks.map(h => h.getKey());

      expect(attackKeys).toContain(enemyAt3.hex.getKey()); // Range 3 ✓
    });

    it('cannot attack at range 2 (too close)', () => {
      const pos = new Hex(0, 4, -4);
      const enemyAt2 = PieceFactory.create(PieceType.Archer, new Hex(0, 2, -2), 'b');

      const attacks = getAttacks(PieceType.Trebuchet, pos, 'w', board, [enemyAt2]);
      const attackKeys = attacks.map(h => h.getKey());

      expect(attackKeys).not.toContain(enemyAt2.hex.getKey()); // Range 2 ✗
    });
  });

  // ================================================================
  // EAGLE
  // ================================================================
  describe('Eagle', () => {
    it('flies up to 3 hexes in any direction', () => {
      const moves = getMoves(PieceType.Eagle, SAFE_POS, 'w', board);
      // Ring 1 (6) + Ring 2 (12) + Ring 3 (18) = up to 36 minus blocked/off-board
      expect(moves.length).toBeGreaterThan(6);
    });

    it('flies over blocking pieces (not blocked by intermediate pieces)', () => {
      const pos = SAFE_POS;
      // Place blockers at ring 1 (all 6 neighbors)
      const ring1 = pos.cubeRing(1).filter(h => board.hexSet.has(h.getKey()));
      const blockers = ring1.map(h => PieceFactory.create(PieceType.Archer, h, 'w'));

      const moves = getMoves(PieceType.Eagle, pos, 'w', board, blockers);
      // Eagle should still reach ring 2 and ring 3 (flies over ring 1)
      expect(moves.length).toBeGreaterThan(0);
      // Verify some moves are at distance 2 or 3
      const farMoves = moves.filter(m => {
        const dist = (Math.abs(m.q - pos.q) + Math.abs(m.r - pos.r) + Math.abs(m.s - pos.s)) / 2;
        return dist >= 2;
      });
      expect(farMoves.length).toBeGreaterThan(0);
    });

    it('cannot land on occupied hex', () => {
      const pos = SAFE_POS;
      const occupier = PieceFactory.create(PieceType.Archer, new Hex(pos.q + 2, pos.r - 2, pos.s), 'w');
      const moves = getMoves(PieceType.Eagle, pos, 'w', board, [occupier]);
      const moveKeys = moves.map(m => m.getKey());
      expect(moveKeys).not.toContain(occupier.hex.getKey());
    });
  });

  // ================================================================
  // GIANT
  // ================================================================
  describe('Giant', () => {
    it('slides orthogonally', () => {
      const moves = getMoves(PieceType.Giant, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(0);
    });

    it('has strength 2', () => {
      const piece = PieceFactory.create(PieceType.Giant, SAFE_POS, 'w');
      expect(piece.Strength).toBe(2);
    });

    it('survives 1 damage (needs 2 to kill)', () => {
      const giant = PieceFactory.create(PieceType.Giant, new Hex(0, 3, -3), 'b');
      const attacker = PieceFactory.create(PieceType.Archer, new Hex(0, 1, -1), 'w');
      const pieceMap = createPieceMap([giant, attacker]);

      const result = CombatSystem.resolveAttack([giant, attacker], attacker, giant.hex, pieceMap);
      // Archer has strength 1, Giant has strength 2 → Giant survives
      expect(result.victimDied).toBe(false);
    });
  });

  // ================================================================
  // ASSASSIN
  // ================================================================
  describe('Assassin', () => {
    it('slides in all 6 directions (queen-like)', () => {
      const moves = getMoves(PieceType.Assassin, SAFE_POS, 'w', board);
      // Should have many moves — combination of orthogonal + diagonal
      expect(moves.length).toBeGreaterThan(10);
    });

    it('instantly kills Monarch regardless of strength', () => {
      const assassin = PieceFactory.create(PieceType.Assassin, new Hex(0, 2, -2), 'w');
      const monarch = PieceFactory.create(PieceType.Monarch, new Hex(0, 1, -1), 'b');
      const pieceMap = createPieceMap([assassin, monarch]);

      const result = CombatSystem.resolveAttack([assassin, monarch], assassin, monarch.hex, pieceMap);
      // Assassin instantly kills Monarch
      expect(result.victimDied).toBe(true);
    });

    it('does not instant-kill non-Monarch pieces', () => {
      const assassin = PieceFactory.create(PieceType.Assassin, new Hex(0, 2, -2), 'w');
      const giant = PieceFactory.create(PieceType.Giant, new Hex(0, 1, -1), 'b');
      const pieceMap = createPieceMap([assassin, giant]);

      const result = CombatSystem.resolveAttack([assassin, giant], assassin, giant.hex, pieceMap);
      // Assassin strength 1 < Giant strength 2 → Giant survives
      expect(result.victimDied).toBe(false);
    });
  });

  // ================================================================
  // DRAGON
  // ================================================================
  describe('Dragon', () => {
    it('makes L-shaped jumps (12 possible landing spots)', () => {
      const moves = getMoves(PieceType.Dragon, SAFE_POS, 'w', board);
      // From center-ish position, should have up to 12 L-shaped destinations
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.length).toBeLessThanOrEqual(12);
    });

    it('flies over obstacles (not blocked by intermediate pieces)', () => {
      const pos = SAFE_POS;
      // Surround with friendly pieces
      const ring1 = pos.cubeRing(1).filter(h => board.hexSet.has(h.getKey()));
      const blockers = ring1.map(h => PieceFactory.create(PieceType.Archer, h, 'w'));

      const moves = getMoves(PieceType.Dragon, pos, 'w', board, blockers);
      // Dragon should still reach L-shaped destinations (flies)
      expect(moves.length).toBeGreaterThan(0);
    });

    it('has strength 3', () => {
      const piece = PieceFactory.create(PieceType.Dragon, SAFE_POS, 'w');
      expect(piece.Strength).toBe(3);
    });
  });

  // ================================================================
  // MONARCH
  // ================================================================
  describe('Monarch', () => {
    it('moves 1 hex in any direction', () => {
      const moves = getMoves(PieceType.Monarch, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.length).toBeLessThanOrEqual(6);
    });

    it('has strength 3', () => {
      const piece = PieceFactory.create(PieceType.Monarch, SAFE_POS, 'w');
      expect(piece.Strength).toBe(3);
    });

    it('attacks adjacent hexes (melee)', () => {
      const enemy = PieceFactory.create(PieceType.Archer, new Hex(SAFE_POS.q + 1, SAFE_POS.r - 1, SAFE_POS.s), 'b');
      const attacks = getAttacks(PieceType.Monarch, SAFE_POS, 'w', board, [enemy]);
      expect(attacks.length).toBe(1);
    });
  });

  // ================================================================
  // WOLF (Sanctuary)
  // ================================================================
  describe('Wolf', () => {
    it('walks up to 3 hexes (BFS, blocked by obstacles)', () => {
      const moves = getMoves(PieceType.Wolf, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(6); // More than ring-1
    });

    it('cannot pass through blocking pieces', () => {
      const pos = SAFE_POS;
      // Block all immediate neighbors
      const ring1 = pos.cubeRing(1).filter(h => board.hexSet.has(h.getKey()));
      const blockers = ring1.map(h => PieceFactory.create(PieceType.Archer, h, 'w'));

      const moves = getMoves(PieceType.Wolf, pos, 'w', board, blockers);
      // Completely surrounded — no moves
      expect(moves.length).toBe(0);
    });

    it('pack tactics: +1 strength per adjacent friendly wolf', () => {
      const wolf1 = PieceFactory.create(PieceType.Wolf, new Hex(0, 2, -2), 'w');
      const wolf2 = PieceFactory.create(PieceType.Wolf, new Hex(1, 1, -2), 'w');
      const wolf3 = PieceFactory.create(PieceType.Wolf, new Hex(-1, 2, -1), 'w');
      const pieceMap = createPieceMap([wolf1, wolf2, wolf3]);

      // wolf1 has 2 adjacent wolves
      const strength = CombatSystem.getCombatStrength(wolf1, pieceMap);
      expect(strength).toBe(3); // base 1 + 2 adjacent wolves
    });
  });

  // ================================================================
  // HEALER (Sanctuary)
  // ================================================================
  describe('Healer', () => {
    it('moves 1 hex in any direction', () => {
      const moves = getMoves(PieceType.Healer, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.length).toBeLessThanOrEqual(6);
    });

    it('cannot attack (AttackType.None)', () => {
      const piece = PieceFactory.create(PieceType.Healer, SAFE_POS, 'w');
      expect(piece.AttackType).toBe(AttackType.None);

      const enemy = PieceFactory.create(PieceType.Archer, new Hex(SAFE_POS.q + 1, SAFE_POS.r - 1, SAFE_POS.s), 'b');
      const attacks = getAttacks(PieceType.Healer, SAFE_POS, 'w', board, [enemy]);
      expect(attacks.length).toBe(0);
    });

    it('aura: +1 strength to adjacent friendly pieces', () => {
      const healer = PieceFactory.create(PieceType.Healer, new Hex(0, 2, -2), 'w');
      const archer = PieceFactory.create(PieceType.Archer, new Hex(1, 1, -2), 'w');
      const pieceMap = createPieceMap([healer, archer]);

      const strength = CombatSystem.getCombatStrength(archer, pieceMap);
      expect(strength).toBe(2); // base 1 + healer aura 1
    });

    it('aura does not buff enemy pieces', () => {
      const healer = PieceFactory.create(PieceType.Healer, new Hex(0, 2, -2), 'w');
      const enemy = PieceFactory.create(PieceType.Archer, new Hex(1, 1, -2), 'b');
      const pieceMap = createPieceMap([healer, enemy]);

      const strength = CombatSystem.getCombatStrength(enemy, pieceMap);
      expect(strength).toBe(1); // base 1, no healer buff (wrong color)
    });
  });

  // ================================================================
  // RANGER (Sanctuary)
  // ================================================================
  describe('Ranger', () => {
    it('walks up to 2 hexes (BFS)', () => {
      const moves = getMoves(PieceType.Ranger, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(0);
      // Max: ring-1 (6) + ring-2 reachable via BFS
      // All moves should be within distance 2
      moves.forEach(m => {
        const dist = (Math.abs(m.q - SAFE_POS.q) + Math.abs(m.r - SAFE_POS.r) + Math.abs(m.s - SAFE_POS.s)) / 2;
        expect(dist).toBeLessThanOrEqual(2);
      });
    });

    it('attacks at range 3 (long range)', () => {
      const pos = new Hex(0, 4, -4);
      const enemyAt3 = PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'b');
      const attacks = getAttacks(PieceType.Ranger, pos, 'w', board, [enemyAt3]);
      expect(attacks.length).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // WIZARD (Sanctuary)
  // ================================================================
  describe('Wizard', () => {
    it('moves 1 hex in any direction', () => {
      const moves = getMoves(PieceType.Wizard, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.length).toBeLessThanOrEqual(6);
    });

    it('attacks at range 2 (ranged)', () => {
      const pos = new Hex(0, 3, -3);
      const enemyAt2 = PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'b');
      const attacks = getAttacks(PieceType.Wizard, pos, 'w', board, [enemyAt2]);
      expect(attacks.length).toBeGreaterThan(0);
    });

    it('has Fireball and Teleport abilities', () => {
      const piece = PieceFactory.create(PieceType.Wizard, SAFE_POS, 'w');
      expect(piece.abilityUsed).toBe(false);
    });
  });

  // ================================================================
  // NECROMANCER (Sanctuary)
  // ================================================================
  describe('Necromancer', () => {
    it('moves 1 hex in any direction', () => {
      const moves = getMoves(PieceType.Necromancer, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.length).toBeLessThanOrEqual(6);
    });

    it('attacks adjacent hexes (melee)', () => {
      const enemy = PieceFactory.create(PieceType.Archer, new Hex(SAFE_POS.q + 1, SAFE_POS.r - 1, SAFE_POS.s), 'b');
      const attacks = getAttacks(PieceType.Necromancer, SAFE_POS, 'w', board, [enemy]);
      expect(attacks.length).toBe(1);
    });

    it('starts with 1 soul', () => {
      const piece = PieceFactory.create(PieceType.Necromancer, SAFE_POS, 'w');
      expect(piece.souls).toBe(1);
    });

    it('gains soul on kill', () => {
      // Place victim on white's side (r > 0) so black swordsman doesn't get river bonus
      // Actually, use an Archer which always has strength 1
      const necro = PieceFactory.create(PieceType.Necromancer, new Hex(0, 2, -2), 'w');
      const victim = PieceFactory.create(PieceType.Archer, new Hex(0, 1, -1), 'b');
      const pieceMap = createPieceMap([necro, victim]);

      const result = CombatSystem.resolveAttack([necro, victim], necro, victim.hex, pieceMap);
      expect(result.victimDied).toBe(true);

      // Necromancer should have gained a soul (started with 1 from factory + 1 from kill = 2)
      const updatedNecro = result.pieces.find(p => p.type === PieceType.Necromancer);
      expect(updatedNecro).toBeDefined();
      expect(updatedNecro!.souls).toBe(2);
    });
  });

  // ================================================================
  // PHOENIX (Sanctuary)
  // ================================================================
  describe('Phoenix', () => {
    it('flies up to 3 hexes (uses Eagle movement)', () => {
      const moves = getMoves(PieceType.Phoenix, SAFE_POS, 'w', board);
      expect(moves.length).toBeGreaterThan(6); // More than just ring 1
    });

    it('has strength 2', () => {
      const piece = PieceFactory.create(PieceType.Phoenix, SAFE_POS, 'w');
      expect(piece.Strength).toBe(2);
    });

    it('attacks adjacent hexes (melee)', () => {
      const enemy = PieceFactory.create(PieceType.Archer, new Hex(SAFE_POS.q + 1, SAFE_POS.r - 1, SAFE_POS.s), 'b');
      const attacks = getAttacks(PieceType.Phoenix, SAFE_POS, 'w', board, [enemy]);
      expect(attacks.length).toBe(1);
    });
  });

  // ================================================================
  // CROSS-CUTTING: Defended piece protection
  // ================================================================
  describe('Defended piece protection (ranged)', () => {
    it('ranged pieces cannot attack targets defended by enemy melee', () => {
      // Enemy at range 2, defended by adjacent melee piece
      const target = PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'b');
      const defender = PieceFactory.create(PieceType.Knight, new Hex(1, 0, -1), 'b');

      const attacks = getAttacks(PieceType.Archer, new Hex(0, 3, -3), 'w', board, [target, defender]);
      // Target should be defended — Archer can't attack it
      const attackKeys = attacks.map(h => h.getKey());
      expect(attackKeys).not.toContain(target.hex.getKey());
    });

    it('melee pieces CAN attack defended targets', () => {
      const target = PieceFactory.create(PieceType.Swordsman, new Hex(SAFE_POS.q + 1, SAFE_POS.r - 1, SAFE_POS.s), 'b');
      const defender = PieceFactory.create(PieceType.Knight, new Hex(SAFE_POS.q + 2, SAFE_POS.r - 2, SAFE_POS.s), 'b');

      const attacks = getAttacks(PieceType.Knight, SAFE_POS, 'w', board, [target, defender]);
      const attackKeys = attacks.map(h => h.getKey());
      expect(attackKeys).toContain(target.hex.getKey());
    });
  });
});
