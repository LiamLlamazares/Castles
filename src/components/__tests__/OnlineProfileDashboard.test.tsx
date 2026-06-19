import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OnlineProfileDashboard from "../OnlineProfileDashboard";
import { OnlineRequestError } from "../../online/client";
import { ONLINE_PROTOCOL_VERSION } from "../../online/protocolVersion";
import { ONLINE_GAME_DIRECTORY_SCHEMA_VERSION } from "../../online/readModel";
import { ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION } from "../../online/challenges";
import type { OnlineAccount } from "../../online/accounts";
import type { OnlineAccountPublicProfile } from "../../online/social";

function account(displayName = "Liam"): OnlineAccount {
  return {
    schemaVersion: 1,
    accountId: `account_${displayName.toLowerCase()}`,
    displayName,
    createdAt: "2026-06-14T12:00:00.000Z",
    updatedAt: "2026-06-14T12:00:00.000Z",
    identity: { kind: "registered", id: `account_${displayName.toLowerCase()}`, displayName },
  };
}

function profile(displayName: string, options: Partial<OnlineAccountPublicProfile> = {}): OnlineAccountPublicProfile {
  return {
    schemaVersion: 1,
    displayName,
    presence: { visibility: "hidden", status: null },
    relationship: { self: false, following: false, followedBy: false, blocked: false },
    ...options,
  };
}

