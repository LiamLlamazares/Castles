import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createClientActionId,
  sameOnlineAction,
} from "../actionIdempotency";

describe("online action idempotency helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("treats hex colorIndex as non-semantic when comparing actions", () => {
    expect(
      sameOnlineAction(
        {
          type: "MOVE",
          baseVersion: 0,
          from: { q: 1, r: -1, s: 0, colorIndex: 1 },
          to: { q: 0, r: 0, s: 0, colorIndex: 2 },
        },
        {
          type: "MOVE",
          baseVersion: 0,
          from: { q: 1, r: -1, s: 0 },
          to: { q: 0, r: 0, s: 0 },
        }
      )
    ).toBe(true);
  });

  it("still distinguishes different semantic action coordinates", () => {
    expect(
      sameOnlineAction(
        {
          type: "MOVE",
          baseVersion: 0,
          from: { q: 1, r: -1, s: 0 },
          to: { q: 0, r: 0, s: 0 },
        },
        {
          type: "MOVE",
          baseVersion: 0,
          from: { q: 1, r: -1, s: 0 },
          to: { q: 0, r: 1, s: -1 },
        }
      )
    ).toBe(false);
  });

  it("uses randomUUID for client action ids when available", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "client-action-random-uuid"),
    });

    expect(createClientActionId()).toBe("client-action-random-uuid");
  });

  it("falls back to crypto random bytes before Math.random", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      for (let index = 0; index < bytes.length; index++) {
        bytes[index] = index;
      }
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(createClientActionId()).toBe("action_000102030405060708090a0b0c0d0e0f");
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});
