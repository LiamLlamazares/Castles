import { fireEvent, render, screen } from "@testing-library/react";
import App from "../App";

vi.mock("../components/Game", () => ({
  default: ({ onSetup }: { onSetup: () => void }) => (
    <button type="button" onClick={onSetup}>
      Configure New Game
    </button>
  ),
}));

vi.mock("../components/GameSetup", () => ({
  default: () => <div>Setup Ready</div>,
}));

vi.mock("../components/InstallAppHint", () => ({
  default: () => null,
}));

describe("App game setup lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/?pgn=stale-pgn&game=stale-game");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("clears stale shared-game URL parameters when configuring a new game", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));

    expect(screen.getByText("Setup Ready")).toBeInTheDocument();
    expect(window.location.search).not.toContain("pgn=");
    expect(window.location.search).not.toContain("game=");
  });
});
