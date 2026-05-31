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
});
