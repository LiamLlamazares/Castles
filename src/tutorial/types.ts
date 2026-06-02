/**
 * @file types.ts
 * @description Type definitions for the tutorial lesson system.
 */
import React from 'react';
import { Board } from '../Classes/Core/Board';
import { Piece } from '../Classes/Entities/Piece';
import { Sanctuary } from '../Classes/Entities/Sanctuary';
import { LayoutService } from '../Classes/Systems/LayoutService';
import { PhoenixRecord } from '../Classes/Core/GameState';
import { AbilityType, PieceType, TurnPhase } from '../Constants';

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

  /** Optional pieces already in the graveyard when the lesson starts */
  graveyard?: Piece[];

  /** Optional pending Phoenix rebirth records when the lesson starts */
  phoenixRecords?: PhoenixRecord[];
  
  /** Optional sanctuaries on the board */
  sanctuaries?: Sanctuary[];

  /** Optional starting turn counter, used to begin tactical lessons in Attack or Castles phase */
  initialTurnCounter?: number;
  
  /** Layout service for rendering */
  layout: LayoutService;
  
  /** Learning objectives displayed in sidebar */
  objectives?: TutorialLessonObjective[];
  
  /** Hints shown to help the player */
  hints?: string[];
  
  /** Optional custom instructions shown at the top */
  instructions?: string | React.ReactNode;
}

export interface TutorialObjective {
  id: string;
  text: string;
}

export type TutorialLessonObjective = string | TutorialObjective;

export type TutorialGameEventType =
  | 'move'
  | 'attack'
  | 'capture'
  | 'recruitment'
  | 'promotion'
  | 'pledge'
  | 'ability'
  | 'pass'
  | 'inspect';

export interface TutorialGameEvent {
  type: TutorialGameEventType;
  notation?: string;
  phase?: TurnPhase;
  hexKey?: string;
  targetKind?: 'hex' | 'castle' | 'sanctuary' | 'piece';
  pieceType?: PieceType;
  abilityType?: AbilityType;
  pieceRemoved?: boolean;
  pieceAdded?: boolean;
  castleControlChanged?: boolean;
}

/**
 * Lesson category for grouping lessons in UI.
 */
export type LessonCategory = 
  | 'basics'      // Movement, attacks, terrain
  | 'mechanics'   // Phases, castles, recruiting
  | 'advanced';   // Abilities, strategies
