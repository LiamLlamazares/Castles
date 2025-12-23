/**
 * @file useSoundEffects.ts
 * @description Hook that plays audio feedback for game events.
 *
 * Subscribes to the game event system and plays appropriate sounds
 * for moves, captures, and game end. Inspired by Lichess's audio feedback.
 *
 * @usage Add to Game component: useSoundEffects();
 */
import { useEffect, useRef, useCallback } from "react";
import { gameEvents, GameEvent } from "../Classes/Events";

/**
 * Audio file paths (relative to public folder)
 */
const SOUNDS = {
  move: "/sounds/move.mp3",
  capture: "/sounds/capture.mp3",
  castle: "/sounds/castle.mp3",
  victory: "/sounds/victory.mp3",
  defeat: "/sounds/defeat.mp3",
} as const;

type SoundType = keyof typeof SOUNDS;

/**
 * Preloads and caches audio elements for instant playback.
 */
function createAudioCache(): Map<SoundType, HTMLAudioElement> {
  const cache = new Map<SoundType, HTMLAudioElement>();
  
  if (typeof window !== "undefined") {
    (Object.keys(SOUNDS) as SoundType[]).forEach((key) => {
      const audio = new Audio(SOUNDS[key]);
      audio.preload = "auto";
      audio.volume = 0.5;
      cache.set(key, audio);
    });
  }
  
  return cache;
}

/**
 * Hook that plays sound effects in response to game events.
 * 
 * @param enabled - Whether sounds are enabled (default: true)
 * @param volume - Volume level 0-1 (default: 0.5)
 */
export function useSoundEffects(enabled: boolean = true, volume: number = 0.5) {
  const audioCache = useRef<Map<SoundType, HTMLAudioElement>>(createAudioCache());

  // Update volume when it changes
  useEffect(() => {
    audioCache.current.forEach((audio) => {
      audio.volume = volume;
    });
  }, [volume]);

  const playSound = useCallback((type: SoundType) => {
    if (!enabled) return;
    
    const audio = audioCache.current.get(type);
    if (audio) {
      // Reset to start for rapid replays
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Ignore autoplay errors (browser policies)
      });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handleEvent = (event: GameEvent) => {
      console.log("[SoundEffects] Event received:", event.type); // Debug
      switch (event.type) {
        case "MOVE_MADE":
          playSound("move");
          break;
        case "ATTACK_RESOLVED":
          if (event.result === "capture") {
            playSound("capture");
          } else {
            playSound("move");
          }
          break;
        case "CASTLE_CAPTURED":
          playSound("capture"); // Use capture sound as fallback
          break;
        case "GAME_ENDED":
          // Play victory for winner, defeat for loser
          // For now just play victory (could be enhanced with playerColor)
          playSound("victory");
          break;
      }
    };

    console.log("[SoundEffects] Subscribing to events"); // Debug
    const unsubscribe = gameEvents.onAll(handleEvent);
    return () => unsubscribe();
  }, [enabled, playSound]);

  return { playSound };
}
