import { render, screen, waitFor } from "@testing-library/react";
import OnlineProfileDashboard from "../OnlineProfileDashboard";
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
  it("loads a signed-in self dashboard with empty account states and sanitized controls", async () => {
    const liam = account("Liam");

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
        loadAccountSessions={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          sessions: [],
        })}
      />
    );

    expect(await screen.findByRole("heading", { name: "Liam" })).toBeInTheDocument();
    expect(screen.getByText("Profile Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Rating 1620?")).toBeInTheDocument();
    expect(await screen.findByText("No account games yet.")).toBeInTheDocument();
    expect(screen.getByText("0 challenges visible to this account.")).toBeInTheDocument();
    expect(screen.getByText("0 followed players.")).toBeInTheDocument();
    expect(screen.getByText("Follows everyone; status followed; challenges followed")).toBeInTheDocument();
    expect(screen.getByText("0 active sessions.")).toBeInTheDocument();
    expect(screen.queryByText("account_liam")).not.toBeInTheDocument();
  });

  it("keeps public profiles shareable without private dashboard sections", async () => {
    const loadAccountGames = vi.fn();

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
    expect(loadAccountGames).not.toHaveBeenCalled();
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
