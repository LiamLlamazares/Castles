/**
 * @file index.ts
 * @description Event system exports for game state changes.
 *
 * This barrel file exports all event-related types and classes
 * for convenient importing throughout the codebase.
 */

// Event types (must use 'export type' for isolatedModules compatibility)
export type {
  GameEvent,
  MoveMadeEvent,
  AttackResolvedEvent,
  CastleCapturedEvent,
  PieceRecruitedEvent,
  TurnChangedEvent,
  PieceDestroyedEvent,
  SanctuaryPledgedEvent,
  AbilityActivatedEvent,
  GameEndedEvent,
} from "./GameEvents";

export { isEventType } from "./GameEvents";

// Event emitter
export type { EventListener, Unsubscribe } from "./GameEventEmitter";
export { GameEventEmitter, gameEvents } from "./GameEventEmitter";
