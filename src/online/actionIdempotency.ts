import type { OnlineActionDTO } from "./types";

export const MAX_CLIENT_ACTION_ID_LENGTH = 128;

export function isValidClientActionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CLIENT_ACTION_ID_LENGTH
  );
}

export function createClientActionId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") {
    return randomUUID.call(globalThis.crypto);
  }
  const getRandomValues = globalThis.crypto?.getRandomValues;
  if (typeof getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    getRandomValues.call(globalThis.crypto, bytes);
    return `action_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `action_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function sameOnlineAction(a: OnlineActionDTO, b: OnlineActionDTO): boolean {
  return stableStringify(canonicalAction(a)) === stableStringify(canonicalAction(b));
}

function canonicalHex(hex: { q: number; r: number; s: number }) {
  return { q: hex.q, r: hex.r, s: hex.s };
}

function canonicalAction(action: OnlineActionDTO): unknown {
  switch (action.type) {
    case "MOVE":
      return {
        type: action.type,
        baseVersion: action.baseVersion,
        from: canonicalHex(action.from),
        to: canonicalHex(action.to),
      };
    case "ATTACK":
      return {
        type: action.type,
        baseVersion: action.baseVersion,
        from: canonicalHex(action.from),
        target: canonicalHex(action.target),
      };
    case "CASTLE_ATTACK":
      return {
        type: action.type,
        baseVersion: action.baseVersion,
        from: canonicalHex(action.from),
        castle: canonicalHex(action.castle),
      };
    case "RECRUIT":
      return {
        type: action.type,
        baseVersion: action.baseVersion,
        castle: canonicalHex(action.castle),
        spawn: canonicalHex(action.spawn),
      };
    case "PLEDGE":
      return {
        type: action.type,
        baseVersion: action.baseVersion,
        sanctuary: canonicalHex(action.sanctuary),
        spawn: canonicalHex(action.spawn),
      };
    case "ABILITY":
      return {
        type: action.type,
        baseVersion: action.baseVersion,
        from: canonicalHex(action.from),
        ability: action.ability,
        target: canonicalHex(action.target),
      };
    case "PROMOTE":
      return {
        type: action.type,
        baseVersion: action.baseVersion,
        pieceType: action.pieceType,
      };
    case "PASS":
    case "RESIGN":
      return {
        type: action.type,
        baseVersion: action.baseVersion,
      };
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
