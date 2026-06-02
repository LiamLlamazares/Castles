import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useInputHandler } from "../useInputHandler";

function InputHandlerHarness({
  onNavigate,
  isHistoryNavigationEnabled,
}: {
  onNavigate: (direction: -1 | 1) => void;
  isHistoryNavigationEnabled: boolean;
}) {
  useInputHandler({
    onPass: vi.fn(),
    onFlipBoard: vi.fn(),
    onTakeback: vi.fn(),
    onResize: vi.fn(),
    onNavigate,
    isHistoryNavigationEnabled,
  });

  return (
    <label>
      Replay speed
      <select aria-label="Replay speed">
        <option>Normal</option>
      </select>
    </label>
  );
}

describe("useInputHandler", () => {
  it("ignores history arrows until replay navigation is enabled", () => {
    const onNavigate = vi.fn();

    render(
      <InputHandlerHarness
        onNavigate={onNavigate}
        isHistoryNavigationEnabled={false}
      />
    );

    fireEvent.keyDown(window, { code: "ArrowLeft", key: "ArrowLeft" });
    fireEvent.keyDown(window, { code: "ArrowRight", key: "ArrowRight" });

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("uses Left and Right for replay navigation when enabled", () => {
    const onNavigate = vi.fn();

    render(
      <InputHandlerHarness
        onNavigate={onNavigate}
        isHistoryNavigationEnabled
      />
    );

    fireEvent.keyDown(window, { code: "ArrowLeft", key: "ArrowLeft" });
    fireEvent.keyDown(window, { code: "ArrowRight", key: "ArrowRight" });

    expect(onNavigate).toHaveBeenNthCalledWith(1, -1);
    expect(onNavigate).toHaveBeenNthCalledWith(2, 1);
  });

  it("does not steal arrows from focused form controls", () => {
    const onNavigate = vi.fn();

    render(
      <InputHandlerHarness
        onNavigate={onNavigate}
        isHistoryNavigationEnabled
      />
    );

    fireEvent.keyDown(screen.getByLabelText("Replay speed"), {
      code: "ArrowLeft",
      key: "ArrowLeft",
    });

    expect(onNavigate).not.toHaveBeenCalled();
  });
});
