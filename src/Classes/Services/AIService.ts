/**
 * @file AIService.ts
 * @description Facade for interacting with the AI Web Worker.
 * 
 * Manages the worker lifecycle and provides a Promise-based API for finding moves.
 */

import { GameState } from "../Core/GameState";
import { AIWorkerRequest, AIWorkerResponse } from "../../workers/AIWorker";

export interface AIAnalysisResult {
    bestMoveNotation: string;
    score: number;
    depth: number;
}

export class AIService {
    private static worker: Worker | null = null;
    private static currentResolve: ((result: AIAnalysisResult) => void) | null = null;
    private static isReady: boolean = false;

    /**
     * Initializes the worker if not already running.
     */
    public static initialize() {
        if (!this.worker) {
            try {
               // Standard Create React App (Webpack 5) worker instantiation
               this.worker = new Worker(new URL('../../workers/AIWorker.ts', import.meta.url));
            } catch (e) {
                console.error("Failed to initialize AI Worker", e);
            }

            if (this.worker) {
                this.worker.onmessage = (e: MessageEvent<AIWorkerResponse>) => {
                const data = e.data;
                
                switch (data.type) {
                    case 'READY':
                        this.isReady = true;
                        console.log("AI Engine Ready");
                        break;
                    case 'BEST_MOVE':
                        if (this.currentResolve) {
                            this.currentResolve({
                                bestMoveNotation: data.notation,
                                score: data.score,
                                depth: 0 // TODO: Track depth
                            });
                            this.currentResolve = null;
                        }
                        break;
                    case 'INFO':
                        // Dispatch event or callback for progress bar
                        // console.log(`AI Thinking: Depth ${data.depth}, Score ${data.score}`);
                        break;
                }
            };
        }
    }
}

    public static terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.isReady = false;
        }
    }

    /**
     * Requests the best move for the current position.
     */
    public static async findBestMove(gameState: GameState, depth: number = 3): Promise<AIAnalysisResult> {
        this.initialize();

        if (this.currentResolve) {
            // Cancel previous search? Or reject?
            console.warn("AI busy, ignoring request");
            return Promise.reject("AI Busy");
        }

        return new Promise((resolve) => {
            this.currentResolve = resolve;
            
            // TODO: Generate FEN from GameState
            // For now sending dummy FEN
            const fen = "STARTING_FEN"; 

            if (this.worker) {
                this.worker.postMessage({
                    type: 'SEARCH',
                    fen,
                    depth
                } as AIWorkerRequest);
            }
        });
    }
}
