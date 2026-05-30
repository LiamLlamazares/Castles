import {
  AbilityCommand,
  AttackCommand,
  CastleAttackCommand,
  MoveCommand,
  PassCommand,
  PledgeCommand,
  RecruitCommand,
} from "../Classes/Commands";
import type { GameCommand } from "../Classes/Commands";
import { serializeHex } from "./serialization";
import { OnlineActionDTO } from "./types";

export function commandToOnlineAction(
  command: GameCommand,
  baseVersion: number
): OnlineActionDTO {
  if (command instanceof MoveCommand) {
    return {
      type: "MOVE",
      baseVersion,
      from: serializeHex(command.piece.hex),
      to: serializeHex(command.targetHex),
    };
  }

  if (command instanceof AttackCommand) {
    return {
      type: "ATTACK",
      baseVersion,
      from: serializeHex(command.attacker.hex),
      target: serializeHex(command.targetHex),
    };
  }

  if (command instanceof CastleAttackCommand) {
    return {
      type: "CASTLE_ATTACK",
      baseVersion,
      from: serializeHex(command.attacker.hex),
      castle: serializeHex(command.targetHex),
    };
  }

  if (command instanceof RecruitCommand) {
    return {
      type: "RECRUIT",
      baseVersion,
      castle: serializeHex(command.castle.hex),
      spawn: serializeHex(command.spawnHex),
    };
  }

  if (command instanceof PledgeCommand) {
    return {
      type: "PLEDGE",
      baseVersion,
      sanctuary: serializeHex(command.sanctuary.hex),
      spawn: serializeHex(command.spawnHex),
    };
  }

  if (command instanceof AbilityCommand) {
    return {
      type: "ABILITY",
      baseVersion,
      from: serializeHex(command.caster.hex),
      ability: command.ability,
      target: serializeHex(command.targetHex),
    };
  }

  if (command instanceof PassCommand) {
    return {
      type: "PASS",
      baseVersion,
    };
  }

  throw new Error(`Unsupported command type for online action: ${command.type}`);
}

