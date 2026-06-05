import { fireEvent, render, screen } from "@testing-library/react";
import AppShellNav from "../AppShellNav";

describe("AppShellNav", () => {
  it("renders a stable app navigation row with a labelled back action", () => {
    const onBack = vi.fn();
    const onOnline = vi.fn();

    render(
      <AppShellNav
        ariaLabel="Play navigation"
        activeDestination="play"
        title="Play"
        kicker="Game setup"
        description="Choose how this Castles game starts."
        backLabel="Back to current game"
        onBack={onBack}
        destinations={[
          { id: "play", label: "Play" },
          { id: "learn", label: "Tutorial", onClick: vi.fn() },
          { id: "library", label: "Library", onClick: vi.fn() },
          { id: "online", label: "Online", onClick: onOnline },
        ]}
      />
    );

    const nav = screen.getByRole("navigation", { name: "Play navigation" });
    expect(nav.querySelector(".app-shell-nav-primary")).toBeInTheDocument();
    expect(screen.getByText("Castles")).toBeInTheDocument();
    expect(nav).toContainElement(screen.getByRole("button", { name: "Back to current game" }));
    expect(nav).toContainElement(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Online" })).toHaveAttribute("title", "Online");
    expect(nav.querySelectorAll(".app-shell-destination-icon")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Online" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to current game" }));

    expect(onOnline).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
