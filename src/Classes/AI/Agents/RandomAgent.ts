/**
 * @file RandomAgent.ts
 * @description Baseline AI that selects moves randomly from all legal options.
 *
 * This is the "Sanity Bot" used to validate the game logic pipeline.
 * If RandomAgent can play a full game without crashing or making illegal moves,
 * the RuleEngine and command infrastructure are working correctly.
 *
 * @see IAgent - Interface this implements
 * @see AIContextBuilder - Provides legal action context
 */

import { IAgent, AIContext } from "../IAgent";
import { AIContextBuilder } from "../AIContextBuilder";
import { GameState, GameEngine } from "../../Core/GameEngine";
import { Board } from "../../Core/Board";
import { GameCommand, CommandContext } from "../../Commands/GameCommand";
import { MoveCommand } from "../../Commands/MoveCommand";
import { AttackCommand, CastleAttackCommand } from "../../Commands/AttackCommands";
import { RecruitCommand } from "../../Commands/RecruitCommand";
import { PledgeCommand } from "../../Commands/PledgeCommand";
import { AbilityCommand } from "../../Commands/AbilityCommand";
import { PassCommand } from "../../Commands/PassCommand";
import { Hex } from "../../Entities/Hex";
import { Color, AttackType } from "../../../Constants";

/**
 * Random AI agent that selects one legal action uniformly at random.
 *
 * Use cases:
 * - API validation (fuzz testing)
 * - Performance baseline for smarter AIs
 * - Debugging game logic edge cases
 */
export class RandomAgent implements IAgent {
  readonly name = "Random Bot v1.0";

  private gameEngine: GameEngine;
  private board: Board;

  constructor(gameEngine: GameEngine, board: Board) {
    this.gameEngine = gameEngine;
    this.board = board;
  }

  /**
   * Selects a random legal action for the current phase.
   *
   * @returns A GameCommand to execute, or null to pass the phase
   */
  async getNextAction(
    gameState: GameState,
    _board: Board, // Unused - we use this.board from constructor
    myColor: Color
  ): Promise<GameCommand | null> {
    // Build context with all legal actions
    const context = AIContextBuilder.build(
      gameState,
      this.board,
      this.gameEngine,
      myColor
    );

    // Collect all possible commands
    const allCommands = this.collectAllCommands(context, gameState);

    // If no legal actions, return null to pass
    if (allCommands.length === 0) {
      return null;
    }

    // Pick one uniformly at random
    const randomIndex = Math.floor(Math.random() * allCommands.length);
    return allCommands[randomIndex];
  }

  /**
   * Collects all legal commands from the AI context.
   */
  private collectAllCommands(
    context: AIContext,
    gameState: GameState
  ): GameCommand[] {
    const commands: GameCommand[] = [];
    const commandContext: CommandContext = {
      gameEngine: this.gameEngine,
      board: this.board,
    };

    // Collect move commands
    const moveEntries = Array.from(context.legalMoves.entries());
    for (const [pieceKey, destinations] of moveEntries) {
      const piece = gameState.pieceMap.getByKey(pieceKey);
      if (!piece) continue;

      for (const targetHex of destinations) {
        commands.push(new MoveCommand(piece, targetHex, commandContext));
      }
    }

    // Collect attack commands (piece attacks and castle attacks)
    const attackEntries = Array.from(context.legalAttacks.entries());
    for (const [pieceKey, targets] of attackEntries) {
      const piece = gameState.pieceMap.getByKey(pieceKey);
      if (!piece) continue;

      for (const targetHex of targets) {
        // Determine if this is a castle attack
        const isCastle = this.board.castleHexSet.has(targetHex.getKey());
        const targetPiece = gameState.pieceMap.getByKey(targetHex.getKey());

        if (isCastle && !targetPiece && piece.AttackType === AttackType.Melee) {
          // Castle capture (moving onto empty enemy castle)
          commands.push(new CastleAttackCommand(piece, targetHex, commandContext));
        } else {
          // Regular attack
          commands.push(new AttackCommand(piece, targetHex, commandContext));
        }
      }
    }

    // Collect recruit commands
    for (const recruit of context.recruitOptions) {
      const castle = gameState.castles.find((c) =>
        c.hex.equals(recruit.castleHex)
      );
      if (!castle) continue;

      for (const spawnHex of recruit.spawnHexes) {
        commands.push(new RecruitCommand(castle, spawnHex, commandContext));
      }
    }

    // Collect pledge commands
    for (const pledge of context.pledgeOptions) {
      // Find the actual Sanctuary object from gameState
      const sanctuary = gameState.sanctuaries.find((s) =>
        s.hex.equals(pledge.sanctuaryHex)
      );
      if (!sanctuary) continue;

      for (const spawnHex of pledge.spawnHexes) {
        commands.push(
          new PledgeCommand(sanctuary, spawnHex, commandContext)
        );
      }
    }


    // Collect ability commands
    for (const ability of context.abilityOptions) {
      const piece = gameState.pieceMap.getByKey(ability.pieceHex.getKey());
      if (!piece) continue;

      for (const targetHex of ability.targetHexes) {
        commands.push(
          new AbilityCommand(piece, targetHex, ability.abilityType, commandContext)
        );
      }
    }

    return commands;
  }
}
