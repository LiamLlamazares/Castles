/**
 * @file GameEventEmitter.ts
 * @description Pub/Sub event system for game state changes.
 *
 * ## What is Pub/Sub?
 * "Publish/Subscribe" is a pattern where:
 * - **Publishers** (Commands) emit events without knowing who listens
 * - **Subscribers** (UI components) react to events without knowing the source
 *
 * ## Why Use This?
 * **Before (tight coupling):**
 * ```typescript
 * // In MoveCommand - had to modify for each new feature
 * execute(state) {
 *   const newState = applyMove(state, piece, hex);
 *   playSound();       // ❌ Mixed concerns
 *   triggerAnimation(); // ❌ Hard to maintain
 *   logAnalytics();    // ❌ Core logic polluted
 * }
 * ```
 *
 * **After (decoupled with events):**
 * ```typescript
 * // In MoveCommand - clean, focused
 * execute(state) {
 *   const newState = applyMove(state, piece, hex);
 *   gameEvents.emit({ type: "MOVE_MADE", piece, from, to });
 * }
 *
 * // Elsewhere - features subscribe independently
 * gameEvents.on("MOVE_MADE", playMoveSound);
 * gameEvents.on("MOVE_MADE", animatePieceMovement);
 * ```
 *
 * ## Future Use Cases
 * - **Sound Effects Hook**: `useSoundEffects()` subscribes to combat/move events
 * - **Animation Component**: Triggers CSS animations on piece destruction
 * - **Achievement Tracker**: Monitors CASTLE_CAPTURED, GAME_ENDED
 * - **Replay System**: Records all events via `onAll()` for playback
 *
 * @example
 * // Subscribe to a specific event
 * const unsubscribe = gameEvents.on("ATTACK_RESOLVED", (event) => {
 *   if (event.result === "capture") playCaptureSound();
 * });
 *
 * // Later: cleanup subscription
 * unsubscribe();
 *
 * @see GameEvents - All available event types
 * @see MoveCommand - Example command that emits events
 */

import { GameEvent } from "./GameEvents";

/**
 * Callback type for event listeners.
 */
export type EventListener<T extends GameEvent = GameEvent> = (event: T) => void;

/**
 * Function to unsubscribe from an event.
 */
export type Unsubscribe = () => void;

/**
 * Event emitter for game events.
 * Implements a simple pub/sub pattern with optional event history.
 */
export class GameEventEmitter {
  private listeners: Map<GameEvent["type"], Set<EventListener<any>>> = new Map();
  private allListeners: Set<EventListener<GameEvent>> = new Set();
  private eventHistory: GameEvent[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Subscribe to a specific event type.
   * @param type - The event type to listen for (e.g., "MOVE_MADE")
   * @param listener - Callback function to execute when event fires
   * @returns Unsubscribe function - call this to stop listening
   *
   * @example
   * const unsub = gameEvents.on("PIECE_DESTROYED", (e) => playDeathSound(e.piece));
   * // Later: unsub();
   */
  on<T extends GameEvent["type"]>(
    type: T,
    listener: EventListener<Extract<GameEvent, { type: T }>>
  ): Unsubscribe {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Subscribe to ALL events (useful for logging, replay recording).
   * @param listener - Callback for every event
   * @returns Unsubscribe function
   *
   * @example
   * gameEvents.onAll((e) => console.log(`[${e.type}]`, e));
   */
  onAll(listener: EventListener<GameEvent>): Unsubscribe {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  /**
   * Emit an event to all registered listeners.
   * Called by Commands after successful execution.
   * @param event - The event to emit
   */
  emit(event: GameEvent): void {
    // Store in history (useful for debugging/replay)
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      });
    }

    // Notify all-event listeners
    this.allListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error(`Error in global event listener:`, error);
      }
    });
  }

  /**
   * Get recent event history (for debugging or replay).
   * @returns Array of past events (up to maxHistorySize)
   */
  getHistory(): readonly GameEvent[] {
    return this.eventHistory;
  }

  /**
   * Clear all listeners (useful for cleanup/testing).
   */
  clearListeners(): void {
    this.listeners.clear();
    this.allListeners.clear();
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.eventHistory = [];
  }
}

/**
 * Singleton instance of the event emitter.
 * Import this to subscribe or emit events anywhere in the app.
 *
 * @example
 * import { gameEvents } from "../Classes/Events";
 * gameEvents.on("MOVE_MADE", handleMove);
 */
export const gameEvents = new GameEventEmitter();
