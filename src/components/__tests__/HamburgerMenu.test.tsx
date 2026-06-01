import { fireEvent, render, screen } from "@testing-library/react";
import HamburgerMenu from "../HamburgerMenu";
import { ThemeProvider } from "../../contexts/ThemeContext";

const renderMenu = (overrides: Partial<React.ComponentProps<typeof HamburgerMenu>> = {}) => {
  const props: React.ComponentProps<typeof HamburgerMenu> & {
    onNewGame?: () => void;
  } = {
    onExportPGN: vi.fn(),
    onImportPGN: vi.fn(),
    onFlipBoard: vi.fn(),
    onToggleCoordinates: vi.fn(),
    onShowRules: vi.fn(),
    onNewGame: vi.fn(),
      onOpenLibrary: vi.fn(),
      onOpenOnlineBrowser: vi.fn(),
      onSaveGameToLibrary: vi.fn(),
      onTutorial: vi.fn(),
      onOpenChange: vi.fn(),
      ...overrides,
    };

  const result = render(
    <ThemeProvider>
      <HamburgerMenu {...props} />
    </ThemeProvider>
  );

  return { ...result, props };
};

const menuProps = (overrides: Partial<React.ComponentProps<typeof HamburgerMenu>> = {}) => ({
  onExportPGN: vi.fn(),
  onImportPGN: vi.fn(),
  onFlipBoard: vi.fn(),
  onToggleCoordinates: vi.fn(),
  onShowRules: vi.fn(),
  onNewGame: vi.fn(),
  onOpenLibrary: vi.fn(),
  onOpenOnlineBrowser: vi.fn(),
  onSaveGameToLibrary: vi.fn(),
  onTutorial: vi.fn(),
  onOpenChange: vi.fn(),
  ...overrides,
});

