import { fireEvent, render, screen } from "@testing-library/react";
import App from "../App";

const onlineHookMocks = vi.hoisted(() => ({
  submitAction: vi.fn(),
  useOnlineGameConnection: vi.fn(),
  useOnlineSpectatorConnection: vi.fn(),
}));

vi.mock("../hooks/useOnlineGameConnection", () => ({
  useOnlineGameConnection: onlineHookMocks.useOnlineGameConnection,
}));

vi.mock("../hooks/useOnlineSpectatorConnection", () => ({
  useOnlineSpectatorConnection: onlineHookMocks.useOnlineSpectatorConnection,
}));

vi.mock("../components/Game", () => ({
  default: ({
    onSetup,
    onTutorial,
    onOpenLibrary,
  }: {
    onSetup: () => void;
    onTutorial: () => void;
    onOpenLibrary: () => void;
  }) => (
    <div>
      <div>Game Ready</div>
      <button type="button" onClick={onSetup}>
        Configure New Game
      </button>
      <button type="button" onClick={onTutorial}>
        Open Tutorial
      </button>
      <button type="button" onClick={onOpenLibrary}>
        Open Library
      </button>
    </div>
  ),
}));

vi.mock("../components/GameSetup", () => ({
  default: ({
    onBack,
    onTutorial,
    onOpenLibrary,
  }: {
    onBack: () => void;
    onTutorial: () => void;
    onOpenLibrary: () => void;
  }) => (
    <div>
      <div>Setup Ready</div>
      <button type="button" onClick={onBack}>
        Back to game
      </button>
      <button type="button" onClick={onTutorial}>
        Setup Tutorial
      </button>
      <button type="button" onClick={onOpenLibrary}>
        Setup Library
      </button>
    </div>
  ),
}));

vi.mock("../components/GameLibrary", () => ({
  default: ({ onBack, backLabel = "Back to game" }: { onBack: () => void; backLabel?: string }) => (
    <div>
      <div>Library Ready</div>
      <button type="button" onClick={onBack}>
        {backLabel}
      </button>
    </div>
  ),
}));

vi.mock("../components/Tutorial", () => ({
  default: ({ onBack, backLabel = "Back to game" }: { onBack: () => void; backLabel?: string }) => (
    <div>
      <div>Tutorial Ready</div>
      <button type="button" onClick={onBack}>
        {backLabel}
      </button>
    </div>
  ),
}));

vi.mock("../components/InstallAppHint", () => ({
  default: () => null,
}));

describe("App game setup lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    onlineHookMocks.submitAction.mockReset();
    onlineHookMocks.useOnlineGameConnection.mockReset();
    onlineHookMocks.useOnlineSpectatorConnection.mockReset();
    onlineHookMocks.useOnlineGameConnection.mockReturnValue({
      status: "idle",
      submitAction: onlineHookMocks.submitAction,
    });
    onlineHookMocks.useOnlineSpectatorConnection.mockReturnValue({
      status: "idle",
    });
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

  it("returns from tutorial to the view that opened it", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Tutorial" }));
    expect(screen.getByText("Tutorial Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Setup Tutorial" }));
    expect(screen.getByText("Tutorial Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
  });

  it("returns from library to the view that opened it", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Library" }));
    expect(screen.getByText("Library Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Setup Library" }));
    expect(screen.getByText("Library Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
  });

  it("lets setup return to the existing game without starting a replacement game", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));
    expect(screen.getByText("Setup Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(screen.getByText("Game Ready")).toBeInTheDocument();
  });

  it("shows readable pre-snapshot online connection states", () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=game_denied&seat=w&token=bad-token"
    );
    onlineHookMocks.useOnlineGameConnection.mockReturnValue({
      status: "access-denied",
      lastError: "Invite link expired.",
      submitAction: onlineHookMocks.submitAction,
    });

    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("Access denied: Invite link expired.");
  });

  it("lets users recover from a failed pre-snapshot online connection", () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=game_denied&seat=w&token=bad-token"
    );
    onlineHookMocks.useOnlineGameConnection.mockReturnValue({
      status: "access-denied",
      lastError: "Invite link expired.",
      submitAction: onlineHookMocks.submitAction,
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Configure New Game" }));

    expect(screen.getByText("Setup Ready")).toBeInTheDocument();
    expect(window.location.search).not.toContain("onlineGame=");
    expect(window.location.search).not.toContain("token=");
  });
});
