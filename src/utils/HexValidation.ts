/**
 * @file HexValidation.ts
 * @description Shared validation utilities for hex positions.
 * 
 * Centralizes spawn location validation used by:
 * - SanctuaryService (pledge spawn validation)
 * - useClickHandler (pledge target validation)
 * - Any future recruitment systems
 */
import { Hex } from "../Classes/Entities/Hex";
import { Board } from "../Classes/Core/Board";
import { PieceMap } from "./PieceMap";

/**
 * Validates if a hex is a valid spawn location for new pieces.
 * 
 * A hex is valid for spawning if:
 * 1. Not occupied by another piece
 * 2. Not a river hex (impassable terrain)
 * 3. Not a castle hex (special structures)
 * 
 * @param hex - The hex position to validate
 * @param board - The game board for terrain checks
 * @param pieceMap - Current piece positions for occupancy check
 * @returns true if the hex is a valid spawn location
 * 
 * @example
 * const canSpawn = isValidSpawnHex(targetHex, board, gameState.pieceMap);
 * if (canSpawn) {
 *   spawnPieceAt(targetHex);
 * }
 */
export function isValidSpawnHex(
  hex: Hex,
  board: Board,
  pieceMap: PieceMap
): boolean {
  // Check occupancy
  if (pieceMap.has(hex)) return false;
  
  // Check terrain
  if (board.isRiver(hex)) return false;
  if (board.isCastle(hex, board.NSquares)) return false;
  
  return true;
}

/**
 * Validates if a hex is adjacent to a target and is a valid spawn location.
 * Commonly used for sanctuary pledge spawn validation.
 * 
 * @param hex - The potential spawn hex
 * @param targetHex - The hex that spawn must be adjacent to
 * @param board - The game board for terrain checks
 * @param pieceMap - Current piece positions for occupancy check
 * @returns true if hex is adjacent and valid for spawning
 */
export function isValidAdjacentSpawn(
  hex: Hex,
  targetHex: Hex,
  board: Board,
  pieceMap: PieceMap
): boolean {
  if (hex.distance(targetHex) !== 1) return false;
  return isValidSpawnHex(hex, board, pieceMap);
}
