/**
 * @file PGNTypes.ts
 * @description Shared type definitions for PGN service modules.
 *
 * Contains interfaces used by both PGNGenerator and PGNImporter.
 */
import { BoardConfig } from "../Core/Board";
import { PieceType, SanctuaryType } from "../../Constants";

/** Setup data for a castle position */
export type CastleSetup = { q: number; r: number; s: number; color: 'w' | 'b' };

/** Setup data for a piece position */
export type PieceSetup = { type: PieceType; q: number; r: number; s: number; color: 'w' | 'b' };

/** Setup data for a sanctuary position */
export type SanctuarySetup = { 
  type: SanctuaryType; 
  q: number; 
  r: number; 
  s: number; 
  territorySide: 'w' | 'b'; 
  cooldown: number; 
  hasPledgedThisGame: boolean 
};

/**
 * Full game setup data for serialization/deserialization.
 * Contains all information needed to reconstruct initial game state.
 */
export interface GameSetup {
  boardConfig: BoardConfig;
  castles: CastleSetup[];
  pieces: PieceSetup[];
  sanctuaries?: SanctuarySetup[];
}

/**
 * Compact format for efficient storage in PGN tags.
 * Uses arrays instead of objects to minimize JSON size.
 */
export interface CompactSetup {
  b: BoardConfig;
  c: [number, number, number, 0 | 1][]; // q, r, s, color (0=w, 1=b)
  p: [PieceType, number, number, number, 0 | 1][]; // type, q, r, s, color
  s?: [SanctuaryType, number, number, number, 0 | 1, number, 0 | 1][]; // type, q, r, s, territorySide, cooldown, hasPledgedThisGame
}
