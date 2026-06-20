import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnlineGameBrowser from "../OnlineGameBrowser";
import {
  ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
  ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
  type OnlineGameDirectoryResponse,
  type OnlineGameSummary,
} from "../../online/readModel";
import {
  ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
  ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
  type OpenSeekDirectoryResponse,
  type OpenSeekSummary,
} from "../../online/seeks";
import {
  ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION,
  ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
  type OnlineAccountChallengeDirectoryResponse,
  type OnlineChallengeSummary,
} from "../../online/challenges";
import { PieceType } from "../../Constants";
import { ONLINE_RULESET_VERSION } from "../../online/events";
import { ONLINE_PROTOCOL_VERSION } from "../../online/protocolVersion";
import { OnlineRequestError } from "../../online/client";
import type { OnlineAccountPublicRating } from "../../online/social";

function summary(overrides: Partial<OnlineGameSummary> = {}): OnlineGameSummary {
  const gameId = overrides.gameId ?? "game_public_active";
  const hasTimeControl = overrides.hasTimeControl ?? true;
  return {
    schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
    gameId,
    rulesetVersion: ONLINE_RULESET_VERSION,
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:03:00.000Z",
    version: 3,
    status: "active",
    visibility: "public",
    archiveState: "active",
    hasTimeControl: true,
    participants: [
      { seat: "w", role: "white", identity: { kind: "registered", id: `${gameId}_w`, displayName: "Ada" } },
      { seat: "b", role: "black", identity: { kind: "registered", id: `${gameId}_b`, displayName: "Ben" } },
    ],
    livePreview: {
      sideToMove: "b",
      turnPhase: "Attack",
      moveCount: overrides.version ?? 3,
      lastMove: {
        notation: "G13G12",
        turnNumber: 1,
        color: "w",
        phase: "Movement",
      },
      boardPreview: {
        radius: 6,
        pieces: [
          { q: 0, r: 6, s: -6, color: "w", type: PieceType.Monarch },
          { q: 0, r: -6, s: 6, color: "b", type: PieceType.Monarch },
          { q: -1, r: 5, s: -4, color: "w", type: PieceType.Swordsman },
          { q: 1, r: -5, s: 4, color: "b", type: PieceType.Archer },
        ],
        castles: [
          { q: 0, r: 6, s: -6, owner: "w" },
          { q: 0, r: -6, s: 6, owner: "b" },
        ],
      },
      ...(hasTimeControl
        ? {
            clock: {
              timeControl: { initialMs: 1_200_000, incrementMs: 20_000 },
              remainingMs: { w: 1_198_000, b: 1_200_000 },
              activeColor: "b" as const,
              runningSince: 2_000,
              serverNow: 5_000,
            },
          }
        : {}),
    },
    lastEventId: `${gameId}_evt`,
    ...overrides,
  };
}

function directory(
  games: OnlineGameSummary[],
  nextCursor?: string
): OnlineGameDirectoryResponse {
  return {
    schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
    games,
    nextCursor,
  };
}

function createChallengeSetup() {
  return {
    board: { config: { nSquares: 7 }, castles: [] },
    pieces: [],
    sanctuaries: [],
    timeControl: { initial: 20, increment: 20 },
    gameRules: { vpModeEnabled: true },
    initialPoolTypes: [],
  };
}

function openSeek(overrides: Partial<OpenSeekSummary> = {}): OpenSeekSummary {
  const seekId = overrides.seekId ?? "seek_public_open";
  return {
    schemaVersion: ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
    seekId,
    creatorIdentity: { kind: "session", id: `${seekId}_creator` },
    creatorSeat: "random",
    setup: createChallengeSetup(),
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2026-06-01T12:10:00.000Z",
    status: "open",
    lastEventId: `${seekId}_evt`,
    ...overrides,
  };
}

function seekDirectory(
  seeks: OpenSeekSummary[],
  nextCursor?: string
): OpenSeekDirectoryResponse {
  return {
    schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
    seeks,
    nextCursor,
  };
}

function accountChallengeSummary(
  overrides: Partial<OnlineChallengeSummary> = {}
): OnlineChallengeSummary {
  const challengeId = overrides.challengeId ?? "challenge_samir_liam";
  return {
    schemaVersion: ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
    challengeId,
    challengerIdentity: { kind: "registered", id: "account_samir", displayName: "Samir" },
    challengedIdentity: { kind: "registered", id: "account_liam", displayName: "Liam" },
    challengerSeat: "random",
    setup: createChallengeSetup(),
    createdAt: "2026-06-03T12:00:00.000Z",
    updatedAt: "2026-06-03T12:01:00.000Z",
    expiresAt: "2026-06-03T12:11:00.000Z",
    status: "pending",
    visibility: "unlisted",
    lastEventId: `${challengeId}_evt`,
    ...overrides,
  };
}

function accountChallengeDirectory(
  challenges: OnlineAccountChallengeDirectoryResponse["challenges"]
): OnlineAccountChallengeDirectoryResponse {
  return {
    schemaVersion: ONLINE_ACCOUNT_CHALLENGE_DIRECTORY_SCHEMA_VERSION,
    challenges,
  };
}

function accountFixture(displayName = "Liam") {
  return {
    schemaVersion: 1 as const,
    accountId: `account_${displayName.toLowerCase()}`,
    displayName,
    createdAt: "2026-06-03T12:00:00.000Z",
    updatedAt: "2026-06-03T12:00:00.000Z",
    identity: { kind: "registered" as const, id: `account_${displayName.toLowerCase()}`, displayName },
  };
}

function publicProfile(
  displayName: string,
  relationship: { self?: boolean; following?: boolean; followedBy?: boolean; blocked?: boolean } = {},
  presence: { visibility?: "visible" | "hidden"; status?: "online" | "recent" | "away" | "offline" | null } = {},
  rating?: OnlineAccountPublicRating
) {
  return {
    schemaVersion: 1 as const,
    displayName,
    avatar: { schemaVersion: 1 as const, preset: "monarch" as const, color: "green" as const },
    ...(rating ? { rating } : {}),
    presence: {
      visibility: presence.visibility ?? "hidden",
      status: presence.status ?? null,
    },
    relationship: {
      self: relationship.self ?? false,
      following: relationship.following ?? false,
      followedBy: relationship.followedBy ?? false,
      blocked: relationship.blocked ?? false,
    },
  };
}

function publicRating(overrides: Partial<OnlineAccountPublicRating> = {}): OnlineAccountPublicRating {
  return {
    schemaVersion: 1,
    rating: 1500,
    display: "1500?",
    provisional: true,
    games: 0,
    updatedAt: null,
    ...overrides,
  };
}

function registeredParticipant(
  seat: "w" | "b",
  displayName: string
): OnlineGameSummary["participants"][number] {
  return {
    seat,
    role: seat === "w" ? "white" : "black",
    identity: {
      kind: "registered",
      id: `account_${displayName.toLowerCase().replace(/\s+/g, "_")}`,
      displayName,
    },
  };
}

function socialPropsWithFollowing(following: ReturnType<typeof publicProfile>[] = []) {
  return {
    loadAccountFollowing: vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      following,
    }),
    loadAccountProfile: vi.fn(),
    onFollowAccount: vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Samir", { following: true }),
    }),
    onUnfollowAccount: vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Samir"),
    }),
    onBlockAccount: vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Samir", { blocked: true }),
    }),
    onUnblockAccount: vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Samir"),
    }),
    onReportAccount: vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      report: {
        schemaVersion: 1,
        targetDisplayName: "Samir",
        reason: "abuse",
        createdAt: "2026-06-05T12:00:00.000Z",
      },
    }),
  };
}

