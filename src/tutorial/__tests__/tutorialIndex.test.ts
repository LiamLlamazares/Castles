import { PieceType } from '../../Constants';
import { GameEngine } from '../../Classes/Core/GameEngine';
import { GameState } from '../../Classes/Core/GameState';
import { MoveTree } from '../../Classes/Core/MoveTree';
import { Hex } from '../../Classes/Entities/Hex';
import { Piece } from '../../Classes/Entities/Piece';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { createPieceMap } from '../../utils/PieceMap';
import { getAllLessons } from '..';

const createLessonState = (lesson: ReturnType<typeof getAllLessons>[number]): GameState => ({
  pieces: lesson.pieces,
  pieceMap: createPieceMap(lesson.pieces),
  castles: [...lesson.board.castles],
  sanctuaries: lesson.sanctuaries ?? [],
  sanctuaryPool: [],
  turnCounter: lesson.initialTurnCounter ?? 0,
  movingPiece: null,
  moveTree: new MoveTree(),
  graveyard: [],
  phoenixRecords: [],
  viewNodeId: null,
});

const findPiece = (pieces: Piece[], type: PieceType, hex: Hex): Piece => {
  const piece = pieces.find((candidate) => candidate.type === type && candidate.hex.equals(hex));
  if (!piece) {
    throw new Error(`Missing ${type} at ${hex.getKey()}`);
  }
  return piece;
};

