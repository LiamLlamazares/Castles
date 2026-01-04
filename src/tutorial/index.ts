/**
 * @file index.ts
 * @description Exports all tutorial lessons organized by module.
 * 
 * MODULES:
 * 1. Board Basics (1.1-1.6)
 * 2. Your Army - Basic Pieces (2.1-2.7)
 * 3. Combat Mechanics (3.1-3.3)
 * 4. Economy & Control (4.1-4.4)
 * 5. Victory (5.1-5.3)
 */
import { TutorialLesson, LessonCategory } from './types';
// Introduction
import { createLesson00 } from './lessons/lesson00_sandbox';

// Module 1: Board Basics
import { createM1L1 } from './lessons/m1_01_terrain_castles';
import { createM1L2 } from './lessons/m1_02_terrain_rivers';
import { createM1L3 } from './lessons/m1_03_terrain_highground';
import { createM1L4 } from './lessons/m1_04_terrain_sanctuaries';

// Module 2: Your Army (Basic Pieces)
import { createM2 } from './lessons/m2_game_phases';
import {createM2L1} from './lessons/m2_01_the_basic_pieces';
import { createM2L2 } from './lessons/m2_02_swordsman';
import { createM2L2_01 } from './lessons/m2_02_02_swordsman_strength';
import { createM2L3 } from './lessons/m2_03_swordsman_river';
import { createM2L4 } from './lessons/m2_04_archer';
import { createM2L5 } from './lessons/m2_05_knight';
import { createM2L6 } from './lessons/m2_06_giant';
import { createM2L7 } from './lessons/m2_07_monarch';

// Module 3: Combat Mechanics
import { createM3L1 } from './lessons/m3_01_strength';
import { createM3L2 } from './lessons/m3_02_defense';
import { createM3L3 } from './lessons/m3_03_melee_ranged';

// Module 4: Economy & Control
import { createM4L1 } from './lessons/m4_01_castle_control';
import { createM4L2 } from './lessons/m4_02_recruitment';
import { createM4L3 } from './lessons/m4_03_pledging';
import { createM4L4 } from './lessons/m4_04_special_units';

// Module 5: Victory
import { createM5L1 } from './lessons/m5_01_conquest';
import { createM5L2 } from './lessons/m5_02_elimination';
import { createM5L3 } from './lessons/m5_03_walkthrough';

// Re-export types
export type { TutorialLesson, LessonCategory };

// Re-export lesson creators
export {
  // Module 1
  createM1L1, createM1L2, createM1L3, createM1L4,
  // Module 2
  createM2L1, createM2L2, createM2L2_01, createM2L3, createM2L4, createM2L5, createM2L6, createM2L7,
  // Module 3
  createM3L1, createM3L2, createM3L3,
  // Module 4
  createM4L1, createM4L2, createM4L3, createM4L4,
  // Module 5
  createM5L1, createM5L2, createM5L3,
};

/**
 * Get all available tutorial lessons in order.
 */
export function getAllLessons(): TutorialLesson[] {
  return [
    createLesson00(), // 0.0 Sandbox
    // Module 1: Board Basics
    createM1L1(), // 1.1 Terrain: Castles
    createM1L2(), // 1.2 Terrain: Rivers
    createM1L3(), // 1.3 Terrain: High Ground
    createM1L4(), // 1.4 Terrain: Sanctuaries
    //Module 2: Game phases intro
    createM2(), // 2.0 Game Phases (intro)
    // Module 2: Your Army
    createM2L1(), // 2.1 Game Phases
    createM2L2(), // 2.2 Swordsman
    createM2L2_01(), // 2.2.1 Swordsman: Strength
    createM2L3(), // 2.3 Swordsman River Bonus
    createM2L4(), // 2.4 Archer
    createM2L5(), // 2.5 Knight
    createM2L6(), // 2.6 Giant
    createM2L7(), // 2.7 Monarch
    
    // Module 3: Combat Mechanics
    createM3L1(), // 3.1 Strength System
    createM3L2(), // 3.2 Defense System
    createM3L3(), // 3.3 Melee vs Ranged
    
    // Module 4: Economy & Control
    createM4L1(), // 4.1 Castle Control
    createM4L2(), // 4.2 Recruitment Cycle
    createM4L3(), // 4.3 Sanctuary Pledging
    createM4L4(), // 4.4 Special Units
    
    // Module 5: Victory
    createM5L1(), // 5.1 Conquest Victory
    createM5L2(), // 5.2 Elimination Victory
    createM5L3(), // 5.3 Full Game Walkthrough
  ];
}
