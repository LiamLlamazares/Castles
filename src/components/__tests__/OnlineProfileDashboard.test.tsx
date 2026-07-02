import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OnlineProfileDashboard from "../OnlineProfileDashboard";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { OnlineRequestError } from "../../online/client";
import { ONLINE_PROTOCOL_VERSION } from "../../online/protocolVersion";
import { ONLINE_GAME_DIRECTORY_SCHEMA_VERSION, ONLINE_GAME_SUMMARY_SCHEMA_VERSION } from "../../online/readModel";
import {
  ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION,
  ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
  type OnlineAccountChallengeListItem,
} from "../../online/challenges";
import type { OnlineAccount } from "../../online/accounts";
import type { OnlineAccountPublicProfile } from "../../online/social";
import type { OnlineGameSummary } from "../../online/readModel";
import type { OnlineGameSetupDTO } from "../../online/types";

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

function unrelatedPublicGame(overrides: Partial<OnlineGameSummary> = {}): OnlineGameSummary {
  return publicGame({
    gameId: "game_public_ada_jules",
    participants: [
      { seat: "w", role: "white", identity: { kind: "registered", id: "account_ada", displayName: "Ada" } },
      { seat: "b", role: "black", identity: { kind: "registered", id: "account_jules", displayName: "Jules" } },
    ],
    ...overrides,
  });
}

function accountChallengeRecord(
  overrides: Partial<OnlineAccountChallengeListItem["summary"]> & {
    role?: OnlineAccountChallengeListItem["role"];
    challenger?: string;
    challenged?: string;
  } = {}
): OnlineAccountChallengeListItem {
  const challenger = overrides.challenger ?? "Liam";
  const challenged = overrides.challenged ?? "Pablo";
  return {
    role: overrides.role ?? "challenger",
    summary: {
      schemaVersion: ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
      challengeId: "challenge_profile_pablo",
      challengerIdentity: {
        kind: "registered",
        id: `account_${challenger.toLowerCase()}`,
        displayName: challenger,
      },
      challengedIdentity: {
        kind: "registered",
        id: `account_${challenged.toLowerCase()}`,
        displayName: challenged,
      },
      challengerSeat: "random",
      visibility: "private",
      setup: {} as OnlineGameSetupDTO,
      createdAt: "2026-07-01T10:15:00.000Z",
      updatedAt: "2026-07-01T10:15:00.000Z",
      expiresAt: "2026-07-02T10:15:00.000Z",
      status: "pending",
      lastEventId: "evt_profile_challenge",
      ...overrides,
    },
  };
}

