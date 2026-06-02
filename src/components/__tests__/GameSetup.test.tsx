import { fireEvent, render, screen } from "@testing-library/react";
import GameSetup from "../GameSetup";
import { Hex } from "../../Classes/Entities/Hex";
import { Sanctuary } from "../../Classes/Entities/Sanctuary";
import { SanctuaryGenerator } from "../../Classes/Systems/SanctuaryGenerator";
import { SanctuaryType } from "../../Constants";

vi.mock("../../Classes/Services/AssetRegistry", () => ({
  getAssetUrl: (_theme: string, color: string, type: string) => `${color}${type}.svg`,
}));

describe("GameSetup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes the preview sanctuary positions through when starting a game", () => {
    const previewSanctuaries = [
      new Sanctuary(new Hex(-1, 1, 0), SanctuaryType.WolfCovenant, "w"),
      new Sanctuary(new Hex(1, -1, 0), SanctuaryType.WolfCovenant, "b"),
    ];
    vi
      .spyOn(SanctuaryGenerator, "generateRandomSanctuaries")
      .mockReturnValue(previewSanctuaries);

    const onPlay = vi.fn();
    const { container } = render(<GameSetup onPlay={onPlay} />);

    fireEvent.click(screen.getByRole("button", { name: "Play Local" }));

    expect(container.querySelector(".game-setup-shell")).toBeInTheDocument();
    expect(container.querySelector(".setup-preview")).toBeInTheDocument();
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.calls[0][3]).toBe(previewSanctuaries);
    expect(onPlay.mock.calls[0][4]).toEqual([
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring,
    ]);
  });

  it("passes the preview setup through when creating a private online room", () => {
    const previewSanctuaries = [
      new Sanctuary(new Hex(-1, 1, 0), SanctuaryType.WolfCovenant, "w"),
      new Sanctuary(new Hex(1, -1, 0), SanctuaryType.WolfCovenant, "b"),
    ];
    vi
      .spyOn(SanctuaryGenerator, "generateRandomSanctuaries")
      .mockReturnValue(previewSanctuaries);

    const onCreateOnlineGame = vi.fn();
    const { container } = render(<GameSetup onPlay={vi.fn()} onCreateOnlineGame={onCreateOnlineGame} />);

    fireEvent.click(screen.getByRole("button", { name: "Private Link" }));

    expect(container.querySelector(".game-setup-shell")).toBeInTheDocument();
    expect(container.querySelector(".setup-preview")).toBeInTheDocument();
    expect(onCreateOnlineGame).toHaveBeenCalledTimes(1);
    expect(onCreateOnlineGame.mock.calls[0][3]).toBe(previewSanctuaries);
    expect(onCreateOnlineGame.mock.calls[0][4]).toEqual([
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring,
    ]);
  });

  it("passes the preview setup through when creating an open lobby seek", () => {
    const previewSanctuaries = [
      new Sanctuary(new Hex(-1, 1, 0), SanctuaryType.WolfCovenant, "w"),
      new Sanctuary(new Hex(1, -1, 0), SanctuaryType.WolfCovenant, "b"),
    ];
    vi
      .spyOn(SanctuaryGenerator, "generateRandomSanctuaries")
      .mockReturnValue(previewSanctuaries);

    const onCreateOpenSeek = vi.fn();
    render(<GameSetup onPlay={vi.fn()} onCreateOpenSeek={onCreateOpenSeek} />);

    fireEvent.click(screen.getByRole("button", { name: "Create Lobby Listing" }));

    expect(onCreateOpenSeek).toHaveBeenCalledTimes(1);
    expect(onCreateOpenSeek.mock.calls[0][3]).toBe(previewSanctuaries);
    expect(onCreateOpenSeek.mock.calls[0][4]).toEqual([
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring,
    ]);
  });

  it("passes the preview setup through when creating an invite challenge", () => {
    const previewSanctuaries = [
      new Sanctuary(new Hex(-1, 1, 0), SanctuaryType.WolfCovenant, "w"),
      new Sanctuary(new Hex(1, -1, 0), SanctuaryType.WolfCovenant, "b"),
    ];
    vi
      .spyOn(SanctuaryGenerator, "generateRandomSanctuaries")
      .mockReturnValue(previewSanctuaries);

    const onCreateOnlineChallenge = vi.fn();
    render(<GameSetup onPlay={vi.fn()} onCreateOnlineChallenge={onCreateOnlineChallenge} />);

    fireEvent.click(screen.getByRole("button", { name: "Invite Friend" }));

    expect(onCreateOnlineChallenge).toHaveBeenCalledTimes(1);
    expect(onCreateOnlineChallenge.mock.calls[0][3]).toBe(previewSanctuaries);
    expect(onCreateOnlineChallenge.mock.calls[0][4]).toEqual([
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring,
    ]);
  });

  it("orders setup actions around local play, invite, matchmaking, then private links", () => {
    render(
      <GameSetup
        onPlay={vi.fn()}
        onCreateOnlineChallenge={vi.fn()}
        onCreateOpenSeek={vi.fn()}
        onCreateOnlineGame={vi.fn()}
      />
    );

    const actionLabels = Array.from(
      screen.getByRole("group", { name: "Game actions" }).querySelectorAll(".setup-action-button")
    ).map((element) => element.textContent?.trim());

    expect(actionLabels).toEqual(["Play Local", "Invite Friend", "Create Lobby Listing", "Private Link"]);
  });

  it("exposes shared play navigation without hiding play actions", () => {
    const onBack = vi.fn();
    const onTutorial = vi.fn();
    const onOpenLibrary = vi.fn();
    const onOpenOnlineBrowser = vi.fn();

    render(
      <GameSetup
        onPlay={vi.fn()}
        onBack={onBack}
        backLabel="Back to current game"
        onTutorial={onTutorial}
        onOpenLibrary={onOpenLibrary}
        onOpenOnlineBrowser={onOpenOnlineBrowser}
      />
    );

    const nav = screen.getByRole("navigation", { name: "Play navigation" });
    const destinations = Array.from(nav.querySelectorAll(".app-shell-destination"))
      .map((element) => element.textContent?.trim());
    expect(nav).toContainElement(screen.getByRole("button", { name: "Back to current game" }));
    expect(destinations).toEqual(["Play", "Tutorial", "Online", "Library"]);
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Back to current game" }));
    fireEvent.click(screen.getByRole("button", { name: "Tutorial" }));
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Online" }));

    const actionGroup = screen.getByRole("group", { name: "Game actions" });
    expect(actionGroup).toContainElement(screen.getByRole("button", { name: "Play Local" }));

    expect(screen.getByRole("button", { name: "Play Local" })).toBeInTheDocument();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onTutorial).toHaveBeenCalledOnce();
    expect(onOpenLibrary).toHaveBeenCalledOnce();
    expect(onOpenOnlineBrowser).toHaveBeenCalledOnce();
  });
});
