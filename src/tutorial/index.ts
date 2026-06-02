/**
 * @file index.ts
 * @description Tutorial lesson exports and ordered lesson registry.
 */

import { TutorialLesson } from './types';

import { createM0L0 } from './lessons/m0_00_welcome';
import { createM0L1 } from './lessons/m0_01_victory_conditions';
import { createM1L1 } from './lessons/m1_01_terrain_castles';
import { createM1L2 } from './lessons/m1_02_terrain_rivers';
import { createM1L3 } from './lessons/m1_03_terrain_highground';
import { createM1L4 } from './lessons/m1_04_terrain_sanctuaries';
import { createM2L0 } from './lessons/m2_00_game_phases_overview';
import { createM2L1 } from './lessons/m2_01_the_basic_pieces';
import { createM2L2 } from './lessons/m2_02_swordsman';
import { createM2L3 } from './lessons/m2_03_swordsman_river';
import { createM2L4 } from './lessons/m2_04_archer';
import { createM2L5 } from './lessons/m2_05_knight';
import { createM2L6 } from './lessons/m2_06_eagle';
import { createM2L7 } from './lessons/m2_07_giant';
import { createM2L8 } from './lessons/m2_08_trebuchet';
import { createM2L9 } from './lessons/m2_09_assassin';
import { createM2L10 } from './lessons/m2_10_dragon';
import { createM2L11 } from './lessons/m2_11_monarch';
import { createM2L12 } from './lessons/m2_12_promotion';
import { createM3L1 } from './lessons/m3_01_strength_puzzle';
import { createM3L2 } from './lessons/m3_02_defense';
import { createM3L3 } from './lessons/m3_03_defense_followup';
import { createM3L4 } from './lessons/m3_04_range_practice';
import { createM4L1 } from './lessons/m4_01_castle_control';
import { createM4L2 } from './lessons/m4_02_recruitment';
import { createM4L3 } from './lessons/m4_03_pledging';
import { createM4L4 } from './lessons/m4_04_sanctuary_cooldowns';
import { createM5L1 } from './lessons/m5_01_special_units';
import { createM5L2 } from './lessons/m5_02_wolf';
import { createM5L3 } from './lessons/m5_03_healer';
import { createM5L4 } from './lessons/m5_04_ranger';
import { createM5L5 } from './lessons/m5_05_wizard';
import { createM5L6 } from './lessons/m5_06_necromancer';
import { createM5L7 } from './lessons/m5_07_phoenix';
import { createM5L8 } from './lessons/m5_08_all_units_reference';
import { createM5L9 } from './lessons/m5_09_walkthrough';

export type { TutorialLesson } from './types';

export function getAllLessons(): TutorialLesson[] {
  return [
    createM0L0(),
    createM0L1(),
    createM1L1(),
    createM1L2(),
    createM1L3(),
    createM1L4(),
    createM2L0(),
    createM2L1(),
    createM2L2(),
    createM2L3(),
    createM2L4(),
    createM2L5(),
    createM2L6(),
    createM2L7(),
    createM2L8(),
    createM2L9(),
    createM2L10(),
    createM2L11(),
    createM2L12(),
    createM3L1(),
    createM3L2(),
    createM3L3(),
    createM3L4(),
    createM4L1(),
    createM4L2(),
    createM4L3(),
    createM4L4(),
    createM5L1(),
    createM5L2(),
    createM5L3(),
    createM5L4(),
    createM5L5(),
    createM5L6(),
    createM5L7(),
    createM5L8(),
    createM5L9(),
  ];
}