describe('tutorial lesson index', () => {
  it('keeps the reorganized tutorial flow unique and complete', () => {
    const lessons = getAllLessons();
    const ids = lessons.map((lesson) => lesson.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'm0_00_welcome',
      'm0_01_victory_conditions',
      'm1_l1_introduction',
      'm1_l2_terrain_rivers',
      'm1_l3_terrain_highground',
      'm1_l4_terrain_sanctuaries',
      'm2_00_game_phases_overview',
      'm2_l1_basic_pieces',
      'm2_l2_swordsman',
      'm2_l3_swordsman_river',
      'm2_l4_archer',
      'm2_l5_knight',
      'm2_l6_eagle',
      'm2_l7_giant',
      'm2_l8_trebuchet',
      'm2_l9_assassin',
      'm2_l10_dragon',
      'm2_l11_monarch',
      'm3_l1_strength_puzzle',
      'm3_l2_defense',
      'm3_l3_defense_followup',
      'm3_l4_range_practice',
      'm4_l1_castle_control',
      'm4_l2_recruitment',
      'm4_l3_pledging',
      'm5_l1_special_units',
      'm5_l2_wolf',
      'm5_l3_healer',
      'm5_l4_ranger',
      'm5_l5_wizard',
      'm5_l6_necromancer',
      'm5_l7_phoenix',
      'm5_l8_all_units_reference',
      'm5_l9_walkthrough',
    ]);
  });

  it('uses each visible section number once', () => {
    const sectionNumbers = getAllLessons()
      .map((lesson) => lesson.title.match(/^(\d+(?:\.\d+)?)/)?.[1])
      .filter((sectionNumber): sectionNumber is string => Boolean(sectionNumber));

    expect(new Set(sectionNumbers).size).toBe(sectionNumbers.length);
  });

  it('adds standalone basic lessons for every standard recruitable piece', () => {
    const lessons = getAllLessons();
    const basicPieceIds = new Set(
      lessons
        .filter((lesson) => lesson.id.startsWith('m2_l'))
        .map((lesson) => lesson.id)
    );

    const expectedPieces = [
      PieceType.Swordsman,
      PieceType.Archer,
      PieceType.Knight,
      PieceType.Trebuchet,
      PieceType.Eagle,
      PieceType.Giant,
      PieceType.Assassin,
      PieceType.Dragon,
      PieceType.Monarch,
    ];

    for (const piece of expectedPieces) {
      expect(
        Array.from(basicPieceIds).some((id) => id.toLowerCase().includes(piece.toLowerCase()))
      ).toBe(true);
    }
  });

  it('starts tactical lessons in the phase their objective requires', () => {
    const lessons = new Map(getAllLessons().map((lesson) => [lesson.id, lesson]));

    expect(lessons.get('m2_l4_archer')?.initialTurnCounter).toBe(2);
    expect(lessons.get('m2_l8_trebuchet')?.initialTurnCounter).toBe(2);
    expect(lessons.get('m3_l1_strength_puzzle')?.initialTurnCounter).toBe(2);
    expect(lessons.get('m3_l2_defense')?.initialTurnCounter).toBe(2);
    expect(lessons.get('m3_l3_defense_followup')?.initialTurnCounter).toBe(2);
    expect(lessons.get('m3_l4_range_practice')?.initialTurnCounter).toBe(2);
    expect(lessons.get('m4_l2_recruitment')?.initialTurnCounter).toBe(4);
    expect(lessons.get('m4_l3_pledging')?.initialTurnCounter).toBe(4);
  });

  it('keeps the early victory lesson inspection-only', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm0_01_victory_conditions');
    if (!lesson) throw new Error('Missing victory lesson');

    expect(lesson.hints).toBeUndefined();
    expect(lesson.board.castles.every((castle) => castle.owner === 'w')).toBe(true);
    expect(lesson.pieces.every((piece) => piece.color === 'w')).toBe(true);
    expect(lesson.initialTurnCounter).toBe(5);
  });

  it('sets up the phase overview so a moved Swordsman can capture next phase', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm2_00_game_phases_overview');
    if (!lesson) throw new Error('Missing phase overview lesson');

    const engine = new GameEngine(lesson.board);
    const movedState = createLessonState({
      ...lesson,
      initialTurnCounter: 2,
      pieces: [
        PieceFactory.create(PieceType.Swordsman, new Hex(-1, 1, 0), 'w'),
        PieceFactory.create(PieceType.Swordsman, new Hex(-2, 1, 1), 'w'),
        PieceFactory.create(PieceType.Swordsman, new Hex(0, 0, 0), 'b'),
        PieceFactory.create(PieceType.Swordsman, new Hex(0, 1, -1), 'b'),
      ],
    });
    const movedSwordsman = findPiece(movedState.pieces, PieceType.Swordsman, new Hex(-1, 1, 0));

    expect(engine.getLegalAttacks(movedState, movedSwordsman).some((hex) => hex.equals(new Hex(0, 0, 0)))).toBe(true);
  });

  it('sets up the Swordsman river lesson as move once, then capture', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm2_l3_swordsman_river');
    if (!lesson) throw new Error('Missing Swordsman river lesson');

    const engine = new GameEngine(lesson.board);
    const startState = createLessonState(lesson);
    const startingSwordsman = findPiece(startState.pieces, PieceType.Swordsman, new Hex(0, 0, 0));
    const advancedHex = new Hex(1, -1, 0);

    expect(engine.getLegalMoves(startState, startingSwordsman).some((hex) => hex.equals(advancedHex))).toBe(true);

    const attackState = createLessonState({
      ...lesson,
      initialTurnCounter: 2,
      pieces: [
        PieceFactory.create(PieceType.Swordsman, advancedHex, 'w'),
        PieceFactory.create(PieceType.Giant, new Hex(2, -2, 0), 'b'),
      ],
    });
    const advancedSwordsman = findPiece(attackState.pieces, PieceType.Swordsman, advancedHex);

    expect(engine.getLegalAttacks(attackState, advancedSwordsman).some((hex) => hex.equals(new Hex(2, -2, 0)))).toBe(true);
  });

  it('gives attack-phase lessons at least one legal attack for the side to move', () => {
    const lessons = getAllLessons().filter(
      (lesson) => lesson.initialTurnCounter === 2 && lesson.id !== 'm3_l3_defense_followup'
    );

    for (const lesson of lessons) {
      const engine = new GameEngine(lesson.board);
      const state = createLessonState(lesson);
      const legalAttackCount = lesson.pieces
        .filter((piece) => piece.color === 'w')
        .reduce((count, piece) => count + engine.getLegalAttacks(state, piece).length, 0);

      if (legalAttackCount === 0) {
        const attackMap = lesson.pieces
          .filter((piece) => piece.color === 'w')
          .map((piece) => `${piece.type}@${piece.hex.getKey()} -> ${engine.getLegalAttacks(state, piece).map((hex) => hex.getKey()).join(',') || 'none'}`)
          .join('; ');
        throw new Error(`${lesson.id} has no legal white attacks: ${attackMap}`);
      }
    }
  });

  it('lets the defense follow-up lesson break defense then fire with the Archer', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm3_l3_defense_followup');
    if (!lesson) throw new Error('Missing defense follow-up lesson');

    const engine = new GameEngine(lesson.board);
    const state = createLessonState(lesson);
    const swordsman = findPiece(lesson.pieces, PieceType.Swordsman, new Hex(0, -1, 1));
    const firstTarget = new Hex(1, -2, 1);

    expect(engine.getLegalAttacks(state, swordsman).some((hex) => hex.equals(firstTarget))).toBe(true);

    const afterMeleeCapture = engine.applyAttack(state, swordsman, firstTarget);
    const archer = findPiece(afterMeleeCapture.pieces, PieceType.Archer, new Hex(0, 0, 0));
    const remainingTarget = new Hex(2, -2, 0);

    expect(engine.getLegalAttacks(afterMeleeCapture, archer).some((hex) => hex.equals(remainingTarget))).toBe(true);
  });

  it('gives castle-phase lessons a legal economy action', () => {
    const lessons = new Map(getAllLessons().map((lesson) => [lesson.id, lesson]));
    const recruitmentLesson = lessons.get('m4_l2_recruitment');
    const pledgeLesson = lessons.get('m4_l3_pledging');
    if (!recruitmentLesson || !pledgeLesson) throw new Error('Missing castle-phase lessons');

    const recruitmentEngine = new GameEngine(recruitmentLesson.board);
    const recruitmentState = createLessonState(recruitmentLesson);
    expect(recruitmentEngine.getRecruitmentHexes(recruitmentState).length).toBeGreaterThan(0);

    const pledgeEngine = new GameEngine(pledgeLesson.board);
    const pledgeState = createLessonState(pledgeLesson);
    expect(pledgeEngine.canPledge(pledgeState, pledgeLesson.sanctuaries![0].hex)).toBe(true);
  });
});
