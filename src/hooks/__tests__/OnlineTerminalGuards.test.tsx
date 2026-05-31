import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderCustomGameLogicHook } from "../test-utils/TestGameProviderUtils";

describe("online terminal action guards", () => {
  it("does not submit online actions after a terminal online result", () => {
    const submitAction = vi.fn();
    const { result } = renderCustomGameLogicHook({
      onlineSession: {
        gameId: "game_terminal",
        role: "player",
        playerColor: "w",
        version: 3,
        status: "connected",
        result: { winner: "b", reason: "timeout" },
        submitAction,
      },
    });

    act(() => {
      result.current.handlePass();
      result.current.handleResign("w");
    });

    expect(submitAction).not.toHaveBeenCalled();
  });

  it("treats spectator sessions as read-only", () => {
    const { result } = renderCustomGameLogicHook({
      onlineSession: {
        gameId: "game_spectator",
        role: "spectator",
        version: 3,
        status: "connected",
        spectatorUrl: "https://castles.example/?onlineGame=game_spectator&view=spectator",
      },
    });

    act(() => {
      result.current.handlePass();
      result.current.handleResign("w");
    });

    expect(result.current.turnCounter).toBe(0);
  });
});
