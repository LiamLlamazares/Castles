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
    onSaveGameToLibrary: vi.fn(),
    onTutorial: vi.fn(),
    ...overrides,
  };

  const result = render(
    <ThemeProvider>
      <HamburgerMenu {...props} />
    </ThemeProvider>
  );

  return { ...result, props };
};

describe("HamburgerMenu", () => {
  it("promotes primary navigation actions and closes after a navigation action", () => {
    const { container, props } = renderMenu();

    expect(screen.queryByRole("button", { name: "New Game" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getByRole("button", { name: "New Game" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Game" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Game Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tutorial" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New Game" }));

    expect(props.onNewGame).toHaveBeenCalledOnce();
    expect(container.querySelector(".hamburger-menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Game" })).not.toBeInTheDocument();
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
});