describe("OnlineProfileDashboard", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("loads a signed-in self dashboard with empty account states and sanitized controls", async () => {
    const liam = account("Liam");
    const updateAccountPrivacy = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      privacy: {
        schemaVersion: 1,
        followPolicy: "everyone",
        presencePolicy: "everyone",
        challengePolicy: "followed",
        updatedAt: "2026-06-14T12:05:00.000Z",
      },
    });
    const updateAccountPassword = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      passwordEnabled: true,
    });

    render(
      <OnlineProfileDashboard
        displayName="Liam"
        account={liam}
        loadProfile={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: profile("Liam", {
            rating: {
              schemaVersion: 1,
              rating: 1620,
              display: "1620?",
              provisional: true,
              games: 4,
              updatedAt: "2026-06-14T12:00:00.000Z",
            },
            relationship: { self: true, following: false, followedBy: false, blocked: false },
          }),
        })}
        loadAccountGames={vi.fn().mockResolvedValue({
          schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
          games: [],
        })}
        loadAccountChallenges={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          schemaVersion: ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION,
          challenges: [],
        })}
        loadAccountFollowing={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          following: [],
        })}
        loadAccountPrivacy={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          privacy: {
            schemaVersion: 1,
            followPolicy: "everyone",
            presencePolicy: "followed",
            challengePolicy: "followed",
            updatedAt: null,
          },
        })}
        updateAccountPrivacy={updateAccountPrivacy}
        updateAccountPassword={updateAccountPassword}
        loadAccountSessions={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          sessions: [],
        })}
      />
    );

    expect(await screen.findByRole("heading", { name: "Liam" })).toBeInTheDocument();
    expect(screen.getByText("Profile Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Rating 1620?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Games" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rating" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(await screen.findByText("No account games yet.")).toBeInTheDocument();
    expect(screen.getByText("0 challenges visible to this account.")).toBeInTheDocument();
    expect(screen.getByText("0 followed players.")).toBeInTheDocument();
    expect(screen.queryByText("Who can see me online")).not.toBeInTheDocument();
    expect(screen.queryByText("0 active sessions.")).not.toBeInTheDocument();
    expect(screen.queryByText("account_liam")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("My Games")).not.toBeInTheDocument();
    expect(screen.getByText("Follows everyone; status followed; challenges followed")).toBeInTheDocument();
    expect(screen.getByText("0 active sessions.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Who can see me online"), {
      target: { value: "everyone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Privacy" }));
    await waitFor(() => expect(updateAccountPrivacy).toHaveBeenCalledWith({
      followPolicy: "everyone",
      presencePolicy: "everyone",
      challengePolicy: "followed",
    }));
    expect(await screen.findByText("Privacy settings saved.")).toBeInTheDocument();
    expect(screen.getByText("Leave current password blank if this account does not have a local password yet.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Password" }));
    await waitFor(() => expect(updateAccountPassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password",
    }));
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "first-local-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Password" }));
    await waitFor(() => expect(updateAccountPassword).toHaveBeenLastCalledWith({
      newPassword: "first-local-password",
    }));
  });

  it("syncs profile section tabs with the URL and browser navigation", async () => {
    window.history.replaceState({}, "", "/?profile=Liam");

    render(
      <OnlineProfileDashboard
        displayName="Liam"
        account={account("Liam")}
        loadProfile={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: profile("Liam", {
            relationship: { self: true, following: false, followedBy: false, blocked: false },
          }),
        })}
      />
    );

    expect(await screen.findByRole("heading", { name: "Liam" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Games" }));
    expect(screen.getByRole("button", { name: "Games" })).toHaveAttribute("aria-pressed", "true");
    expect(new URL(window.location.href).searchParams.get("section")).toBe("games");

    fireEvent.click(screen.getByRole("button", { name: "Summary" }));
    expect(screen.getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", "true");
    expect(new URL(window.location.href).searchParams.has("section")).toBe(false);

    window.history.pushState({}, "", "/?profile=Liam&section=rating");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Rating" })).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("preserves trusted Settings rejection messages", async () => {
    const liam = account("Liam");
    const updateAccountPrivacy = vi.fn().mockRejectedValue(
      new OnlineRequestError(403, "not_allowed", "Privacy settings cannot be changed right now.")
    );
    const updateAccountPassword = vi.fn().mockRejectedValue(
      new OnlineRequestError(401, "unauthorized", "Current password is incorrect.")
    );

    render(
      <OnlineProfileDashboard
        displayName="Liam"
        account={liam}
        loadProfile={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: profile("Liam", {
            relationship: { self: true, following: false, followedBy: false, blocked: false },
          }),
        })}
        loadAccountPrivacy={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          privacy: {
            schemaVersion: 1,
            followPolicy: "everyone",
            presencePolicy: "followed",
            challengePolicy: "followed",
            updatedAt: null,
          },
        })}
        updateAccountPrivacy={updateAccountPrivacy}
        updateAccountPassword={updateAccountPassword}
      />
    );

    expect(await screen.findByRole("heading", { name: "Liam" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.change(screen.getByLabelText("Who can see me online"), {
      target: { value: "everyone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Privacy" }));
    await waitFor(() => expect(updateAccountPrivacy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Privacy settings cannot be changed right now.")).toBeInTheDocument();
    expect(screen.queryByText("Privacy settings could not be saved.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Password" }));
    await waitFor(() => expect(updateAccountPassword).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(screen.queryByText("Password could not be updated.")).not.toBeInTheDocument();
  });

  it("surfaces provisional starting ratings as a real account state", async () => {
    render(
      <OnlineProfileDashboard
        displayName="Testing"
        account={account("Testing")}
        loadProfile={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: profile("Testing", {
            rating: {
              schemaVersion: 1,
              rating: 1500,
              display: "1500?",
              provisional: true,
              games: 0,
              updatedAt: null,
            },
            relationship: { self: true, following: false, followedBy: false, blocked: false },
          }),
        })}
      />
    );

    expect(await screen.findByText("Rating 1500?")).toBeInTheDocument();
    expect(screen.getByText("0 rated games")).toBeInTheDocument();
    expect(screen.queryByText(/unrated/i)).not.toBeInTheDocument();
  });

  it("keeps public profiles shareable without private dashboard sections", async () => {
    const loadAccountGames = vi.fn();
    window.history.replaceState({}, "", "/?profile=Samir&section=settings");

    render(
      <OnlineProfileDashboard
        displayName="Samir"
        loadProfile={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: profile("Samir", {
            rating: {
              schemaVersion: 1,
              rating: 1510,
              display: "1510",
              provisional: false,
              games: 18,
              updatedAt: "2026-06-14T12:00:00.000Z",
            },
          }),
        })}
        loadAccountGames={loadAccountGames}
      />
    );

    expect(await screen.findByRole("heading", { name: "Samir" })).toBeInTheDocument();
    expect(screen.getByText("Public Profile")).toBeInTheDocument();
    expect(screen.getByText("Rating 1510")).toBeInTheDocument();
    expect(screen.getByText("18 rated games")).toBeInTheDocument();
    expect(screen.queryByText("Challenge Inbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Account Sessions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", "true");
    expect(new URL(window.location.href).searchParams.has("section")).toBe(false);
    expect(loadAccountGames).not.toHaveBeenCalled();
  });

  it("searches players with suggestions and opens a selected public profile", async () => {
    const searchProfiles = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profiles: [
        {
          schemaVersion: 1,
          displayName: "Liam",
          rating: {
            schemaVersion: 1,
            rating: 1500,
            display: "1500?",
            provisional: true,
            games: 0,
            updatedAt: null,
          },
        },
        {
          schemaVersion: 1,
          displayName: "Liana",
          rating: {
            schemaVersion: 1,
            rating: 1500,
            display: "1500?",
            provisional: true,
            games: 0,
            updatedAt: null,
          },
        },
      ],
    });
    const onOpenProfile = vi.fn();

    render(
      <OnlineProfileDashboard
        displayName="Liam"
        account={account("Liam")}
        loadProfile={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: profile("Liam", { relationship: { self: true, following: false, followedBy: false, blocked: false } }),
        })}
        searchProfiles={searchProfiles}
        onOpenProfile={onOpenProfile}
      />
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search players" }), {
      target: { value: "lia" },
    });

    await waitFor(() => expect(searchProfiles).toHaveBeenCalledWith("lia"));
    const liana = await screen.findByRole("option", { name: "Liana rating 1500?" });
    fireEvent.click(liana);
    expect(onOpenProfile).toHaveBeenCalledWith("Liana");
  });

  it("shows a bounded error state when a profile cannot load", async () => {
    render(
      <OnlineProfileDashboard
        displayName="Missing"
        loadProfile={vi.fn().mockRejectedValue(new Error("not found"))}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Profile unavailable.");
    await waitFor(() => {
      expect(screen.queryByText("not found")).not.toBeInTheDocument();
    });
  });
});
