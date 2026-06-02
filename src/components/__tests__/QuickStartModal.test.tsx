import { fireEvent, render, screen } from "@testing-library/react";
import QuickStartModal from "../QuickStartModal";
import { ThemeProvider } from "../../contexts/ThemeContext";

function renderModal(props: Partial<React.ComponentProps<typeof QuickStartModal>> = {}) {
  return render(
    <ThemeProvider>
      <QuickStartModal onClose={vi.fn()} {...props} />
    </ThemeProvider>
  );
}

describe("QuickStartModal", () => {
  it("recommends the tutorial before playing", () => {
    const onOpenTutorial = vi.fn();
    const onClose = vi.fn();
    renderModal({ onOpenTutorial, onClose });

    expect(screen.getByRole("heading", { name: /Welcome to Castles/ })).toBeInTheDocument();
    expect(screen.getByText(/The fastest way to learn is the guided tutorial/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Start Tutorial/ }));
    fireEvent.click(screen.getByRole("button", { name: /Play Anyway/ }));

    expect(onOpenTutorial).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes with Escape", () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
