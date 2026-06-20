import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OnlineAccountDialog } from "../OnlineAccountControls";
import { ONLINE_PROTOCOL_VERSION } from "../../online/protocolVersion";

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

  it("offers password recovery only through an existing verified sign-in method", async () => {
    render(
      <OnlineAccountDialog
        isOpen
        onClose={vi.fn()}
        account={null}
        onCreateAccount={vi.fn()}
        onSignInAccount={vi.fn()}
        loadAccountOAuthProviders={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          providers: [{ provider: "google", enabled: true, startUrl: "/api/online/account/oauth/google/start" }],
        })}
      />
    );

    await waitFor(() => expect(screen.getByRole("link", { name: "Continue with Google" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(screen.getByRole("region", { name: "Password recovery options" })).toHaveTextContent(
      "continue with Google"
    );
    expect(screen.getByRole("link", { name: "Recover with Google" })).toHaveAttribute(
      "href",
      expect.stringContaining("returnTo=")
    );
    expect(screen.getByText(/Password-only accounts do not yet have a verified recovery email/i)).toBeInTheDocument();
  });
});
