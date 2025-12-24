/**
 * @file PGNTypes.ts
 * @description Shared type definitions for PGN service modules.
 *
 * Contains interfaces used by both PGNGenerator and PGNImporter.
 */
import { BoardConfig } from "../Core/Board";
import { PieceType, SanctuaryType } from "../../Constants";

/**
 * Full game setup data for serialization/deserialization.
 * Contains all information needed to reconstruct initial game state.
 */
export interface GameSetup {
  boardConfig: BoardConfig;
  castles: { q: number; r: number; s: number; color: 'w' | 'b' }[];
  pieces: { type: PieceType; q: number; r: number; s: number; color: 'w' | 'b' }[];
  sanctuaries?: { 
    type: SanctuaryType; 
    q: number; 
    r: number; 
    s: number; 
    territorySide: 'w' | 'b'; 
    cooldown: number; 
    hasPledgedThisGame: boolean 
  }[];
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
