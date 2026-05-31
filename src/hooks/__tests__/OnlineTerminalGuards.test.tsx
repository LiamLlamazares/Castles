import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderCustomGameLogicHook } from "../test-utils/TestGameProviderUtils";

describe("online terminal action guards", () => {
  it("does not submit online actions after a terminal online result", () => {
    const submitAction = vi.fn();
    const { result } = renderCustomGameLogicHook({
      onlineSession: {
        gameId: "game_terminal",
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
});
