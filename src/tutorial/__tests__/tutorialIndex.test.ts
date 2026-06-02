import { AbilityType, CASTLE_RECRUITMENT_COOLDOWN_LABEL, PieceType } from '../../Constants';
import { GameEngine } from '../../Classes/Core/GameEngine';
import { GameState } from '../../Classes/Core/GameState';
import { MoveTree } from '../../Classes/Core/MoveTree';
import { Hex } from '../../Classes/Entities/Hex';
import { Piece } from '../../Classes/Entities/Piece';
import { PieceFactory } from '../../Classes/Entities/PieceFactory';
import { createPieceMap } from '../../utils/PieceMap';
import { getAllLessons } from '..';
import { getLessonObjectives } from '../objectives';

const createLessonState = (lesson: ReturnType<typeof getAllLessons>[number]): GameState => ({
  pieces: lesson.pieces,
  pieceMap: createPieceMap(lesson.pieces),
  castles: [...lesson.board.castles],
  sanctuaries: lesson.sanctuaries ?? [],
  sanctuaryPool: [],
  turnCounter: lesson.initialTurnCounter ?? 0,
  movingPiece: null,
  moveTree: new MoveTree(),
  graveyard: lesson.graveyard ?? [],
  phoenixRecords: lesson.phoenixRecords ?? [],
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
      'm2_l12_promotion',
      'm3_l1_strength_puzzle',
      'm3_l2_defense',
      'm3_l3_defense_followup',
      'm3_l4_range_practice',
      'm4_l1_castle_control',
      'm4_l2_recruitment',
      'm4_l3_pledging',
      'm4_l4_sanctuary_cooldowns',
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

  it('gives every lesson objective a stable unique id within its lesson', () => {
    for (const lesson of getAllLessons()) {
      const objectiveIds = getLessonObjectives(lesson).map((objective) => objective.id);

      expect(objectiveIds.every((id) => id.length > 0)).toBe(true);
      expect(new Set(objectiveIds).size).toBe(objectiveIds.length);
      expect(objectiveIds.every((id) => !/^\d+$/.test(id))).toBe(true);
    }
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
    expect(lessons.get('m5_l2_wolf')?.initialTurnCounter).toBe(0);
    expect(lessons.get('m5_l3_healer')?.initialTurnCounter).toBe(0);
  });

  it('documents castle recruitment cooldown with the shared value', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm4_l2_recruitment');
    if (!lesson) throw new Error('Missing recruitment lesson');

    expect(lesson.description).toContain(CASTLE_RECRUITMENT_COOLDOWN_LABEL);
    expect(lesson.description).toContain('Capturing a castle clears any current recruitment cooldown');
    expect(lesson.instructions).toContain(`enters cooldown for ${CASTLE_RECRUITMENT_COOLDOWN_LABEL}`);
    expect(lesson.hints).toContain(
      `After this recruitment, the captured castle waits ${CASTLE_RECRUITMENT_COOLDOWN_LABEL} before it can recruit again.`
    );
  });

  it('documents sanctuary cooldown ownership as the pledging player', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm4_l4_sanctuary_cooldowns');
    if (!lesson) throw new Error('Missing sanctuary cooldown lesson');

    expect(lesson.description).toContain('player who used it');
    expect(lesson.description).toContain("that player's turn");
    expect(lesson.hints?.join(' ')).toContain('Swordsmen do not accelerate sanctuary cooldown');
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

  it('sets up the promotion lesson as one move to the back edge', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm2_l12_promotion');
    if (!lesson) throw new Error('Missing promotion lesson');

    const engine = new GameEngine(lesson.board);
    const state = createLessonState(lesson);
    const swordsman = findPiece(state.pieces, PieceType.Swordsman, new Hex(0, -2, 2));
    const promotionHex = new Hex(1, -3, 2);

    expect(lesson.board.isPromotionHex(promotionHex, 'w')).toBe(true);
    expect(engine.getLegalMoves(state, swordsman).some((hex) => hex.equals(promotionHex))).toBe(true);

    const promotedState = engine.applyMove(state, swordsman, promotionHex);
    expect(promotedState.promotionPending?.hex.equals(promotionHex)).toBe(true);
  });

  it('gives attack-phase lessons at least one legal attack or ability for the side to move', () => {
    const lessons = getAllLessons().filter(
      (lesson) => lesson.initialTurnCounter === 2 && lesson.id !== 'm3_l3_defense_followup'
    );

    for (const lesson of lessons) {
      const engine = new GameEngine(lesson.board);
      const state = createLessonState(lesson);
      const legalActionCount = lesson.pieces
        .filter((piece) => piece.color === 'w')
        .reduce((count, piece) => {
          const abilityTargets =
            piece.type === PieceType.Wizard
              ? engine.getAbilityTargets(state, piece, AbilityType.Fireball).length + engine.getAbilityTargets(state, piece, AbilityType.Teleport).length
              : piece.type === PieceType.Necromancer
                ? engine.getAbilityTargets(state, piece, AbilityType.RaiseDead).length
                : 0;
          return count + engine.getLegalAttacks(state, piece).length + abilityTargets;
        }, 0);

      if (legalActionCount === 0) {
        const attackMap = lesson.pieces
          .filter((piece) => piece.color === 'w')
          .map((piece) => `${piece.type}@${piece.hex.getKey()} -> ${engine.getLegalAttacks(state, piece).map((hex) => hex.getKey()).join(',') || 'none'}`)
          .join('; ');
        throw new Error(`${lesson.id} has no legal white attacks: ${attackMap}`);
      }
    }
  });

  it('sets up the Wolf lesson as move into pack range, then capture the Giant', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm5_l2_wolf');
    if (!lesson) throw new Error('Missing Wolf lesson');

    const engine = new GameEngine(lesson.board);
    const startState = createLessonState(lesson);
    const startingWolf = findPiece(startState.pieces, PieceType.Wolf, new Hex(-3, 2, 1));
    const packHex = new Hex(-1, 0, 1);
    const giantHex = new Hex(0, 0, 0);

    expect(engine.getLegalMoves(startState, startingWolf).some((hex) => hex.equals(packHex))).toBe(true);

    const attackState = createLessonState({
      ...lesson,
      initialTurnCounter: 2,
      pieces: [
        PieceFactory.create(PieceType.Wolf, packHex, 'w'),
        PieceFactory.create(PieceType.Wolf, new Hex(-1, 1, 0), 'w'),
        PieceFactory.create(PieceType.Giant, giantHex, 'b'),
      ],
    });
    const packedWolf = findPiece(attackState.pieces, PieceType.Wolf, packHex);

    expect(engine.getLegalAttacks(attackState, packedWolf).some((hex) => hex.equals(giantHex))).toBe(true);
    expect(engine.applyAttack(attackState, packedWolf, giantHex).pieces.some((piece) => piece.type === PieceType.Giant && piece.hex.equals(giantHex))).toBe(false);
  });

  it('sets up the Healer lesson as move into aura range, then capture the Giant', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm5_l3_healer');
    if (!lesson) throw new Error('Missing Healer lesson');

    const engine = new GameEngine(lesson.board);
    const startState = createLessonState(lesson);
    expect(lesson.board.riverHexes.length).toBeGreaterThan(0);

    const swordsman = findPiece(startState.pieces, PieceType.Swordsman, new Hex(-2, 2, 0));
    const healer = findPiece(startState.pieces, PieceType.Healer, new Hex(1, 1, -2));
    const swordsmanAuraHex = new Hex(-1, 1, 0);
    const healerAuraHex = new Hex(0, 1, -1);
    const giantHex = new Hex(0, 0, 0);

    expect(swordsman.hex.r).toBeGreaterThan(0);
    expect(healer.hex.distance(swordsman.hex)).toBeGreaterThan(1);
    expect(engine.getLegalMoves(startState, swordsman).some((hex) => hex.equals(swordsmanAuraHex))).toBe(true);
    expect(engine.getLegalMoves(startState, healer).some((hex) => hex.equals(healerAuraHex))).toBe(true);

    const attackState = createLessonState({
      ...lesson,
      initialTurnCounter: 2,
      pieces: [
        PieceFactory.create(PieceType.Healer, healerAuraHex, 'w'),
        PieceFactory.create(PieceType.Swordsman, swordsmanAuraHex, 'w'),
        PieceFactory.create(PieceType.Giant, giantHex, 'b'),
      ],
    });
    const strengthenedSwordsman = findPiece(attackState.pieces, PieceType.Swordsman, swordsmanAuraHex);

    expect(engine.getLegalAttacks(attackState, strengthenedSwordsman).some((hex) => hex.equals(giantHex))).toBe(true);
    expect(engine.applyAttack(attackState, strengthenedSwordsman, giantHex).pieces.some((piece) => piece.type === PieceType.Giant && piece.hex.equals(giantHex))).toBe(false);
  });

  it('sets up the Wizard lesson off river and lets Fireball kill multiple weak pieces', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm5_l5_wizard');
    if (!lesson) throw new Error('Missing Wizard lesson');

    const engine = new GameEngine(lesson.board);
    const state = createLessonState(lesson);
    const wizard = findPiece(state.pieces, PieceType.Wizard, new Hex(-2, 1, 1));
    const targetHex = new Hex(0, -1, 1);

    expect(lesson.board.riverHexSet.has(wizard.hex.getKey())).toBe(false);
    expect(engine.getAbilityTargets(state, wizard, AbilityType.Fireball).some((hex) => hex.equals(targetHex))).toBe(true);

    const afterFireball = engine.activateAbility(state, wizard.hex, targetHex, AbilityType.Fireball);

    expect(afterFireball.pieces.some((piece) => piece.type === PieceType.Swordsman && piece.hex.equals(targetHex))).toBe(false);
    expect(afterFireball.pieces.some((piece) => piece.type === PieceType.Archer && piece.hex.equals(new Hex(0, 0, 0)))).toBe(false);
    expect(afterFireball.pieces.find((piece) => piece.type === PieceType.Giant && piece.hex.equals(new Hex(1, -1, 0)))?.damage).toBe(1);
  });

  it('blocks Wizard abilities outside the Attack phase', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm5_l5_wizard');
    if (!lesson) throw new Error('Missing Wizard lesson');

    const engine = new GameEngine(lesson.board);
    const movementState = createLessonState({
      ...lesson,
      initialTurnCounter: 0,
    });
    const wizard = findPiece(movementState.pieces, PieceType.Wizard, new Hex(-2, 1, 1));

    expect(() => engine.activateAbility(movementState, wizard.hex, new Hex(0, -1, 1), AbilityType.Fireball)).toThrow(
      /Attack phase/
    );
  });

  it('sets up the Necromancer lesson so Black can create a graveyard piece and White can raise it', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm5_l6_necromancer');
    if (!lesson) throw new Error('Missing Necromancer lesson');

    const engine = new GameEngine(lesson.board);
    const state = createLessonState(lesson);
    const whiteNecromancer = findPiece(state.pieces, PieceType.Necromancer, new Hex(-2, 1, 1));
    const reviveHex = new Hex(-1, 0, 1);

    expect(lesson.initialTurnCounter).toBe(2);
    expect(state.graveyard.some((piece) => piece.color === 'w' && piece.type === PieceType.Swordsman)).toBe(true);
    expect(whiteNecromancer.souls).toBe(1);
    expect(engine.getAbilityTargets(state, whiteNecromancer, AbilityType.RaiseDead).some((hex) => hex.equals(reviveHex))).toBe(true);

    const afterRaiseDead = engine.activateAbility(state, whiteNecromancer.hex, reviveHex, AbilityType.RaiseDead);
    expect(afterRaiseDead.pieces.some((piece) => piece.type === PieceType.Swordsman && piece.hex.equals(reviveHex))).toBe(true);
    expect(afterRaiseDead.graveyard).toEqual([]);
  });

  it('sets up the Phoenix lesson with an Eagle comparison and a pending rebirth demonstration', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm5_l7_phoenix');
    if (!lesson) throw new Error('Missing Phoenix lesson');

    expect(lesson.pieces.some((piece) => piece.type === PieceType.Eagle)).toBe(true);
    expect(lesson.phoenixRecords?.some((record) => record.owner === 'w')).toBe(true);
    expect(lesson.objectives).toEqual(['As Black, capture the nearby Phoenix with the Giant.']);
    expect(lesson.hints?.some((hint) => hint.includes('Compare the Phoenix with the Eagle'))).toBe(true);

    const engine = new GameEngine(lesson.board);
    const state = createLessonState(lesson);
    const blackGiant = findPiece(state.pieces, PieceType.Giant, new Hex(0, 0, 0));
    const phoenixHex = new Hex(-1, 1, 0);
    expect(engine.getLegalAttacks(state, blackGiant).some((hex) => hex.equals(phoenixHex))).toBe(true);

    const afterCapture = engine.applyAttack(state, blackGiant, phoenixHex);
    expect(afterCapture.pieces.some((piece) => piece.type === PieceType.Phoenix && piece.hex.equals(phoenixHex))).toBe(false);
    expect(afterCapture.pieces.some((piece) => piece.type === PieceType.Phoenix)).toBe(true);
  });

  it('teaches that melee pieces defend adjacent Archers but Archers do not defend allies', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm3_l2_defense');
    if (!lesson) throw new Error('Missing defense lesson');

    expect(lesson.description).toContain('melee piece defends any adjacent friendly piece');

    const board = lesson.board;
    const engine = new GameEngine(board);
    const state = createLessonState(lesson);
    const whiteArcher = findPiece(state.pieces, PieceType.Archer, new Hex(-2, 0, 2));
    const defendedBlackArcher = findPiece(state.pieces, PieceType.Archer, new Hex(0, -2, 2));

    expect(engine.isHexDefended(defendedBlackArcher.hex, 'w', state)).toBe(true);
    expect(engine.getLegalAttacks(state, whiteArcher).some((hex) => hex.equals(defendedBlackArcher.hex))).toBe(false);

    const archerOnlyDefendedTarget = PieceFactory.create(PieceType.Swordsman, new Hex(-2, -2, 4), 'b');
    const blackArcher = PieceFactory.create(PieceType.Archer, new Hex(-1, -2, 3), 'b');
    const archerOnlyState = createLessonState({
      ...lesson,
      pieces: [whiteArcher, archerOnlyDefendedTarget, blackArcher],
    });
    expect(engine.isHexDefended(archerOnlyDefendedTarget.hex, 'w', archerOnlyState)).toBe(false);
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
    const cooldownLesson = lessons.get('m4_l4_sanctuary_cooldowns');
    if (!recruitmentLesson || !pledgeLesson || !cooldownLesson) throw new Error('Missing castle-phase lessons');

    const recruitmentEngine = new GameEngine(recruitmentLesson.board);
    const recruitmentState = createLessonState(recruitmentLesson);
    expect(recruitmentLesson.board.castles.find((castle) => castle.hex.equals(new Hex(3, -3, 0)))?.owner).toBe('w');
    expect(findPiece(recruitmentLesson.pieces, PieceType.Swordsman, new Hex(3, -3, 0))).toBeTruthy();
    expect(recruitmentEngine.getRecruitmentHexes(recruitmentState).length).toBeGreaterThan(0);

    const pledgeEngine = new GameEngine(pledgeLesson.board);
    const pledgeState = createLessonState(pledgeLesson);
    expect(pledgeEngine.canPledge(pledgeState, pledgeLesson.sanctuaries![0].hex)).toBe(true);

    const cooldownEngine = new GameEngine(cooldownLesson.board);
    const cooldownState = createLessonState({ ...cooldownLesson, initialTurnCounter: 9 });
    const afterCooldownTick = cooldownEngine.passTurn(cooldownState);
    expect(afterCooldownTick.sanctuaries[0].cooldown).toBe(3);
  });

  it('shows every standard and sanctuary unit on the all-units reference board', () => {
    const lesson = getAllLessons().find((candidate) => candidate.id === 'm5_l8_all_units_reference');
    if (!lesson) throw new Error('Missing all-units reference lesson');

    const typesOnBoard = new Set(lesson.pieces.map((piece) => piece.type));
    const expectedTypes = [
      PieceType.Swordsman,
      PieceType.Archer,
      PieceType.Knight,
      PieceType.Eagle,
      PieceType.Giant,
      PieceType.Trebuchet,
      PieceType.Assassin,
      PieceType.Dragon,
      PieceType.Monarch,
      PieceType.Wolf,
      PieceType.Healer,
      PieceType.Ranger,
      PieceType.Wizard,
      PieceType.Necromancer,
      PieceType.Phoenix,
    ];

    for (const pieceType of expectedTypes) {
      expect(typesOnBoard.has(pieceType)).toBe(true);
    }
  });
});