function deferredDirectory() {
  let resolve!: (value: OnlineGameDirectoryResponse) => void;
  const promise = new Promise<OnlineGameDirectoryResponse>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function deferredValue<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function deferredSeekDirectory() {
  let resolve!: (value: OpenSeekDirectoryResponse) => void;
  const promise = new Promise<OpenSeekDirectoryResponse>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("OnlineGameBrowser", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports tab changes without losing a controlled active tab", async () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <OnlineGameBrowser
        activeTab="lobby"
        onTabChange={onTabChange}
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Lobby games" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));

    expect(onTabChange).toHaveBeenCalledWith("archive");
    expect(screen.getByRole("button", { name: "Lobby games" })).toHaveAttribute("aria-pressed", "true");

    rerender(
      <OnlineGameBrowser
        activeTab="archive"
        onTabChange={onTabChange}
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Online Archive" })).toHaveAttribute("aria-pressed", "true");
  });

  async function openAccountDialog() {
    await screen.findByText("No lobby listings yet.");
    fireEvent.click(screen.getByRole("button", { name: "Guest account. Open account sign in" }));
    return screen.findByRole("dialog", { name: "Online account" });
  }

  it("creates an online account from the Online account dialog", async () => {
    const onCreateAccount = vi.fn().mockResolvedValue(undefined);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onCreateAccount={onCreateAccount}
      />
    );

    const dialog = await openAccountDialog();
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Liam" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "account-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => expect(onCreateAccount).toHaveBeenCalledWith("Liam", "account-password"));
    expect(await screen.findByText("Online account created.")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it("surfaces trusted server errors when account creation fails in the account dialog", async () => {
    const onCreateAccount = vi.fn().mockRejectedValue(
      new OnlineRequestError(400, "bad_request", "That display name is already taken.")
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onCreateAccount={onCreateAccount}
      />
    );

    await openAccountDialog();
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Liam" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "account-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => expect(onCreateAccount).toHaveBeenCalledWith("Liam", "account-password"));
    expect(await screen.findByText("That display name is already taken.")).toHaveClass("error");
    expect(screen.queryByText("Could not create that online account name.")).not.toBeInTheDocument();
  });

  it("signs into an online account from the Online account dialog", async () => {
    const onSignInAccount = vi.fn().mockResolvedValue(undefined);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onSignInAccount={onSignInAccount}
      />
    );

    await openAccountDialog();
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Liam" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "account-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(onSignInAccount).toHaveBeenCalledWith("Liam", "account-password"));
    expect(await screen.findByText("Signed in.")).toBeInTheDocument();
  });

  it("surfaces trusted server errors when account sign-in fails in the account dialog", async () => {
    const onSignInAccount = vi.fn().mockRejectedValue(
      new OnlineRequestError(401, "unauthorized", "That display name or password did not match.")
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onSignInAccount={onSignInAccount}
      />
    );

    await openAccountDialog();
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Liam" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "account-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(onSignInAccount).toHaveBeenCalledWith("Liam", "account-password"));
    expect(await screen.findByText("That display name or password did not match.")).toHaveClass("error");
    expect(screen.queryByText("Could not sign in with that display name and password.")).not.toBeInTheDocument();
  });

  it("opens account sign-in from a single Online navigation identity chip when Google is enabled", async () => {
    window.history.replaceState(
      {},
      "",
      "/?onlineGame=game_return&seat=w&token=secret-seat-token&view=spectator#challengeToken=fragment-secret"
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        loadAccountOAuthProviders={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          providers: [
            {
              provider: "google",
              enabled: true,
              startUrl: "/api/online/account/oauth/google/start",
            },
          ],
        })}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const nav = screen.getByRole("navigation", { name: "Online navigation" });
    const accountButton = await within(nav).findByRole("button", { name: "Guest account. Open account sign in" });
    expect(accountButton).toHaveTextContent("Guest");
    expect(within(nav).queryByRole("link", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Sign in with password" })).not.toBeInTheDocument();

    fireEvent.click(accountButton);

    const dialog = await screen.findByRole("dialog", { name: "Online account" });
    const link = within(dialog).getByRole("link", { name: "Continue with Google" });
    expect(link).toHaveAttribute(
      "href",
      "/api/online/account/oauth/google/start?returnTo=%2F%3FonlineGame%3Dgame_return%26seat%3Dw%26view%3Dspectator"
    );
    expect(within(dialog).getByRole("button", { name: "Create Account" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Sign In" })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveFocus());
  });

  it("labels the Online navigation identity chip with the signed-in display name", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        account={accountFixture("Liam")}
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const nav = screen.getByRole("navigation", { name: "Online navigation" });
    const accountButton = await within(nav).findByRole("button", { name: "Liam account. Open account controls" });

    expect(accountButton).toHaveTextContent("Liam");
    fireEvent.click(accountButton);
    expect(await screen.findByRole("dialog", { name: "Online account" })).toHaveTextContent("Signed in as");
  });

  it("hides the default account form and shows disabled Google sign-in only in the account dialog", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        loadAccountOAuthProviders={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          providers: [{ provider: "google", enabled: false }],
        })}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("No lobby listings yet.");
    expect(screen.queryByRole("link", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Online account" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Guest account. Open account sign in" }));

    const dialog = await screen.findByRole("dialog", { name: "Online account" });
    expect(within(dialog).queryByRole("link", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Google sign-in is unavailable right now.")).toBeInTheDocument();
  });

  it("keeps account security controls out of the Online page", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_liam",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_liam", displayName: "Liam" },
    };
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        onSignOutAccount={vi.fn()}
        onOpenProfile={vi.fn()}
      />
    );

    expect(await screen.findByRole("button", { name: "My Profile" })).toBeInTheDocument();
    expect(screen.queryByText(/active session/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh Sessions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign Out Everywhere" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Account" })).not.toBeInTheDocument();
  });

  it("lets signed-in players find, follow, and block accounts without account settings controls", async () => {
    const account = accountFixture("Liam");
    const visibleProfile = publicProfile("Samir");
    const followedProfile = publicProfile("Samir", { following: true });
    const blockedProfile = publicProfile("Samir", { blocked: true });
    let currentFollowing = false;
    let currentBlocked = false;
    const loadAccountFollowing = vi.fn().mockImplementation(() => Promise.resolve({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      following: currentFollowing && !currentBlocked ? [followedProfile] : [],
    }));
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: visibleProfile,
    });
    const onFollowAccount = vi.fn().mockImplementation(() => {
      currentFollowing = true;
      currentBlocked = false;
      return Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: followedProfile,
      });
    });
    const onUnfollowAccount = vi.fn().mockImplementation(() => {
      currentFollowing = false;
      return Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: visibleProfile,
      });
    });
    const onBlockAccount = vi.fn().mockImplementation(() => {
      currentFollowing = false;
      currentBlocked = true;
      return Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: blockedProfile,
      });
    });
    const onUnblockAccount = vi.fn().mockImplementation(() => {
      currentBlocked = false;
      return Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: visibleProfile,
      });
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountFollowing={loadAccountFollowing}
        loadAccountProfile={loadAccountProfile}
        onFollowAccount={onFollowAccount}
        onUnfollowAccount={onUnfollowAccount}
        onBlockAccount={onBlockAccount}
        onUnblockAccount={onUnblockAccount}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    expect(await within(people).findByText("No followed players yet.")).toBeInTheDocument();
    expect(loadAccountFollowing).toHaveBeenCalledTimes(1);
    expect(within(people).queryByRole("combobox", { name: "Who can newly follow me" })).not.toBeInTheDocument();
    expect(within(people).queryByRole("combobox", { name: "Who can see me online" })).not.toBeInTheDocument();
    expect(within(people).queryByRole("combobox", { name: "Who can challenge me" })).not.toBeInTheDocument();

    fireEvent.change(within(people).getByRole("textbox", { name: "Search account name" }), {
      target: { value: "Samir" },
    });
    fireEvent.click(within(people).getByRole("button", { name: "Find Account" }));

    expect(await within(people).findByRole("article", { name: "Profile Samir" })).toBeInTheDocument();
    expect(loadAccountProfile).toHaveBeenCalledWith("Samir");
    fireEvent.click(within(people).getByRole("button", { name: "Follow Samir" }));

    await waitFor(() => expect(onFollowAccount).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByRole("button", { name: "Unfollow Samir" })).toBeInTheDocument();
    expect(within(people).getByRole("article", { name: "Profile Samir" })).toHaveTextContent("Following");
    expect(await within(people).findByRole("button", { name: "Unfollow Samir from following list" })).toBeInTheDocument();

    fireEvent.click(within(people).getByRole("button", { name: "Block Samir" }));

    await waitFor(() => expect(onBlockAccount).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByRole("button", { name: "Unblock Samir" })).toBeInTheDocument();
    expect(within(people).getByRole("article", { name: "Profile Samir" })).toHaveTextContent("Blocked");
    expect(within(people).getByRole("article", { name: "Profile Samir" })).not.toHaveTextContent("Following");
    expect(await within(people).findByText("No followed players yet.")).toBeInTheDocument();

    fireEvent.click(within(people).getByRole("button", { name: "Unblock Samir" }));

    await waitFor(() => expect(onUnblockAccount).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByRole("button", { name: "Follow Samir" })).toBeInTheDocument();
    expect(within(people).getByRole("article", { name: "Profile Samir" })).toHaveTextContent("Not followed");
  });

  it("suggests account search matches in the Online People panel", async () => {
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Samir"),
    });
    const searchAccountProfiles = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profiles: [{ schemaVersion: 1, displayName: "Samir", rating: publicRating() }],
    });

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountProfile={loadAccountProfile}
        searchAccountProfiles={searchAccountProfiles}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.change(within(people).getByRole("textbox", { name: "Search account name" }), {
      target: { value: "sam" },
    });

    await waitFor(() => expect(searchAccountProfiles).toHaveBeenCalledWith("sam"));
    const suggestion = await within(people).findByRole("option", { name: "Samir rating 1500?" });
    fireEvent.click(suggestion);

    await waitFor(() => expect(loadAccountProfile).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByRole("article", { name: "Profile Samir" })).toBeInTheDocument();
  });

  it("preserves trusted follow rejection messages", async () => {
    const onFollowAccount = vi.fn().mockRejectedValue(
      new OnlineRequestError(429, "rate_limited", "Follow changes are temporarily rate limited.")
    );
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Samir"),
    });

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountProfile={loadAccountProfile}
        onFollowAccount={onFollowAccount}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.change(within(people).getByRole("textbox", { name: "Search account name" }), {
      target: { value: "Samir" },
    });
    fireEvent.click(within(people).getByRole("button", { name: "Find Account" }));

    const profile = await within(people).findByRole("article", { name: "Profile Samir" });
    fireEvent.click(within(profile).getByRole("button", { name: "Follow Samir" }));

    await waitFor(() => expect(onFollowAccount).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByText("Follow changes are temporarily rate limited.")).toBeInTheDocument();
    expect(within(people).queryByText("Could not follow that account.")).not.toBeInTheDocument();
  });

  it("lets signed-in players challenge and copy invites for visible and followed accounts", async () => {
    const onChallengeAccount = vi.fn().mockResolvedValue(undefined);
    const onCopyChallengeAccountInvite = vi.fn().mockResolvedValue(undefined);
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Ada"),
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        loadAccountProfile={loadAccountProfile}
        onChallengeAccount={onChallengeAccount}
        onCopyChallengeAccountInvite={onCopyChallengeAccountInvite}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const followingName = await within(people).findByText("Samir");
    const followingRow = followingName.closest("article");
    expect(followingRow).not.toBeNull();
    fireEvent.click(within(followingRow as HTMLElement).getByRole("button", { name: "Challenge Samir" }));
    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir"));
    fireEvent.click(within(followingRow as HTMLElement).getByRole("button", { name: "Copy challenge invite for Samir" }));
    await waitFor(() => expect(onCopyChallengeAccountInvite).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByText("Challenge invite copied for Samir.")).toBeInTheDocument();

    fireEvent.change(within(people).getByRole("textbox", { name: "Search account name" }), {
      target: { value: "Ada" },
    });
    fireEvent.click(within(people).getByRole("button", { name: "Find Account" }));

    const profileCard = await within(people).findByRole("article", { name: "Profile Ada" });
    fireEvent.click(within(profileCard).getByRole("button", { name: "Challenge Ada" }));
    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Ada"));
    fireEvent.click(within(profileCard).getByRole("button", { name: "Copy challenge invite for Ada" }));
    await waitFor(() => expect(onCopyChallengeAccountInvite).toHaveBeenCalledWith("Ada"));
    expect(await within(people).findByText("Challenge invite copied for Ada.")).toBeInTheDocument();
  });

  it("offers a profile-card rematch from loaded head-to-head account history", async () => {
    const account = accountFixture("Liam");
    const latestHeadToHead = summary({
      gameId: "game_profile_h2h_latest_rematch",
      updatedAt: "2026-06-01T12:08:00.000Z",
      endedAt: "2026-06-01T12:08:00.000Z",
      status: "complete",
      archiveState: "archived",
      visibility: "private",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: registeredParticipant("b", "Ada").identity },
      ],
      result: { winner: "w", reason: "resignation" },
    });
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Ada"),
    });
    const onChallengeAccount = vi.fn().mockResolvedValue(undefined);

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountProfile={loadAccountProfile}
        loadAccountGames={vi.fn().mockResolvedValue(directory([]))}
        loadAccountHeadToHeadGames={vi.fn().mockResolvedValue(directory([latestHeadToHead]))}
        onChallengeAccount={onChallengeAccount}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.change(within(people).getByRole("textbox", { name: "Search account name" }), {
      target: { value: "Ada" },
    });
    fireEvent.click(within(people).getByRole("button", { name: "Find Account" }));

    const profileCard = await within(people).findByRole("article", { name: "Profile Ada" });
    expect(within(profileCard).queryByRole("button", {
      name: "Rematch Ada from latest head-to-head game game_profile_h2h_latest_rematch",
    })).not.toBeInTheDocument();

    fireEvent.click(within(profileCard).getByRole("button", { name: "Show Ada game history from profile" }));

    await screen.findByRole("region", { name: "Head-to-head with Ada" });
    fireEvent.click(await within(profileCard).findByRole("button", {
      name: "Rematch Ada from latest head-to-head game game_profile_h2h_latest_rematch",
    }));

    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Ada", {
      intent: "rematch",
      sourceGameId: "game_profile_h2h_latest_rematch",
    }));
    expect(await screen.findByText("Rematch challenge created for Ada.")).toBeInTheDocument();
  });

  it("shows public rating summaries on profile cards and followed players", async () => {
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile(
        "Ada",
        {},
        { visibility: "visible", status: "online" },
        publicRating({ rating: 1612, display: "1612", provisional: false, games: 24, updatedAt: "2026-06-04T12:00:00.000Z" })
      ),
    });

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Samir", { following: true }, {}, publicRating()),
        ])}
        loadAccountProfile={loadAccountProfile}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const following = await within(people).findByRole("region", { name: "Followed players" });
    const samirRow = within(following).getByText("Samir").closest("article");
    expect(samirRow).not.toBeNull();
    expect(within(samirRow as HTMLElement).getByTitle("0 rated games")).toHaveTextContent("1500?");

    fireEvent.change(within(people).getByRole("textbox", { name: "Search account name" }), {
      target: { value: "Ada" },
    });
    fireEvent.click(within(people).getByRole("button", { name: "Find Account" }));

    const profileCard = await within(people).findByRole("article", { name: "Profile Ada" });
    expect(within(profileCard).getByTitle("24 rated games")).toHaveTextContent("1612");
  });

  it("shows sanitized public rating leaders in the People panel", async () => {
    const loadRatingLeaderboard = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      schemaVersion: 1,
      scope: "global",
      entries: [
        {
          schemaVersion: 1,
          displayName: "Cleo",
          rating: publicRating({
            rating: 1620,
            display: "1620",
            provisional: false,
            games: 8,
            updatedAt: "2026-06-04T12:00:00.000Z",
          }),
        },
        {
          schemaVersion: 1,
          displayName: "Ben",
          rating: publicRating({
            rating: 1590,
            display: "1590?",
            provisional: true,
            games: 3,
            updatedAt: "2026-06-04T12:01:00.000Z",
          }),
        },
      ],
    });

    render(
      <OnlineGameBrowser
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        onReplay={vi.fn()}
        onSpectate={vi.fn()}
        onBack={vi.fn()}
        account={accountFixture()}
        {...socialPropsWithFollowing([])}
        loadRatingLeaderboard={loadRatingLeaderboard}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const leaders = await within(people).findByRole("region", { name: "Rating leaders" });
    expect(leaders).toHaveTextContent("Rating leaders");
    expect(leaders).toHaveTextContent("2 players");
    const rows = within(leaders).getAllByRole("article");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("1");
    expect(rows[0]).toHaveTextContent("Cleo");
    expect(within(rows[0]).getByTitle("8 rated games")).toHaveTextContent("1620");
    expect(rows[1]).toHaveTextContent("2");
    expect(rows[1]).toHaveTextContent("Ben");
    expect(within(rows[1]).getByTitle("3 rated games")).toHaveTextContent("1590?");
    expect(people).not.toHaveTextContent("account_cleo");
    expect(loadRatingLeaderboard).toHaveBeenCalledWith({ limit: 10, scope: "global" });
  });

  it("opens public profiles directly from rating leader rows", async () => {
    const onOpenProfile = vi.fn();
    render(
      <OnlineGameBrowser
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        onReplay={vi.fn()}
        onSpectate={vi.fn()}
        onBack={vi.fn()}
        account={accountFixture("Liam")}
        {...socialPropsWithFollowing([])}
        loadRatingLeaderboard={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          schemaVersion: 1,
          scope: "global",
          entries: [
            {
              schemaVersion: 1,
              displayName: "Cleo",
              avatar: { schemaVersion: 1, preset: "dragon", color: "violet" },
              rating: publicRating({ rating: 1620, display: "1620", provisional: false, games: 8 }),
            },
          ],
        })}
        onOpenProfile={onOpenProfile}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const leaders = await within(people).findByRole("region", { name: "Rating leaders" });
    fireEvent.click(await within(leaders).findByRole("button", { name: "Open Cleo profile from rating leaders" }));

    expect(onOpenProfile).toHaveBeenCalledWith("Cleo");
  });

  it("switches rating leaders between global and followed-player scopes", async () => {
    const loadRatingLeaderboard = vi.fn()
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        schemaVersion: 1,
        scope: "global",
        entries: [
          {
            schemaVersion: 1,
            displayName: "Cleo",
            rating: publicRating({ rating: 1620, display: "1620", provisional: false, games: 8 }),
          },
        ],
      })
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        schemaVersion: 1,
        scope: "following",
        entries: [
          {
            schemaVersion: 1,
            displayName: "Liam",
            rating: publicRating({ rating: 1550, display: "1550", provisional: false, games: 10 }),
          },
        ],
      });

    render(
      <OnlineGameBrowser
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        onReplay={vi.fn()}
        onSpectate={vi.fn()}
        onBack={vi.fn()}
        account={accountFixture("Liam")}
        {...socialPropsWithFollowing([])}
        loadRatingLeaderboard={loadRatingLeaderboard}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const leaders = await within(people).findByRole("region", { name: "Rating leaders" });
    expect(await within(leaders).findByText("Cleo")).toBeInTheDocument();

    fireEvent.click(within(leaders).getByRole("button", { name: "Following" }));

    await waitFor(() => expect(loadRatingLeaderboard).toHaveBeenLastCalledWith({ limit: 10, scope: "following" }));
    expect(await within(leaders).findByText("Liam")).toBeInTheDocument();
    expect(within(leaders).queryByText("Cleo")).not.toBeInTheDocument();
  });

  it("lets signed-in players watch public live games from profile cards", async () => {
    const onSpectate = vi.fn();
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Ada", {}, { visibility: "visible", status: "online" }),
    });
    const liveGame = summary({
      gameId: "game_profile_watch",
      participants: [
        registeredParticipant("w", "Ada"),
        registeredParticipant("b", "Ben"),
      ],
    });
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([liveGame]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountProfile={loadAccountProfile}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.change(within(people).getByRole("textbox", { name: "Search account name" }), {
      target: { value: "Ada" },
    });
    fireEvent.click(within(people).getByRole("button", { name: "Find Account" }));

    const profileCard = await within(people).findByRole("article", { name: "Profile Ada" });
    fireEvent.click(within(profileCard).getByRole("button", {
      name: "Watch Ada's live game from profile Ada vs Ben, game_profile_watch",
    }));

    expect(onSpectate).toHaveBeenCalledWith("game_profile_watch");
  });

  it("lets signed-in players watch followed players who are in public live games", async () => {
    const onSpectate = vi.fn();
    const followedLiveGame = summary({
      gameId: "game_friend_live",
      participants: [
        registeredParticipant("w", "Ben"),
        registeredParticipant("b", "Samir"),
      ],
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([followedLiveGame]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Ada", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Samir", { following: true }, { visibility: "visible", status: "online" }),
        ])}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const following = await within(people).findByRole("region", { name: "Followed players" });
    const samirName = await within(following).findByText("Samir");
    const samirRow = samirName.closest("article");
    expect(samirRow).not.toBeNull();
    expect(samirRow as HTMLElement).toHaveTextContent("Playing now");
    expect(within(samirRow as HTMLElement).getByRole("button", {
      name: "Watch Samir's live game Ben vs Samir, game_friend_live",
    })).toBeInTheDocument();

    const adaRow = within(following).getByText("Ada").closest("article");
    expect(adaRow).not.toBeNull();
    expect(within(adaRow as HTMLElement).queryByRole("button", { name: /Watch Ada/i })).not.toBeInTheDocument();

    fireEvent.click(within(samirRow as HTMLElement).getByRole("button", {
      name: "Watch Samir's live game Ben vs Samir, game_friend_live",
    }));
    expect(onSpectate).toHaveBeenCalledWith("game_friend_live");
  });

  it("shows an online-now rail for followed players with quick actions", async () => {
    const onSpectate = vi.fn();
    const onChallengeAccount = vi.fn().mockResolvedValue(undefined);
    const onCopyChallengeAccountInvite = vi.fn().mockResolvedValue(undefined);
    const followedLiveGame = summary({
      gameId: "game_friend_rail_live",
      participants: [
        registeredParticipant("w", "Ben"),
        registeredParticipant("b", "Samir"),
      ],
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([followedLiveGame]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Zed", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Mira", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Omar", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Ada", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Ben", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Yara", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Samir", { following: true, followedBy: true }, { visibility: "visible", status: "online" }),
          publicProfile("Kai", { following: true }, { visibility: "visible", status: "away" }),
        ])}
        onChallengeAccount={onChallengeAccount}
        onCopyChallengeAccountInvite={onCopyChallengeAccountInvite}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const onlineNow = await within(people).findByRole("region", { name: "Online followed players now" });
    expect(onlineNow).toHaveTextContent("Online now");
    expect(onlineNow).toHaveTextContent("7 players");
    expect(onlineNow).toHaveTextContent("+1 more online");
    expect(within(onlineNow).queryByText("Kai")).not.toBeInTheDocument();
    expect(within(onlineNow).queryByText("Zed")).not.toBeInTheDocument();

    const samirCard = within(onlineNow).getByText("Samir").closest("article");
    expect(samirCard).not.toBeNull();
    expect(samirCard as HTMLElement).toHaveTextContent("Playing now");
    fireEvent.click(within(samirCard as HTMLElement).getByRole("button", {
      name: "Watch Samir's live game from online now Ben vs Samir, game_friend_rail_live",
    }));
    expect(onSpectate).toHaveBeenCalledWith("game_friend_rail_live");

    fireEvent.click(within(samirCard as HTMLElement).getByRole("button", { name: "Challenge Samir from online now" }));
    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir"));

    fireEvent.click(within(samirCard as HTMLElement).getByRole("button", {
      name: "Copy challenge invite for Samir from online now",
    }));
    await waitFor(() => expect(onCopyChallengeAccountInvite).toHaveBeenCalledWith("Samir"));

    fireEvent.click(within(samirCard as HTMLElement).getByRole("button", { name: "Select Samir from online now" }));
    expect(await within(people).findByRole("article", { name: "Profile Samir" })).toHaveTextContent("Mutual friend");
    expect(await within(people).findByText("Selected Samir from online now.")).toBeInTheDocument();
  });

  it("pins followed players above unpinned players in the online-now rail", async () => {
    const storageKey = "castles_online_pinned_following_v1:account_pinner";
    const account = accountFixture("Pinner");
    const following = [
      publicProfile("Zed", { following: true }, { visibility: "visible", status: "online" }),
      publicProfile("Mira", { following: true }, { visibility: "visible", status: "online" }),
      publicProfile("Omar", { following: true }, { visibility: "visible", status: "online" }),
      publicProfile("Ada", { following: true }, { visibility: "visible", status: "online" }),
      publicProfile("Ben", { following: true }, { visibility: "visible", status: "online" }),
      publicProfile("Yara", { following: true }, { visibility: "visible", status: "online" }),
      publicProfile("Samir", { following: true, followedBy: true }, { visibility: "visible", status: "online" }),
    ];

    window.localStorage.removeItem(storageKey);
    try {
      const props = {
        initialTab: "lobby" as const,
        loadGames: vi.fn().mockResolvedValue(directory([])),
        loadOpenSeeks: vi.fn().mockResolvedValue(seekDirectory([])),
        onBack: vi.fn(),
        onSpectate: vi.fn(),
        onReplay: vi.fn(),
        account,
        accountStatus: "ready" as const,
        ...socialPropsWithFollowing(following),
      };
      const { unmount } = render(<OnlineGameBrowser {...props} />);

      const people = await screen.findByRole("region", { name: "People" });
      const onlineNow = await within(people).findByRole("region", { name: "Online followed players now" });
      expect(onlineNow).toHaveTextContent("+1 more online");
      expect(within(onlineNow).queryByText("Zed")).not.toBeInTheDocument();

      const followedPlayers = await within(people).findByRole("region", { name: "Followed players" });
      const zedRow = within(followedPlayers).getByText("Zed").closest("article");
      expect(zedRow).not.toBeNull();
      fireEvent.click(within(zedRow as HTMLElement).getByRole("button", { name: "Pin Zed from following list" }));

      await waitFor(() => expect(within(onlineNow).getByText("Zed")).toBeInTheDocument());
      expect(within(onlineNow).queryByText("Yara")).not.toBeInTheDocument();
      const pinnedZedCard = within(onlineNow).getByText("Zed").closest("article");
      expect(pinnedZedCard).not.toBeNull();
      expect(pinnedZedCard as HTMLElement).toHaveTextContent("Pinned");
      expect(within(zedRow as HTMLElement).getByRole("button", { name: "Unpin Zed from following list" })).toBeInTheDocument();

      unmount();
      render(<OnlineGameBrowser {...props} />);

      const restoredPeople = await screen.findByRole("region", { name: "People" });
      const restoredOnlineNow = await within(restoredPeople).findByRole("region", { name: "Online followed players now" });
      await waitFor(() => expect(restoredOnlineNow).toHaveTextContent("Zed"));
      expect(restoredOnlineNow).toHaveTextContent("Pinned");
    } finally {
      window.localStorage.removeItem(storageKey);
    }
  });

  it("stores private notes for followed players locally and restores them", async () => {
    const storageKey = "castles_online_following_notes_v1:account_notetaker";
    const account = accountFixture("NoteTaker");
    const props = {
      initialTab: "lobby" as const,
      loadGames: vi.fn().mockResolvedValue(directory([])),
      loadOpenSeeks: vi.fn().mockResolvedValue(seekDirectory([])),
      onBack: vi.fn(),
      onSpectate: vi.fn(),
      onReplay: vi.fn(),
      account,
      accountStatus: "ready" as const,
      ...socialPropsWithFollowing([publicProfile("Samir", { following: true })]),
    };

    window.localStorage.removeItem(storageKey);
    try {
      const { unmount } = render(<OnlineGameBrowser {...props} />);
      const following = await screen.findByRole("region", { name: "Followed players" });
      const samirRow = (await within(following).findByText("Samir")).closest("article");
      expect(samirRow).not.toBeNull();

      fireEvent.click(within(samirRow as HTMLElement).getByRole("button", { name: "Add private note for Samir" }));
      fireEvent.change(within(samirRow as HTMLElement).getByRole("textbox", { name: "Private note for Samir" }), {
        target: { value: "Reliable weekend opponent" },
      });
      fireEvent.click(within(samirRow as HTMLElement).getByRole("button", { name: "Save Note" }));

      await waitFor(() => expect(samirRow as HTMLElement).toHaveTextContent("Reliable weekend opponent"));
      expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")).toEqual({
        samir: "Reliable weekend opponent",
      });

      unmount();
      render(<OnlineGameBrowser {...props} />);
      const restoredFollowing = await screen.findByRole("region", { name: "Followed players" });
      const restoredSamirRow = (await within(restoredFollowing).findByText("Samir")).closest("article");
      expect(restoredSamirRow).not.toBeNull();
      expect(restoredSamirRow as HTMLElement).toHaveTextContent("Reliable weekend opponent");
      expect(within(restoredSamirRow as HTMLElement).getByRole("button", { name: "Edit private note for Samir" })).toBeInTheDocument();
    } finally {
      window.localStorage.removeItem(storageKey);
    }
  });

  it("removes private notes when a followed player is unfollowed", async () => {
    const storageKey = "castles_online_following_notes_v1:account_notetaker";
    const account = accountFixture("NoteTaker");
    let currentFollowing = true;
    const followedProfile = publicProfile("Samir", { following: true });
    const socialProps = socialPropsWithFollowing([followedProfile]);
    const loadAccountFollowing = vi.fn().mockImplementation(() => Promise.resolve({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      following: currentFollowing ? [followedProfile] : [],
    }));
    const onUnfollowAccount = vi.fn().mockImplementation(() => {
      currentFollowing = false;
      return Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: publicProfile("Samir"),
      });
    });

    window.localStorage.setItem(storageKey, JSON.stringify({ samir: "Prep sharp openings" }));
    try {
      render(
        <OnlineGameBrowser
          initialTab="lobby"
          loadGames={vi.fn().mockResolvedValue(directory([]))}
          loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
          onBack={vi.fn()}
          onSpectate={vi.fn()}
          onReplay={vi.fn()}
          account={account}
          accountStatus="ready"
          {...socialProps}
          loadAccountFollowing={loadAccountFollowing}
          onUnfollowAccount={onUnfollowAccount}
        />
      );

      const following = await screen.findByRole("region", { name: "Followed players" });
      const samirRow = (await within(following).findByText("Samir")).closest("article");
      expect(samirRow).not.toBeNull();
      expect(samirRow as HTMLElement).toHaveTextContent("Prep sharp openings");

      fireEvent.click(within(samirRow as HTMLElement).getByRole("button", { name: "Unfollow Samir from following list" }));

      await waitFor(() => expect(onUnfollowAccount).toHaveBeenCalledWith("Samir"));
      expect(await within(following).findByText("No followed players yet.")).toBeInTheDocument();
      expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")).toEqual({});
    } finally {
      window.localStorage.removeItem(storageKey);
    }
  });

  it("submits account reports from followed-player rows", async () => {
    const onReportAccount = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      report: {
        schemaVersion: 1,
        targetDisplayName: "Samir",
        reason: "cheating",
        createdAt: "2026-06-05T12:00:00.000Z",
      },
    });

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Reporter")}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        onReportAccount={onReportAccount}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const following = await within(people).findByRole("region", { name: "Followed players" });
    const samirRow = (await within(following).findByText("Samir")).closest("article");
    expect(samirRow).not.toBeNull();

    fireEvent.click(within(samirRow as HTMLElement).getByRole("button", { name: "Report Samir from following list" }));

    const reportForm = within(people).getByRole("form", { name: "Report Samir" });
    fireEvent.change(within(reportForm).getByRole("combobox", { name: "Reason" }), {
      target: { value: "cheating" },
    });
    fireEvent.change(within(reportForm).getByRole("textbox", { name: "Details" }), {
      target: { value: "Repeated impossible moves" },
    });
    fireEvent.click(within(reportForm).getByRole("button", { name: "Submit Report" }));

    await waitFor(() =>
      expect(onReportAccount).toHaveBeenCalledWith("Samir", {
        reason: "cheating",
        details: "Repeated impossible moves",
      })
    );
    expect(await within(people).findByText("Report submitted for Samir.")).toBeInTheDocument();
    expect(within(people).queryByRole("form", { name: "Report Samir" })).not.toBeInTheDocument();
  });

  it("labels mutual friends and accounts that follow the signed-in player", async () => {
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Mira", { followedBy: true }, { visibility: "visible", status: "recent" }),
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Ada", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Samir", { following: true, followedBy: true }, { visibility: "visible", status: "online" }),
        ])}
        loadAccountProfile={loadAccountProfile}
      />
    );

    const following = await screen.findByRole("region", { name: "Followed players" });
    const samirRow = (await within(following).findByText("Samir")).closest("article");
    const adaRow = within(following).getByText("Ada").closest("article");
    expect(samirRow).not.toBeNull();
    expect(adaRow).not.toBeNull();
    expect(samirRow as HTMLElement).toHaveTextContent("Mutual friend");
    expect(adaRow as HTMLElement).toHaveTextContent("Following");
    expect(adaRow as HTMLElement).not.toHaveTextContent("Mutual friend");

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.change(within(people).getByRole("textbox", { name: "Search account name" }), {
      target: { value: "Mira" },
    });
    fireEvent.click(within(people).getByRole("button", { name: "Find Account" }));

    const profileCard = await within(people).findByRole("article", { name: "Profile Mira" });
    expect(profileCard).toHaveTextContent("Follows you");
    expect(profileCard).not.toHaveTextContent("Not followed");
  });

  it("surfaces incoming account challenge actions in followed-player rows", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const acceptedSummary = {
      ...pendingSummary,
      updatedAt: "2026-06-03T12:02:00.000Z",
      status: "accepted" as const,
      acceptedAt: "2026-06-03T12:02:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_friend_accept",
      whiteIdentity: pendingSummary.challengerIdentity,
      blackIdentity: account.identity,
      lastEventId: "challenge_samir_liam_friend_accept_evt",
    };
    const loadAccountChallenges = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([
        {
          role: "challenged",
          summary: pendingSummary,
        },
      ]),
    });
    const onAcceptAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenged",
      summary: acceptedSummary,
      gameInvite: {
        gameId: "game_friend_accept",
        seat: "b",
        token: "friend-accept-token",
        url: "https://castles.example/?onlineGame=game_friend_accept&seat=b",
      },
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        loadAccountChallenges={loadAccountChallenges}
        onAcceptAccountChallenge={onAcceptAccountChallenge}
        onDeclineAccountChallenge={vi.fn()}
      />
    );

    const following = await screen.findByRole("region", { name: "Followed players" });
    const samirName = await within(following).findByText("Samir");
    const samirRow = samirName.closest("article");
    expect(samirRow).not.toBeNull();
    expect(samirRow as HTMLElement).toHaveTextContent("Incoming challenge");
    expect(within(samirRow as HTMLElement).queryByRole("button", { name: "Challenge Samir" })).not.toBeInTheDocument();

    fireEvent.click(within(samirRow as HTMLElement).getByRole("button", { name: "Accept challenge from Samir" }));

    await waitFor(() => expect(onAcceptAccountChallenge).toHaveBeenCalledWith("challenge_samir_liam"));
    expect(await screen.findByText("Challenge accepted.")).toBeInTheDocument();
  });

  it("surfaces outgoing account challenge cancellation in followed-player rows", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({
      challengeId: "challenge_liam_samir",
      challengerIdentity: account.identity,
      challengedIdentity: { kind: "registered", id: "account_samir", displayName: "Samir" },
    });
    const cancelledSummary = {
      ...pendingSummary,
      updatedAt: "2026-06-03T12:02:00.000Z",
      status: "cancelled" as const,
      cancelledAt: "2026-06-03T12:02:00.000Z",
      cancelledBy: account.identity,
      lastEventId: "challenge_liam_samir_cancelled_evt",
    };
    const loadAccountChallenges = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([
        {
          role: "challenger",
          summary: pendingSummary,
        },
      ]),
    });
    const onCancelAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenger",
      summary: cancelledSummary,
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        loadAccountChallenges={loadAccountChallenges}
        onCancelAccountChallenge={onCancelAccountChallenge}
      />
    );

    const following = await screen.findByRole("region", { name: "Followed players" });
    const samirName = await within(following).findByText("Samir");
    const samirRow = samirName.closest("article");
    expect(samirRow).not.toBeNull();
    expect(samirRow as HTMLElement).toHaveTextContent("Challenge sent");
    expect(within(samirRow as HTMLElement).queryByRole("button", { name: "Challenge Samir" })).not.toBeInTheDocument();

    fireEvent.click(within(samirRow as HTMLElement).getByRole("button", { name: "Cancel challenge to Samir" }));

    await waitFor(() => expect(onCancelAccountChallenge).toHaveBeenCalledWith("challenge_liam_samir"));
    expect(await screen.findByText("Challenge cancelled.")).toBeInTheDocument();
  });

  it("orders followed players by visible online status before display name", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Zed", { following: true }),
          publicProfile("Mira", { following: true }, { visibility: "visible", status: "offline" }),
          publicProfile("Omar", { following: true }, { visibility: "visible", status: "away" }),
          publicProfile("Ada", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Ben", { following: true }, { visibility: "visible", status: "recent" }),
        ])}
      />
    );

    const following = await screen.findByRole("region", { name: "Followed players" });
    expect(await within(following).findByText("Ada")).toBeInTheDocument();
    const rows = within(following).getAllByRole("article");

    expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual([
      "Ada",
      "Ben",
      "Omar",
      "Mira",
      "Zed",
    ]);
    expect(rows[0]).toHaveTextContent("Online");
    expect(rows[1]).toHaveTextContent("Active recently");
    expect(rows[2]).toHaveTextContent("Away");
    expect(rows[3]).toHaveTextContent("Offline");
    expect(rows[4]).toHaveTextContent("Presence hidden");
  });

  it("filters followed players to online accounts without losing the full list", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Ada", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Ben", { following: true }, { visibility: "visible", status: "recent" }),
          publicProfile("Zed", { following: true }),
        ])}
      />
    );

    const following = await screen.findByRole("region", { name: "Followed players" });
    expect(await within(following).findByText("Ada")).toBeInTheDocument();
    expect(within(following).getByText("3 players")).toBeInTheDocument();

    fireEvent.click(within(following).getByRole("button", { name: "Show online followed players" }));
    expect(within(following).getByText("1 online")).toBeInTheDocument();
    let rows = within(following).getAllByRole("article");
    expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual(["Ada"]);

    fireEvent.click(within(following).getByRole("button", { name: "Show all followed players" }));
    expect(within(following).getByText("3 players")).toBeInTheDocument();
    rows = within(following).getAllByRole("article");
    expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual(["Ada", "Ben", "Zed"]);
  });

  it("shows an empty online-friends state when followed players are offline or hidden", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Mira", { following: true }, { visibility: "visible", status: "away" }),
          publicProfile("Zed", { following: true }),
        ])}
      />
    );

    const following = await screen.findByRole("region", { name: "Followed players" });
    expect(await within(following).findByText("Mira")).toBeInTheDocument();

    fireEvent.click(within(following).getByRole("button", { name: "Show online followed players" }));

    expect(within(following).getByText("0 online")).toBeInTheDocument();
    expect(within(following).getByText("No followed players online.")).toBeInTheDocument();
    expect(within(following).queryByRole("article")).not.toBeInTheDocument();
  });

  it("auto-refreshes followed-player presence while visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const loadAccountFollowing = vi
      .fn()
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        following: [
          publicProfile("Samir", { following: true }, { visibility: "visible", status: "offline" }),
        ],
      })
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        following: [
          publicProfile("Samir", { following: true }, { visibility: "visible", status: "online" }),
        ],
      });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountFollowing={loadAccountFollowing}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const following = screen.getByRole("region", { name: "Followed players" });
    expect(loadAccountFollowing).toHaveBeenCalledTimes(1);
    expect(within(following).getByText("Samir")).toBeInTheDocument();
    expect(within(following).getByText("Offline")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadAccountFollowing).toHaveBeenCalledTimes(2);
    expect(within(following).getByText("Samir")).toBeInTheDocument();
    const samirRow = within(following).getByText("Samir").closest("article");
    expect(samirRow).not.toBeNull();
    expect(within(samirRow as HTMLElement).getByText("Online")).toBeInTheDocument();
  });

  it("loads account challenges automatically and still allows manual refresh", async () => {
    const account = accountFixture("Liam");
    const loadAccountChallenges = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([
        {
          role: "challenged",
          summary: accountChallengeSummary({ challengedIdentity: account.identity }),
        },
      ]),
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        loadAccountChallenges={loadAccountChallenges}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenCalledWith({ state: "all" }));
    const notice = within(people).getByRole("region", { name: "Pending challenge notice" });
    expect(notice).toHaveTextContent("1 incoming challenge awaiting your response");
    fireEvent.click(within(notice).getByRole("button", { name: "View Challenges" }));
    await waitFor(() => expect(challenges).toHaveFocus());
    expect(await within(challenges).findByText("Samir")).toBeInTheDocument();
    expect(within(challenges).getByText("Incoming")).toBeInTheDocument();
    expect(within(challenges).getByText("Awaiting your response")).toBeInTheDocument();
    expect(within(challenges).getByText("Random side")).toBeInTheDocument();

    const callsBeforeManualRefresh = loadAccountChallenges.mock.calls.length;
    fireEvent.click(within(challenges).getByRole("button", { name: "Refresh Inbox" }));

    await waitFor(() => expect(loadAccountChallenges.mock.calls.length).toBeGreaterThan(callsBeforeManualRefresh));
    expect(await within(challenges).findByText("Samir")).toBeInTheDocument();
  });

  it("labels persisted rematch requests in account challenge rows", async () => {
    const account = accountFixture("Liam");
    const rematchSummary = accountChallengeSummary({
      challengedIdentity: account.identity,
      intent: "rematch",
      sourceGameId: "game_source_rematch",
      rematch: {
        schemaVersion: 1,
        sourceGameId: "game_source_rematch",
        requesterDisplayName: "Samir",
        responderDisplayName: "Liam",
        requestedAt: "2026-06-03T12:00:00.000Z",
      },
    } as Partial<OnlineChallengeSummary>);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        loadAccountChallenges={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          ...accountChallengeDirectory([{ role: "challenged", summary: rematchSummary }]),
        })}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    const rowLabel = await within(challenges).findByText("Samir");
    const row = rowLabel.closest("article");

    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Incoming")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Rematch")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Source game game_source_rematch")).toBeInTheDocument();
  });

  it("emphasizes pending account challenges that expire soon", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-03T12:08:30.000Z"));
    const account = accountFixture("Liam");
    const expiringSummary = accountChallengeSummary({
      challengedIdentity: account.identity,
      expiresAt: "2026-06-03T12:10:30.000Z",
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          ...accountChallengeDirectory([{ role: "challenged", summary: expiringSummary }]),
        })}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    const row = await within(challenges).findByText("Samir");
    const article = row.closest("article");
    expect(article).not.toBeNull();
    expect(within(article as HTMLElement).getByText("Expires soon")).toBeInTheDocument();
    expect(within(article as HTMLElement).getByText("2 min left")).toBeInTheDocument();
  });

  it("loads terminal account challenge history from the default all inbox filter", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const acceptedSummary = accountChallengeSummary({
      challengeId: "challenge_ada_liam",
      challengerIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      challengedIdentity: account.identity,
      updatedAt: "2026-06-03T12:03:00.000Z",
      status: "accepted",
      acceptedAt: "2026-06-03T12:03:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_ada_liam",
      whiteIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      blackIdentity: account.identity,
      lastEventId: "challenge_ada_liam_accepted_evt",
    });
    const loadAccountChallenges = vi.fn().mockImplementation((options?: { state?: "pending" | "all" }) =>
      Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory(
          options?.state === "all"
            ? [
                { role: "challenged", summary: acceptedSummary },
                { role: "challenged", summary: pendingSummary },
              ]
            : [{ role: "challenged", summary: pendingSummary }]
        ),
      })
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={loadAccountChallenges}
        onAcceptAccountChallenge={vi.fn()}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenLastCalledWith({ state: "all" }));
    expect(await within(challenges).findByText("2 challenges")).toBeInTheDocument();
    expect(within(challenges).getByText("Ada")).toBeInTheDocument();
    expect(within(challenges).getByText("Accepted")).toBeInTheDocument();
    expect(within(challenges).getByText("Samir")).toBeInTheDocument();
    expect(within(challenges).getByText("Awaiting your response")).toBeInTheDocument();
    const adaRow = within(challenges).getByText("Ada").closest("article");
    expect(adaRow).not.toBeNull();
    expect(within(adaRow as HTMLElement).queryByRole("button", { name: "Accept challenge from Ada" })).not.toBeInTheDocument();
  });

  it("offers account rejoin from accepted account challenge rows with a game id", async () => {
    const account = accountFixture("Liam");
    const acceptedSummary = accountChallengeSummary({
      challengeId: "challenge_ada_liam",
      challengerIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      challengedIdentity: account.identity,
      visibility: "unlisted",
      updatedAt: "2026-06-03T12:03:00.000Z",
      status: "accepted",
      acceptedAt: "2026-06-03T12:03:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_ada_liam",
      whiteIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      blackIdentity: account.identity,
      lastEventId: "challenge_ada_liam_accepted_evt",
    });
    const onRejoinAccountChallengeGame = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          ...accountChallengeDirectory([{ role: "challenged", summary: acceptedSummary }]),
        })}
        onRejoinAccountChallengeGame={onRejoinAccountChallengeGame}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    fireEvent.click(within(challenges).getByRole("button", { name: "Show all account challenges" }));
    const row = await within(challenges).findByText("Ada");
    const article = row.closest("article");
    expect(article).not.toBeNull();

    const joinButton = within(article as HTMLElement).getByRole("button", {
      name: "Join accepted challenge game game_ada_liam against Ada",
    });
    expect(joinButton).toHaveTextContent("Join Game");
    fireEvent.click(joinButton);

    expect(onRejoinAccountChallengeGame).toHaveBeenCalledWith("game_ada_liam", "unlisted");
  });

  it("loads all account challenges by default so accepted games are immediately recoverable", async () => {
    const account = accountFixture("Liam");
    const acceptedSummary = accountChallengeSummary({
      challengeId: "challenge_ada_liam",
      challengerIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      challengedIdentity: account.identity,
      visibility: "unlisted",
      updatedAt: "2026-06-03T12:03:00.000Z",
      status: "accepted",
      acceptedAt: "2026-06-03T12:03:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_ada_liam",
      whiteIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      blackIdentity: account.identity,
      lastEventId: "challenge_ada_liam_accepted_evt",
    });
    const loadAccountChallenges = vi.fn().mockImplementation((options?: { state?: "pending" | "all" }) =>
      Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory(
          options?.state === "all" ? [{ role: "challenged" as const, summary: acceptedSummary }] : []
        ),
      })
    );
    const onRejoinAccountChallengeGame = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={loadAccountChallenges}
        onRejoinAccountChallengeGame={onRejoinAccountChallengeGame}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenCalledWith({ state: "all" }));
    expect(within(challenges).getByRole("button", { name: "Show all account challenges" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    const row = await within(challenges).findByText("Ada");
    const article = row.closest("article");
    expect(article).not.toBeNull();
    expect(within(article as HTMLElement).getByText("Accepted")).toBeInTheDocument();
    const joinButton = within(article as HTMLElement).getByRole("button", {
      name: "Join accepted challenge game game_ada_liam against Ada",
    });
    fireEvent.click(joinButton);

    expect(onRejoinAccountChallengeGame).toHaveBeenCalledWith("game_ada_liam", "unlisted");
  });

  it("offers account rejoin from accepted following-row challenges instead of a duplicate challenge", async () => {
    const account = accountFixture("Liam");
    const acceptedSummary = accountChallengeSummary({
      challengeId: "challenge_ada_liam",
      challengerIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      challengedIdentity: account.identity,
      visibility: "unlisted",
      updatedAt: "2026-06-03T12:03:00.000Z",
      status: "accepted",
      acceptedAt: "2026-06-03T12:03:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_ada_liam",
      whiteIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      blackIdentity: account.identity,
      lastEventId: "challenge_ada_liam_accepted_evt",
    });
    const loadAccountChallenges = vi.fn().mockImplementation((options?: { state?: "pending" | "all" }) =>
      Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory(
          options?.state === "all" ? [{ role: "challenged" as const, summary: acceptedSummary }] : []
        ),
      })
    );
    const onChallengeAccount = vi.fn();
    const onRejoinAccountChallengeGame = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Ada", { following: true })])}
        loadAccountChallenges={loadAccountChallenges}
        onChallengeAccount={onChallengeAccount}
        onRejoinAccountChallengeGame={onRejoinAccountChallengeGame}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    fireEvent.click(within(challenges).getByRole("button", { name: "Show all account challenges" }));
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenLastCalledWith({ state: "all" }));

    const followedPlayers = await within(people).findByRole("region", { name: "Followed players" });
    const adaRow = (await within(followedPlayers).findByText("Ada")).closest("article");
    expect(adaRow).not.toBeNull();

    const joinButton = within(adaRow as HTMLElement).getByRole("button", {
      name: "Join accepted challenge game game_ada_liam against Ada",
    });
    expect(joinButton).toHaveTextContent("Join Game");
    expect(within(adaRow as HTMLElement).queryByRole("button", { name: "Challenge Ada" })).not.toBeInTheDocument();

    fireEvent.click(joinButton);
    expect(onRejoinAccountChallengeGame).toHaveBeenCalledWith("game_ada_liam", "unlisted");
    expect(onChallengeAccount).not.toHaveBeenCalled();
  });

  it("keeps accepted challenge recovery in following rows after switching the inbox to pending", async () => {
    const account = accountFixture("Liam");
    const acceptedSummary = accountChallengeSummary({
      challengeId: "challenge_ada_liam",
      challengerIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      challengedIdentity: account.identity,
      visibility: "unlisted",
      updatedAt: "2026-06-03T12:03:00.000Z",
      status: "accepted",
      acceptedAt: "2026-06-03T12:03:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_ada_liam",
      whiteIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      blackIdentity: account.identity,
      lastEventId: "challenge_ada_liam_accepted_evt",
    });
    const loadAccountChallenges = vi.fn().mockImplementation((options?: { state?: "pending" | "all" }) =>
      Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory(
          options?.state === "all" ? [{ role: "challenged" as const, summary: acceptedSummary }] : []
        ),
      })
    );
    const onChallengeAccount = vi.fn();
    const onRejoinAccountChallengeGame = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Ada", { following: true })])}
        loadAccountChallenges={loadAccountChallenges}
        onChallengeAccount={onChallengeAccount}
        onRejoinAccountChallengeGame={onRejoinAccountChallengeGame}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenLastCalledWith({ state: "all" }));

    const followedPlayers = await within(people).findByRole("region", { name: "Followed players" });
    const adaRow = (await within(followedPlayers).findByText("Ada")).closest("article");
    expect(adaRow).not.toBeNull();
    expect(within(adaRow as HTMLElement).getByText("Game ready")).toBeInTheDocument();
    expect(within(adaRow as HTMLElement).getByRole("button", {
      name: "Join accepted challenge game game_ada_liam against Ada",
    })).toHaveTextContent("Join Game");
    expect(within(adaRow as HTMLElement).queryByRole("button", { name: "Challenge Ada" })).not.toBeInTheDocument();

    fireEvent.click(within(challenges).getByRole("button", { name: "Show pending account challenges" }));

    await waitFor(() => expect(loadAccountChallenges).toHaveBeenLastCalledWith({ state: "pending" }));
    expect(await within(challenges).findByText("No pending account challenges.")).toBeInTheDocument();
    expect(within(adaRow as HTMLElement).getByText("Game ready")).toBeInTheDocument();
    const joinButton = within(adaRow as HTMLElement).getByRole("button", {
      name: "Join accepted challenge game game_ada_liam against Ada",
    });
    expect(joinButton).toHaveTextContent("Join Game");
    expect(within(adaRow as HTMLElement).queryByRole("button", { name: "Challenge Ada" })).not.toBeInTheDocument();

    fireEvent.click(joinButton);
    expect(onRejoinAccountChallengeGame).toHaveBeenCalledWith("game_ada_liam", "unlisted");
    expect(onChallengeAccount).not.toHaveBeenCalled();
  });

  it("drops stale pending following-row challenge actions after a foreground inbox refresh fails", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const loadAccountChallenges = vi
      .fn()
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory([{ role: "challenged" as const, summary: pendingSummary }]),
      })
      .mockRejectedValueOnce(new Error("network unavailable"));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        loadAccountChallenges={loadAccountChallenges}
        onAcceptAccountChallenge={vi.fn()}
        onDeclineAccountChallenge={vi.fn()}
        onChallengeAccount={vi.fn()}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    const following = await within(people).findByRole("region", { name: "Followed players" });
    const samirRow = (await within(following).findByText("Samir")).closest("article");
    expect(samirRow).not.toBeNull();
    expect(samirRow as HTMLElement).toHaveTextContent("Incoming challenge");
    expect(within(samirRow as HTMLElement).getByRole("button", { name: "Accept challenge from Samir" })).toBeInTheDocument();

    fireEvent.click(within(challenges).getByRole("button", { name: "Refresh Inbox" }));

    expect(await within(challenges).findByText("Could not load account challenges.")).toBeInTheDocument();
    expect(samirRow as HTMLElement).not.toHaveTextContent("Incoming challenge");
    expect(within(samirRow as HTMLElement).queryByRole("button", { name: "Accept challenge from Samir" })).not.toBeInTheDocument();
    expect(within(samirRow as HTMLElement).getByRole("button", { name: "Challenge Samir" })).toBeInTheDocument();
  });

  it("keeps accepted following-row game recovery after a foreground inbox refresh fails", async () => {
    const account = accountFixture("Liam");
    const acceptedSummary = accountChallengeSummary({
      challengeId: "challenge_ada_liam",
      challengerIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      challengedIdentity: account.identity,
      visibility: "unlisted",
      updatedAt: "2026-06-03T12:03:00.000Z",
      status: "accepted",
      acceptedAt: "2026-06-03T12:03:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_ada_liam",
      whiteIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      blackIdentity: account.identity,
      lastEventId: "challenge_ada_liam_accepted_evt",
    });
    const loadAccountChallenges = vi
      .fn()
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory([{ role: "challenged" as const, summary: acceptedSummary }]),
      })
      .mockRejectedValueOnce(new Error("network unavailable"));
    const onRejoinAccountChallengeGame = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Ada", { following: true })])}
        loadAccountChallenges={loadAccountChallenges}
        onChallengeAccount={vi.fn()}
        onRejoinAccountChallengeGame={onRejoinAccountChallengeGame}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    const following = await within(people).findByRole("region", { name: "Followed players" });
    const adaRow = (await within(following).findByText("Ada")).closest("article");
    expect(adaRow).not.toBeNull();
    expect(within(adaRow as HTMLElement).getByText("Game ready")).toBeInTheDocument();

    fireEvent.click(within(challenges).getByRole("button", { name: "Refresh Inbox" }));

    expect(await within(challenges).findByText("Could not load account challenges.")).toBeInTheDocument();
    const joinButton = within(adaRow as HTMLElement).getByRole("button", {
      name: "Join accepted challenge game game_ada_liam against Ada",
    });
    expect(joinButton).toHaveTextContent("Join Game");
    expect(within(adaRow as HTMLElement).queryByRole("button", { name: "Challenge Ada" })).not.toBeInTheDocument();

    fireEvent.click(joinButton);
    expect(onRejoinAccountChallengeGame).toHaveBeenCalledWith("game_ada_liam", "unlisted");
  });

  it("ignores a stale all-inbox response after switching to pending challenges", async () => {
    const account = accountFixture("Liam");
    const staleAllLoad = deferredValue<OnlineAccountChallengeDirectoryResponse & { protocolVersion: number }>();
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const acceptedSummary = accountChallengeSummary({
      challengeId: "challenge_ada_liam",
      challengerIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      challengedIdentity: account.identity,
      updatedAt: "2026-06-03T12:03:00.000Z",
      status: "accepted",
      acceptedAt: "2026-06-03T12:03:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_ada_liam",
      whiteIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      blackIdentity: account.identity,
      lastEventId: "challenge_ada_liam_accepted_evt",
    });
    const pendingDirectory = {
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([{ role: "challenged" as const, summary: pendingSummary }]),
    };
    const allDirectory = {
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([{ role: "challenged" as const, summary: acceptedSummary }]),
    };
    const loadAccountChallenges = vi.fn().mockImplementation((options?: { state?: "pending" | "all" }) =>
      options?.state === "all" ? staleAllLoad.promise : Promise.resolve(pendingDirectory)
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={loadAccountChallenges}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenCalledWith({ state: "all" }));
    fireEvent.click(within(challenges).getByRole("button", { name: "Show pending account challenges" }));
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenLastCalledWith({ state: "pending" }));
    expect(await within(challenges).findByText("Samir")).toBeInTheDocument();
    expect(within(challenges).getByText("Awaiting your response")).toBeInTheDocument();

    await act(async () => {
      staleAllLoad.resolve(allDirectory);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(within(challenges).getByText("Samir")).toBeInTheDocument();
    expect(within(challenges).getByText("Awaiting your response")).toBeInTheDocument();
    expect(within(challenges).queryByText("Ada")).not.toBeInTheDocument();
  });

  it("auto-refreshes account challenges while visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const account = accountFixture("Liam");
    const loadAccountChallenges = vi
      .fn()
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory([]),
      })
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory([
          {
            role: "challenged",
            summary: accountChallengeSummary({ challengedIdentity: account.identity }),
          },
        ]),
      });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={loadAccountChallenges}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const people = screen.getByRole("region", { name: "People" });
    const challenges = within(people).getByRole("region", { name: "Account challenges" });
    expect(loadAccountChallenges).toHaveBeenCalledTimes(1);
    expect(within(challenges).getByText("No account challenges yet.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadAccountChallenges).toHaveBeenCalledTimes(2);
    expect(within(challenges).getByText("Samir")).toBeInTheDocument();
  });

  it("surfaces accepted challenge activity from background all-inbox polling while viewing pending", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const account = accountFixture("Liam");
    const acceptedSummary = accountChallengeSummary({
      challengeId: "challenge_ada_liam_ready",
      challengerIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      challengedIdentity: account.identity,
      visibility: "unlisted",
      updatedAt: "2026-06-03T12:04:00.000Z",
      status: "accepted",
      acceptedAt: "2026-06-03T12:04:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_ada_liam_ready",
      whiteIdentity: { kind: "registered", id: "account_ada", displayName: "Ada" },
      blackIdentity: account.identity,
      lastEventId: "challenge_ada_liam_ready_accepted_evt",
    });
    const loadAccountChallenges = vi.fn().mockImplementation((options?: { state?: "pending" | "all" }) =>
      Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory(
          loadAccountChallenges.mock.calls.length >= 2 && options?.state === "all"
            ? [{ role: "challenged" as const, summary: acceptedSummary }]
            : []
        ),
      })
    );
    const onChallengeAccount = vi.fn();
    const onRejoinAccountChallengeGame = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Ada", { following: true })])}
        loadAccountChallenges={loadAccountChallenges}
        onChallengeAccount={onChallengeAccount}
        onRejoinAccountChallengeGame={onRejoinAccountChallengeGame}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenLastCalledWith({ state: "all" }));
    fireEvent.click(within(challenges).getByRole("button", { name: "Show pending account challenges" }));
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenLastCalledWith({ state: "pending" }));
    expect(await within(challenges).findByText("No pending account challenges.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(loadAccountChallenges).toHaveBeenLastCalledWith({ state: "all" }));
    expect(within(challenges).getByText("No pending account challenges.")).toBeInTheDocument();
    const notice = within(people).getByRole("region", { name: "Challenge activity notice" });
    expect(notice).toHaveTextContent("1 accepted challenge game ready");
    expect(notice).toHaveTextContent("New activity");
    const following = await within(people).findByRole("region", { name: "Followed players" });
    const adaRow = (await within(following).findByText("Ada")).closest("article");
    expect(adaRow).not.toBeNull();
    expect(within(adaRow as HTMLElement).getByText("Game ready")).toBeInTheDocument();
    const joinButton = within(adaRow as HTMLElement).getByRole("button", {
      name: "Join accepted challenge game game_ada_liam_ready against Ada",
    });
    expect(within(adaRow as HTMLElement).queryByRole("button", { name: "Challenge Ada" })).not.toBeInTheDocument();

    fireEvent.click(within(notice).getByRole("button", { name: "View Challenges" }));
    await waitFor(() => expect(challenges).toHaveFocus());
    expect(within(people).queryByRole("region", { name: "Challenge activity notice" })).not.toBeInTheDocument();
    fireEvent.click(joinButton);
    expect(onRejoinAccountChallengeGame).toHaveBeenCalledWith("game_ada_liam_ready", "unlisted");
    expect(onChallengeAccount).not.toHaveBeenCalled();
  });

  it("lets signed-in players act on account challenges from the inbox", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const acceptedSummary = {
      ...pendingSummary,
      updatedAt: "2026-06-03T12:02:00.000Z",
      status: "accepted" as const,
      acceptedAt: "2026-06-03T12:02:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_account_accept",
      whiteIdentity: pendingSummary.challengerIdentity,
      blackIdentity: account.identity,
      lastEventId: "challenge_samir_liam_accepted_evt",
    };
    const loadAccountChallenges = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([
        {
          role: "challenged",
          summary: pendingSummary,
        },
      ]),
    });
    const onAcceptAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenged",
      summary: acceptedSummary,
      gameInvite: {
        gameId: "game_account_accept",
        seat: "b",
        token: "fresh-seat-token",
        url: "https://castles.example/?onlineGame=game_account_accept&seat=b",
      },
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={loadAccountChallenges}
        onAcceptAccountChallenge={onAcceptAccountChallenge}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    expect(within(people).getByRole("region", { name: "Pending challenge notice" })).toHaveTextContent(
      "1 incoming challenge awaiting your response"
    );
    fireEvent.click(within(challenges).getByRole("button", { name: "Refresh Inbox" }));
    const row = await within(challenges).findByText("Samir");
    const article = row.closest("article");
    expect(article).not.toBeNull();
    expect(article as HTMLElement).toHaveTextContent("Board Radius 7");
    expect(article as HTMLElement).toHaveTextContent("Clock Timed 20+20");
    expect(article as HTMLElement).toHaveTextContent("Scoring Victory points");
    expect(article as HTMLElement).toHaveTextContent("Rating Casual");

    const acceptButton = within(article as HTMLElement).getByRole("button", { name: "Accept challenge from Samir" });
    expect(acceptButton).toHaveTextContent("Accept & Join");
    fireEvent.click(acceptButton);

    await waitFor(() => expect(onAcceptAccountChallenge).toHaveBeenCalledWith("challenge_samir_liam"));
    expect(await within(challenges).findByText("Accepted")).toBeInTheDocument();
    expect(within(challenges).getByText("Game game_account_accept")).toBeInTheDocument();
    expect(await within(people).findByText("Challenge accepted.")).toBeInTheDocument();
    expect(within(people).queryByRole("region", { name: "Pending challenge notice" })).not.toBeInTheDocument();
  });

  it("keeps a locally accepted challenge visible when a stale inbox refresh returns pending", async () => {
    vi.useFakeTimers();
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const acceptedSummary = {
      ...pendingSummary,
      updatedAt: "2026-06-03T12:02:00.000Z",
      status: "accepted" as const,
      acceptedAt: "2026-06-03T12:02:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_account_accept",
      whiteIdentity: pendingSummary.challengerIdentity,
      blackIdentity: account.identity,
      lastEventId: "challenge_samir_liam_accepted_evt",
    };
    const staleAllRefresh = deferredValue<
      OnlineAccountChallengeDirectoryResponse & { protocolVersion: number }
    >();
    const stalePendingDirectory = {
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([{ role: "challenged", summary: pendingSummary }]),
    };
    const loadAccountChallenges = vi
      .fn()
      .mockResolvedValueOnce(stalePendingDirectory)
      .mockReturnValueOnce(staleAllRefresh.promise);
    const onAcceptAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenged",
      summary: acceptedSummary,
      gameInvite: {
        gameId: "game_account_accept",
        seat: "b",
        token: "fresh-seat-token",
        url: "https://castles.example/?onlineGame=game_account_accept&seat=b",
      },
    });

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={loadAccountChallenges}
        onAcceptAccountChallenge={onAcceptAccountChallenge}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const people = screen.getByRole("region", { name: "People" });
    const challenges = within(people).getByRole("region", { name: "Account challenges" });
    expect(within(challenges).getByText("Samir")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadAccountChallenges).toHaveBeenCalledTimes(2);

    fireEvent.click(within(challenges).getByRole("button", { name: "Accept challenge from Samir" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(within(challenges).getByText("Accepted")).toBeInTheDocument();

    await act(async () => {
      staleAllRefresh.resolve(stalePendingDirectory);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(within(challenges).getByText("Accepted")).toBeInTheDocument();
    expect(within(challenges).getByText("Game game_account_accept")).toBeInTheDocument();
    expect(within(people).getByText("Challenge accepted.")).toBeInTheDocument();
  });

  it("clears a locally accepted challenge when an authoritative all-inbox refresh omits it", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const acceptedSummary = {
      ...pendingSummary,
      updatedAt: "2026-06-03T12:02:00.000Z",
      status: "accepted" as const,
      acceptedAt: "2026-06-03T12:02:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_account_accept",
      whiteIdentity: pendingSummary.challengerIdentity,
      blackIdentity: account.identity,
      lastEventId: "challenge_samir_liam_accepted_evt",
    };
    const loadAccountChallenges = vi
      .fn()
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory([{ role: "challenged", summary: pendingSummary }]),
      })
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        ...accountChallengeDirectory([]),
      });
    const onAcceptAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenged",
      summary: acceptedSummary,
      gameInvite: {
        gameId: "game_account_accept",
        seat: "b",
        token: "fresh-seat-token",
        url: "https://castles.example/?onlineGame=game_account_accept&seat=b",
      },
    });

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={loadAccountChallenges}
        onAcceptAccountChallenge={onAcceptAccountChallenge}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    const row = await within(challenges).findByText("Samir");
    const article = row.closest("article");
    expect(article).not.toBeNull();

    fireEvent.click(within(article as HTMLElement).getByRole("button", { name: "Accept challenge from Samir" }));
    await waitFor(() => expect(onAcceptAccountChallenge).toHaveBeenCalledWith("challenge_samir_liam"));
    expect(await within(challenges).findByText("Accepted")).toBeInTheDocument();

    fireEvent.click(within(challenges).getByRole("button", { name: "Refresh Inbox" }));
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenCalledTimes(2));

    expect(within(challenges).queryByText("Accepted")).not.toBeInTheDocument();
    expect(within(challenges).queryByText("Game game_account_accept")).not.toBeInTheDocument();
    expect(within(challenges).getByText("No account challenges yet.")).toBeInTheDocument();
  });

  it("synchronizes the count-only Online navigation badge after declining an inbox challenge", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const declinedSummary = {
      ...pendingSummary,
      updatedAt: "2026-06-03T12:02:00.000Z",
      status: "declined" as const,
      declinedAt: "2026-06-03T12:02:00.000Z",
      declinedBy: account.identity,
      lastEventId: "challenge_samir_liam_declined_evt",
    };
    const loadAccountChallenges = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([{ role: "challenged", summary: pendingSummary }]),
    });
    const loadGames = vi.fn().mockResolvedValue(directory([]));
    const loadOpenSeeks = vi.fn().mockResolvedValue(seekDirectory([]));
    const onBack = vi.fn();
    const onSpectate = vi.fn();
    const onReplay = vi.fn();
    const onDeclineAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenged",
      summary: declinedSummary,
    });
    const BrowserWithParentNotificationState = () => {
      const [onlineNotificationCount, setOnlineNotificationCount] = React.useState(1);
      return (
        <OnlineGameBrowser
          initialTab="lobby"
          loadGames={loadGames}
          loadOpenSeeks={loadOpenSeeks}
          onBack={onBack}
          onSpectate={onSpectate}
          onReplay={onReplay}
          account={account}
          accountStatus="ready"
          {...socialPropsWithFollowing()}
          loadAccountChallenges={loadAccountChallenges}
          onDeclineAccountChallenge={onDeclineAccountChallenge}
          onlineNotificationCount={onlineNotificationCount}
          onlineNotificationLabel="challenge activities"
          onAccountChallengeNavigationActivityChange={setOnlineNotificationCount}
        />
      );
    };

    render(<BrowserWithParentNotificationState />);

    expect(await screen.findByRole("button", { name: "Online, 1 challenge activity" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    const row = await within(challenges).findByText("Samir");
    const article = row.closest("article");
    expect(article).not.toBeNull();

    fireEvent.click(within(article as HTMLElement).getByRole("button", { name: "Decline challenge from Samir" }));

    await waitFor(() => expect(onDeclineAccountChallenge).toHaveBeenCalledWith("challenge_samir_liam"));
    expect(await within(challenges).findByText("No account challenges yet.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Online" })).toHaveAttribute("aria-current", "page")
    );
    expect(screen.queryByRole("button", { name: "Online, 1 challenge activity" })).not.toBeInTheDocument();
  });

  it("offers block and report actions from registered account challenge rows", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    let blockedOpponent = false;
    const socialProps = {
      ...socialPropsWithFollowing(),
      onBlockAccount: vi.fn().mockImplementation(async () => {
        blockedOpponent = true;
        return {
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          profile: publicProfile("Samir", { blocked: true }),
        };
      }),
    };
    const loadAccountChallenges = vi.fn().mockImplementation(async () => ({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory(blockedOpponent ? [] : [{ role: "challenged", summary: pendingSummary }]),
    }));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialProps}
        loadAccountChallenges={loadAccountChallenges}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    const row = await within(challenges).findByText("Samir");
    const article = row.closest("article");
    expect(article).not.toBeNull();

    fireEvent.click(within(article as HTMLElement).getByRole("button", { name: "Report Samir from challenge row" }));

    const reportForm = await within(people).findByRole("form", { name: "Report Samir" });
    fireEvent.change(within(reportForm).getByRole("textbox", { name: "Details" }), {
      target: { value: "Repeated targeted challenge spam." },
    });
    fireEvent.click(within(reportForm).getByRole("button", { name: "Submit Report" }));

    await waitFor(() =>
      expect(socialProps.onReportAccount).toHaveBeenCalledWith("Samir", {
        reason: "abuse",
        details: "Repeated targeted challenge spam.",
      })
    );
    expect(await within(people).findByText("Report submitted for Samir.")).toBeInTheDocument();

    fireEvent.click(within(article as HTMLElement).getByRole("button", { name: "Block Samir from challenge row" }));

    await waitFor(() => expect(socialProps.onBlockAccount).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByText("Blocked Samir.")).toBeInTheDocument();
    await waitFor(() => expect(within(challenges).queryByText("Samir")).not.toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(within(people).queryByRole("region", { name: "Pending challenge notice" })).not.toBeInTheDocument();
  });

  it("keeps accepted challenge status visible after acting from the all inbox", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const acceptedSummary = {
      ...pendingSummary,
      updatedAt: "2026-06-03T12:02:00.000Z",
      status: "accepted" as const,
      acceptedAt: "2026-06-03T12:02:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_account_accept",
      whiteIdentity: pendingSummary.challengerIdentity,
      blackIdentity: account.identity,
      lastEventId: "challenge_samir_liam_accepted_evt",
    };
    const loadAccountChallenges = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([{ role: "challenged", summary: pendingSummary }]),
    });
    const onAcceptAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenged",
      summary: acceptedSummary,
      gameInvite: {
        gameId: "game_account_accept",
        seat: "b",
        token: "fresh-seat-token",
        url: "https://castles.example/?onlineGame=game_account_accept&seat=b",
      },
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={loadAccountChallenges}
        onAcceptAccountChallenge={onAcceptAccountChallenge}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    fireEvent.click(within(challenges).getByRole("button", { name: "Show all account challenges" }));
    await waitFor(() => expect(loadAccountChallenges).toHaveBeenLastCalledWith({ state: "all" }));
    const row = await within(challenges).findByText("Samir");
    const article = row.closest("article");
    expect(article).not.toBeNull();

    fireEvent.click(within(article as HTMLElement).getByRole("button", { name: "Accept challenge from Samir" }));

    await waitFor(() => expect(onAcceptAccountChallenge).toHaveBeenCalledWith("challenge_samir_liam"));
    expect(await within(challenges).findByText("Accepted")).toBeInTheDocument();
    expect(within(article as HTMLElement).getByText("Game game_account_accept")).toBeInTheDocument();
    expect(within(article as HTMLElement).getByText("Your side Black")).toBeInTheDocument();
    expect(within(article as HTMLElement).queryByText("Random side")).not.toBeInTheDocument();
    expect(within(challenges).queryByText("No pending account challenges.")).not.toBeInTheDocument();
    expect(within(article as HTMLElement).queryByRole("button", { name: "Accept challenge from Samir" })).not.toBeInTheDocument();
  });

  it("surfaces trusted server errors when accepting an account challenge fails", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const onAcceptAccountChallenge = vi.fn().mockRejectedValue(
      new OnlineRequestError(
        429,
        "rate_limited",
        "Too many online challenge requests were sent too quickly."
      )
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          ...accountChallengeDirectory([{ role: "challenged", summary: pendingSummary }]),
        })}
        onAcceptAccountChallenge={onAcceptAccountChallenge}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    const row = await within(challenges).findByText("Samir");
    const article = row.closest("article");
    expect(article).not.toBeNull();

    fireEvent.click(within(article as HTMLElement).getByRole("button", { name: "Accept challenge from Samir" }));

    await waitFor(() => expect(onAcceptAccountChallenge).toHaveBeenCalledWith("challenge_samir_liam"));
    expect(await within(people).findByText("Too many online challenge requests were sent too quickly.")).toBeInTheDocument();
    expect(within(people).queryByText("Could not accept that challenge.")).not.toBeInTheDocument();
  });

  it("does not restore stale pending challenge state after an inbox action", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({ challengedIdentity: account.identity });
    const acceptedSummary = {
      ...pendingSummary,
      updatedAt: "2026-06-03T12:02:00.000Z",
      status: "accepted" as const,
      acceptedAt: "2026-06-03T12:02:00.000Z",
      acceptedBy: account.identity,
      gameId: "game_account_accept",
      whiteIdentity: pendingSummary.challengerIdentity,
      blackIdentity: account.identity,
      lastEventId: "challenge_samir_liam_accepted_evt",
    };
    const staleRefresh = deferredValue<OnlineAccountChallengeDirectoryResponse & { protocolVersion: number }>();
    const pendingDirectory = {
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      ...accountChallengeDirectory([
        {
          role: "challenged" as const,
          summary: pendingSummary,
        },
      ]),
    };
    const loadAccountChallenges = vi
      .fn()
      .mockResolvedValueOnce(pendingDirectory)
      .mockReturnValueOnce(staleRefresh.promise);
    const onAcceptAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenged",
      summary: acceptedSummary,
      gameInvite: {
        gameId: "game_account_accept",
        seat: "b",
        token: "fresh-seat-token",
        url: "https://castles.example/?onlineGame=game_account_accept&seat=b",
      },
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={loadAccountChallenges}
        onAcceptAccountChallenge={onAcceptAccountChallenge}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    const row = await within(challenges).findByText("Samir");
    const article = row.closest("article");
    expect(article).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadAccountChallenges).toHaveBeenCalledTimes(2);

    fireEvent.click(within(article as HTMLElement).getByRole("button", { name: "Accept challenge from Samir" }));
    await waitFor(() => expect(onAcceptAccountChallenge).toHaveBeenCalledWith("challenge_samir_liam"));
    expect(await within(challenges).findByText("Accepted")).toBeInTheDocument();
    expect(within(challenges).getByText("Game game_account_accept")).toBeInTheDocument();

    await act(async () => {
      staleRefresh.resolve(pendingDirectory);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(within(challenges).getByText("Samir")).toBeInTheDocument();
    expect(within(challenges).getByText("Accepted")).toBeInTheDocument();
    expect(within(challenges).getByText("Game game_account_accept")).toBeInTheDocument();
    expect(within(challenges).queryByText("Awaiting your response")).not.toBeInTheDocument();
    expect(within(challenges).queryByRole("button", { name: "Accept challenge from Samir" })).not.toBeInTheDocument();
  });

  it("shows outgoing account challenge cancellation in the inbox", async () => {
    const account = accountFixture("Liam");
    const pendingSummary = accountChallengeSummary({
      challengerIdentity: account.identity,
      challengedIdentity: { kind: "registered", id: "account_samir", displayName: "Samir" },
    });
    const cancelledSummary = {
      ...pendingSummary,
      updatedAt: "2026-06-03T12:02:00.000Z",
      status: "cancelled" as const,
      cancelledAt: "2026-06-03T12:02:00.000Z",
      cancelledBy: account.identity,
      lastEventId: "challenge_samir_liam_cancelled_evt",
    };
    const onCancelAccountChallenge = vi.fn().mockResolvedValue({
      role: "challenger",
      summary: cancelledSummary,
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountChallenges={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          ...accountChallengeDirectory([{ role: "challenger", summary: pendingSummary }]),
        })}
        onCancelAccountChallenge={onCancelAccountChallenge}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    const challenges = await within(people).findByRole("region", { name: "Account challenges" });
    fireEvent.click(within(challenges).getByRole("button", { name: "Refresh Inbox" }));
    const row = await within(challenges).findByText("Samir");
    const article = row.closest("article");
    expect(article).not.toBeNull();
    expect(within(article as HTMLElement).getByText("Outgoing")).toBeInTheDocument();

    fireEvent.click(within(article as HTMLElement).getByRole("button", { name: "Cancel challenge to Samir" }));

    await waitFor(() => expect(onCancelAccountChallenge).toHaveBeenCalledWith("challenge_samir_liam"));
    expect(await within(challenges).findByText("Cancelled")).toBeInTheDocument();
    expect(within(challenges).queryByRole("button", { name: "Cancel challenge to Samir" })).not.toBeInTheDocument();
    expect(await within(people).findByText("Challenge cancelled.")).toBeInTheDocument();
  });

  it("shows a challenge error when the challenge handler rejects", async () => {
    const onChallengeAccount = vi.fn().mockRejectedValue(new Error("setup required"));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        onChallengeAccount={onChallengeAccount}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.click(await within(people).findByRole("button", { name: "Challenge Samir" }));

    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByText("Could not create a challenge for Samir.")).toBeInTheDocument();
  });

  it("shows trusted server challenge errors when account challenge creation is throttled", async () => {
    const onChallengeAccount = vi.fn().mockRejectedValue(
      new OnlineRequestError(
        429,
        "rate_limited",
        "That account already has a pending challenge from you."
      )
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        onChallengeAccount={onChallengeAccount}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.click(await within(people).findByRole("button", { name: "Challenge Samir" }));

    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir"));
    expect(
      await within(people).findByText("That account already has a pending challenge from you.")
    ).toBeInTheDocument();
  });

  it("shows a friend-facing unavailable state when account challenge privacy rejects", async () => {
    const onChallengeAccount = vi.fn().mockRejectedValue(
      new OnlineRequestError(
        403,
        "not_allowed",
        "That account is not accepting challenges."
      )
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        onChallengeAccount={onChallengeAccount}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.click(await within(people).findByRole("button", { name: "Challenge Samir" }));

    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByText("Samir is not available for challenges right now.")).toBeInTheDocument();
  });

  it("shows a copy-invite error when the direct invite handler rejects", async () => {
    const onCopyChallengeAccountInvite = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([publicProfile("Samir", { following: true })])}
        onCopyChallengeAccountInvite={onCopyChallengeAccountInvite}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.click(await within(people).findByRole("button", { name: "Copy challenge invite for Samir" }));

    await waitFor(() => expect(onCopyChallengeAccountInvite).toHaveBeenCalledWith("Samir"));
    expect(await within(people).findByText("Could not copy a challenge invite for Samir.")).toBeInTheDocument();
  });

  it("ignores stale social lookup responses after the account changes", async () => {
    const pendingLookup = deferredValue<{
      protocolVersion: typeof ONLINE_PROTOCOL_VERSION;
      profile: ReturnType<typeof publicProfile>;
    }>();
    const loadAccountProfile = vi.fn().mockReturnValue(pendingLookup.promise);
    const socialProps = {
      loadAccountFollowing: vi.fn().mockResolvedValue({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        following: [],
      }),
      loadAccountProfile,
      onFollowAccount: vi.fn(),
      onUnfollowAccount: vi.fn(),
      onBlockAccount: vi.fn(),
      onUnblockAccount: vi.fn(),
    };
    const { rerender } = render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialProps}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    fireEvent.change(within(people).getByRole("textbox", { name: "Search account name" }), {
      target: { value: "Samir" },
    });
    fireEvent.click(within(people).getByRole("button", { name: "Find Account" }));

    rerender(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Nora")}
        accountStatus="ready"
        {...socialProps}
      />
    );

    await act(async () => {
      pendingLookup.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: publicProfile("Samir"),
      });
    });

    await waitFor(() => expect(loadAccountProfile).toHaveBeenCalledWith("Samir"));
    expect(screen.queryByRole("article", { name: "Profile Samir" })).not.toBeInTheDocument();
  });

  it("keeps account privacy controls out of the Online People panel", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        loadAccountFollowing={vi.fn().mockResolvedValue({
          protocolVersion: ONLINE_PROTOCOL_VERSION,
          following: [],
        })}
        loadAccountProfile={vi.fn()}
        onFollowAccount={vi.fn()}
        onUnfollowAccount={vi.fn()}
        onBlockAccount={vi.fn()}
        onUnblockAccount={vi.fn()}
      />
    );

    const people = await screen.findByRole("region", { name: "People" });
    expect(await within(people).findByText("No followed players yet.")).toBeInTheDocument();
    expect(within(people).queryByRole("combobox", { name: "Who can newly follow me" })).not.toBeInTheDocument();
    expect(within(people).queryByRole("combobox", { name: "Who can see me online" })).not.toBeInTheDocument();
    expect(within(people).queryByRole("combobox", { name: "Who can challenge me" })).not.toBeInTheDocument();
    expect(within(people).queryByText("Could not load social privacy.")).not.toBeInTheDocument();
  });

  it("filters loaded Lobby listings and current games by followed registered players", async () => {
    const socialProps = socialPropsWithFollowing([publicProfile("Samir", { following: true })]);
    const loadOpenSeeks = vi.fn().mockResolvedValue(seekDirectory([
      openSeek({
        seekId: "seek_followed_creator",
        creatorIdentity: { kind: "registered", id: "account_samir", displayName: "samir" },
      }),
      openSeek({
        seekId: "seek_other_creator",
        creatorIdentity: { kind: "registered", id: "account_ben", displayName: "Ben" },
      }),
      openSeek({
        seekId: "seek_session_creator",
        creatorIdentity: { kind: "session", id: "session_samir" },
      }),
    ]));
    const loadGames = vi.fn().mockResolvedValue(directory([
      summary({
        gameId: "game_followed_live",
        participants: [
          registeredParticipant("w", "SAMIR"),
          registeredParticipant("b", "Ada"),
        ],
      }),
      summary({
        gameId: "game_other_live",
        participants: [
          registeredParticipant("w", "Ben"),
          registeredParticipant("b", "Ada"),
        ],
      }),
    ]));

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={loadGames}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialProps}
      />
    );

    expect(await screen.findByText("seek_followed_creator")).toBeInTheDocument();
    expect(await screen.findByText("game_other_live")).toBeInTheDocument();

    const filter = screen.getByRole("combobox", { name: "Followed players filter" });
    await waitFor(() => expect(filter).toBeEnabled());
    fireEvent.change(filter, { target: { value: "followed" } });

    await waitFor(() => expect(screen.queryByText("seek_other_creator")).not.toBeInTheDocument());
    expect(screen.getByText("seek_followed_creator")).toBeInTheDocument();
    expect(screen.queryByText("seek_session_creator")).not.toBeInTheDocument();
    const currentGames = screen.getByRole("region", { name: "Current public games" });
    expect(within(currentGames).getByText("game_followed_live")).toBeInTheDocument();
    expect(within(currentGames).queryByText("game_other_live")).not.toBeInTheDocument();
    expect(within(currentGames).getByRole("group", { name: "Lobby live games overview" })).toHaveTextContent(
      "1 public live game"
    );
    expect(screen.getByText(/Shows loaded listings, public games, and account games/i)).toBeInTheDocument();
    expect(loadOpenSeeks).toHaveBeenCalledWith({ state: "open", limit: 50 });
    expect(loadGames).toHaveBeenCalledWith({ state: "active", limit: 50, cursor: undefined });
  });

  it("can load another lobby listing page while filtering by followed players", async () => {
    const socialProps = socialPropsWithFollowing([publicProfile("Samir", { following: true })]);
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([
        openSeek({
          seekId: "seek_page_one_other",
          creatorIdentity: { kind: "registered", id: "account_ben", displayName: "Ben" },
        }),
      ], "seek_cursor_2"))
      .mockResolvedValueOnce(seekDirectory([
        openSeek({
          seekId: "seek_page_two_followed",
          creatorIdentity: { kind: "registered", id: "account_samir", displayName: "Samir" },
        }),
      ]));

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialProps}
      />
    );

    expect(await screen.findByText("seek_page_one_other")).toBeInTheDocument();
    const filter = screen.getByRole("combobox", { name: "Followed players filter" });
    await waitFor(() => expect(filter).toBeEnabled());
    fireEvent.change(filter, { target: { value: "followed" } });

    expect(await screen.findByText("No loaded lobby listings include followed players.")).toBeInTheDocument();
    expect(screen.getByText("Load more listings to search another page, or follow players from People.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more listings" }));

    await waitFor(() => expect(loadOpenSeeks).toHaveBeenLastCalledWith({
      state: "open",
      limit: 50,
      cursor: "seek_cursor_2",
    }));
    expect(await screen.findByText("seek_page_two_followed")).toBeInTheDocument();
    expect(screen.queryByText("seek_page_one_other")).not.toBeInTheDocument();
  });

  it("clears stale lobby load-more errors after a successful retry", async () => {
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_initial_page" })], "seek_cursor_2"))
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_second_page" })]));

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    expect(await screen.findByText("seek_initial_page")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more listings" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Could not load more lobby listings.");
    fireEvent.click(screen.getByRole("button", { name: "Load more listings" }));

    expect(await screen.findByText("seek_second_page")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).not.toHaveTextContent("Could not load more lobby listings.");
    });
  });

  it("filters loaded Watch games by followed registered participants", async () => {
    const socialProps = socialPropsWithFollowing([publicProfile("Samir", { following: true })]);
    const loadGames = vi.fn().mockResolvedValue(directory([
      summary({
        gameId: "game_watch_followed",
        participants: [
          registeredParticipant("w", "Nora"),
          registeredParticipant("b", "samir"),
        ],
      }),
      summary({
        gameId: "game_watch_registered_other",
        participants: [
          registeredParticipant("w", "Nora"),
          registeredParticipant("b", "Ben"),
        ],
      }),
      summary({
        gameId: "game_watch_session_other",
        participants: [
          { seat: "w", role: "white", identity: { kind: "session", id: "session_samir" } },
          registeredParticipant("b", "Nora"),
        ],
      }),
    ]));

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialProps}
      />
    );

    expect(await screen.findByText("game_watch_followed")).toBeInTheDocument();
    expect(await screen.findByText("game_watch_registered_other")).toBeInTheDocument();

    const filter = screen.getByRole("combobox", { name: "Followed players filter" });
    await waitFor(() => expect(filter).toBeEnabled());
    fireEvent.change(filter, { target: { value: "followed" } });

    await waitFor(() => expect(screen.queryByText("game_watch_registered_other")).not.toBeInTheDocument());
    expect(screen.getByText("game_watch_followed")).toBeInTheDocument();
    expect(screen.queryByText("game_watch_session_other")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Watch live games overview" })).toHaveTextContent("1 public live game");
    expect(loadGames).toHaveBeenCalledWith({ state: "active", limit: 50 });
  });

  it("surfaces followed-player live games directly on Watch", async () => {
    const onSpectate = vi.fn();
    const loadAccountHeadToHeadGames = vi.fn().mockResolvedValue(directory([]));
    const samirLiveGame = summary({
      gameId: "game_watch_friend_samir",
      participants: [
        registeredParticipant("w", "Ben"),
        registeredParticipant("b", "Samir"),
      ],
    });
    const hiddenPresenceLiveGame = summary({
      gameId: "game_watch_friend_hidden",
      participants: [
        registeredParticipant("w", "Kai"),
        registeredParticipant("b", "Nora"),
      ],
    });

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([samirLiveGame, hiddenPresenceLiveGame]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Ada", { following: true }, { visibility: "visible", status: "online" }),
          publicProfile("Kai", { following: true }, { visibility: "hidden", status: "online" }),
          publicProfile("Samir", { following: true }, { visibility: "visible", status: "online" }),
        ])}
        loadAccountHeadToHeadGames={loadAccountHeadToHeadGames}
      />
    );

    const strip = await screen.findByRole("region", { name: "Followed players live now" });
    expect(strip).toHaveTextContent("1 public game");
    expect(strip).toHaveTextContent("Samir");
    expect(within(strip).queryByText("Ada")).not.toBeInTheDocument();
    expect(within(strip).queryByText("Kai")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Followed players filter" })).toHaveValue("all");

    fireEvent.click(within(strip).getByRole("button", {
      name: "Watch Samir's live game from Watch Ben vs Samir, game_watch_friend_samir",
    }));
    expect(onSpectate).toHaveBeenCalledWith("game_watch_friend_samir");

    fireEvent.click(within(strip).getByRole("button", {
      name: "Show Samir game history from Watch live strip",
    }));
    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: "Search online archive" })).toHaveValue("Samir")
    );
    await waitFor(() => expect(loadAccountHeadToHeadGames).toHaveBeenCalledWith("Samir", { limit: 5 }));
    expect(screen.getByText("Showing visible games with Samir.")).toBeInTheDocument();
  });

  it("opens registered player profiles from public game rows", async () => {
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Samir", { followedBy: true }, { visibility: "visible", status: "online" }),
    });
    const liveGame = summary({
      gameId: "game_profile_live",
      participants: [
        registeredParticipant("w", "Samir"),
        registeredParticipant("b", "Ada"),
      ],
    });

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([liveGame]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountProfile={loadAccountProfile}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open Samir profile from game_profile_live" }));

    await waitFor(() => expect(loadAccountProfile).toHaveBeenCalledWith("Samir"));
    const people = screen.getByRole("region", { name: "People" });
    expect(within(people).getByRole("textbox", { name: "Search account name" })).toHaveValue("Samir");
    const profileCard = await within(people).findByRole("article", { name: "Profile Samir" });
    expect(profileCard).toHaveTextContent("Follows you");
    await waitFor(() => expect(profileCard).toHaveFocus());
  });

  it("opens visible player history from the following list in the archive", async () => {
    const account = accountFixture("Liam");
    const accountArchiveSamir = summary({
      gameId: "game_account_history_samir",
      status: "complete",
      archiveState: "archived",
      visibility: "unlisted",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: registeredParticipant("b", "Samir").identity },
      ],
    });
    const accountArchiveBen = summary({
      gameId: "game_account_history_ben",
      status: "complete",
      archiveState: "archived",
      visibility: "unlisted",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: registeredParticipant("b", "Ben").identity },
      ],
    });
    const publicArchiveSamir = summary({
      gameId: "game_public_history_samir",
      status: "complete",
      archiveState: "archived",
      visibility: "public",
      hasTimeControl: false,
      participants: [
        registeredParticipant("w", "Samir"),
        registeredParticipant("b", "Ada"),
      ],
    });
    const publicArchiveBen = summary({
      gameId: "game_public_history_ben",
      status: "complete",
      archiveState: "archived",
      visibility: "public",
      hasTimeControl: false,
      participants: [
        registeredParticipant("w", "Ben"),
        registeredParticipant("b", "Ada"),
      ],
    });
    const loadAccountGames = vi.fn().mockResolvedValue(directory([accountArchiveSamir, accountArchiveBen]));

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([publicArchiveSamir, publicArchiveBen]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Samir", { following: true }, { visibility: "visible", status: "online" }),
        ])}
        loadAccountGames={loadAccountGames}
      />
    );

    const following = await screen.findByRole("region", { name: "Followed players" });
    fireEvent.click(within(following).getByRole("button", {
      name: "Show Samir game history from following list",
    }));

    const search = await screen.findByRole("searchbox", { name: "Search online archive" });
    await waitFor(() => expect(search).toHaveValue("Samir"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Online Archive" })).toHaveAttribute("aria-pressed", "true")
    );
    await waitFor(() => expect(loadAccountGames).toHaveBeenCalledWith({ state: "all", limit: 50 }));

    const accountGames = await screen.findByRole("region", { name: "Your account games" });
    expect(within(accountGames).getByText("game_account_history_samir")).toBeInTheDocument();
    expect(within(accountGames).queryByText("game_account_history_ben")).not.toBeInTheDocument();

    const publicArchive = screen.getByRole("region", { name: "Public archive games" });
    expect(within(publicArchive).getByText("game_public_history_samir")).toBeInTheDocument();
    expect(within(publicArchive).queryByText("game_public_history_ben")).not.toBeInTheDocument();
    expect(screen.getByText("Showing visible games with Samir.")).toBeInTheDocument();

    const historyFilter = screen.getByRole("region", { name: "Archive player history filter" });
    expect(historyFilter).toHaveTextContent("Showing games with Samir.");
    fireEvent.click(within(historyFilter).getByRole("button", { name: "Clear game history filter for Samir" }));

    await waitFor(() => expect(search).toHaveValue(""));
    expect(screen.queryByRole("region", { name: "Archive player history filter" })).not.toBeInTheDocument();
    await waitFor(() => expect(within(accountGames).getByText("game_account_history_ben")).toBeInTheDocument());
    expect(within(publicArchive).getByText("game_public_history_ben")).toBeInTheDocument();
  });

  it("summarizes head-to-head account history after opening a followed player history", async () => {
    const account = accountFixture("Liam");
    const liamWin = summary({
      gameId: "game_h2h_liam_win",
      updatedAt: "2026-06-01T12:06:00.000Z",
      endedAt: "2026-06-01T12:04:00.000Z",
      status: "complete",
      archiveState: "archived",
      visibility: "private",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: registeredParticipant("b", "Samir").identity },
      ],
      result: { winner: "w", reason: "resignation" },
    });
    const samirWin = summary({
      gameId: "game_h2h_samir_win",
      updatedAt: "2026-06-01T12:05:00.000Z",
      endedAt: "2026-06-01T12:05:00.000Z",
      status: "complete",
      archiveState: "archived",
      visibility: "unlisted",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: registeredParticipant("w", "Samir").identity },
        { seat: "b", role: "black", identity: account.identity },
      ],
      result: { winner: "w", reason: "timeout" },
    });
    const laterLiamWin = summary({
      gameId: "game_h2h_later_liam_win",
      updatedAt: "2026-06-01T12:06:00.000Z",
      endedAt: "2026-06-01T12:06:00.000Z",
      status: "complete",
      archiveState: "archived",
      visibility: "private",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: registeredParticipant("b", "Samir").identity },
      ],
      result: { winner: "w", reason: "resignation" },
    });
    const otherOpponent = summary({
      gameId: "game_h2h_other",
      status: "complete",
      archiveState: "archived",
      visibility: "private",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: registeredParticipant("b", "Ben").identity },
      ],
      result: { winner: "w", reason: "resignation" },
    });
    const loadAccountGames = vi.fn().mockResolvedValue(directory([otherOpponent]));
    const loadAccountHeadToHeadGames = vi.fn()
      .mockResolvedValueOnce(directory([liamWin, samirWin], "pair_cursor_2"))
      .mockResolvedValueOnce(directory([laterLiamWin]));
    const onReplay = vi.fn();
    const onChallengeAccount = vi.fn().mockResolvedValue(undefined);

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={onReplay}
        onChallengeAccount={onChallengeAccount}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Samir", { following: true }, { visibility: "visible", status: "online" }),
        ])}
        loadAccountGames={loadAccountGames}
        loadAccountHeadToHeadGames={loadAccountHeadToHeadGames}
      />
    );

    const following = await screen.findByRole("region", { name: "Followed players" });
    fireEvent.click(within(following).getByRole("button", {
      name: "Show Samir game history from following list",
    }));

    const summaryCard = await screen.findByRole("region", { name: "Head-to-head with Samir" });
    expect(loadAccountHeadToHeadGames).toHaveBeenCalledWith("Samir", { limit: 5 });
    expect(summaryCard).toHaveTextContent("2 games");
    expect(summaryCard).toHaveTextContent("Liam 1");
    expect(summaryCard).toHaveTextContent("Samir 1");
    expect(summaryCard).toHaveTextContent("Last game game_h2h_samir_win");
    expect(summaryCard).not.toHaveTextContent("game_h2h_other");
    fireEvent.click(within(summaryCard).getByRole("button", {
      name: "Show archive details for latest head-to-head game game_h2h_samir_win",
    }));
    expect(await screen.findByRole("region", {
      name: "Archive details for game_h2h_samir_win",
    })).toBeInTheDocument();
    fireEvent.click(within(summaryCard).getByRole("button", {
      name: "Analyze latest head-to-head replay game_h2h_samir_win",
    }));
    expect(onReplay).toHaveBeenCalledWith("game_h2h_samir_win");
    fireEvent.click(within(summaryCard).getByRole("button", {
      name: "Rematch Samir from head-to-head summary game_h2h_samir_win",
    }));
    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir", {
      intent: "rematch",
      sourceGameId: "game_h2h_samir_win",
    }));

    const pairGames = screen.getByRole("region", { name: "Head-to-head games with Samir" });
    expect(within(pairGames).getByText("game_h2h_samir_win")).toBeInTheDocument();
    expect(within(pairGames).getByText("game_h2h_liam_win")).toBeInTheDocument();
    expect(within(pairGames).queryByText("game_h2h_other")).not.toBeInTheDocument();

    fireEvent.click(within(pairGames).getByRole("button", { name: "Load more head-to-head games with Samir" }));

    await waitFor(() =>
      expect(loadAccountHeadToHeadGames).toHaveBeenLastCalledWith("Samir", {
        limit: 5,
        cursor: "pair_cursor_2",
      })
    );
    expect(await within(pairGames).findByText("game_h2h_later_liam_win")).toBeInTheDocument();
    expect(summaryCard).toHaveTextContent("3 games");
    expect(summaryCard).toHaveTextContent("Liam 2");
  });

  it("offers a following-row rematch from loaded head-to-head account history", async () => {
    const account = accountFixture("Liam");
    const latestHeadToHead = summary({
      gameId: "game_h2h_latest_rematch",
      updatedAt: "2026-06-01T12:08:00.000Z",
      endedAt: "2026-06-01T12:08:00.000Z",
      status: "complete",
      archiveState: "archived",
      visibility: "private",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: registeredParticipant("b", "Samir").identity },
      ],
      result: { winner: "w", reason: "resignation" },
    });
    const olderHeadToHead = summary({
      gameId: "game_h2h_older_rematch",
      updatedAt: "2026-06-01T12:04:00.000Z",
      endedAt: "2026-06-01T12:04:00.000Z",
      status: "complete",
      archiveState: "archived",
      visibility: "private",
      hasTimeControl: false,
      participants: [
        { seat: "w", role: "white", identity: registeredParticipant("w", "Samir").identity },
        { seat: "b", role: "black", identity: account.identity },
      ],
      result: { winner: "w", reason: "timeout" },
    });
    const onChallengeAccount = vi.fn().mockResolvedValue(undefined);

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing([
          publicProfile("Samir", { following: true }, { visibility: "visible", status: "online" }),
        ])}
        loadAccountGames={vi.fn().mockResolvedValue(directory([]))}
        loadAccountHeadToHeadGames={vi.fn().mockResolvedValue(directory([olderHeadToHead, latestHeadToHead]))}
        onChallengeAccount={onChallengeAccount}
      />
    );

    const following = await screen.findByRole("region", { name: "Followed players" });
    const samirRow = (await within(following).findByText("Samir")).closest("article");
    expect(samirRow).not.toBeNull();
    expect(within(samirRow as HTMLElement).queryByRole("button", {
      name: "Rematch Samir from latest head-to-head game game_h2h_latest_rematch",
    })).not.toBeInTheDocument();

    fireEvent.click(within(samirRow as HTMLElement).getByRole("button", {
      name: "Show Samir game history from following list",
    }));

    await screen.findByRole("region", { name: "Head-to-head with Samir" });
    fireEvent.click(await within(samirRow as HTMLElement).findByRole("button", {
      name: "Rematch Samir from latest head-to-head game game_h2h_latest_rematch",
    }));

    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir", {
      intent: "rematch",
      sourceGameId: "game_h2h_latest_rematch",
    }));
    expect(await screen.findByText("Rematch challenge created for Samir.")).toBeInTheDocument();
  });

  it("keeps game row player names plain without signed-in social lookup", async () => {
    const liveGame = summary({
      gameId: "game_profile_plain",
      participants: [
        registeredParticipant("w", "Samir"),
        registeredParticipant("b", "Ada"),
      ],
    });

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([liveGame]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const row = await screen.findByRole("article", { name: "Current live selection Samir vs Ada game_profile_plain" });
    expect(within(row).queryByRole("button", { name: "Open Samir profile from game_profile_plain" })).not.toBeInTheDocument();
    expect(row).toHaveTextContent("Samir vs Ada");
  });

  it("lets players escape the followed-player filter after following refresh fails", async () => {
    const loadAccountFollowing = vi
      .fn()
      .mockResolvedValueOnce({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        following: [publicProfile("Samir", { following: true })],
      })
      .mockRejectedValueOnce(new Error("following unavailable"));
    const socialProps = {
      ...socialPropsWithFollowing([publicProfile("Samir", { following: true })]),
      loadAccountFollowing,
    };

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_following_failure_followed",
            participants: [
              registeredParticipant("w", "Samir"),
              registeredParticipant("b", "Ada"),
            ],
          }),
          summary({
            gameId: "game_following_failure_other",
            participants: [
              registeredParticipant("w", "Ben"),
              registeredParticipant("b", "Ada"),
            ],
          }),
        ]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialProps}
      />
    );

    expect(await screen.findByText("game_following_failure_other")).toBeInTheDocument();
    const filter = screen.getByRole("combobox", { name: "Followed players filter" });
    await waitFor(() => expect(filter).toBeEnabled());
    fireEvent.change(filter, { target: { value: "followed" } });
    await waitFor(() => expect(screen.queryByText("game_following_failure_other")).not.toBeInTheDocument());

    fireEvent.click(within(screen.getByRole("region", { name: "People" })).getByRole("button", { name: "Refresh Following" }));

    expect(await screen.findByText("Following list unavailable. Use Refresh Following to retry, or switch back to All players.")).toBeInTheDocument();
    expect(filter).toBeEnabled();
    fireEvent.change(filter, { target: { value: "all" } });

    expect(await screen.findByText("game_following_failure_followed")).toBeInTheDocument();
    expect(screen.getByText("game_following_failure_other")).toBeInTheDocument();
  });

  it("filters public and account archive rows by followed registered participants", async () => {
    const account = accountFixture("Liam");
    const socialProps = socialPropsWithFollowing([publicProfile("Samir", { following: true })]);
    const onChallengeAccount = vi.fn().mockResolvedValue(undefined);
    const publicFollowed = summary({
      gameId: "game_public_archive_samir",
      status: "complete",
      archiveState: "archived",
      visibility: "public",
      participants: [
        registeredParticipant("w", "Samir"),
        registeredParticipant("b", "Ada"),
      ],
    });
    const publicOther = summary({
      gameId: "game_public_archive_ben",
      status: "complete",
      archiveState: "archived",
      visibility: "public",
      participants: [
        registeredParticipant("w", "Ben"),
        registeredParticipant("b", "Ada"),
      ],
    });
    const accountFollowed = summary({
      gameId: "game_account_archive_samir",
      status: "complete",
      archiveState: "archived",
      visibility: "unlisted",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        registeredParticipant("b", "SAMIR"),
      ],
    });
    const accountOther = summary({
      gameId: "game_account_archive_ben",
      status: "complete",
      archiveState: "archived",
      visibility: "private",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        registeredParticipant("b", "Ben"),
      ],
    });

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([publicFollowed, publicOther]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        loadAccountGames={vi.fn().mockResolvedValue(directory([accountFollowed, accountOther]))}
        recentOnlineGames={[
          {
            gameId: "game_device_only_archive",
            role: "player",
            seat: "w",
            status: "complete",
            lastSeenAt: "2026-06-03T13:00:00.000Z",
          },
        ]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onChallengeAccount={onChallengeAccount}
        account={account}
        accountStatus="ready"
        {...socialProps}
      />
    );

    expect(await screen.findByText("game_public_archive_samir")).toBeInTheDocument();
    expect(await screen.findByText("game_account_archive_ben")).toBeInTheDocument();

    const followedOpponents = await screen.findByRole("region", {
      name: "Followed opponents in your account archive",
    });
    const followedOpponentRow = within(followedOpponents).getByRole("article", {
      name: "Followed opponent Samir in account archive",
    });
    expect(followedOpponentRow).toHaveTextContent("1 game; 1 replay; Latest game_account_archive_samir");
    expect(within(followedOpponents).queryByText("Ben")).not.toBeInTheDocument();

    fireEvent.click(within(followedOpponents).getByRole("button", {
      name: "Challenge Samir from followed account archive",
    }));
    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir"));
    expect(await screen.findByText("Challenge created for Samir.")).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "Search online archive" });
    fireEvent.click(within(followedOpponents).getByRole("button", {
      name: "Show Samir game history from followed account archive",
    }));
    await waitFor(() => expect(search).toHaveValue("Samir"));
    expect(screen.getByRole("region", { name: "Archive player history filter" })).toHaveTextContent(
      "Showing games with Samir."
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear game history filter for Samir" }));
    await waitFor(() => expect(search).toHaveValue(""));

    const filter = screen.getByRole("combobox", { name: "Followed players filter" });
    await waitFor(() => expect(filter).toBeEnabled());
    fireEvent.change(filter, { target: { value: "followed" } });

    await waitFor(() => expect(screen.queryByText("game_public_archive_ben")).not.toBeInTheDocument());
    expect(screen.getByText("game_public_archive_samir")).toBeInTheDocument();
    expect(screen.getByText("game_account_archive_samir")).toBeInTheDocument();
    expect(screen.queryByText("game_account_archive_ben")).not.toBeInTheDocument();
    expect(screen.queryByText("game_device_only_archive")).not.toBeInTheDocument();
  });

  it("clears the followed-player discovery filter when the player signs out", async () => {
    const socialProps = socialPropsWithFollowing([publicProfile("Samir", { following: true })]);
    const loadGames = vi.fn().mockResolvedValue(directory([
      summary({
        gameId: "game_followed_after_signout",
        participants: [
          registeredParticipant("w", "Samir"),
          registeredParticipant("b", "Ada"),
        ],
      }),
      summary({
        gameId: "game_other_after_signout",
        participants: [
          registeredParticipant("w", "Ben"),
          registeredParticipant("b", "Ada"),
        ],
      }),
    ]));
    const props = {
      initialTab: "watch" as const,
      loadGames,
      loadOpenSeeks: vi.fn().mockResolvedValue(seekDirectory([])),
      onBack: vi.fn(),
      onSpectate: vi.fn(),
      onReplay: vi.fn(),
      accountStatus: "ready" as const,
      ...socialProps,
    };
    const { rerender } = render(
      <OnlineGameBrowser
        {...props}
        account={accountFixture("Liam")}
      />
    );

    expect(await screen.findByText("game_other_after_signout")).toBeInTheDocument();
    const filter = screen.getByRole("combobox", { name: "Followed players filter" });
    await waitFor(() => expect(filter).toBeEnabled());
    fireEvent.change(filter, { target: { value: "followed" } });
    await waitFor(() => expect(screen.queryByText("game_other_after_signout")).not.toBeInTheDocument());

    rerender(
      <OnlineGameBrowser
        {...props}
        account={null}
      />
    );

    expect(screen.queryByRole("combobox", { name: "Followed players filter" })).not.toBeInTheDocument();
    expect(screen.getByText("game_followed_after_signout")).toBeInTheDocument();
    expect(screen.getByText("game_other_after_signout")).toBeInTheDocument();
  });

  it("shows signed-in account archive games without duplicating public archive rows", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_liam",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_liam", displayName: "Liam" },
    };
    const publicArchive = summary({
      gameId: "game_public_archive",
      status: "complete",
      archiveState: "archived",
      visibility: "public",
    });
    const accountArchive = summary({
      gameId: "game_private_account_archive",
      status: "complete",
      archiveState: "archived",
      visibility: "unlisted",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b" } },
      ],
    });
    const activeAccount = summary({
      gameId: "game_active_account",
      status: "active",
      archiveState: "active",
      visibility: "private",
      participants: [
        { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_w" } },
        { seat: "b", role: "black", identity: account.identity },
      ],
    });
    const loadAccountGames = vi.fn().mockResolvedValue(directory([activeAccount, accountArchive, publicArchive]));
    const onReturnToAccountGame = vi.fn();

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([publicArchive]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={loadAccountGames}
        resolveAccountGameJoin={(game, seat) =>
          game.gameId === "game_active_account" && seat === "b"
            ? { gameId: game.gameId, seat, token: "black-token" }
            : null
        }
        onReturnToAccountGame={onReturnToAccountGame}
        recentOnlineGames={[
          {
            gameId: "game_private_account_archive",
            role: "player",
            seat: "w",
            status: "complete",
            lastSeenAt: "2026-06-03T13:00:00.000Z",
          },
          {
            gameId: "game_device_only_archive",
            role: "spectator",
            status: "complete",
            lastSeenAt: "2026-06-03T13:05:00.000Z",
          },
        ]}
      />
    );

    const accountGames = await screen.findByRole("region", { name: "Your account games" });
    const activeGames = await screen.findByRole("region", { name: "Active account games" });
    const completedGames = await screen.findByRole("region", { name: "Completed account games" });
    const recentGames = await screen.findByRole("region", { name: "Recent online games on this device" });
    expect(loadAccountGames).toHaveBeenCalledWith({ state: "all", limit: 50 });
    expect(within(activeGames).getByText("game_active_account")).toBeInTheDocument();
    expect(within(activeGames).getByText("Your seat Black")).toBeInTheDocument();
    expect(within(activeGames).getByText("Your turn")).toBeInTheDocument();
    fireEvent.click(
      within(activeGames).getByRole("button", {
        name: "Return to account game White vs Liam, game_active_account",
      })
    );
    expect(onReturnToAccountGame).toHaveBeenCalledWith({
      gameId: "game_active_account",
      seat: "b",
      token: "black-token",
    }, "private");
    expect(within(completedGames).getByText("game_private_account_archive")).toBeInTheDocument();
    expect(within(accountGames).queryByText("game_public_archive")).not.toBeInTheDocument();
    expect(within(recentGames).getByText("game_device_only_archive")).toBeInTheDocument();
    expect(within(recentGames).queryByText("game_private_account_archive")).not.toBeInTheDocument();
    expect(screen.getByText("game_public_archive")).toBeInTheDocument();

    expect(screen.getByRole("status")).toHaveTextContent(
      "1 active account game, 1 account replay, 1 public replay, 1 device replay shown"
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search online archive" }), {
      target: { value: "does-not-match" },
    });
    await waitFor(() => {
      expect(within(accountGames).getByText("No account games match these filters.")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
    });
  });

  it("requests account game filters from the server for signed-in archive rows", async () => {
    const account = accountFixture("Liam");
    const loadAccountGames = vi.fn().mockResolvedValue(directory([]));
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={loadAccountGames}
      />
    );

    await waitFor(() => expect(loadAccountGames).toHaveBeenLastCalledWith({ state: "all", limit: 50 }));

    fireEvent.change(screen.getByRole("combobox", { name: "Time control filter" }), {
      target: { value: "casual" },
    });

    await waitFor(() => {
      expect(loadAccountGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "all",
        limit: 50,
        clock: "casual",
      });
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Rating filter" }), {
      target: { value: "rated" },
    });

    await waitFor(() => {
      expect(loadAccountGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "all",
        limit: 50,
        clock: "casual",
        rating: "rated",
      });
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "timeout" },
    });

    await waitFor(() => {
      expect(loadAccountGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "all",
        limit: 50,
        clock: "casual",
        rating: "rated",
        result: "timeout",
      });
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search online archive" }), {
      target: { value: "Samir" },
    });

    await waitFor(() => {
      expect(loadAccountGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "all",
        limit: 50,
        clock: "casual",
        rating: "rated",
        result: "timeout",
        query: "samir",
      });
    });
  });

  it("lets signed-in players inspect, follow, and rematch registered opponents from account game rows", async () => {
    const account = accountFixture("Liam");
    const followedProfile = publicProfile("Samir", { following: true }, { visibility: "visible", status: "online" });
    let currentFollowing = false;
    const loadAccountFollowing = vi.fn().mockImplementation(() => Promise.resolve({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      following: currentFollowing ? [followedProfile] : [],
    }));
    const onFollowAccount = vi.fn().mockImplementation((displayName: string) => {
      currentFollowing = true;
      return Promise.resolve({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        profile: publicProfile(displayName, { following: true }, { visibility: "visible", status: "online" }),
      });
    });
    const onChallengeAccount = vi.fn().mockResolvedValue(undefined);
    const loadAccountHeadToHeadGames = vi.fn().mockResolvedValue(directory([]));
    const accountArchive = summary({
      gameId: "game_account_archive_samir",
      status: "complete",
      archiveState: "archived",
      visibility: "unlisted",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: registeredParticipant("b", "Samir").identity },
      ],
    });
    const activeAccount = summary({
      gameId: "game_active_account_samir",
      status: "active",
      archiveState: "active",
      visibility: "unlisted",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: registeredParticipant("b", "Samir").identity },
      ],
    });
    const publicArchive = summary({
      gameId: "game_public_archive_samir_only",
      status: "complete",
      archiveState: "archived",
      visibility: "public",
      participants: [
        registeredParticipant("w", "Samir"),
        registeredParticipant("b", "Ada"),
      ],
    });

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([publicArchive]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        {...socialPropsWithFollowing()}
        loadAccountFollowing={loadAccountFollowing}
        loadAccountGames={vi.fn().mockResolvedValue(directory([activeAccount, accountArchive]))}
        loadAccountHeadToHeadGames={loadAccountHeadToHeadGames}
        onFollowAccount={onFollowAccount}
        onChallengeAccount={onChallengeAccount}
      />
    );

    const activeGames = await screen.findByRole("region", { name: "Active account games" });
    const activeRow = (await within(activeGames).findByText("game_active_account_samir")).closest("article");
    expect(activeRow).not.toBeNull();
    expect(within(activeRow as HTMLElement).getByRole("button", {
      name: "Show Samir game history from game_active_account_samir",
    })).toBeInTheDocument();
    expect(within(activeRow as HTMLElement).getByRole("button", {
      name: "Follow Samir from game_active_account_samir",
    })).toBeInTheDocument();
    expect(within(activeRow as HTMLElement).queryByRole("button", {
      name: "Challenge Samir from game_active_account_samir",
    })).not.toBeInTheDocument();

    const completedGames = await screen.findByRole("region", { name: "Completed account games" });
    const accountReplayRow = (await within(completedGames).findByText("game_account_archive_samir")).closest("article");
    expect(accountReplayRow).not.toBeNull();
    expect(within(accountReplayRow as HTMLElement).getByRole("button", {
      name: "Show Samir game history from game_account_archive_samir",
    })).toBeInTheDocument();
    expect(within(accountReplayRow as HTMLElement).getByRole("button", {
      name: "Follow Samir from game_account_archive_samir",
    })).toBeInTheDocument();
    expect(within(accountReplayRow as HTMLElement).getByRole("button", {
      name: "Rematch Samir from game_account_archive_samir",
    })).toBeInTheDocument();

    const publicReplayRow = (await screen.findByText("game_public_archive_samir_only")).closest("article");
    expect(publicReplayRow).not.toBeNull();
    expect(within(publicReplayRow as HTMLElement).queryByRole("button", {
      name: "Show Samir game history from game_public_archive_samir_only",
    })).not.toBeInTheDocument();
    expect(within(publicReplayRow as HTMLElement).queryByRole("button", {
      name: "Follow Samir from game_public_archive_samir_only",
    })).not.toBeInTheDocument();
    expect(within(publicReplayRow as HTMLElement).queryByRole("button", {
      name: "Rematch Samir from game_public_archive_samir_only",
    })).not.toBeInTheDocument();

    fireEvent.click(within(accountReplayRow as HTMLElement).getByRole("button", {
      name: "Follow Samir from game_account_archive_samir",
    }));
    await waitFor(() => expect(onFollowAccount).toHaveBeenCalledWith("Samir"));
    await waitFor(() => expect(within(accountReplayRow as HTMLElement).queryByRole("button", {
      name: "Follow Samir from game_account_archive_samir",
    })).not.toBeInTheDocument());

    fireEvent.click(within(accountReplayRow as HTMLElement).getByRole("button", {
      name: "Rematch Samir from game_account_archive_samir",
    }));
    await waitFor(() => expect(onChallengeAccount).toHaveBeenCalledWith("Samir", {
      intent: "rematch",
      sourceGameId: "game_account_archive_samir",
    }));
    expect(await screen.findByText("Rematch challenge created for Samir.")).toBeInTheDocument();

    fireEvent.click(within(activeRow as HTMLElement).getByRole("button", {
      name: "Show Samir game history from game_active_account_samir",
    }));
    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: "Search online archive" })).toHaveValue("Samir")
    );
    await waitFor(() => expect(loadAccountHeadToHeadGames).toHaveBeenCalledWith("Samir", { limit: 5 }));
    expect(screen.getByText("Showing visible games with Samir.")).toBeInTheDocument();
  });

  it("does not show device replay fallback while signed-in account archive is still loading", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_loading",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_loading", displayName: "Liam" },
    };
    const accountGames = deferredDirectory();

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={vi.fn().mockReturnValue(accountGames.promise)}
        recentOnlineGames={[
          {
            gameId: "game_device_only_waits",
            role: "player",
            seat: "b",
            status: "complete",
            lastSeenAt: "2026-06-03T13:00:00.000Z",
          },
        ]}
      />
    );

    expect(await screen.findByText("Loading account games...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("account games loading, 0 public replays shown");
    expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();

    await act(async () => {
      accountGames.resolve(directory([]));
      await Promise.resolve();
    });

    expect(await screen.findByRole("region", { name: "Recent online games on this device" })).toHaveTextContent(
      "game_device_only_waits"
    );
  });

  it("falls back safely when active account games do not have a local player token", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_active_fallback",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_active_fallback", displayName: "Liam" },
    };
    const onSpectate = vi.fn();
    const publicActive = summary({
      gameId: "game_public_active_account",
      status: "active",
      archiveState: "active",
      visibility: "unlisted",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b" } },
      ],
    });
    const privateActive = summary({
      gameId: "game_private_active_account",
      status: "active",
      archiveState: "active",
      visibility: "private",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b_private" } },
      ],
    });

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={vi.fn().mockResolvedValue(directory([publicActive, privateActive]))}
        resolveAccountGameJoin={vi.fn().mockReturnValue(null)}
      />
    );

    const activeGames = await screen.findByRole("region", { name: "Active account games" });
    expect(activeGames).toHaveTextContent("game_public_active_account");
    expect(activeGames).toHaveTextContent("game_private_active_account");
    expect(activeGames).toHaveTextContent("Player token not in this browser session");
    fireEvent.click(
      within(activeGames).getByRole("button", {
        name: "Spectate account game Liam vs Black, game_public_active_account",
      })
    );
    expect(onSpectate).toHaveBeenCalledWith("game_public_active_account");
    expect(activeGames).toHaveTextContent("Open from original browser session or invite link");
    expect(
      within(activeGames).queryByRole("button", {
        name: "Spectate account game Liam vs Black, game_private_active_account",
      })
    ).not.toBeInTheDocument();
  });

  it("offers account rejoin for active account games without a local player token", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_active_rejoin",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_active_rejoin", displayName: "Liam" },
    };
    const activeAccount = summary({
      gameId: "game_active_account_rejoin",
      status: "active",
      archiveState: "active",
      visibility: "private",
      participants: [
        { seat: "w", role: "white", identity: account.identity },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b" } },
      ],
    });
    const onRejoinAccountGame = vi.fn();

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={vi.fn().mockResolvedValue(directory([activeAccount]))}
        resolveAccountGameJoin={vi.fn().mockReturnValue(null)}
        onRejoinAccountGame={onRejoinAccountGame}
      />
    );

    const accountGames = await screen.findByRole("region", { name: "Your account games" });
    expect(accountGames).toHaveTextContent(
      "Active games can return from this browser session or rejoin through your account when available."
    );
    expect(accountGames).not.toHaveTextContent("Active games can return to play only when this browser session");
    const activeGames = await screen.findByRole("region", { name: "Active account games" });
    fireEvent.click(
      within(activeGames).getByRole("button", {
        name: "Rejoin account game Liam vs Black, game_active_account_rejoin",
      })
    );

    expect(onRejoinAccountGame).toHaveBeenCalledWith(activeAccount);
    expect(within(activeGames).queryByText("Open from original browser session or invite link")).not.toBeInTheDocument();
  });

  it("does not offer account rejoin when the account seat is missing from an active game row", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_active_missing_seat",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_active_missing_seat", displayName: "Liam" },
    };
    const activeAccount = summary({
      gameId: "game_active_account_missing_seat",
      status: "active",
      archiveState: "active",
      visibility: "private",
      participants: [
        { seat: "w", role: "white", identity: { kind: "anonymous", id: "anon_w_missing_seat" } },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b_missing_seat" } },
      ],
    });
    const onRejoinAccountGame = vi.fn();

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={vi.fn().mockResolvedValue(directory([activeAccount]))}
        resolveAccountGameJoin={vi.fn().mockReturnValue(null)}
        onRejoinAccountGame={onRejoinAccountGame}
      />
    );

    const activeGames = await screen.findByRole("region", { name: "Active account games" });
    expect(within(activeGames).queryByRole("button", {
      name: "Rejoin account game White vs Black, game_active_account_missing_seat",
    })).not.toBeInTheDocument();
    expect(activeGames).toHaveTextContent("Account seat unavailable");
    expect(activeGames).not.toHaveTextContent("Your seat unknown");
    expect(activeGames).toHaveTextContent("Open from original browser session or invite link");
    expect(onRejoinAccountGame).not.toHaveBeenCalled();
  });

  it("reports account archive errors without falling back to possibly duplicated device rows", async () => {
    const account = {
      schemaVersion: 1 as const,
      accountId: "account_error",
      displayName: "Liam",
      createdAt: "2026-06-03T12:00:00.000Z",
      updatedAt: "2026-06-03T12:00:00.000Z",
      identity: { kind: "registered" as const, id: "account_error", displayName: "Liam" },
    };

    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={account}
        accountStatus="ready"
        loadAccountGames={vi.fn().mockRejectedValue(new Error("offline"))}
        recentOnlineGames={[
          {
            gameId: "game_device_only_account_error",
            role: "player",
            seat: "w",
            status: "complete",
            lastSeenAt: "2026-06-03T13:00:00.000Z",
          },
        ]}
      />
    );

    expect(await screen.findByText("Account games are unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("account games unavailable, 0 public replays shown");
    expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
  });

  it("loads lobby listings and public live games in the Lobby tab", async () => {
    const loadOpenSeeks = vi.fn().mockResolvedValue(seekDirectory([openSeek()]));
    const loadGames = vi.fn().mockResolvedValue(directory([
      summary({ gameId: "game_lobby_live", version: 8 }),
    ]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={loadGames}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    const row = await screen.findByRole("article", { name: /Lobby listing seek_public_open/i });

    expect(loadOpenSeeks).toHaveBeenCalledWith({ state: "open", limit: 50 });
    expect(loadGames).toHaveBeenCalledWith({ state: "active", limit: 50, cursor: undefined });
    expect(row).toHaveTextContent("Creator unregistered");
    expect(row).toHaveTextContent("Creator side Random");
    expect(row).toHaveTextContent("Radius 7");
    expect(row).toHaveTextContent("Timed 20+20");
    expect(row).toHaveTextContent("Scoring Victory points");
    expect(within(row).getByRole("button", { name: "Accept lobby listing seek_public_open" })).toBeInTheDocument();
    const currentGames = screen.getByRole("region", { name: "Current public games" });
    const liveOverview = within(currentGames).getByRole("group", { name: "Lobby live games overview" });
    expect(liveOverview).toHaveTextContent("1 public live game");
    expect(liveOverview).toHaveTextContent("Most moves");
    expect(liveOverview).toHaveTextContent("Ada vs Ben, 8 moves");
    expect(liveOverview).toHaveTextContent("Public only");
    expect(within(currentGames).getByText("game_lobby_live")).toBeInTheDocument();
    expect(within(currentGames).getByRole("button", { name: "Spectate Ada vs Ben, game_lobby_live" })).toBeInTheDocument();
    expect(within(currentGames).getByRole("button", { name: "Open Watch tab" })).toBeInTheDocument();
    expect(within(currentGames).getByRole("button", { name: "Refresh live public games" })).toHaveTextContent("Refresh live games");
  });

  it("shows safe registered Lobby creators and opens their profiles", async () => {
    const loadAccountProfile = vi.fn().mockResolvedValue({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: publicProfile("Samir", { following: true }),
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({
            seekId: "seek_registered_creator",
            creatorIdentity: { kind: "registered", id: "account_samir_private", displayName: "Samir" },
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        account={accountFixture("Liam")}
        accountStatus="ready"
        {...socialPropsWithFollowing([])}
        loadAccountProfile={loadAccountProfile}
      />
    );

    const row = await screen.findByRole("article", {
      name: /Lobby listing by Samir, seek_registered_creator/i,
    });
    expect(row).toHaveTextContent("Lobby listing by Samir");
    expect(row).toHaveTextContent("Creator Samir");
    expect(row).not.toHaveTextContent("account_samir_private");

    fireEvent.click(within(row).getByRole("button", {
      name: "Open Samir profile from lobby listing seek_registered_creator",
    }));

    await waitFor(() => expect(loadAccountProfile).toHaveBeenCalledWith("Samir"));
  });

  it("shows server-backed spectator counts for live public games", async () => {
    const watchedGame = summary({ gameId: "game_watched_live", version: 12 });
    watchedGame.livePreview = {
      ...watchedGame.livePreview,
      spectatorCount: 3,
    };

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([watchedGame]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const watch = await screen.findByRole("article", {
      name: /Current live selection Ada vs Ben game_watched_live/i,
    });

    expect(watch).toHaveTextContent("3 watching");
  });

  it("can scan Watch by current spectator count without claiming a global ranking", async () => {
    const manyMoves = summary({
      gameId: "game_many_moves_fewer_watchers",
      version: 14,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "mara_w", displayName: "Mara" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "noor_b", displayName: "Noor" } },
      ],
    });
    manyMoves.livePreview = {
      ...manyMoves.livePreview,
      spectatorCount: 1,
    };
    const mostWatched = summary({
      gameId: "game_most_watched_now",
      version: 4,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "iris_w", displayName: "Iris" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "jules_b", displayName: "Jules" } },
      ],
    });
    mostWatched.livePreview = {
      ...mostWatched.livePreview,
      spectatorCount: 6,
    };

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([manyMoves, mostWatched]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_many_moves_fewer_watchers");

    expect(screen.getByRole("region", {
      name: "Current public live selection by most moves in current list",
    })).toHaveTextContent(
      "game_many_moves_fewer_watchers"
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Sort public games" }), {
      target: { value: "watchers" },
    });

    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    const selectedRegion = screen.getByRole("region", {
      name: "Current public live selection by most watched in current list",
    });
    expect(liveOverview).toHaveTextContent("Selected by");
    expect(liveOverview).not.toHaveTextContent("Featured by");
    expect(liveOverview).toHaveTextContent("Most watched in current list");
    expect(liveOverview).toHaveTextContent("Iris vs Jules, 6 watching, 4 moves");
    expect(selectedRegion).toHaveTextContent("Current live selection");
    expect(selectedRegion).toHaveTextContent("Most watched in current list");
    expect(selectedRegion).not.toHaveTextContent("Most active live game");
    expect(selectedRegion).toHaveTextContent("game_most_watched_now");
    expect(selectedRegion).toHaveTextContent("6 watching");
  });

  it("falls back to the most-moves Watch model when watcher counts are missing", async () => {
    const manyMoves = summary({
      gameId: "game_many_moves_no_watchers",
      version: 14,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "mara_w", displayName: "Mara" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "noor_b", displayName: "Noor" } },
      ],
    });
    const fewerMoves = summary({
      gameId: "game_fewer_moves_zero_watchers",
      version: 4,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "iris_w", displayName: "Iris" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "jules_b", displayName: "Jules" } },
      ],
    });
    fewerMoves.livePreview = {
      ...fewerMoves.livePreview,
      spectatorCount: 0,
    };

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([fewerMoves, manyMoves]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_many_moves_no_watchers");

    fireEvent.change(screen.getByRole("combobox", { name: "Sort public games" }), {
      target: { value: "watchers" },
    });

    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    const selectedRegion = screen.getByRole("region", {
      name: "Current public live selection by most moves in current list",
    });
    expect(liveOverview).toHaveTextContent("Selected by");
    expect(liveOverview).toHaveTextContent("Most moves in current list");
    expect(liveOverview).toHaveTextContent("Mara vs Noor, 14 moves");
    expect(selectedRegion).toHaveTextContent("Current live selection");
    expect(selectedRegion).toHaveTextContent("Most moves in current list");
    expect(selectedRegion).toHaveTextContent("game_many_moves_no_watchers");
    expect(selectedRegion).not.toHaveTextContent("watching");
  });

  it("orders Watch rows by watcher count before move-count fallback", async () => {
    const mostWatched = summary({
      gameId: "game_six_watchers",
      version: 4,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "iris_w", displayName: "Iris" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "jules_b", displayName: "Jules" } },
      ],
    });
    mostWatched.livePreview = {
      ...mostWatched.livePreview,
      spectatorCount: 6,
    };
    const fewerMovesMoreWatchers = summary({
      gameId: "game_three_watchers_two_moves",
      version: 2,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "kara_w", displayName: "Kara" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "luz_b", displayName: "Luz" } },
      ],
    });
    fewerMovesMoreWatchers.livePreview = {
      ...fewerMovesMoreWatchers.livePreview,
      spectatorCount: 3,
    };
    const tiedWatchersMoreMoves = summary({
      gameId: "game_two_watchers_twenty_moves",
      version: 20,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "mara_w", displayName: "Mara" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "noor_b", displayName: "Noor" } },
      ],
    });
    tiedWatchersMoreMoves.livePreview = {
      ...tiedWatchersMoreMoves.livePreview,
      spectatorCount: 2,
    };
    const tiedWatchersFewerMoves = summary({
      gameId: "game_two_watchers_nine_moves",
      version: 9,
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "opal_w", displayName: "Opal" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "paz_b", displayName: "Paz" } },
      ],
    });
    tiedWatchersFewerMoves.livePreview = {
      ...tiedWatchersFewerMoves.livePreview,
      spectatorCount: 2,
    };

    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          tiedWatchersFewerMoves,
          tiedWatchersMoreMoves,
          fewerMovesMoreWatchers,
          mostWatched,
        ]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_six_watchers");

    fireEvent.change(screen.getByRole("combobox", { name: "Sort public games" }), {
      target: { value: "watchers" },
    });

    const spectateLabels = screen
      .getAllByRole("button", { name: /^Spectate / })
      .map((button) => button.getAttribute("aria-label"));
    expect(spectateLabels).toEqual([
      "Spectate Iris vs Jules, game_six_watchers",
      "Spectate Kara vs Luz, game_three_watchers_two_moves",
      "Spectate Mara vs Noor, game_two_watchers_twenty_moves",
      "Spectate Opal vs Paz, game_two_watchers_nine_moves",
    ]);
  });

  it("counts all public live games even when the Lobby preview is capped", async () => {
    const liveGames = Array.from({ length: 6 }, (_, index) =>
      summary({ gameId: `game_lobby_live_${index + 1}`, version: index + 1 })
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory(liveGames))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const currentGames = await screen.findByRole("region", { name: "Current public games" });
    const liveOverview = within(currentGames).getByRole("group", { name: "Lobby live games overview" });
    expect(within(currentGames).getByText("6 public games in progress")).toBeInTheDocument();
    expect(liveOverview).toHaveTextContent("6 public live games");
    expect(liveOverview).toHaveTextContent("Ada vs Ben, 6 moves");
    expect(within(currentGames).getByText("game_lobby_live_6")).toBeInTheDocument();
    expect(within(currentGames).queryByText("game_lobby_live_1")).not.toBeInTheDocument();
  });

  it("keeps listing filters adjacent to open listings even when live games exist", async () => {
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_before_filter" })]))
      .mockResolvedValue(seekDirectory([]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({ gameId: "game_live_below_listings", version: 10 }),
        ]))}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_before_filter");
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby creator side filter" }), {
      target: { value: "w" },
    });

    expect(await screen.findByText("No lobby listings match these filters.")).toBeInTheDocument();
    expect(screen.getByText("game_live_below_listings")).toBeInTheDocument();
    const listings = screen.getByRole("region", { name: "Open lobby listings" });
    const currentGames = screen.getByRole("region", { name: "Current public games" });
    expect(Boolean(listings.compareDocumentPosition(currentGames) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("renders and searches Castle-control listings explicitly", async () => {
    const castleControlSeek = openSeek({ seekId: "seek_castle_control" });
    castleControlSeek.setup.gameRules = { vpModeEnabled: false };
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([castleControlSeek]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    const row = await screen.findByRole("article", { name: /Lobby listing seek_castle_control/i });
    expect(row).toHaveTextContent("Scoring Castle control");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "castle control" },
    });

    expect(screen.getByRole("article", { name: /Lobby listing seek_castle_control/i })).toBeInTheDocument();
  });

  it("renders and searches rated labels in lobby listings and current-game rows", async () => {
    const ratedSeek = openSeek({
      seekId: "seek_rated_listing",
      setup: { ...createChallengeSetup(), ratingMode: "rated" },
    });
    const ratedGame = summary({
      gameId: "game_lobby_rated",
      ratingMode: "rated",
    });
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([ratedGame]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([ratedSeek]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    const listing = await screen.findByRole("article", { name: /Lobby listing seek_rated_listing/i });
    expect(listing).toHaveTextContent("Rating Rated");
    const currentGames = await screen.findByRole("region", { name: "Current public games" });
    expect(within(currentGames).getByRole("article", { name: /game_lobby_rated/i })).toHaveTextContent("Rating Rated");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "rated game" },
    });

    expect(screen.getByRole("article", { name: /Lobby listing seek_rated_listing/i })).toBeInTheDocument();
  });

  it("explains fixed creator-side listings from the acceptor's point of view", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_creator_white", creatorSeat: "w" }),
          openSeek({ seekId: "seek_creator_black", creatorSeat: "b" }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    expect(await screen.findByText("seek_creator_white")).toBeInTheDocument();
    expect(screen.getByText("Creator plays White; you play Black")).toBeInTheDocument();
    expect(screen.getByText("Creator plays Black; you play White")).toBeInTheDocument();
  });

  it("searches lobby listings by visible creator side and clock labels", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_creator_white_timed", creatorSeat: "w" }),
          openSeek({
            seekId: "seek_creator_samir",
            creatorIdentity: { kind: "registered", id: "account_samir_private", displayName: "Samir" },
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    expect(await screen.findByText("seek_creator_white_timed")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "creator plays white" },
    });

    expect(screen.getByRole("article", { name: /Lobby listing seek_creator_white_timed/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "timed" },
    });

    expect(screen.getByRole("article", { name: /Lobby listing seek_creator_white_timed/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "Samir creator" },
    });

    expect(screen.getByRole("article", { name: /Lobby listing by Samir, seek_creator_samir/i })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /seek_creator_white_timed/i })).not.toBeInTheDocument();
  });

  it("does not send Lobby listing search to current public game requests", async () => {
    const loadGames = vi.fn().mockResolvedValue(directory([
      summary({ gameId: "game_lobby_current" }),
    ]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={loadGames}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_creator_white_timed", creatorSeat: "w" }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    expect(await screen.findByText("game_lobby_current")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "creator plays white" },
    });

    expect(loadGames.mock.calls.every(([options]) => options && !("query" in options))).toBe(true);
  });

  it("bounds public game search length without limiting Lobby listing search", async () => {
    const { rerender } = render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("searchbox", { name: "Search lobby listings" })).not.toHaveAttribute("maxLength");

    rerender(
      <OnlineGameBrowser
        activeTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("searchbox", { name: "Search live public games" })).toHaveAttribute("maxLength", "80");
  });

  it("opens the Watch tab from the Lobby current-games section", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({ gameId: "game_lobby_watch_handoff", version: 8 }),
        ]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const currentGames = await screen.findByRole("region", { name: "Current public games" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search lobby listings" }), {
      target: { value: "not-this-live-game" },
    });
    fireEvent.click(within(currentGames).getByRole("button", { name: "Open Watch tab" }));

    expect(screen.getByRole("button", { name: "Live public games" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox", { name: "Search live public games" })).toHaveValue("");
    expect(screen.getByRole("region", {
      name: "Current public live selection by most moves in current list",
    })).toHaveTextContent("game_lobby_watch_handoff");
  });

  it("auto-refreshes current public games while the Lobby tab is visible", async () => {
    vi.useFakeTimers();
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_auto_live" })]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={loadGames}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("No public games in progress.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("game_auto_live")).toBeInTheDocument();
    expect(loadGames).toHaveBeenCalledTimes(2);
  });

  it("announces copied spectator links from Lobby current games", async () => {
    const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    try {
      render(
        <OnlineGameBrowser
          initialTab="lobby"
          loadGames={vi.fn().mockResolvedValue(directory([
            summary({ gameId: "game_copy_live" }),
          ]))}
          loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
          onBack={vi.fn()}
          onSpectate={vi.fn()}
          onReplay={vi.fn()}
        />
      );

      const currentGames = await screen.findByRole("region", { name: "Current public games" });
      fireEvent.click(within(currentGames).getByRole("button", { name: "Copy spectator link for game_copy_live" }));

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Spectator link copied.");
      });
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("onlineGame=game_copy_live"));
    } finally {
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  });

  it("runs quick match from the lobby with exact setup copy and pending controls", async () => {
    let resolveQuickMatch!: () => void;
    const quickMatchPromise = new Promise<"waiting">((resolve) => {
      resolveQuickMatch = () => resolve("waiting");
    });
    const onQuickMatch = vi.fn().mockReturnValue(quickMatchPromise);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([openSeek()]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCreateSeek={vi.fn()}
        onQuickMatch={onQuickMatch}
        quickMatchSetupSummary={{
          boardRadius: 7,
          clock: "Timed 20+20",
          scoring: "Victory points",
          rating: "Rated",
        }}
      />
    );

    await screen.findByText("seek_public_open");
    expect(screen.getByRole("region", { name: "Play from current setup" })).toBeInTheDocument();
    expect(screen.getByText("Try open listings with your current Play setup")).toBeInTheDocument();
    const setupSummary = screen.getByLabelText("Quick match setup summary");
    expect(within(setupSummary).getByText("Radius 7")).toBeInTheDocument();
    expect(within(setupSummary).getByText("Timed 20+20")).toBeInTheDocument();
    expect(within(setupSummary).getByText("Victory points")).toBeInTheDocument();
    expect(within(setupSummary).getByText("Rated")).toBeInTheDocument();
    expect(screen.getByText(/Quick Match tries open listings for this setup, then lists yours/i))
      .toBeInTheDocument();

    const quickMatch = screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    });
    fireEvent.click(quickMatch);

    expect(onQuickMatch).toHaveBeenCalledOnce();
    expect(quickMatch).toBeDisabled();
    const createListing = screen.getByRole("button", { name: "Create public lobby listing from current Play setup" });
    expect(createListing).toHaveTextContent("Create Lobby Listing");
    expect(createListing).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Checking open lobby listings");

    await act(async () => {
      resolveQuickMatch();
      await quickMatchPromise;
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/setup is listed in the Lobby/i);
  });

  it("lists the current setup from the lobby without allowing duplicate clicks", async () => {
    let resolveCreate!: () => void;
    const createPromise = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });
    const onCreateSeek = vi.fn().mockReturnValue(createPromise);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onCreateSeek={onCreateSeek}
      />
    );

    await screen.findByText("No lobby listings yet.");
    const listButton = screen.getByRole("button", { name: "Create public lobby listing from current Play setup" });
    expect(listButton).toHaveTextContent("Create Lobby Listing");

    fireEvent.click(listButton);
    fireEvent.click(listButton);

    expect(onCreateSeek).toHaveBeenCalledOnce();
    expect(listButton).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Creating lobby listing from current setup...");

    await act(async () => {
      resolveCreate();
      await createPromise;
    });

    expect(listButton).not.toBeDisabled();
  });

  it("lets signed-in players list the current setup for followed players only", async () => {
    const onCreateSeek = vi.fn().mockResolvedValue(undefined);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        onCreateSeek={onCreateSeek}
      />
    );

    await screen.findByText("No lobby listings yet.");
    const followedButton = screen.getByRole("button", {
      name: "Create followed-player lobby listing from current Play setup",
    });
    expect(followedButton).toHaveTextContent("List for Followed Players");

    fireEvent.click(followedButton);

    await waitFor(() => {
      expect(onCreateSeek).toHaveBeenCalledWith("followed");
    });
    expect(screen.getByRole("status")).toHaveTextContent("Listed for accounts you follow.");
  });

  it("lets signed-in players list the current setup for invited accounts only", async () => {
    const onCreateSeek = vi.fn().mockResolvedValue(undefined);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({
            seekId: "seek_invited_samir",
            visibility: "invited",
            invitedDisplayNames: ["Samir"],
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        account={accountFixture("Liam")}
        onCreateSeek={onCreateSeek}
      />
    );

    const inviteeInput = await screen.findByRole("textbox", { name: "Invite account to lobby listing" });
    fireEvent.change(inviteeInput, { target: { value: " Samir " } });
    const invitedButton = screen.getByRole("button", {
      name: "Create invite-only lobby listing from current Play setup",
    });
    expect(invitedButton).toHaveTextContent("List for Invited Account");

    fireEvent.click(invitedButton);

    await waitFor(() => {
      expect(onCreateSeek).toHaveBeenCalledWith("invited", { invitedDisplayNames: ["Samir"] });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Listed for Samir.");
    const listing = screen.getByRole("article", { name: /Lobby listing seek_invited_samir/i });
    expect(listing).toHaveTextContent("Invite-only");
    expect(listing).toHaveTextContent("Invited Samir");
  });

  it("surfaces trusted server errors when listing the current setup fails", async () => {
    const onCreateSeek = vi.fn().mockRejectedValue(
      new OnlineRequestError(
        409,
        "game_over",
        "This session already has an active open seek."
      )
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onCreateSeek={onCreateSeek}
      />
    );

    await screen.findByText("No lobby listings yet.");
    fireEvent.click(screen.getByRole("button", { name: "Create public lobby listing from current Play setup" }));

    await waitFor(() => expect(onCreateSeek).toHaveBeenCalledWith("public"));
    expect(await screen.findByRole("status")).toHaveTextContent("This session already has an active open seek.");
    expect(screen.queryByText("Could not list the current setup.")).not.toBeInTheDocument();
  });

  it("keeps conflicting lobby actions disabled after a matched quick match result", async () => {
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([openSeek()]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCreateSeek={vi.fn()}
        onQuickMatch={vi.fn().mockResolvedValue("matched")}
      />
    );

    await screen.findByText("seek_public_open");
    fireEvent.click(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    }));

    expect(await screen.findByRole("status")).toHaveTextContent("Match found. Opening game...");
    expect(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create public lobby listing from current Play setup" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh lobby listings" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Accept lobby listing seek_public_open" })).toBeDisabled();
  });

  it("starts quick match from the keyboard and moves focus to the owned seek after waiting", async () => {
    const user = userEvent.setup();
    const waitingSeek = openSeek({ seekId: "seek_keyboard_waiting" });

    function Harness() {
      const [ownedSeekResponse, setOwnedSeekResponse] = React.useState<{
        role: "creator";
        summary: OpenSeekSummary;
      } | null>(null);
      return (
        <OnlineGameBrowser
          initialTab="lobby"
          loadGames={vi.fn()}
          loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
          onBack={vi.fn()}
          onSpectate={vi.fn()}
          onReplay={vi.fn()}
          onAcceptSeek={vi.fn()}
          onCreateSeek={vi.fn()}
          ownedSeekIds={ownedSeekResponse ? [ownedSeekResponse.summary.seekId] : []}
          ownedSeekResponse={ownedSeekResponse}
          onQuickMatch={async (): Promise<"waiting"> => {
            setOwnedSeekResponse({ role: "creator", summary: waitingSeek });
            return "waiting";
          }}
        />
      );
    }

    render(<Harness />);

    await screen.findByText("No lobby listings yet.");
    const quickMatch = screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    });
    quickMatch.focus();
    await user.keyboard("{Enter}");

    const ownerPanel = await screen.findByRole("region", { name: "Your lobby listing" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "No open listing for this setup found. Your setup is listed in the Lobby for someone to accept."
    );
    expect(ownerPanel).toHaveFocus();
  });

  it("announces owned-seek actions after a waiting quick match", async () => {
    const waitingSeek = openSeek({ seekId: "seek_waiting_cancel" });

    function Harness() {
      const [ownedSeekResponse, setOwnedSeekResponse] = React.useState<{
        role: "creator";
        summary: OpenSeekSummary;
      } | null>(null);
      return (
        <OnlineGameBrowser
          initialTab="lobby"
          loadGames={vi.fn()}
          loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
          onBack={vi.fn()}
          onSpectate={vi.fn()}
          onReplay={vi.fn()}
          onAcceptSeek={vi.fn()}
          onCancelSeek={async () => setOwnedSeekResponse(null)}
          ownedSeekIds={ownedSeekResponse ? [ownedSeekResponse.summary.seekId] : []}
          ownedSeekResponse={ownedSeekResponse}
          onQuickMatch={async (): Promise<"waiting"> => {
            setOwnedSeekResponse({ role: "creator", summary: waitingSeek });
            return "waiting";
          }}
        />
      );
    }

    render(<Harness />);

    await screen.findByText("No lobby listings yet.");
    fireEvent.click(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(/listed in the Lobby for someone to accept/);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel your lobby listing" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Lobby listing cancelled.");
  });

  it("replaces waiting quick-match copy when a background refresh marks the owned seek accepted", async () => {
    const waitingSeek = openSeek({ seekId: "seek_waiting_accepted" });
    const acceptedSeek = openSeek({
      seekId: "seek_waiting_accepted",
      status: "accepted",
      updatedAt: "2026-06-01T12:02:00.000Z",
      acceptedAt: "2026-06-01T12:02:00.000Z",
      acceptedBy: { kind: "session", id: "acceptor" },
      gameId: "game_waiting_accepted",
      whiteIdentity: waitingSeek.creatorIdentity,
      blackIdentity: { kind: "session", id: "acceptor" },
      lastEventId: "seek_waiting_accepted_evt_accepted",
    });

    function Harness() {
      const [ownedSeekResponse, setOwnedSeekResponse] = React.useState<{
        role: "creator";
        summary: OpenSeekSummary;
        gameInvite?: { gameId: string; seat: "w" | "b"; token: string; url: string };
      } | null>(null);
      return (
        <>
          <OnlineGameBrowser
            initialTab="lobby"
            loadGames={vi.fn()}
            loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
            onBack={vi.fn()}
            onSpectate={vi.fn()}
            onReplay={vi.fn()}
            onAcceptSeek={vi.fn()}
            onJoinOwnedSeek={vi.fn()}
            ownedSeekIds={ownedSeekResponse ? [ownedSeekResponse.summary.seekId] : []}
            ownedSeekResponse={ownedSeekResponse}
            onQuickMatch={async (): Promise<"waiting"> => {
              setOwnedSeekResponse({ role: "creator", summary: waitingSeek });
              return "waiting";
            }}
          />
          <button
            type="button"
            onClick={() =>
              setOwnedSeekResponse({
                role: "creator",
                summary: acceptedSeek,
                gameInvite: {
                  gameId: "game_waiting_accepted",
                  seat: "w",
                  token: "join-token",
                  url: "https://castles.example/?onlineGame=game_waiting_accepted&seat=w",
                },
              })
            }
          >
            Mock accepted refresh
          </button>
        </>
      );
    }

    render(<Harness />);

    await screen.findByText("No lobby listings yet.");
    fireEvent.click(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(/listed in the Lobby for someone to accept/);

    fireEvent.click(screen.getByRole("button", { name: "Mock accepted refresh" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your lobby listing was accepted. Join the game from your lobby panel."
      );
    });
    expect(screen.getByRole("button", { name: "Join accepted game" })).toBeInTheDocument();
  });

  it("restores quick match focus after failures", async () => {
    const onQuickMatch = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCreateSeek={vi.fn()}
        onQuickMatch={onQuickMatch}
      />
    );

    await screen.findByText("No lobby listings yet.");
    const quickMatch = screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    });
    quickMatch.focus();
    fireEvent.click(quickMatch);

    expect(await screen.findByRole("status")).toHaveTextContent("Could not start quick match.");
    expect(quickMatch).toHaveFocus();
  });

  it("surfaces trusted server errors when quick match fails", async () => {
    const onQuickMatch = vi.fn().mockRejectedValue(
      new OnlineRequestError(
        409,
        "game_over",
        "This session already has an active open seek."
      )
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCreateSeek={vi.fn()}
        onQuickMatch={onQuickMatch}
      />
    );

    await screen.findByText("No lobby listings yet.");
    const quickMatch = screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    });
    quickMatch.focus();
    fireEvent.click(quickMatch);

    expect(await screen.findByRole("status")).toHaveTextContent("This session already has an active open seek.");
    expect(screen.queryByText("Could not start quick match.")).not.toBeInTheDocument();
    expect(quickMatch).toHaveFocus();
  });

  it("disables quick match while an owned seek is restoring, open, or accepted", async () => {
    const loadOpenSeeks = vi.fn().mockResolvedValue(seekDirectory([]));
    const { rerender } = render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={null}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onQuickMatch={vi.fn()}
      />
    );

    await screen.findByText("No lobby listings yet.");
    expect(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).toBeDisabled();

    rerender(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: openSeek({ seekId: "seek_mine" }),
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onQuickMatch={vi.fn()}
      />
    );
    expect(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).toBeDisabled();

    rerender(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: openSeek({
            seekId: "seek_mine",
            status: "accepted",
            acceptedAt: "2026-06-01T12:04:00.000Z",
            acceptedBy: { kind: "session", id: "acceptor" },
            gameId: "game_mine",
            whiteIdentity: { kind: "session", id: "creator" },
            blackIdentity: { kind: "session", id: "acceptor" },
          }),
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onQuickMatch={vi.fn()}
      />
    );
    expect(screen.getByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).toBeDisabled();
  });

  it("refreshes the public lobby listing list on demand", async () => {
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([]))
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_after_refresh" })]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    expect(await screen.findByText("No lobby listings yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh lobby listings" }));

    expect(await screen.findByText("seek_after_refresh")).toBeInTheDocument();
    expect(loadOpenSeeks).toHaveBeenCalledTimes(2);
  });

  it("loads lobby seek filters from the server and reports filtered empty states honestly", async () => {
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_initial" })]))
      .mockResolvedValue(seekDirectory([]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_initial");
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby creator side filter" }), {
      target: { value: "w" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby clock filter" }), {
      target: { value: "timed" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby scoring filter" }), {
      target: { value: "enabled" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Lobby rating filter" }), {
      target: { value: "rated" },
    });

    await waitFor(() => {
      expect(loadOpenSeeks).toHaveBeenLastCalledWith({
        state: "open",
        limit: 50,
        creatorSeat: "w",
        clock: "timed",
        vp: "enabled",
        rating: "rated",
      });
    });
    expect(await screen.findByText("No lobby listings match these filters.")).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/checked/i);
    expect(status.querySelector("[aria-hidden='true']")).toHaveTextContent(/checked/i);
    expect(document.querySelector(".online-browser-visually-hidden[aria-live='off']")).toHaveTextContent(/last checked/i);
    expect(status).not.toHaveTextContent(/present|waiting|ready/i);
  });

  it("auto-refreshes the active visible lobby without clearing rows on rate limits", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_initial" })]))
      .mockRejectedValueOnce(new Error("Could not fetch lobby listings (429)"))
      .mockResolvedValue(seekDirectory([openSeek({ seekId: "seek_after_backoff" })]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_initial");

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    await waitFor(() => expect(loadOpenSeeks).toHaveBeenCalledTimes(2));
    expect(screen.getByText("seek_initial")).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("Loading lobby listings");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(loadOpenSeeks).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    await waitFor(() => expect(loadOpenSeeks).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("seek_after_backoff")).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("Auto refresh paused");
  });

  it("pauses lobby auto-refresh while hidden and checks once when visible again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let visibilityState: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilityState);
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_initial" })]))
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_visible_again" })]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_initial");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(loadOpenSeeks).toHaveBeenCalledTimes(1);

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(await screen.findByText("seek_visible_again")).toBeInTheDocument();
    expect(loadOpenSeeks).toHaveBeenCalledTimes(2);
  });

  it("preserves a pending accept row and focus while background refresh omits it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveAccept!: () => void;
    const acceptPromise = new Promise<void>((resolve) => {
      resolveAccept = resolve;
    });
    const onAcceptSeek = vi.fn().mockReturnValue(acceptPromise);
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_acceptable" })]))
      .mockResolvedValue(seekDirectory([]));
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={onAcceptSeek}
      />
    );

    const row = await screen.findByRole("article", { name: /seek_acceptable/i });
    const accept = within(row).getByRole("button", { name: "Accept lobby listing seek_acceptable" });
    accept.focus();
    fireEvent.click(accept);

    await waitFor(() => expect(accept).toBeDisabled());
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(loadOpenSeeks.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole("article", { name: /seek_acceptable/i })).toBeInTheDocument();
    expect(accept).toHaveFocus();

    await act(async () => {
      resolveAccept();
      await acceptPromise;
    });
    await waitFor(() => expect(accept).not.toBeDisabled());
  });

  it("preserves a pending accept row when an older background refresh resolves after the click", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const backgroundRefresh = deferredSeekDirectory();
    let resolveAccept!: () => void;
    const acceptPromise = new Promise<void>((resolve) => {
      resolveAccept = resolve;
    });
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_background_race" })]))
      .mockReturnValueOnce(backgroundRefresh.promise);
    const onAcceptSeek = vi.fn().mockReturnValue(acceptPromise);

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={onAcceptSeek}
      />
    );

    const row = await screen.findByRole("article", { name: /seek_background_race/i });
    const accept = within(row).getByRole("button", { name: "Accept lobby listing seek_background_race" });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(loadOpenSeeks).toHaveBeenCalledTimes(2));

    accept.focus();
    fireEvent.click(accept);
    await waitFor(() => expect(accept).toBeDisabled());

    await act(async () => {
      backgroundRefresh.resolve(seekDirectory([]));
      await backgroundRefresh.promise;
    });

    expect(screen.getByRole("article", { name: /seek_background_race/i })).toBeInTheDocument();
    expect(accept).toHaveFocus();

    await act(async () => {
      resolveAccept();
      await acceptPromise;
    });
  });

  it("does not overlap a manual lobby refresh with an in-flight background refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const backgroundRefresh = deferredSeekDirectory();
    const loadOpenSeeks = vi
      .fn()
      .mockResolvedValueOnce(seekDirectory([openSeek({ seekId: "seek_before_refresh" })]))
      .mockReturnValueOnce(backgroundRefresh.promise)
      .mockResolvedValue(seekDirectory([openSeek({ seekId: "seek_after_refresh" })]));

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
      />
    );

    await screen.findByText("seek_before_refresh");
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(loadOpenSeeks).toHaveBeenCalledTimes(2));

    const refresh = screen.getByRole("button", { name: "Refresh lobby listings" });
    expect(refresh).toBeDisabled();
    fireEvent.click(refresh);
    expect(loadOpenSeeks).toHaveBeenCalledTimes(2);

    await act(async () => {
      backgroundRefresh.resolve(seekDirectory([openSeek({ seekId: "seek_background_done" })]));
      await backgroundRefresh.promise;
    });

    await waitFor(() => expect(refresh).not.toBeDisabled());
    expect(screen.getByText("seek_background_done")).toBeInTheDocument();
  });

  it("does not foreground reload the lobby when a seek action becomes pending", async () => {
    let resolveAccept!: () => void;
    const acceptPromise = new Promise<void>((resolve) => {
      resolveAccept = resolve;
    });
    const loadOpenSeeks = vi.fn().mockResolvedValue(seekDirectory([
      openSeek({ seekId: "seek_pending_no_reload" }),
    ]));
    const onAcceptSeek = vi.fn().mockReturnValue(acceptPromise);

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn()}
        loadOpenSeeks={loadOpenSeeks}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={onAcceptSeek}
      />
    );

    const row = await screen.findByRole("article", { name: /seek_pending_no_reload/i });
    const accept = within(row).getByRole("button", { name: "Accept lobby listing seek_pending_no_reload" });

    fireEvent.click(accept);

    await waitFor(() => expect(accept).toBeDisabled());
    expect(loadOpenSeeks).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAccept();
      await acceptPromise;
    });
  });

  it("auto-refreshes creator-owned lobby listings through the owner refresh path", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onRefreshOwnedSeek = vi.fn().mockResolvedValue(undefined);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: openSeek({ seekId: "seek_mine" }),
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onRefreshOwnedSeek={onRefreshOwnedSeek}
      />
    );

    await screen.findByRole("region", { name: "Your lobby listing" });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(onRefreshOwnedSeek).toHaveBeenCalledOnce());
  });

  it("surfaces trusted server errors when refreshing an owned lobby listing fails", async () => {
    const onRefreshOwnedSeek = vi.fn().mockRejectedValue(
      new OnlineRequestError(
        429,
        "rate_limited",
        "Please wait before refreshing that lobby listing again."
      )
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: openSeek({ seekId: "seek_mine" }),
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onRefreshOwnedSeek={onRefreshOwnedSeek}
      />
    );

    const panel = await screen.findByRole("region", { name: "Your lobby listing" });
    fireEvent.click(within(panel).getByRole("button", { name: "Refresh your lobby listing" }));

    await waitFor(() => expect(onRefreshOwnedSeek).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent("Please wait before refreshing that lobby listing again.");
    expect(screen.queryByText("Could not refresh your lobby listing.")).not.toBeInTheDocument();
  });

  it("accepts and cancels lobby listings with row-local pending states", async () => {
    const onAcceptSeek = vi.fn().mockResolvedValue(undefined);
    const onCancelSeek = vi.fn().mockResolvedValue(undefined);
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_acceptable" }),
          openSeek({ seekId: "seek_mine" }),
        ]))}
        ownedSeekIds={["seek_mine"]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={onAcceptSeek}
        onCancelSeek={onCancelSeek}
      />
    );

    const acceptRow = await screen.findByRole("article", { name: /seek_acceptable/i });
    fireEvent.click(within(acceptRow).getByRole("button", { name: "Accept lobby listing seek_acceptable" }));

    await waitFor(() => expect(onAcceptSeek).toHaveBeenCalledWith("seek_acceptable"));

    const ownRow = screen.getByRole("article", { name: /seek_mine/i });
    fireEvent.click(within(ownRow).getByRole("button", { name: "Cancel lobby listing seek_mine" }));

    await waitFor(() => expect(onCancelSeek).toHaveBeenCalledWith("seek_mine"));
  });

  it("surfaces trusted server errors when accepting a lobby listing fails", async () => {
    const onAcceptSeek = vi.fn().mockRejectedValue(
      new OnlineRequestError(
        404,
        "not_found",
        "That lobby listing is no longer available."
      )
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_expired" }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={onAcceptSeek}
      />
    );

    const row = await screen.findByRole("article", { name: /seek_expired/i });
    fireEvent.click(within(row).getByRole("button", { name: "Accept lobby listing seek_expired" }));

    await waitFor(() => expect(onAcceptSeek).toHaveBeenCalledWith("seek_expired"));
    expect(await screen.findByRole("status")).toHaveTextContent("That lobby listing is no longer available.");
    expect(screen.queryByText("Could not accept that lobby listing.")).not.toBeInTheDocument();
  });

  it("surfaces trusted server errors when cancelling a lobby listing fails", async () => {
    const onCancelSeek = vi.fn().mockRejectedValue(
      new OnlineRequestError(
        429,
        "rate_limited",
        "Please wait before changing that lobby listing again."
      )
    );
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([
          openSeek({ seekId: "seek_mine" }),
        ]))}
        ownedSeekIds={["seek_mine"]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onCancelSeek={onCancelSeek}
      />
    );

    const row = await screen.findByRole("article", { name: /seek_mine/i });
    fireEvent.click(within(row).getByRole("button", { name: "Cancel lobby listing seek_mine" }));

    await waitFor(() => expect(onCancelSeek).toHaveBeenCalledWith("seek_mine"));
    expect(await screen.findByRole("status")).toHaveTextContent("Please wait before changing that lobby listing again.");
    expect(screen.queryByText("Could not cancel that lobby listing.")).not.toBeInTheDocument();
  });

  it("shows creator-owned seek status with refresh, cancel, and accepted-game join actions", async () => {
    const onRefreshOwnedSeek = vi.fn().mockResolvedValue(undefined);
    const onCancelSeek = vi.fn().mockResolvedValue(undefined);
    const onJoinOwnedSeek = vi.fn();
    const { rerender } = render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: openSeek({ seekId: "seek_mine", creatorSeat: "w" }),
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCancelSeek={onCancelSeek}
        onRefreshOwnedSeek={onRefreshOwnedSeek}
        onJoinOwnedSeek={onJoinOwnedSeek}
      />
    );

    const openPanel = await screen.findByRole("region", { name: "Your lobby listing" });

    expect(openPanel).toHaveTextContent("seek_mine");
    expect(openPanel).toHaveTextContent("Open");
    fireEvent.click(within(openPanel).getByRole("button", { name: "Refresh your lobby listing" }));
    await waitFor(() => expect(onRefreshOwnedSeek).toHaveBeenCalledOnce());
    fireEvent.click(within(openPanel).getByRole("button", { name: "Cancel your lobby listing" }));
    await waitFor(() => expect(onCancelSeek).toHaveBeenCalledWith("seek_mine"));

    const accepted = openSeek({
      seekId: "seek_mine",
      creatorSeat: "w",
      status: "accepted",
      updatedAt: "2026-06-01T12:04:00.000Z",
      acceptedAt: "2026-06-01T12:04:00.000Z",
      acceptedBy: { kind: "session", id: "seek_mine_acceptor" },
      gameId: "game_from_seek",
      whiteIdentity: { kind: "session", id: "seek_mine_creator" },
      blackIdentity: { kind: "session", id: "seek_mine_acceptor" },
      lastEventId: "seek_mine_accepted",
    });
    rerender(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        ownedSeekIds={["seek_mine"]}
        ownedSeekResponse={{
          role: "creator",
          summary: accepted,
          gameInvite: {
            gameId: "game_from_seek",
            seat: "w",
            token: "creator-token",
            url: "https://castles.example/?onlineGame=game_from_seek&seat=w&token=creator-token",
          },
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onCancelSeek={onCancelSeek}
        onRefreshOwnedSeek={onRefreshOwnedSeek}
        onJoinOwnedSeek={onJoinOwnedSeek}
      />
    );

    const panel = await screen.findByRole("region", { name: "Your lobby listing" });

    expect(panel).toHaveTextContent("seek_mine");
    expect(panel).toHaveTextContent("Accepted");
    expect(within(panel).queryByRole("button", { name: "Cancel your lobby listing" })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Join accepted game" }));
    expect(onJoinOwnedSeek).toHaveBeenCalledOnce();
  });

  it("shows the concrete owned side after a random-side listing is accepted", async () => {
    const acceptedRandom = openSeek({
      seekId: "seek_random_accepted_side",
      creatorSeat: "random",
      status: "accepted",
      updatedAt: "2026-06-01T12:04:00.000Z",
      acceptedAt: "2026-06-01T12:04:00.000Z",
      acceptedBy: { kind: "session", id: "seek_random_acceptor" },
      gameId: "game_random_accepted_side",
      whiteIdentity: { kind: "session", id: "seek_random_creator" },
      blackIdentity: { kind: "session", id: "seek_random_acceptor" },
      lastEventId: "seek_random_accepted_side_evt",
    });

    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        ownedSeekIds={["seek_random_accepted_side"]}
        ownedSeekResponse={{
          role: "creator",
          summary: acceptedRandom,
          gameInvite: {
            gameId: "game_random_accepted_side",
            seat: "b",
            token: "creator-token",
            url: "https://castles.example/?onlineGame=game_random_accepted_side&seat=b&token=creator-token",
          },
        }}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onAcceptSeek={vi.fn()}
        onJoinOwnedSeek={vi.fn()}
      />
    );

    const panel = await screen.findByRole("region", { name: "Your lobby listing" });
    expect(panel).toHaveTextContent("You play Black");
    expect(panel).not.toHaveTextContent("Creator side Random");
  });

  it.each(["cancelled", "expired"] as const)(
    "does not render dead owner controls for %s lobby listings",
    async (status) => {
      const terminalSeek = openSeek({
        seekId: `seek_${status}`,
        status,
        updatedAt: status === "expired" ? "2026-06-01T12:11:00.000Z" : "2026-06-01T12:04:00.000Z",
        ...(status === "cancelled"
          ? {
              cancelledAt: "2026-06-01T12:04:00.000Z",
              cancelledBy: { kind: "session" as const, id: "seek_cancelled_creator" },
            }
          : {
              expiredAt: "2026-06-01T12:11:00.000Z",
              expiredBy: "system" as const,
            }),
      });

      render(
        <OnlineGameBrowser
          initialTab="lobby"
          loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
          ownedSeekIds={[terminalSeek.seekId]}
          ownedSeekResponse={{ role: "creator", summary: terminalSeek }}
          onBack={vi.fn()}
          onSpectate={vi.fn()}
          onReplay={vi.fn()}
          onAcceptSeek={vi.fn()}
          onCancelSeek={vi.fn()}
          onRefreshOwnedSeek={vi.fn()}
          onCreateSeek={vi.fn()}
          onQuickMatch={vi.fn()}
        />
      );

      await screen.findByText("No lobby listings yet.");
      const closedPanel = screen.getByRole("region", { name: "Closed lobby listing" });
      expect(closedPanel).toHaveTextContent("This listing is no longer public");
      expect(closedPanel).toHaveTextContent(status === "cancelled" ? "Cancelled" : "Expired");
      expect(closedPanel).toHaveTextContent(`seek_${status}`);
      expect(screen.queryByRole("region", { name: "Your lobby listing" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Refresh your lobby listing" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancel your lobby listing" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Create a new lobby listing from current Play setup" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Create public lobby listing from current Play setup" })).toHaveLength(1);
      expect(screen.getByRole("status")).toHaveTextContent("Your previous lobby listing is closed and no longer public.");
    }
  );

  it("moves focus to the closed listing panel when owner controls disappear", async () => {
    const openOwnedSeek = openSeek({ seekId: "seek_focus_terminal" });
    const closedOwnedSeek = openSeek({
      seekId: "seek_focus_terminal",
      status: "cancelled",
      updatedAt: "2026-06-01T12:04:00.000Z",
      cancelledAt: "2026-06-01T12:04:00.000Z",
      cancelledBy: { kind: "session", id: "seek_focus_terminal_creator" },
    });
    const props = {
      initialTab: "lobby" as const,
      loadOpenSeeks: vi.fn().mockResolvedValue(seekDirectory([])),
      ownedSeekIds: ["seek_focus_terminal"],
      onBack: vi.fn(),
      onSpectate: vi.fn(),
      onReplay: vi.fn(),
      onAcceptSeek: vi.fn(),
      onCancelSeek: vi.fn(),
      onRefreshOwnedSeek: vi.fn().mockResolvedValue(undefined),
      onCreateSeek: vi.fn(),
      onQuickMatch: vi.fn(),
    };
    const { rerender } = render(
      <OnlineGameBrowser
        {...props}
        ownedSeekResponse={{
          role: "creator",
          summary: openOwnedSeek,
        }}
      />
    );

    const openPanel = await screen.findByRole("region", { name: "Your lobby listing" });
    const refresh = within(openPanel).getByRole("button", { name: "Refresh your lobby listing" });
    refresh.focus();
    expect(refresh).toHaveFocus();

    rerender(
      <OnlineGameBrowser
        {...props}
        ownedSeekResponse={{
          role: "creator",
          summary: closedOwnedSeek,
        }}
      />
    );

    const closedPanel = await screen.findByRole("region", { name: "Closed lobby listing" });
    await waitFor(() => expect(closedPanel).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Refresh your lobby listing" })).not.toBeInTheDocument();
  });

  it("loads the public directory for the active tab state", async () => {
    const loadGames = vi.fn().mockResolvedValue(directory([]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("No public games in progress.")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({ state: "active", limit: 50 });

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));

    expect(await screen.findByText("No public completed games yet.")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({ state: "archived", limit: 50 });
  });

  it("requests public game clock rating and archive result filters from the server", async () => {
    const loadGames = vi.fn().mockResolvedValue(directory([]));
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("No public completed games yet.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Time control filter" }), {
      target: { value: "casual" },
    });

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "archived",
        limit: 50,
        clock: "casual",
        cursor: undefined,
      });
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Rating filter" }), {
      target: { value: "rated" },
    });

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "archived",
        limit: 50,
        clock: "casual",
        rating: "rated",
        cursor: undefined,
      });
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "timeout" },
    });

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "archived",
        limit: 50,
        clock: "casual",
        rating: "rated",
        result: "timeout",
        cursor: undefined,
      });
    });
    expect(screen.getByText("No public replays match these filters.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Live public games" }));

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "active",
        limit: 50,
        clock: "casual",
        rating: "rated",
        cursor: undefined,
      });
    });
  });

  it("requests public game search from the server and preserves it for pagination", async () => {
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([summary({ gameId: "game_initial_page" })]))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_search_match" })], "cursor-search"))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_search_second_page" })]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("game_initial_page")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "black   to   move" },
    });

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "active",
        limit: 50,
        query: "black to move",
        cursor: undefined,
      });
    });
    expect(await screen.findByText("game_search_match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "active",
        limit: 50,
        query: "black to move",
        cursor: "cursor-search",
      });
    });
    expect(await screen.findByText("game_search_second_page")).toBeInTheDocument();
  });

  it("trusts server-returned Watch search rows without filtering them again locally", async () => {
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([summary({ gameId: "game_initial_page" })]))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_server_selected" })]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("game_initial_page")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "server only indexed field" },
    });

    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "active",
        limit: 50,
        query: "server only indexed field",
        cursor: undefined,
      });
    });
    expect(await screen.findByText("game_server_selected")).toBeInTheDocument();
  });

  it("shows an honest empty Watch state while only public games are listable", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        onBack={vi.fn()}
        onOpenGame={vi.fn()}
        onTutorial={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenProfile={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading public games");
    const nav = screen.getByRole("navigation", { name: "Online navigation" });
    const destinations = Array.from(nav.querySelectorAll(".app-shell-destination"))
      .map((element) => element.textContent?.trim());
    expect(nav).toBeInTheDocument();
    expect(destinations).toEqual(["Play", "Tutorial", "Online", "Profile", "Library"]);
    expect(screen.getByRole("button", { name: "Online" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("No public games in progress.")).toBeInTheDocument();
    expect(screen.getByText(/Private and unlisted games stay off this page/i)).toBeInTheDocument();
  });

  it("shows a setup prompt when no playable setup action is available", async () => {
    const onOpenGame = vi.fn();
    const onConfigureSetup = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="lobby"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onOpenGame={onOpenGame}
        onConfigureSetup={onConfigureSetup}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("No lobby listings yet.");

    expect(screen.getByRole("region", { name: "Set up lobby play" })).toBeInTheDocument();
    expect(screen.getByText("Choose a Play setup before lobby play")).toBeInTheDocument();
    expect(screen.getByText("Configure setup, then return here to find or create a lobby listing.")).toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Quick Match: try open lobby listings or list yours",
    })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Create public lobby listing from current Play setup",
    })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure a Play setup for online lobby" }));

    expect(onConfigureSetup).toHaveBeenCalledOnce();
    expect(onOpenGame).not.toHaveBeenCalled();
  });

  it("auto-refreshes the Watch tab while visible", async () => {
    vi.useFakeTimers();
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_watch_refresh" })]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("No public games in progress.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("game_watch_refresh")).toBeInTheDocument();
    expect(loadGames).toHaveBeenCalledTimes(2);
  });

  it("pauses Watch auto-refresh while the tab is hidden", async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilityState);
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_visible_again" })]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(loadGames).toHaveBeenCalledTimes(1);

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadGames).toHaveBeenCalledTimes(2);
    expect(screen.getByText("game_visible_again")).toBeInTheDocument();
  });

  it("renders live public games with accessible spectator handoff", async () => {
    const onSpectate = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([summary()]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={vi.fn()}
      />
    );

    const row = await screen.findByRole("article", { name: /Ada vs Ben/i });
    const selectedRegion = screen.getByRole("region", {
      name: "Current public live selection by most moves in current list",
    });
    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    expect(liveOverview).toHaveTextContent("1 public live game");
    expect(liveOverview).toHaveTextContent("Selected by");
    expect(liveOverview).toHaveTextContent("Most moves in current list");
    expect(liveOverview).toHaveTextContent("Ada vs Ben, 3 moves");
    expect(liveOverview).toHaveTextContent("Public only");
    expect(selectedRegion).toContainElement(row);
    expect(row).toHaveTextContent("Current live selection");
    expect(row).toHaveTextContent("Most moves in current list");
    expect(row).toHaveTextContent("Live");
    expect(row).toHaveTextContent("3 moves");
    expect(row).toHaveTextContent("Black to move, Attack");
    expect(row).toHaveTextContent("Last G13G12");
    expect(row).toHaveTextContent("Clock W 19:58 B 19:57");
    expect(within(row).getByRole("img", {
      name: "Board preview: 2 White pieces 2 Black pieces 1 White-controlled castles 1 Black-controlled castles",
    })).toBeInTheDocument();
    expect(row).toHaveTextContent("Pieces W2 B2");
    expect(row).toHaveTextContent("Castles W1 B1");

    fireEvent.click(within(row).getByRole("button", { name: "Spectate Ada vs Ben, game_public_active" }));

    expect(onSpectate).toHaveBeenCalledWith("game_public_active");
  });

  it("selects the most-moves live game even when the Watch list is sorted newest", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_newest_few_moves",
            updatedAt: "2026-06-01T12:05:00.000Z",
            version: 2,
          }),
          summary({
            gameId: "game_older_many_moves",
            updatedAt: "2026-06-01T12:01:00.000Z",
            version: 9,
            participants: [
              { seat: "w", role: "white", identity: { kind: "registered", id: "caro_w", displayName: "Caro" } },
              { seat: "b", role: "black", identity: { kind: "registered", id: "dani_b", displayName: "Dani" } },
            ],
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_newest_few_moves");

    expect(screen.getByRole("combobox", { name: "Sort public games" })).toHaveValue("newest");
    const selectedRegion = screen.getByRole("region", {
      name: "Current public live selection by most moves in current list",
    });
    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    expect(liveOverview).toHaveTextContent("2 public live games");
    expect(liveOverview).toHaveTextContent("Caro vs Dani, 9 moves");
    expect(selectedRegion).toHaveTextContent("game_older_many_moves");
    expect(selectedRegion).toHaveTextContent("9 moves");
    expect(screen.getByRole("region", { name: "Other public live games" })).toHaveTextContent("game_newest_few_moves");
  });

  it("keeps the Watch live count total while search filters the visible leader", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({ gameId: "game_public_visible", version: 5 }),
          summary({
            gameId: "game_public_hidden",
            version: 9,
            participants: [
              { seat: "w", role: "white", identity: { kind: "registered", id: "caro_w", displayName: "Caro" } },
              { seat: "b", role: "black", identity: { kind: "registered", id: "dani_b", displayName: "Dani" } },
            ],
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_public_visible");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "Ada" },
    });

    const liveOverview = screen.getByRole("group", { name: "Watch live games overview" });
    expect(liveOverview).toHaveTextContent("2 public live games");
    expect(liveOverview).toHaveTextContent("Ada vs Ben, 5 moves");
    expect(screen.queryByText("game_public_hidden")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "no matching game" },
    });

    expect(liveOverview).toHaveTextContent("2 public live games");
    expect(liveOverview).toHaveTextContent("No visible game");
    expect(liveOverview).toHaveTextContent("No matching public games");
  });

  it("defensively hides non-public summaries even if a loader returns them", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({ gameId: "game_public_visible", visibility: "public" }),
          summary({ gameId: "game_unlisted_hidden", visibility: "unlisted" }),
          summary({ gameId: "game_private_hidden", visibility: "private" }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("game_public_visible")).toBeInTheDocument();
    expect(screen.queryByText("game_unlisted_hidden")).not.toBeInTheDocument();
    expect(screen.queryByText("game_private_hidden")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Watch game_unlisted_hidden" })).not.toBeInTheDocument();
  });

  it("keeps completed games in the Online Archive tab with local analysis replay actions", async () => {
    const onReplay = vi.fn();
    const onSpectate = vi.fn();
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_public_archive",
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:05:00.000Z",
            updatedAt: "2026-06-01T12:05:00.000Z",
            ratingMode: "rated",
            result: { winner: "w", reason: "resignation" },
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={onSpectate}
        onReplay={onReplay}
      />
    );

    const row = await screen.findByRole("article", {
      name: "Ada vs Ben replay game_public_archive, White wins by resignation",
    });
    expect(screen.getByRole("button", { name: "Online Archive" })).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveTextContent("Complete");
    expect(row).toHaveTextContent("Replay length 3 moves");
    expect(row).toHaveTextContent("Final position Black, Attack");
    expect(row).toHaveTextContent("Last move G13G12");
    expect(row).toHaveTextContent("Timed 20+20");
    expect(row).toHaveTextContent("Rating Rated");
    expect(row).toHaveTextContent(/Ended /);
    expect(row).toHaveTextContent(/Started /);
    expect(row).toHaveTextContent("White wins by resignation");

    fireEvent.click(within(row).getByRole("button", {
      name: "Show archive details for Ada vs Ben, game_public_archive",
    }));
    const details = screen.getByRole("region", { name: "Archive details for game_public_archive" });
    await waitFor(() => expect(details).toHaveFocus());
    expect(details).toHaveTextContent(/Archive details\s*Ada vs Ben\s*game_public_archive/);
    expect(details).toHaveTextContent(/White\s*Ada/);
    expect(details).toHaveTextContent(/Black\s*Ben/);
    expect(details).toHaveTextContent(/Result\s*White wins by resignation/);
    expect(details).toHaveTextContent(/Replay\s*3 moves/);
    expect(details).toHaveTextContent(/Final phase\s*Black to move, Attack/);
    expect(details).toHaveTextContent(/Last move\s*G13G12/);
    expect(details).toHaveTextContent(/Time control\s*Timed 20\+20/);
    expect(details).toHaveTextContent(/Final clock\s*Clock W 19:58 B 19:57/);
    expect(details).toHaveTextContent(/Rating\s*Rated/);
    expect(details).toHaveTextContent(/Visibility\s*Public/);
    fireEvent.click(within(details).getByRole("button", {
      name: "Close archive details for game_public_archive",
    }));
    expect(screen.queryByRole("region", { name: "Archive details for game_public_archive" })).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Analyze replay Ada vs Ben, game_public_archive" }));

    expect(onReplay).toHaveBeenCalledWith("game_public_archive");
    expect(onSpectate).not.toHaveBeenCalled();
    expect(within(row).queryByRole("button", { name: "Copy spectator link for game_public_archive" })).not.toBeInTheDocument();
  });

  it("keeps current spectator sorting out of Online Archive", async () => {
    const active = summary({ gameId: "game_live_with_watchers", version: 6 });
    active.livePreview = {
      ...active.livePreview,
      spectatorCount: 5,
    };
    const archived = summary({
      gameId: "game_public_archive_no_watchers",
      status: "complete",
      archiveState: "archived",
      endedAt: "2026-06-01T12:05:00.000Z",
      updatedAt: "2026-06-01T12:05:00.000Z",
      result: { winner: "b", reason: "timeout" },
    });
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([active, archived]))}
        loadOpenSeeks={vi.fn().mockResolvedValue(seekDirectory([]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_live_with_watchers");
    const watchSort = screen.getByRole("combobox", { name: "Sort public games" });
    fireEvent.change(watchSort, { target: { value: "watchers" } });
    expect(watchSort).toHaveValue("watchers");

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));

    await screen.findByText("game_public_archive_no_watchers");
    const archiveSort = screen.getByRole("combobox", { name: "Sort archive games" });
    expect(archiveSort).toHaveValue("newest");
    expect(screen.queryByRole("option", { name: "Most watched in current list" })).not.toBeInTheDocument();
  });

  it("shows completed recent device games in Online Archive without duplicating public rows", async () => {
    const onReplay = vi.fn();
    const onClearRecentOnlineGames = vi.fn();
    const loadGames = vi.fn().mockResolvedValue(directory([
      summary({
        gameId: "game_public_archive",
        status: "complete",
        archiveState: "archived",
        updatedAt: "2026-06-01T12:05:00.000Z",
        result: { winner: "w", reason: "resignation" },
      }),
    ]));
    const { rerender } = render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={loadGames}
        recentOnlineGames={[
          {
            gameId: "game_unlisted_finished",
            role: "player",
            seat: "b",
            status: "complete",
            lastSeenAt: "2026-06-01T13:00:00.000Z",
          },
          {
            gameId: "game_public_archive",
            role: "player",
            seat: "w",
            status: "complete",
            lastSeenAt: "2026-06-01T12:05:00.000Z",
          },
          {
            gameId: "game_active_recent",
            role: "spectator",
            status: "active",
            lastSeenAt: "2026-06-01T12:30:00.000Z",
          },
        ]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={onReplay}
        onClearRecentOnlineGames={onClearRecentOnlineGames}
      />
    );

    const recent = await screen.findByRole("region", { name: "Recent online games on this device" });
    expect(recent).toHaveTextContent("game_unlisted_finished");
    expect(recent).toHaveTextContent("Played Black");
    expect(recent).toHaveTextContent("Device-only replay");
    expect(recent).toHaveTextContent(
      "Completed online games opened in this browser can be replayed here when they are not already in your account or public archive."
    );
    expect(recent).toHaveTextContent(
      "Search can match these local game ids; clock and result filters require server archive details."
    );
    expect(recent).not.toHaveTextContent("game_active_recent");
    expect(within(recent).queryByText("game_public_archive")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search online archive" }), {
      target: { value: "not-this-device-game" },
    });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search online archive" }), {
      target: { value: "unlisted" },
    });
    const filteredRecent = await screen.findByRole("region", { name: "Recent online games on this device" });
    expect(filteredRecent).toHaveTextContent("game_unlisted_finished");

    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "white" },
    });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "all" },
    });
    const restoredRecent = await screen.findByRole("region", { name: "Recent online games on this device" });

    fireEvent.click(
      within(restoredRecent).getByRole("button", { name: "Analyze recent online replay game_unlisted_finished" })
    );
    expect(onReplay).toHaveBeenCalledWith("game_unlisted_finished");

    const clearButton = within(restoredRecent).getByRole("button", {
      name: "Clear recent online replays on this device",
    });
    expect(clearButton).toHaveTextContent("Clear Recent Replays");
    fireEvent.click(clearButton);
    expect(onClearRecentOnlineGames).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Online Archive" })).toHaveFocus();
    expect(screen.getByText("Recent device replay list cleared.")).toBeInTheDocument();

    rerender(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={loadGames}
        recentOnlineGames={[]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={onReplay}
        onClearRecentOnlineGames={onClearRecentOnlineGames}
      />
    );
    expect(screen.queryByRole("region", { name: "Recent online games on this device" })).not.toBeInTheDocument();
  });

  it("does not carry the recent replay clear status into Watch", async () => {
    const { rerender } = render(
      <OnlineGameBrowser
        activeTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        recentOnlineGames={[
          {
            gameId: "game_unlisted_finished",
            role: "player",
            seat: "b",
            status: "complete",
            lastSeenAt: "2026-06-01T13:00:00.000Z",
          },
        ]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onClearRecentOnlineGames={vi.fn()}
      />
    );

    const recent = await screen.findByRole("region", { name: "Recent online games on this device" });
    fireEvent.click(
      within(recent).getByRole("button", {
        name: "Clear recent online replays on this device",
      })
    );
    expect(screen.getByRole("status")).toHaveTextContent("Recent device replay list cleared.");

    rerender(
      <OnlineGameBrowser
        activeTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([]))}
        recentOnlineGames={[]}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
        onClearRecentOnlineGames={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).not.toHaveTextContent("Recent device replay list cleared.");
  });

  it("filters public summaries by player name and game id", async () => {
    const gameAda = summary({ gameId: "game_ada_public" });
    const gameCaro = summary({
      gameId: "game_caro_public",
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "caro_w", displayName: "Caro" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "dani_b", displayName: "Dani" } },
      ],
    });
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([gameAda, gameCaro]))
      .mockResolvedValueOnce(directory([gameCaro]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_ada_public");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "caro" },
    });

    expect(screen.queryByText("game_ada_public")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(loadGames.mock.calls.at(-1)?.[0]).toEqual({
        state: "active",
        limit: 50,
        query: "caro",
        cursor: undefined,
      });
    });
    expect(await screen.findByText("game_caro_public")).toBeInTheDocument();
  });

  it("sorts and filters live public games without exposing hidden summaries", async () => {
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_newer_few_moves",
            updatedAt: "2026-06-01T12:05:00.000Z",
            version: 2,
            hasTimeControl: true,
          }),
          summary({
            gameId: "game_older_many_moves",
            updatedAt: "2026-06-01T12:01:00.000Z",
            version: 9,
            hasTimeControl: false,
          }),
          summary({
            gameId: "game_middle_moves",
            updatedAt: "2026-06-01T12:03:00.000Z",
            version: 5,
            hasTimeControl: false,
          }),
          summary({ gameId: "game_hidden_unlisted", visibility: "unlisted", version: 99 }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_newer_few_moves");
    expect(screen.queryByText("game_hidden_unlisted")).not.toBeInTheDocument();

    const selectedRegion = screen.getByRole("region", {
      name: "Current public live selection by most moves in current list",
    });
    expect(selectedRegion).toHaveTextContent("game_older_many_moves");
    let sideRows = within(screen.getByRole("region", { name: "Other public live games" })).getAllByRole("article");
    expect(sideRows[0]).toHaveTextContent("game_newer_few_moves");
    expect(sideRows[1]).toHaveTextContent("game_middle_moves");

    fireEvent.change(screen.getByRole("combobox", { name: "Sort public games" }), {
      target: { value: "moves" },
    });
    sideRows = within(screen.getByRole("region", { name: "Other public live games" })).getAllByRole("article");
    expect(sideRows[0]).toHaveTextContent("game_middle_moves");

    fireEvent.change(screen.getByRole("combobox", { name: "Time control filter" }), {
      target: { value: "timed" },
    });

    expect(screen.getByText("game_newer_few_moves")).toBeInTheDocument();
    expect(screen.queryByText("game_older_many_moves")).not.toBeInTheDocument();
    expect(screen.queryByText("game_middle_moves")).not.toBeInTheDocument();
  });

  it("filters archived games by result and reports filtered no-results honestly", async () => {
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_white_archive",
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:05:00.000Z",
            result: { winner: "w", reason: "resignation" },
          }),
          summary({
            gameId: "game_black_archive",
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:06:00.000Z",
            result: { winner: "b", reason: "timeout" },
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_white_archive");

    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "black" },
    });

    await waitFor(() => {
      expect(screen.getByText("game_black_archive")).toBeInTheDocument();
      expect(screen.queryByText("game_white_archive")).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search online archive" }), {
      target: { value: "no-such-game" },
    });

    await waitFor(() => {
      expect(screen.getByText("No public replays match these filters.")).toBeInTheDocument();
    });
  });

  it("hides archive-only result filters on Watch and resets them when returning to live games", async () => {
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: "game_black_archive",
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:06:00.000Z",
            result: { winner: "b", reason: "timeout" },
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await screen.findByText("game_black_archive");
    fireEvent.change(screen.getByRole("combobox", { name: "Result filter" }), {
      target: { value: "black" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Live public games" }));

    expect(screen.queryByRole("combobox", { name: "Result filter" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Result filter" })).toHaveValue("all");
    });
  });

  it("keeps long public rows actionable on narrow layouts", async () => {
    const longId = "game_public_archive_with_a_very_long_identifier_that_should_wrap_without_hiding_actions";
    render(
      <OnlineGameBrowser
        initialTab="archive"
        loadGames={vi.fn().mockResolvedValue(directory([
          summary({
            gameId: longId,
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-06-01T12:05:00.000Z",
            result: { winner: "w", reason: "castle_control" },
            participants: [
              { seat: "w", role: "white", identity: { kind: "registered", id: "very_long_w", displayName: "A Very Long White Player Name That Wraps" } },
              { seat: "b", role: "black", identity: { kind: "registered", id: "very_long_b", displayName: "A Very Long Black Player Name That Wraps" } },
            ],
          }),
        ]))}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    const row = await screen.findByRole("article", { name: new RegExp(longId) });

    expect(row).toHaveTextContent(longId);
    expect(within(row).getByRole("button", { name: new RegExp(`Analyze replay .*${longId}`) })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: `Copy spectator link for ${longId}` })).not.toBeInTheDocument();
  });

  it("loads additional public directory pages on demand", async () => {
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([summary({ gameId: "game_first_page" })], "cursor-next"))
      .mockResolvedValueOnce(directory([summary({ gameId: "game_second_page" })]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("game_first_page")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("game_second_page")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({
      state: "active",
      limit: 50,
      cursor: "cursor-next",
    });
  });

  it("does not let Watch auto-refresh clobber a pending Load more request", async () => {
    vi.useFakeTimers();
    const secondPage = deferredDirectory();
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([summary({ gameId: "game_first_page" })], "cursor-next"))
      .mockReturnValueOnce(secondPage.promise);
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("game_first_page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(loadGames).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondPage.resolve(directory([summary({ gameId: "game_second_page" })]));
      await secondPage.promise;
    });

    expect(screen.getByText("game_second_page")).toBeInTheDocument();
  });

  it("reloads the public directory when search changes instead of relying on an unfiltered cursor", async () => {
    const loadGames = vi
      .fn()
      .mockResolvedValueOnce(directory([
        summary({ gameId: "game_first_page_no_match" }),
      ], "cursor-filtered"))
      .mockResolvedValueOnce(directory([
        summary({ gameId: "game_second_page_match" }),
      ]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("game_first_page_no_match")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search live public games" }), {
      target: { value: "second_page_match" },
    });

    expect(screen.getByText("No public games match these filters.")).toBeInTheDocument();

    expect(await screen.findByText("game_second_page_match")).toBeInTheDocument();
    expect(loadGames).toHaveBeenLastCalledWith({
      state: "active",
      limit: 50,
      query: "second_page_match",
      cursor: undefined,
    });
  });

  it("ignores stale tab load responses after a newer tab request wins", async () => {
    const watch = deferredDirectory();
    const archive = deferredDirectory();
    const loadGames = vi
      .fn()
      .mockReturnValueOnce(watch.promise)
      .mockReturnValueOnce(archive.promise);
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Online Archive" }));
    archive.resolve(directory([
      summary({
        gameId: "game_archive_wins_race",
        status: "complete",
        archiveState: "archived",
        endedAt: "2026-06-01T12:06:00.000Z",
        result: { winner: "b", reason: "timeout" },
      }),
    ]));
    expect(await screen.findByText("game_archive_wins_race")).toBeInTheDocument();

    watch.resolve(directory([summary({ gameId: "game_stale_watch" })]));

    expect(screen.queryByText("game_stale_watch")).not.toBeInTheDocument();
    expect(screen.getByText("game_archive_wins_race")).toBeInTheDocument();
  });

  it("shows a retryable failure state when public summaries cannot load", async () => {
    const loadGames = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(directory([summary()]));
    render(
      <OnlineGameBrowser
        initialTab="watch"
        loadGames={loadGames}
        onBack={vi.fn()}
        onSpectate={vi.fn()}
        onReplay={vi.fn()}
      />
    );

    expect(await screen.findByText("Could not load public games.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("game_public_active")).toBeInTheDocument();
    expect(loadGames).toHaveBeenCalledTimes(2);
  });
});