describe("HamburgerMenu", () => {
  it("promotes primary navigation actions and closes after a navigation action", () => {
    const { container, props } = renderMenu();

    expect(screen.queryByRole("button", { name: "New Game" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getByRole("button", { name: "New Game" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Game" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Game Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Online Lobby" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Learn" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tutorial" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Play" })).toContainElement(screen.getByRole("button", { name: "New Game" }));
    expect(screen.getByRole("region", { name: "Online" })).toContainElement(screen.getByRole("button", { name: "Online Lobby" }));
    expect(screen.getByRole("region", { name: "Library" })).toContainElement(screen.getByRole("button", { name: "Game Library" }));
    expect(screen.getByRole("region", { name: "Learn" })).toContainElement(screen.getByRole("button", { name: "Learn" }));

    fireEvent.click(screen.getByRole("button", { name: "New Game" }));

    expect(props.onNewGame).toHaveBeenCalledOnce();
    expect(container.querySelector(".hamburger-menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Game" })).not.toBeInTheDocument();
  });

  it("orders primary drawer destinations consistently before board tools", () => {
    renderMenu({
      onEnableAnalysis: vi.fn(),
      onEditPosition: vi.fn(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const sectionLabels = Array.from(document.querySelectorAll(".menu-section-label"))
      .map((element) => element.textContent?.trim());

    expect(sectionLabels.slice(0, 6)).toEqual([
      "Play",
      "Learn",
      "Online",
      "Library",
      "Board",
      "Tools",
    ]);
  });

  it("keeps save, learning, and secondary tools in their intended sections", () => {
    renderMenu({
      onEnableAnalysis: vi.fn(),
      onEditPosition: vi.fn(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getByRole("region", { name: "Learn" })).toContainElement(screen.getByRole("button", { name: "Learn" }));
    expect(screen.getByRole("region", { name: "Learn" })).toContainElement(screen.getByRole("button", { name: "Rules" }));
    expect(screen.getByRole("region", { name: "Library" })).toContainElement(screen.getByRole("button", { name: "Save Game" }));
    expect(screen.getByRole("region", { name: "Library" })).toContainElement(screen.getByRole("button", { name: "Game Library" }));
    expect(screen.getByRole("region", { name: "Board" })).toContainElement(screen.getByRole("button", { name: "Flip Board" }));
    expect(screen.getByRole("region", { name: "Tools" })).toContainElement(screen.getByRole("button", { name: "Analysis Board" }));
    expect(screen.getByText("Lessons and rules")).toBeInTheDocument();
    expect(screen.getByText("Saved games")).toBeInTheDocument();
  });

  it("uses non-text icon markers for drawer items and keeps the full menu scrollable", () => {
    const { container } = renderMenu({
      onEnableAnalysis: vi.fn(),
      onEditPosition: vi.fn(),
      onToggleTerrainIcons: vi.fn(),
      onToggleSanctuaryIcons: vi.fn(),
      onToggleShields: vi.fn(),
      onToggleCastleRecruitment: vi.fn(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const iconText = Array.from(container.querySelectorAll(".menu-item-icon"))
      .map((element) => element.textContent?.trim())
      .filter(Boolean);
    expect(iconText).toEqual([]);
    expect(container.querySelector(".menu-items")).toHaveClass("menu-items");
    expect(screen.getByRole("button", { name: "Icon Settings" })).toBeInTheDocument();
  });

  it("uses real checkbox controls for icon settings without nesting them in buttons", () => {
    const { container, props } = renderMenu({
      onToggleTerrainIcons: vi.fn(),
      onToggleSanctuaryIcons: vi.fn(),
      onToggleShields: vi.fn(),
      onToggleCastleRecruitment: vi.fn(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: /Icon Settings/i }));

    const coordinates = screen.getByRole("checkbox", { name: "Coordinates" });
    fireEvent.click(coordinates);

    expect(props.onToggleCoordinates).toHaveBeenCalledOnce();
    expect(coordinates.closest("button")).toBeNull();
    expect(container.querySelectorAll(".menu-toggle-item input[type='checkbox']")).toHaveLength(5);
  });

  it("reports drawer open state for shell-level overlap handling", () => {
    const { props } = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(props.onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(props.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("closes with Escape and keeps icon toggles open", () => {
    const { container, props } = renderMenu({
      onToggleTerrainIcons: vi.fn(),
      onToggleSanctuaryIcons: vi.fn(),
      onToggleShields: vi.fn(),
      onToggleCastleRecruitment: vi.fn(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: /Icon Settings/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Coordinates" }));

    expect(props.onToggleCoordinates).toHaveBeenCalledOnce();
    expect(container.querySelector(".hamburger-menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(container.querySelector(".hamburger-menu")).not.toBeInTheDocument();
    expect(props.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("focuses the drawer, traps Tab, and restores focus to the menu button", () => {
    renderMenu();

    const menuButton = screen.getByRole("button", { name: "Menu" });
    menuButton.focus();
    fireEvent.click(menuButton);

    expect(screen.getByRole("dialog", { name: "Castles menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();
    expect(menuButton).toHaveAttribute("aria-hidden", "true");
    expect(menuButton).toHaveAttribute("inert", "");
    expect(menuButton).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Icon Settings" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(menuButton).toHaveFocus();
    expect(menuButton).not.toHaveAttribute("aria-hidden");
    expect(menuButton).not.toHaveAttribute("inert");
    expect(menuButton).not.toHaveAttribute("tabindex", "-1");
  });

  it("wraps forward Tab from the last drawer control back to the close button", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const lastControl = screen.getByRole("button", { name: "Icon Settings" });
    lastControl.focus();

    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();
  });

  it("recovers forward Tab when focus is forced outside the open drawer", () => {
    renderMenu();

    const menuButton = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(menuButton);
    menuButton.focus();

    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();
  });

  it("inerts background siblings while the drawer is open and restores them after close", () => {
    render(
      <ThemeProvider>
        <div>
          <button type="button">Outside action</button>
          <HamburgerMenu {...menuProps()} />
        </div>
      </ThemeProvider>
    );

    const outsideAction = screen.getByRole("button", { name: "Outside action" });
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    expect(outsideAction).toHaveAttribute("aria-hidden", "true");
    expect(outsideAction).toHaveAttribute("inert", "");

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));

    expect(outsideAction).not.toHaveAttribute("aria-hidden");
    expect(outsideAction).not.toHaveAttribute("inert");
  });

  it("inerts app-level siblings outside the game shell while the drawer is open", () => {
    render(
      <ThemeProvider>
        <div>
          <main>
            <section>
              <button type="button">Board action</button>
              <HamburgerMenu {...menuProps()} />
            </section>
          </main>
          <aside aria-label="Install prompt">
            <button type="button">Install app</button>
          </aside>
        </div>
      </ThemeProvider>
    );

    const boardAction = screen.getByRole("button", { name: "Board action" });
    const installPrompt = screen.getByLabelText("Install prompt");
    const installAction = screen.getByRole("button", { name: "Install app" });

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    expect(boardAction).toHaveAttribute("aria-hidden", "true");
    expect(boardAction).toHaveAttribute("inert", "");
    expect(installPrompt).toHaveAttribute("aria-hidden", "true");
    expect(installPrompt).toHaveAttribute("inert", "");

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));

    expect(boardAction).not.toHaveAttribute("aria-hidden");
    expect(boardAction).not.toHaveAttribute("inert");
    expect(installPrompt).not.toHaveAttribute("aria-hidden");
    expect(installPrompt).not.toHaveAttribute("inert");
    expect(installAction).toBeInTheDocument();
  });
});
