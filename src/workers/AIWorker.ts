/**
 * @file AIWorker.ts
 * @description Web Worker for background AI calculation.
 * 
 * This worker runs in a separate thread to prevent UI freezing during
 * computationally expensive move searching.
 * 
 * PROTOCOL:
 * - Input: { type: 'SEARCH', fen: string, depth: number }
 * - Output: { type: 'BEST_MOVE', from: Hex, to: Hex, score: number }
 */

// Define worker message types
export type AIWorkerRequest = 
  | { type: 'SEARCH'; fen: string; depth: number }
  | { type: 'STOP' };

export type AIWorkerResponse = 
  | { type: 'BEST_MOVE'; notation: string; score: number } // Use notation for simplicity in passing back
  | { type: 'INFO'; depth: number; score: number; nodes: number }
  | { type: 'READY' };

const ctx: Worker = self as any;

ctx.onmessage = (e: MessageEvent<AIWorkerRequest>) => {
  const { type } = e.data;

  switch (type) {
    case 'SEARCH':
      handleSearch(e.data.fen, e.data.depth);
      break;
    case 'STOP':
      // Implement stop logic (flag)
      break;
  }
};

function handleSearch(fen: string, depth: number) {
  // SIMULATION: Fake thinking delay
  let progress = 0;
  const totalSteps = 5;
  
  const interval = setInterval(() => {
    progress++;
    
    // Send progress updates
    ctx.postMessage({ 
      type: 'INFO', 
      depth: (progress / totalSteps) * depth, 
      score: Math.random() * 2 - 1,
      nodes: progress * 1000 
    });

    if (progress >= totalSteps) {
      clearInterval(interval);
      
      // Send "best move" (Random for now)
      // In real implementation, this would be the result of Alpha-Beta search
      ctx.postMessage({
        type: 'BEST_MOVE',
        notation: "WAIT", // Placeholder - needs valid notation generation
        score: 0.5
      });
    }
  }, 500); // 0.5s steps -> 2.5s total think time
}

// Notify main thread we are ready
ctx.postMessage({ type: 'READY' });
