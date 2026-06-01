import { act, fireEvent, render, screen } from "@testing-library/react";
import ControlPanel from "../ControlPanel";

describe("ControlPanel", () => {
  const baseProps = {
    currentPlayer: "w" as const,
    turnPhase: "Movement" as const,
    turnCounter: 0,
    onPass: vi.fn(),
    onResign: vi.fn(),
    onNewGame: vi.fn(),
    moveHistory: [],
    hasGameStarted: false,
    winner: null,
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a clear victory points scoreboard when VP mode is enabled", () => {
    const { container } = render(
      <ControlPanel
        {...baseProps}
        victoryPoints={{ w: 3, b: 1 }}
      />
    );

    expect(screen.getByText("Victory Points")).toBeInTheDocument();
    expect(screen.getByText("White")).toBeInTheDocument();
    expect(screen.getByText("Black")).toBeInTheDocument();
    expect(screen.getByText("First to 10")).toBeInTheDocument();
    expect(screen.getByLabelText("White victory points: 3 of 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Black victory points: 1 of 10")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="vp-pip-w"][data-filled="true"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="vp-pip-b"][data-filled="true"]')).toHaveLength(1);
  });

  it("groups contextual game action buttons for accessible responsive layout", () => {
    render(
      <ControlPanel
        {...baseProps}
        onShare={vi.fn()}
        onSaveGame={vi.fn()}
        onOpenLibrary={vi.fn()}
      />
    );

    const turnControls = screen.getByRole("group", { name: "Turn controls" });
    const saveControls = screen.getByRole("group", { name: "Local Library and review" });
    const playControls = screen.getByRole("group", { name: "Play" });

    expect(turnControls).toContainElement(screen.getByRole("button", { name: "Pass" }));
    expect(turnControls).toContainElement(screen.getByRole("button", { name: "Resign" }));
    expect(saveControls).toContainElement(screen.getByRole("button", { name: "Save Game" }));
    expect(saveControls).toContainElement(screen.getByRole("button", { name: "Library" }));
    expect(saveControls).toContainElement(screen.getByRole("button", { name: "Share" }));
    expect(playControls).toContainElement(screen.getByRole("button", { name: "New Game" }));
    expect(screen.queryByRole("button", { name: "Tutorial" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Watch" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move history" })).toBeInTheDocument();
  });

  it("keeps tutorial and watch navigation out of the game side panel", () => {
    render(<ControlPanel {...baseProps} />);

    expect(screen.queryByRole("button", { name: "Tutorial" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Watch" })).not.toBeInTheDocument();
  });

  it("calls visible save and library actions from the game panel", () => {
    const onSaveGame = vi.fn();
    const onOpenLibrary = vi.fn();

    render(
      <ControlPanel
        {...baseProps}
        onSaveGame={onSaveGame}
        onOpenLibrary={onOpenLibrary}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Game" }));
    fireEvent.click(screen.getByRole("button", { name: "Library" }));

    expect(onSaveGame).toHaveBeenCalledOnce();
    expect(onOpenLibrary).toHaveBeenCalledOnce();
  });

  it("describes named saves and the Library path from the side panel", () => {
    render(
      <ControlPanel
        {...baseProps}
        onSaveGame={vi.fn()}
        onOpenLibrary={vi.fn()}
      />
    );

    const saveButton = screen.getByRole("button", { name: "Save Game" });
    const libraryButton = screen.getByRole("button", { name: "Library" });

    expect(saveButton).toHaveAttribute("title", "Name this game and save it to Library");
    expect(libraryButton).toHaveAttribute("title", "Open saved games");
    expect(saveButton).toHaveAccessibleDescription("Name this game and save it to Library.");
    expect(libraryButton).toHaveAccessibleDescription("Open saved games in Library.");
  });

  it("shows visible local save progress in the side panel", () => {
    render(
      <ControlPanel
        {...baseProps}
        onSaveGame={vi.fn()}
        onOpenLibrary={vi.fn()}
        saveStatusLabel="Autosaved locally"
      />
    );

    const saveControls = screen.getByRole("group", { name: "Local Library and review" });
    const saveStatus = screen.getByLabelText("Save status: Autosaved locally");

    expect(saveControls).toContainElement(saveStatus);
    expect(screen.getByText("Local Library")).toBeInTheDocument();
    expect(saveStatus).toHaveTextContent("Autosaved locally");
  });

  it("shows analysis in save and review controls for review-only online games", () => {
    const onEnableAnalysis = vi.fn();

    render(
      <ControlPanel
        {...baseProps}
        hasGameStarted
        isOnline
        isReadOnly
        onEnableAnalysis={onEnableAnalysis}
      />
    );

    const saveControls = screen.getByRole("group", { name: "Local Library and review" });
    const analysisButton = screen.getByRole("button", { name: "Analysis" });

    expect(saveControls).toContainElement(analysisButton);

    fireEvent.click(analysisButton);

    expect(onEnableAnalysis).toHaveBeenCalledOnce();
  });

  it("renders online clocks from server state instead of starting local browser clocks", () => {
    render(
      <ControlPanel
        {...baseProps}
        hasGameStarted
        onlineClock={{
          timeControl: { initialMs: 60_000, incrementMs: 0 },
          remainingMs: { w: 60_000, b: 60_000 },
          activeColor: "w",
          runningSince: 0,
          serverNow: 5_000,
        }}
      />
    );

    expect(screen.getByTestId("online-clock-w")).toHaveTextContent("0:55");
    expect(screen.getByTestId("online-clock-b")).toHaveTextContent("1:00");
    expect(screen.queryByText("20:00")).not.toBeInTheDocument();
  });

  it("ticks online clocks as a display estimate without using the local chess clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);

    render(
      <ControlPanel
        {...baseProps}
        hasGameStarted
        onlineClock={{
          timeControl: { initialMs: 60_000, incrementMs: 0 },
          remainingMs: { w: 60_000, b: 60_000 },
          activeColor: "w",
          runningSince: 0,
          serverNow: 5_000,
        }}
      />
    );

    expect(screen.getByTestId("online-clock-w")).toHaveTextContent("0:55");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByTestId("online-clock-w")).toHaveTextContent("0:54");
  });

  it("disables play controls when an online result has ended the game", () => {
    render(
      <ControlPanel
        {...baseProps}
        hasGameStarted
        winner="b"
        isOnline
      />
    );

    expect(screen.getByRole("button", { name: "Pass" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resign" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New Game" })).not.toBeDisabled();
  });

  it("disables play controls in read-only spectator mode", () => {
    render(
      <ControlPanel
        {...baseProps}
        isReadOnly
      />
    );

    expect(screen.getByRole("button", { name: "Pass" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resign" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Share" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "New Game" })).not.toBeDisabled();
  });

  it("disables play controls while an online action is waiting for server confirmation", () => {
    render(
      <ControlPanel
        {...baseProps}
        isOnline
        isActionPending
      />
    );

    expect(screen.getByRole("button", { name: "Pass" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resign" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New Game" })).not.toBeDisabled();
  });

  it("can relabel the share control for online invites", () => {
    const onShare = vi.fn();
    render(
      <ControlPanel
        {...baseProps}
        onShare={onShare}
        shareLabel="Copy Invite"
        shareTitle="Copy opponent invite link"
      />
    );

    const shareButton = screen.getByRole("button", { name: "Copy Invite" });
    expect(shareButton).toHaveAttribute("title", "Copy opponent invite link");

    fireEvent.click(shareButton);

    expect(onShare).toHaveBeenCalledOnce();
  });

  it("separates move-enabled opponent invites from read-only spectator links", () => {
    const onCopyOpponentInvite = vi.fn();
    const onCopySpectator = vi.fn();
    const onShare = vi.fn();

    render(
      <ControlPanel
        {...baseProps}
        onShare={onShare}
        onCopyOpponentInvite={onCopyOpponentInvite}
        onCopySpectator={onCopySpectator}
      />
    );

    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();

    const opponentButton = screen.getByRole("button", { name: "Copy Opponent Invite" });
    const spectatorButton = screen.getByRole("button", { name: "Copy Spectator Link" });
    expect(opponentButton).toHaveTextContent("Invite");
    expect(spectatorButton).toHaveTextContent("Spectator Link");
    expect(opponentButton).toHaveAttribute("title", "Copy move-enabled opponent invite link");
    expect(spectatorButton).toHaveAttribute("title", "Copy read-only spectator link");

    fireEvent.click(opponentButton);
    fireEvent.click(spectatorButton);

    expect(onCopyOpponentInvite).toHaveBeenCalledOnce();
    expect(onCopySpectator).toHaveBeenCalledOnce();
    expect(onShare).not.toHaveBeenCalled();
  });

  it("exposes a player visibility control for publishing and unlisting online games", () => {
    const OnlineControlPanel = ControlPanel as React.ComponentType<any>;
    const onUpdateOnlineVisibility = vi.fn();

    const { rerender } = render(
      <OnlineControlPanel
        {...baseProps}
        onlineVisibility="unlisted"
        onUpdateOnlineVisibility={onUpdateOnlineVisibility}
      />
    );

    const publishButton = screen.getByRole("button", { name: "Publish Game to Watch" });
    expect(publishButton).toHaveTextContent("Publish");
    expect(publishButton).toHaveAttribute("title", "List this game in Watch");

    fireEvent.click(publishButton);

    expect(onUpdateOnlineVisibility).toHaveBeenCalledWith("public");

    rerender(
      <OnlineControlPanel
        {...baseProps}
        onlineVisibility="public"
        onUpdateOnlineVisibility={onUpdateOnlineVisibility}
      />
    );

    const unlistButton = screen.getByRole("button", { name: "Remove Game from Watch" });
    expect(unlistButton).toHaveTextContent("Unlist");

    fireEvent.click(unlistButton);

    expect(onUpdateOnlineVisibility).toHaveBeenLastCalledWith("unlisted");
  });
});