describe("OnlineProfileDashboard", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
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
    expect(await screen.findByText("Rating 1620?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Games" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rating" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(await screen.findByText("No account games yet. Signed-in games will appear here for review.")).toBeInTheDocument();
    expect(screen.getByText("No challenge records.")).toBeInTheDocument();
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

  it("shows self challenge records with opponent, status, and timestamps", async () => {
    const cancelledRecord = accountChallengeRecord({
      status: "cancelled",
      updatedAt: "2026-07-01T10:18:00.000Z",
      cancelledAt: "2026-07-01T10:18:00.000Z",
      cancelledBy: {
        kind: "registered",
        id: "account_liam",
        displayName: "Liam",
      },
    });
    const onCancelAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenger",
      summary: cancelledRecord.summary,
    });
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
        loadAccountChallenges={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          schemaVersion: ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION,
          challenges: [
            accountChallengeRecord(),
            accountChallengeRecord({
              role: "challenged",
              challengeId: "challenge_profile_ada",
              challenger: "Ada",
              challenged: "Liam",
              status: "accepted",
              createdAt: "2026-07-01T11:20:00.000Z",
              expiresAt: "2026-07-02T11:20:00.000Z",
              gameId: "game_accepted_ada",
            }),
          ],
        })}
        onCancelAccountChallenge={onCancelAccountChallenge}
      />
    );

    expect(await screen.findByRole("heading", { name: "Liam" })).toBeInTheDocument();
    expect(await screen.findByText("2 challenge records visible to this account.")).toBeInTheDocument();
    expect(screen.getByText("To Pablo")).toBeInTheDocument();
    expect(screen.getByText("From Ada")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.getByText("Created 2026-07-01 10:15 UTC")).toBeInTheDocument();
    expect(screen.getByText("Expires 2026-07-02 11:20 UTC")).toBeInTheDocument();
    expect(screen.getByText("Game game_accepted_ada")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel challenge to Pablo" }));
    await waitFor(() => expect(onCancelAccountChallenge).toHaveBeenCalledWith("challenge_profile_pablo"));
    expect(await screen.findByText("Challenge to Pablo cancelled.")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel challenge to Pablo" })).not.toBeInTheDocument();
  });

  it("keeps profile picture upload but removes built-in avatar chooser clutter", async () => {
    const liam = account("Liam");
    const updateAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: profile("Liam", {
        avatar: { schemaVersion: 1, preset: "monarch", color: "green" },
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

    expect(screen.getByLabelText("Upload PNG, JPEG, or WebP")).toHaveAttribute("type", "file");
    expect(screen.queryByRole("group", { name: "Built-in Avatar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Color" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Dragon avatar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Violet avatar color" })).not.toBeInTheDocument();
    expect(updateAccountProfile).not.toHaveBeenCalled();
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
    expect(screen.queryByRole("radio", { name: "Monarch avatar" })).not.toBeInTheDocument();
  });

  it("uses a cached uploaded profile picture while the latest profile is loading", async () => {
    window.localStorage.setItem("castles-profile-avatar-cache-v1", JSON.stringify({
      liam: {
        displayName: "Liam",
        avatar: { schemaVersion: 1, imageDataUrl: TINY_AVATAR_DATA_URL },
        cachedAt: Date.now(),
      },
    }));
    let resolveProfile: ((value: {
      protocolVersion: typeof ONLINE_PROTOCOL_VERSION;
      profile: OnlineAccountPublicProfile;
    }) => void) | undefined;
    const profilePromise = new Promise<{
      protocolVersion: typeof ONLINE_PROTOCOL_VERSION;
      profile: OnlineAccountPublicProfile;
    }>((resolve) => {
      resolveProfile = resolve;
    });

    render(
      <OnlineProfileDashboard
        displayName="Liam"
        account={account("Liam")}
        loadProfile={vi.fn().mockReturnValue(profilePromise)}
      />
    );

    const cachedAvatar = screen.getByRole("img", { name: "Liam uploaded profile picture" });
    expect(cachedAvatar.querySelector("img")).toHaveAttribute("src", TINY_AVATAR_DATA_URL);

    resolveProfile?.({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: profile("Liam", {
        avatar: { schemaVersion: 1, preset: "knight", color: "blue" },
        relationship: { self: true, following: false, followedBy: false, blocked: false },
      }),
    });
    expect(await screen.findByRole("img", { name: "Liam profile avatar, knight on blue" })).toBeInTheDocument();
  });

  it("does not keep a cached profile picture after the latest profile load fails", async () => {
    window.localStorage.setItem("castles-profile-avatar-cache-v1", JSON.stringify({
      liam: {
        displayName: "Liam",
        avatar: { schemaVersion: 1, imageDataUrl: TINY_AVATAR_DATA_URL },
        cachedAt: Date.now(),
      },
    }));

    render(
      <OnlineProfileDashboard
        displayName="Liam"
        account={account("Liam")}
        loadProfile={vi.fn().mockRejectedValue(new Error("offline"))}
      />
    );

    expect(screen.getByRole("img", { name: "Liam uploaded profile picture" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Profile unavailable.");
    expect(screen.queryByRole("img", { name: "Liam uploaded profile picture" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Liam profile avatar, monarch on green" })).toBeInTheDocument();
  });

  it("exposes theme mode and piece-set preferences in Profile Settings", async () => {
    render(
      <ThemeProvider>
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
      </ThemeProvider>
    );

    expect(await screen.findByRole("heading", { name: "Liam" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Theme preference"), { target: { value: "system" } });
    fireEvent.change(screen.getByLabelText("Piece set preference"), { target: { value: "Chess" } });

    expect(document.documentElement).toHaveAttribute("data-theme");
    expect(window.localStorage.getItem("castles-theme")).toBe("system");
    expect(window.localStorage.getItem("castles-piece-theme")).toBe("Chess");
    expect(screen.getByText("Piece set applies when you create the next Play setup.")).toBeInTheDocument();
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
      games: [unrelatedPublicGame(), publicGame()],
    });
    const loadPublicProfileRatingHistory = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      schemaVersion: 1,
      points: [
        {
          schemaVersion: 1,
          rating: 1502,
          display: "1502",
          provisional: false,
          games: 17,
          appliedAt: "2026-06-13T12:00:00.000Z",
        },
        {
          schemaVersion: 1,
          rating: 1510,
          display: "1510",
          provisional: false,
          games: 18,
          appliedAt: "2026-06-14T12:00:00.000Z",
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
    const ratingLine = container.querySelector(".online-profile-rating-chart polyline");
    expect(ratingLine).toBeInTheDocument();
    const plottedPoints = ratingLine?.getAttribute("points")?.split(" ").map((point) => {
      const [, y] = point.split(",").map(Number);
      return y;
    }) ?? [];
    expect(plottedPoints.at(-1)).toBeLessThan(plottedPoints[0]);
    expect(screen.getByText("Online status is private for this viewer.")).toBeInTheDocument();
    expect(screen.queryByText("Challenge Inbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Account Sessions")).not.toBeInTheDocument();
    const publicGamesRegion = await screen.findByRole("region", { name: "Public games for Samir" });
    expect(publicGamesRegion).toHaveTextContent("Samir vs Liam");
    expect(publicGamesRegion).not.toHaveTextContent("Ada vs Jules");
    expect(screen.getByText("White wins by resignation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze latest public game game_public_samir_liam from Samir profile" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Challenge Samir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Follow Samir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rematch Samir from game_public_samir_liam" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyze replay game_public_samir_liam from Samir public profile" }));
    expect(onReplay).toHaveBeenCalledWith("game_public_samir_liam");
    expect(screen.getByRole("button", { name: "Summary" })).toHaveAttribute("aria-pressed", "true");
    expect(new URL(window.location.href).searchParams.has("section")).toBe(false);
    expect(loadAccountGames).not.toHaveBeenCalled();
    expect(loadPublicProfileGames).toHaveBeenCalledWith("Samir");
    expect(loadPublicProfileRatingHistory).toHaveBeenCalledWith("Samir");
  });

  it("shows play-centered public profile actions only when authorized and useful", async () => {
    const liveGame = publicGame({
      gameId: "game_live_samir",
      status: "active",
      archiveState: "active",
      endedAt: undefined,
      result: undefined,
    });
    const unrelatedLiveGame = unrelatedPublicGame({
      gameId: "game_live_ada",
      status: "active",
      archiveState: "active",
      endedAt: undefined,
      result: undefined,
    });
    const onReplay = vi.fn();
    const onSpectate = vi.fn();
    const onChallengeAccount = vi.fn().mockResolvedValue(undefined);
    const onFollowAccount = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: profile("Samir", {
        relationship: { self: false, following: true, followedBy: false, blocked: false },
      }),
    });
    const onUnfollowAccount = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: profile("Samir", {
        relationship: { self: false, following: false, followedBy: false, blocked: false },
      }),
    });

    render(
      <OnlineProfileDashboard
        displayName="Samir"
        account={account("Liam")}
        loadProfile={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: profile("Samir", {
            relationship: { self: false, following: false, followedBy: false, blocked: false },
          }),
        })}
        loadPublicProfileGames={vi.fn().mockResolvedValue({
          schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
          games: [unrelatedPublicGame(), publicGame()],
        })}
        loadPublicProfileLiveGames={vi.fn().mockResolvedValue({
          schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
          games: [unrelatedLiveGame, liveGame],
        })}
        onReplay={onReplay}
        onSpectate={onSpectate}
        onChallengeAccount={onChallengeAccount}
        onFollowAccount={onFollowAccount}
        onUnfollowAccount={onUnfollowAccount}
      />
    );

    expect(await screen.findByRole("group", { name: "Profile actions for Samir" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Watch Samir live game game_live_samir" }));
    expect(onSpectate).toHaveBeenCalledWith("game_live_samir");

    fireEvent.click(screen.getByRole("button", { name: "Analyze latest public game game_public_samir_liam from Samir profile" }));
    expect(onReplay).toHaveBeenCalledWith("game_public_samir_liam");

    fireEvent.click(screen.getByRole("button", { name: "Challenge Samir" }));
    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir"));

    fireEvent.click(screen.getByRole("button", { name: "Rematch Samir from game_public_samir_liam" }));
    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir", {
      intent: "rematch",
      sourceGameId: "game_public_samir_liam",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Follow Samir" }));
    await waitFor(() => expect(onFollowAccount).toHaveBeenCalledWith("Samir"));
    expect(await screen.findByText("Following Samir.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unfollow Samir" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unfollow Samir" }));
    await waitFor(() => expect(onUnfollowAccount).toHaveBeenCalledWith("Samir"));
    expect(await screen.findByText("Unfollowed Samir.")).toBeInTheDocument();
  });

  it("does not show public profile actions when the profile fails to load", async () => {
    render(
      <OnlineProfileDashboard
        displayName="Samir"
        account={account("Liam")}
        loadProfile={vi.fn().mockRejectedValue(new Error("profile failed"))}
        loadPublicProfileGames={vi.fn().mockResolvedValue({
          schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
          games: [publicGame()],
        })}
        loadPublicProfileLiveGames={vi.fn().mockResolvedValue({
          schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
          games: [publicGame({
            gameId: "game_live_samir",
            status: "active",
            archiveState: "active",
            endedAt: undefined,
            result: undefined,
          })],
        })}
        onReplay={vi.fn()}
        onSpectate={vi.fn()}
        onChallengeAccount={vi.fn()}
        onFollowAccount={vi.fn()}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Profile unavailable.");
    expect(screen.queryByRole("group", { name: "Profile actions for Samir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Watch Samir live game game_live_samir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analyze latest public game game_public_samir_liam from Samir profile" })).not.toBeInTheDocument();
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
