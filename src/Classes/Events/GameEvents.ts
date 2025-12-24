/**
 * @file GameEvents.ts
 * @description Event types for game state changes.
 *
 * ## Purpose
 * The Event System decouples game logic from side effects, making it easy to add
 * new features without modifying core game code.
 *
 * ## Future Integration Points
 * These events can be used by:
 * - **Sound Effects**: Subscribe to MOVE_MADE, ATTACK_RESOLVED for audio feedback
 * - **Animations**: Trigger CSS/JS animations on PIECE_DESTROYED, CASTLE_CAPTURED
 * - **Achievement System**: Track CASTLE_CAPTURED, GAME_ENDED for unlocks
 * - **Replay System**: Record all events for game replay functionality
 * - **Analytics**: Log player actions for game balance data
 *
 * ## Relationship to NotationService
 * Events contain rich data (pieces, hexes, results) while NotationService produces
 * compact string notation (e.g., "J10K11"). Commands use NotationService for
 * history recording and emit events for real-time side effects.
 *
 * @see GameEventEmitter - The pub/sub system that dispatches these events
 * @see NotationService - Produces string notation for move history
 * @see MoveCommand - Example of a command that emits MOVE_MADE events
 */

import { Piece } from "../Entities/Piece";
import { Hex } from "../Entities/Hex";
import { Castle } from "../Entities/Castle";
import { Color, TurnPhase, PieceType, AbilityType } from "../../Constants";

/**
 * Base event with common properties.
 */
interface BaseGameEvent {
  /** Timestamp when the event occurred */
  timestamp: number;
  /** Turn number when event occurred */
  turnNumber: number;
}

/**
 * Emitted when a piece moves to a new hex.
 * @example Subscribe in a sound component: gameEvents.on("MOVE_MADE", playSwooshSound)
 */
export interface MoveMadeEvent extends BaseGameEvent {
  type: "MOVE_MADE";
  piece: Piece;
  from: Hex;
  to: Hex;
}

/**
 * Emitted when combat is resolved between pieces.
 * @example Subscribe for hit/miss sound effects based on result
 */
export interface AttackResolvedEvent extends BaseGameEvent {
  type: "ATTACK_RESOLVED";
  attacker: Piece;
  defender: Piece | null; // null if attacking castle
  targetHex: Hex;
  result: "capture" | "damage" | "miss";
  damageDealt?: number;
}

/**
 * Emitted when a castle changes control.
 * @example Trigger fanfare animation on capture
 */
export interface CastleCapturedEvent extends BaseGameEvent {
  type: "CASTLE_CAPTURED";
  castle: Castle;
  capturedBy: Color;
  previousOwner: Color | null;
}

/**
 * Emitted when a piece is recruited from a castle.
 */
export interface PieceRecruitedEvent extends BaseGameEvent {
  type: "PIECE_RECRUITED";
  pieceType: PieceType;
  spawnHex: Hex;
  recruitedBy: Color;
  castle: Castle;
}

/**
 * Emitted when the turn phase or player changes.
 * @example Update UI indicators, play turn-change sound
 */
export interface TurnChangedEvent extends BaseGameEvent {
  type: "TURN_CHANGED";
  newPlayer: Color;
  newPhase: TurnPhase;
  previousPlayer: Color;
  previousPhase: TurnPhase;
}

/**
 * Emitted when a piece is destroyed/captured.
 * @example Trigger death animation, play defeat sound
 */
export interface PieceDestroyedEvent extends BaseGameEvent {
  type: "PIECE_DESTROYED";
  piece: Piece;
  destroyedBy: Piece | null;
  cause: "combat" | "ability" | "other";
}

/**
 * Emitted when a player pledges at a sanctuary.
 */
export interface SanctuaryPledgedEvent extends BaseGameEvent {
  type: "SANCTUARY_PLEDGED";
  sanctuaryHex: Hex;
  pieceType: PieceType;
  spawnHex: Hex;
  pledgedBy: Color;
}

/**
 * Emitted when a special ability is activated.
 * @example Trigger ability-specific VFX (fireball, teleport shimmer)
 */
export interface AbilityActivatedEvent extends BaseGameEvent {
  type: "ABILITY_ACTIVATED";
  caster: Piece;
  ability: AbilityType;
  targetHex: Hex;
}

/**
 * Emitted when the game ends.
 * @example Show victory screen, play victory/defeat music
 */
export interface GameEndedEvent extends BaseGameEvent {
  type: "GAME_ENDED";
  winner: Color;
  reason: "monarch_captured" | "resignation" | "timeout";
}

/**
 * Union type of all game events.
 */
export type GameEvent =
  | MoveMadeEvent
  | AttackResolvedEvent
  | CastleCapturedEvent
  | PieceRecruitedEvent
  | TurnChangedEvent
  | PieceDestroyedEvent
  | SanctuaryPledgedEvent
  | AbilityActivatedEvent
  | GameEndedEvent;

/**
 * Type guard to check event type.
 */
export function isEventType<T extends GameEvent["type"]>(
  event: GameEvent,
  type: T
): event is Extract<GameEvent, { type: T }> {
  return event.type === type;
}
