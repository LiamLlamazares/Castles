/**
 * @file AI Module Index
 * @description Central export for AI-related classes and interfaces.
 *
 * Usage:
 * ```typescript
 * import { RandomAgent, AIController } from './Classes/AI';
 * import type { IAgent } from './Classes/AI';
 *
 * const agent = new RandomAgent(gameEngine, board);
 * const controller = new AIController(agent, gameEngine, board);
 * const newState = await controller.playTurn(state, 'b');
 * ```
 */

// Classes 
export { AIContextBuilder } from "./AIContextBuilder";
export { AIController, runAIGame } from "./AIController";
export { RandomAgent } from "./Agents/RandomAgent";

// Types (use 'export type' for isolated modules compatibility)
export type { IAgent, IEvaluator, AIContext, AISettings, AIGameResult } from "./IAgent";
export type {
  MoveOption,
  AttackOption,
  RecruitOption,
  PledgeOption,
  AbilityOption,
} from "./IAgent";
