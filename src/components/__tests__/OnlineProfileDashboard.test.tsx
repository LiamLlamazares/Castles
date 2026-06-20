import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OnlineProfileDashboard from "../OnlineProfileDashboard";
import { OnlineRequestError } from "../../online/client";
import { ONLINE_PROTOCOL_VERSION } from "../../online/protocolVersion";
import { ONLINE_GAME_DIRECTORY_SCHEMA_VERSION, ONLINE_GAME_SUMMARY_SCHEMA_VERSION } from "../../online/readModel";
import { ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION } from "../../online/challenges";
import type { OnlineAccount } from "../../online/accounts";
import type { OnlineAccountPublicProfile } from "../../online/social";
import type { OnlineGameSummary } from "../../online/readModel";

const TINY_AVATAR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

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
    avatar: { schemaVersion: 1, preset: "monarch", color: "green" },
    presence: { visibility: "hidden", status: null },
    relationship: { self: false, following: false, followedBy: false, blocked: false },
    ...options,
  };
}

function publicGame(overrides: Partial<OnlineGameSummary> = {}): OnlineGameSummary {
  return {
    schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
    gameId: "game_public_samir_liam",
    rulesetVersion: "castles-beta-v1",
    createdAt: "2026-06-14T12:00:00.000Z",
    updatedAt: "2026-06-14T12:08:00.000Z",
    endedAt: "2026-06-14T12:08:00.000Z",
    version: 4,
    status: "complete",
    visibility: "public",
    archiveState: "archived",
    hasTimeControl: false,
    ratingMode: "rated",
    participants: [
      { seat: "w", role: "white", identity: { kind: "registered", id: "account_samir", displayName: "Samir" } },
      { seat: "b", role: "black", identity: { kind: "registered", id: "account_liam", displayName: "Liam" } },
    ],
    result: { winner: "w", reason: "resignation" },
    livePreview: {
      sideToMove: "b",
      turnPhase: "Movement",
      moveCount: 4,
      lastMove: { notation: "G13G12", turnNumber: 2, color: "w", phase: "Movement" },
      boardPreview: {
        radius: 6,
        pieces: [],
        castles: [],
      },
    },
    lastEventId: "evt_public_samir_liam",
    ...overrides,
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
    const onSignOutAllAccountSessions = vi.fn().mockResolvedValue(undefined);
    const onDeleteAccount = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
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
        onSignOutAllAccountSessions={onSignOutAllAccountSessions}
        onDeleteAccount={onDeleteAccount}
        loadAccountSessions={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          sessions: [],
        })}
        loadAccountRatingHistory={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          schemaVersion: 1,
          entries: [
            {
              schemaVersion: 1,
              gameId: "game_rated_1",
              side: "b",
              opponentDisplayName: "Samir",
              result: "win",
              reason: "resignation",
              ratingBefore: 1500,
              ratingAfter: 1620,
              ratingDelta: 120,
              games: 4,
              provisional: true,
              appliedAt: "2026-06-14T12:00:00.000Z",
            },
          ],
        })}
        onOpenProfile={vi.fn()}
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
    expect(screen.getByRole("img", { name: "Rating history graph" })).toBeInTheDocument();
    expect(container.querySelector(".online-profile-rating-chart polyline")).toBeInTheDocument();
    expect(screen.getByText("Rating History")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Samir profile from rating history game_rated_1" })).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    expect(screen.queryByText("Who can see me online")).not.toBeInTheDocument();
    expect(screen.queryByText("0 active sessions.")).not.toBeInTheDocument();
    expect(screen.queryByText("account_liam")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("My Games")).not.toBeInTheDocument();
    expect(screen.getByText("Follows everyone; status followed; challenges followed")).toBeInTheDocument();
    expect(screen.getByText("0 active sessions.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Out Everywhere" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();

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

  it("lets signed-in players choose a built-in avatar from Profile Settings", async () => {
    const liam = account("Liam");
    const updateAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: profile("Liam", {
        avatar: { schemaVersion: 1, preset: "dragon", color: "violet" },
        relationship: { self: true, following: false, followedBy: false, blocked: false },
      }),
    });

    render(
      <OnlineProfileDashboard
        displayName="Liam"
        account={liam}
        loadProfile={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: profile("Liam", {
            avatar: { schemaVersion: 1, preset: "monarch", color: "green" },
            relationship: { self: true, following: false, followedBy: false, blocked: false },
          }),
        })}
        updateAccountProfile={updateAccountProfile}
      />
    );

    expect(await screen.findByRole("img", { name: "Liam profile avatar, monarch on green" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("radio", { name: "Dragon avatar" }));
    fireEvent.click(screen.getByRole("radio", { name: "Violet avatar color" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Avatar" }));

    await waitFor(() => expect(updateAccountProfile).toHaveBeenCalledWith({
      avatar: { schemaVersion: 1, preset: "dragon", color: "violet" },
    }));
    expect(await screen.findByText("Avatar saved.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Liam profile avatar, dragon on violet" })).toBeInTheDocument();
  });

  it("renders uploaded profile pictures and keeps the upload control in Profile Settings", async () => {
    render(
      <OnlineProfileDashboard
        displayName="Liam"
        account={account("Liam")}
        loadProfile={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: profile("Liam", {
            avatar: { schemaVersion: 1, imageDataUrl: TINY_AVATAR_DATA_URL },
            relationship: { self: true, following: false, followedBy: false, blocked: false },
          }),
        })}
        updateAccountProfile={vi.fn()}
      />
    );

    const avatar = await screen.findByRole("img", { name: "Liam uploaded profile picture" });
    expect(avatar.querySelector("img")).toHaveAttribute("src", TINY_AVATAR_DATA_URL);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Upload PNG, JPEG, or WebP")).toHaveAttribute("type", "file");
    expect(screen.getByRole("radio", { name: "Monarch avatar" })).not.toBeChecked();
  });

  it("signs out all account sessions from Profile Settings", async () => {
    const onSignOutAllAccountSessions = vi.fn().mockResolvedValue(undefined);

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
        loadAccountSessions={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          sessions: [
            {
              sessionId: "account_session_current",
              createdAt: "2026-06-03T12:00:00.000Z",
              lastUsedAt: "2026-06-03T12:05:00.000Z",
              current: true,
            },
          ],
        })}
        onSignOutAllAccountSessions={onSignOutAllAccountSessions}
      />
    );

    expect(await screen.findByRole("heading", { name: "Liam" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("1 active session.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign Out Everywhere" }));

    await waitFor(() => expect(onSignOutAllAccountSessions).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Signed out everywhere.")).toBeInTheDocument();
  });

  it("confirms account deletion from Profile Settings and preserves trusted errors", async () => {
    const onDeleteAccount = vi.fn().mockRejectedValue(
      new OnlineRequestError(503, "persistence_failed", "Account could not be deleted.")
    );
    const onSignOutAllAccountSessions = vi.fn().mockResolvedValue(undefined);

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
        loadAccountSessions={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          sessions: [],
        })}
        onSignOutAllAccountSessions={onSignOutAllAccountSessions}
        onDeleteAccount={onDeleteAccount}
      />
    );

    expect(await screen.findByRole("heading", { name: "Liam" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const deleteButton = screen.getByRole("button", { name: "Delete Account" });

    expect(deleteButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(deleteButton);
    const confirmation = screen.getByRole("region", { name: "Remove Liam" });
    expect(deleteButton).toHaveAttribute("aria-expanded", "true");
    expect(confirmation).toHaveTextContent("public games may still show this display name in public archives");
    expect(confirmation).toHaveTextContent("private and unlisted games stay hidden");
    expect(confirmation).toHaveTextContent("display name stays reserved");

    fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

    await waitFor(() => expect(onDeleteAccount).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("region", { name: "Remove Liam" })).toBeInTheDocument();
    expect(await screen.findByText("Account could not be deleted.")).toHaveClass("online-profile-error");
    expect(screen.queryByText("Could not delete account.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign Out Everywhere" }));
    await waitFor(() => expect(onSignOutAllAccountSessions).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Signed out everywhere.")).not.toHaveClass("online-profile-error");
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
    const loadPublicProfileGames = vi.fn().mockResolvedValue({
      schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
      games: [publicGame()],
    });
    const loadPublicProfileRatingHistory = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      schemaVersion: 1,
      points: [
        {
          schemaVersion: 1,
          rating: 1510,
          display: "1510",
          provisional: false,
          games: 18,
          appliedAt: "2026-06-14T12:00:00.000Z",
        },
        {
          schemaVersion: 1,
          rating: 1502,
          display: "1502",
          provisional: false,
          games: 17,
          appliedAt: "2026-06-13T12:00:00.000Z",
        },
      ],
    });
    const onReplay = vi.fn();
    window.history.replaceState({}, "", "/?profile=Samir&section=settings");

    const { container } = render(
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
        loadPublicProfileGames={loadPublicProfileGames}
        loadPublicProfileRatingHistory={loadPublicProfileRatingHistory}
        onReplay={onReplay}
        onOpenProfile={vi.fn()}
      />
    );

    expect(await screen.findByRole("heading", { name: "Samir" })).toBeInTheDocument();
    expect(screen.getByText("Public Profile")).toBeInTheDocument();
    expect(screen.getByText("Rating 1510")).toBeInTheDocument();
    expect(screen.getAllByText("Presence private")).toHaveLength(2);
    expect(screen.queryByText("Status hidden")).not.toBeInTheDocument();
    expect(screen.getAllByText("18 rated games").length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByRole("img", { name: "Public rating history graph" })).toBeInTheDocument();
    expect(container.querySelector(".online-profile-rating-chart polyline")).toBeInTheDocument();
    expect(screen.getByText("Online status is private for this viewer.")).toBeInTheDocument();
    expect(screen.queryByText("Challenge Inbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Account Sessions")).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Public games for Samir" })).toHaveTextContent("Samir vs Liam");
    expect(screen.getByText("White wins by resignation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyze replay game_public_samir_liam from Samir public profile" }));
    expect(onReplay).toHaveBeenCalledWith("game_public_samir_liam");
    expect(screen.getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", "true");
    expect(new URL(window.location.href).searchParams.has("section")).toBe(false);
    expect(loadAccountGames).not.toHaveBeenCalled();
    expect(loadPublicProfileGames).toHaveBeenCalledWith("Samir");
    expect(loadPublicProfileRatingHistory).toHaveBeenCalledWith("Samir");
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
