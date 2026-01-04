/**
 * @file types.ts
 * @description Type definitions for the tutorial lesson system.
 */
import React from 'react';
import { Board } from '../Classes/Core/Board';
import { Piece } from '../Classes/Entities/Piece';
import { Sanctuary } from '../Classes/Entities/Sanctuary';
import { LayoutService } from '../Classes/Systems/LayoutService';

/**
 * Represents a single tutorial lesson with board setup and instructional content.
 */
export interface TutorialLesson {
  /** Unique identifier for the lesson */
  id: string;
  
  /** Display title shown in sidebar */
  title: string;
  
  /** Short description of what this lesson teaches */
  description: string | React.ReactNode;
  
  /** The game board for this lesson */
  board: Board;
  
  /** Pieces placed on the board */
  pieces: Piece[];
  
  /** Optional sanctuaries on the board */
  sanctuaries?: Sanctuary[];
  
  /** Layout service for rendering */
  layout: LayoutService;
  
  /** Learning objectives displayed in sidebar */
  objectives?: string[];
  
  /** Hints shown to help the player */
  hints?: string[];
  
  /** Optional custom instructions shown at the top */
  instructions?: string | React.ReactNode;
}

/**
 * Lesson category for grouping lessons in UI.
 */
export type LessonCategory = 
  | 'basics'      // Movement, attacks, terrain
  | 'mechanics'   // Phases, castles, recruiting
  | 'advanced';   // Abilities, strategies
