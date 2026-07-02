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
  beforeEach(() => {
    window.localStorage.clear();
  });

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

  it("passes the preview setup through when listing in the public lobby", () => {
    const previewSanctuaries = [
      new Sanctuary(new Hex(-1, 1, 0), SanctuaryType.WolfCovenant, "w"),
      new Sanctuary(new Hex(1, -1, 0), SanctuaryType.WolfCovenant, "b"),
    ];
    vi
      .spyOn(SanctuaryGenerator, "generateRandomSanctuaries")
      .mockReturnValue(previewSanctuaries);

    const onCreateOpenSeek = vi.fn();
    render(<GameSetup onPlay={vi.fn()} onCreateOpenSeek={onCreateOpenSeek} />);

    fireEvent.click(screen.getByRole("button", { name: "List in Lobby" }));

    expect(onCreateOpenSeek).toHaveBeenCalledTimes(1);
    expect(onCreateOpenSeek.mock.calls[0][3]).toBe(previewSanctuaries);
    expect(onCreateOpenSeek.mock.calls[0][4]).toEqual([
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring,
    ]);
    expect(onCreateOpenSeek.mock.calls[0][9]).toBe("casual");
  });

  it("passes rated mode through online setup actions", () => {
    const onPlay = vi.fn();
    const onCreateOpenSeek = vi.fn();
    const onCreateOnlineChallenge = vi.fn();
    render(
      <GameSetup
        onPlay={onPlay}
        onCreateOpenSeek={onCreateOpenSeek}
        onCreateOnlineChallenge={onCreateOnlineChallenge}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Rated" }));
    fireEvent.click(screen.getByRole("button", { name: "Play Local" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Setup Challenge Link" }));
    fireEvent.click(screen.getByRole("button", { name: "List in Lobby" }));

    expect(onPlay.mock.calls[0][10]).toBe("rated");
    expect(onCreateOnlineChallenge.mock.calls[0][9]).toBe("rated");
    expect(onCreateOpenSeek.mock.calls[0][9]).toBe("rated");
  });

  it("uses the saved piece-set preference for new setup actions", () => {
    window.localStorage.setItem("castles-piece-theme", "Chess");
    const onPlay = vi.fn();
    render(<GameSetup onPlay={onPlay} />);

    expect(screen.getByDisplayValue("Chess")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play Local" }));

    expect(onPlay.mock.calls[0][8]).toBe("Chess");
  });

  it("persists setup choices and hydrates them on the next setup visit", () => {
    const onPlay = vi.fn();
    const { unmount } = render(<GameSetup onPlay={onPlay} />);

    fireEvent.click(screen.getByRole("button", { name: "quick" }));
    fireEvent.click(screen.getByRole("button", { name: "Rated" }));
    fireEvent.click(screen.getByRole("button", { name: "Play Local" }));

    expect(onPlay.mock.calls[0][0].config.nSquares).toBe(5);
    expect(onPlay.mock.calls[0][10]).toBe("rated");

    unmount();
    const hydratedPlay = vi.fn();
    render(<GameSetup onPlay={hydratedPlay} />);

    fireEvent.click(screen.getByRole("button", { name: "Play Local" }));

    expect(hydratedPlay.mock.calls[0][0].config.nSquares).toBe(5);
    expect(hydratedPlay.mock.calls[0][10]).toBe("rated");
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

    fireEvent.click(screen.getByRole("button", { name: "Copy Setup Challenge Link" }));

    expect(onCreateOnlineChallenge).toHaveBeenCalledTimes(1);
    expect(onCreateOnlineChallenge.mock.calls[0][3]).toBe(previewSanctuaries);
    expect(onCreateOnlineChallenge.mock.calls[0][4]).toEqual([
      SanctuaryType.WolfCovenant,
      SanctuaryType.SacredSpring,
    ]);
  });

  it("labels the generic setup challenge as a link and points friend games to People", () => {
    render(
      <GameSetup
        onPlay={vi.fn()}
        onCreateOnlineChallenge={vi.fn()}
        onCreateOpenSeek={vi.fn()}
      />
    );

    const actionLabels = Array.from(
      screen.getByRole("group", { name: "Game actions" }).querySelectorAll(".setup-action-button")
    ).map((element) => element.textContent?.trim());

    expect(actionLabels).toEqual(["Play Local", "Copy Setup Challenge Link", "List in Lobby"]);
    expect(screen.queryByRole("button", { name: "Private Link" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Setup Challenge Link" })).toHaveAttribute(
      "title",
      "Create a setup challenge link. For friend games, use People or a profile Challenge button."
    );
    expect(screen.getByRole("button", { name: "List in Lobby" })).toHaveAttribute(
      "title",
      "List this setup in the public lobby"
    );
  });

  it("exposes shared play navigation without hiding play actions", () => {
    const onBack = vi.fn();
    const onTutorial = vi.fn();
    const onOpenLibrary = vi.fn();
    const onOpenOnlineBrowser = vi.fn();
    const onOpenPeople = vi.fn();
    const onOpenProfile = vi.fn();

    render(
      <GameSetup
        onPlay={vi.fn()}
        onBack={onBack}
        backLabel="Back to current game"
        onTutorial={onTutorial}
        onOpenLibrary={onOpenLibrary}
        onOpenOnlineBrowser={onOpenOnlineBrowser}
        onOpenPeople={onOpenPeople}
        onOpenProfile={onOpenProfile}
      />
    );

    const nav = screen.getByRole("navigation", { name: "Play navigation" });
    const destinations = Array.from(nav.querySelectorAll(".app-shell-destination"))
      .map((element) => element.textContent?.trim());
    expect(nav).toContainElement(screen.getByRole("button", { name: "Back to current game" }));
    expect(destinations).toEqual(["Play", "Tutorial", "Online", "People", "Profile", "Library"]);
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Back to current game" }));
    fireEvent.click(screen.getByRole("button", { name: "Tutorial" }));
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    fireEvent.click(screen.getByRole("button", { name: "People" }));
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Online" }));

    const actionGroup = screen.getByRole("group", { name: "Game actions" });
    expect(actionGroup).toContainElement(screen.getByRole("button", { name: "Play Local" }));

    expect(screen.getByRole("button", { name: "Play Local" })).toBeInTheDocument();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onTutorial).toHaveBeenCalledOnce();
    expect(onOpenProfile).toHaveBeenCalledOnce();
    expect(onOpenPeople).toHaveBeenCalledOnce();
    expect(onOpenLibrary).toHaveBeenCalledOnce();
    expect(onOpenOnlineBrowser).toHaveBeenCalledOnce();
  });
});
