import type { MoveRecord } from "../Constants";
import { Hex } from "../Classes/Entities/Hex";
import { NotationService } from "../Classes/Systems/NotationService";

export interface MoveHighlightHexes {
  notation: string;
  from: Hex | null;
  to: Hex | null;
}

const COORDINATE_PATTERN = /[A-Z]\d+/g;

function toValidHex(coordinate: string, validHexKeys?: Set<string>): Hex | null {
  try {
    const hex = NotationService.fromCoordinate(coordinate);
    if (validHexKeys && !validHexKeys.has(hex.getKey())) return null;
    return hex;
  } catch {
    return null;
  }
}

export function getMoveHighlightHexes(
  move: MoveRecord | null | undefined,
  validHexKeys?: Set<string>
): MoveHighlightHexes | null {
  if (!move || move.notation === "Start" || move.notation === "Pass") {
    return null;
  }

  const coordinates = move.notation.match(COORDINATE_PATTERN) ?? [];
  if (coordinates.length === 0) return null;

  const targetCoordinate = coordinates[coordinates.length - 1];
  if (!targetCoordinate) return null;

  const sourceCoordinate = coordinates.length >= 2 ? coordinates[0] : undefined;
  const from = sourceCoordinate ? toValidHex(sourceCoordinate, validHexKeys) : null;
  const to = toValidHex(targetCoordinate, validHexKeys);

  if (!from && !to) return null;

  return {
    notation: move.notation,
    from,
    to,
  };
}
