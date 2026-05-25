import { PieceType } from '../../Constants';
import { getAllLessons } from '..';

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
      'm5_l2_all_units_reference',
      'm5_l3_walkthrough',
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
});
