/**
 * @file index.ts
 * @description Exports all tutorial lessons.
 */
import { TutorialLesson, LessonCategory } from './types';
import { createLesson00 } from './lessons/lesson00_sandbox';
import { createLesson01 } from './lessons/lesson01_movement';

// Re-export types
export type { TutorialLesson, LessonCategory };

// Re-export lesson creators
export { createLesson00, createLesson01 };

/**
 * Get all available tutorial lessons in order.
 */
export function getAllLessons(): TutorialLesson[] {
  return [
    createLesson00(), // Sandbox - full board
    createLesson01(), // Movement basics
    // Future lessons will be added here
  ];
}
