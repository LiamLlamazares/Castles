import { act, renderHook } from "@testing-library/react";
import { Hex } from "../../Classes/Entities/Hex";
import { useClickHandler } from "../useClickHandler";

describe("useClickHandler", () => {
  it("does not enter mutation-oriented board click flows when read-only", () => {
    const sanctuaryHex = new Hex(0, 0, 0);
    const onEngineHexClick = vi.fn();
    const pledge = vi.fn();
    const triggerAbility = vi.fn();

    const { result } = renderHook(() =>
      useClickHandler({
        movingPiece: null,
        sanctuaries: [{ hex: sanctuaryHex }] as any,
        pieces: [],
        canPledge: vi.fn(() => true),
        pledge,
        triggerAbility,
        activeAbility: null,
        onEngineHexClick,
        isReadOnly: true,
        board: {} as any,
        gameState: {} as any,
      })
    );

    act(() => {
      result.current.handleBoardClick(sanctuaryHex);
    });

    expect(result.current.pledgingSanctuary).toBeNull();
    expect(result.current.isPledgeTarget(new Hex(1, -1, 0))).toBe(false);
    expect(pledge).not.toHaveBeenCalled();
    expect(triggerAbility).not.toHaveBeenCalled();
    expect(onEngineHexClick).not.toHaveBeenCalled();
  });
});
