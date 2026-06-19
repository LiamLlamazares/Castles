import { render, screen } from "@testing-library/react";
import { OnlineAccountDialog } from "../OnlineAccountControls";

describe("OnlineAccountDialog", () => {
  it("states the actual password requirements without inventing number or special-character rules", () => {
    render(
      <OnlineAccountDialog
        isOpen
        onClose={vi.fn()}
        account={null}
        onCreateAccount={vi.fn()}
        onSignInAccount={vi.fn()}
      />
    );

    expect(screen.getByText("Password requirements")).toBeInTheDocument();
    expect(screen.getByText("8-128 characters")).toBeInTheDocument();
    expect(screen.getByText("No control characters")).toBeInTheDocument();
    expect(screen.queryByText(/number/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/special character/i)).not.toBeInTheDocument();
  });
});
