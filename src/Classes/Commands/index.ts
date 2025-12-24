/**
 * @file index.ts
 * @description Command Pattern exports for game actions.
 *
 * This barrel file exports all command-related types and classes
 * for convenient importing throughout the codebase.
 */

// Core types (must use 'export type' for isolatedModules compatibility)
export type { GameCommand, CommandResult, CommandContext } from "./GameCommand";
export { CommandType } from "./GameCommand";

// Concrete commands
export { MoveCommand } from "./MoveCommand";
export { AttackCommand, CastleAttackCommand } from "./AttackCommands";
export { PassCommand } from "./PassCommand";
export { RecruitCommand } from "./RecruitCommand";
export { PledgeCommand } from "./PledgeCommand";
export { AbilityCommand } from "./AbilityCommand";

