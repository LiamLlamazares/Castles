import React from "react";
import AppShellNav, { type AppShellDestination } from "./AppShellNav";
import type {
  FetchOnlineAccountChallengesOptions,
  FetchOnlineAccountGamesOptions,
} from "../online/client";
import type { OnlineAccount, OnlineAccountSessionsResponse } from "../online/accounts";
import type {
  OnlineAccountFollowingResponse,
  OnlineAccountPrivacyResponse,
  OnlineAccountProfileResponse,
  OnlineAccountPublicProfile,
} from "../online/social";
import type { OnlineAccountChallengeDirectoryResponse } from "../online/challenges";
import type { OnlineGameDirectoryResponse, OnlineGameSummary } from "../online/readModel";
import "../css/OnlineProfileDashboard.css";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface OnlineProfileDashboardProps {
  displayName: string;
  account?: OnlineAccount | null;
  loadProfile: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  loadAccountGames?: (options?: FetchOnlineAccountGamesOptions) => Promise<OnlineGameDirectoryResponse>;
  loadAccountChallenges?: (
    options?: FetchOnlineAccountChallengesOptions
  ) => Promise<OnlineAccountChallengeDirectoryResponse & { protocolVersion: number }>;
  loadAccountFollowing?: () => Promise<OnlineAccountFollowingResponse>;
  loadAccountPrivacy?: () => Promise<OnlineAccountPrivacyResponse>;
  loadAccountSessions?: () => Promise<OnlineAccountSessionsResponse>;
  onBack?: () => void;
  backLabel?: string;
  onOpenGame?: () => void;
  onTutorial?: () => void;
  onOpenOnlineBrowser?: () => void;
  onOpenLibrary?: () => void;
  onOpenAccountControls?: () => void;
  onlineNotificationCount?: number;
  onlineNotificationLabel?: string;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function presenceLabel(profile: OnlineAccountPublicProfile | null): string {
  if (!profile) return "Loading";
  if (profile.presence.visibility === "hidden" || profile.presence.status === null) {
    return "Status hidden";
  }
  return profile.presence.status[0].toUpperCase() + profile.presence.status.slice(1);
}

function gameCount(games: OnlineGameSummary[]): string {
  return formatCount(games.length, "game");
}

const OnlineProfileDashboard: React.FC<OnlineProfileDashboardProps> = ({
  displayName,
  account,
  loadProfile,
  loadAccountGames,
  loadAccountChallenges,
  loadAccountFollowing,
  loadAccountPrivacy,
  loadAccountSessions,
  onBack,
  backLabel = "Back",
  onOpenGame,
  onTutorial,
  onOpenOnlineBrowser,
  onOpenLibrary,
  onOpenAccountControls,
  onlineNotificationCount = 0,
  onlineNotificationLabel = "challenge activities",
}) => {
  const [profile, setProfile] = React.useState<OnlineAccountPublicProfile | null>(null);
  const [profileStatus, setProfileStatus] = React.useState<LoadStatus>("loading");
  const [activeGames, setActiveGames] = React.useState<OnlineGameSummary[]>([]);
  const [completedGames, setCompletedGames] = React.useState<OnlineGameSummary[]>([]);
  const [challengeCount, setChallengeCount] = React.useState(0);
  const [followingCount, setFollowingCount] = React.useState(0);
  const [privacyLabel, setPrivacyLabel] = React.useState("Loading");
  const [sessionCount, setSessionCount] = React.useState(0);
  const [dashboardStatus, setDashboardStatus] = React.useState<LoadStatus>("idle");
  const profileRequestRef = React.useRef(0);
  const dashboardRequestRef = React.useRef(0);
  const isSelfDashboard =
    !!account && account.displayName.trim().toLowerCase() === displayName.trim().toLowerCase();

  React.useEffect(() => {
    const requestId = ++profileRequestRef.current;
    setProfile(null);
    setProfileStatus("loading");
    loadProfile(displayName)
      .then((response) => {
        if (requestId !== profileRequestRef.current) return;
        setProfile(response.profile);
        setProfileStatus("ready");
      })
      .catch((error) => {
        if (requestId !== profileRequestRef.current) return;
        console.error("[OnlineProfileDashboard] Failed to load profile", error);
        setProfileStatus("error");
      });
  }, [displayName, loadProfile]);

  React.useEffect(() => {
    const requestId = ++dashboardRequestRef.current;
    setActiveGames([]);
    setCompletedGames([]);
    setChallengeCount(0);
    setFollowingCount(0);
    setPrivacyLabel("Loading");
    setSessionCount(0);

    if (!isSelfDashboard) {
      setDashboardStatus("idle");
      return;
    }

    setDashboardStatus("loading");
    const activeGamesLoad = loadAccountGames?.({ state: "active", limit: 3 }) ?? Promise.resolve(null);
    const completedGamesLoad = loadAccountGames?.({ state: "archived", limit: 5 }) ?? Promise.resolve(null);
    const challengesLoad = loadAccountChallenges?.({ state: "all" }) ?? Promise.resolve(null);
    const followingLoad = loadAccountFollowing?.() ?? Promise.resolve(null);
    const privacyLoad = loadAccountPrivacy?.() ?? Promise.resolve(null);
    const sessionsLoad = loadAccountSessions?.() ?? Promise.resolve(null);

    Promise.allSettled([
      activeGamesLoad,
      completedGamesLoad,
      challengesLoad,
      followingLoad,
      privacyLoad,
      sessionsLoad,
    ] as const).then((results) => {
      if (requestId !== dashboardRequestRef.current) return;
      const [
        activeGamesResult,
        completedGamesResult,
        challengesResult,
        followingResult,
        privacyResult,
        sessionsResult,
      ] = results;
      if (activeGamesResult.status === "fulfilled" && activeGamesResult.value) {
        setActiveGames(activeGamesResult.value.games);
      }
      if (completedGamesResult.status === "fulfilled" && completedGamesResult.value) {
        setCompletedGames(completedGamesResult.value.games);
      }
      if (challengesResult.status === "fulfilled" && challengesResult.value) {
        setChallengeCount(challengesResult.value.challenges.length);
      }
      if (followingResult.status === "fulfilled" && followingResult.value) {
        setFollowingCount(followingResult.value.following.length);
      }
      if (privacyResult.status === "fulfilled" && privacyResult.value) {
        const privacy = privacyResult.value.privacy;
        setPrivacyLabel(
          `Follows ${privacy.followPolicy}; status ${privacy.presencePolicy}; challenges ${privacy.challengePolicy}`
        );
      }
      if (sessionsResult.status === "fulfilled" && sessionsResult.value) {
        setSessionCount(sessionsResult.value.sessions.length);
      }
      setDashboardStatus(results.some((result) => result.status === "rejected") ? "error" : "ready");
    });
  }, [
    displayName,
    isSelfDashboard,
    loadAccountChallenges,
    loadAccountFollowing,
    loadAccountGames,
    loadAccountPrivacy,
    loadAccountSessions,
  ]);

  const navDestinations: AppShellDestination[] = [
    { id: "play", label: "Play", onClick: onOpenGame },
    ...(onTutorial ? [{ id: "learn" as const, label: "Tutorial", onClick: onTutorial }] : []),
    ...(onOpenOnlineBrowser
      ? [{
          id: "online" as const,
          label: "Online",
          onClick: onOpenOnlineBrowser,
          notificationCount: onlineNotificationCount,
          notificationSingularLabel: "challenge activity",
          notificationPluralLabel: onlineNotificationLabel,
        }]
      : []),
    { id: "profile", label: "Profile" },
    ...(onOpenLibrary ? [{ id: "library" as const, label: "Library", onClick: onOpenLibrary }] : []),
  ];

  const ratingText = profile?.rating ? `Rating ${profile.rating.display}` : "Rating unrated";

  return (
    <main className="online-profile-page">
      <AppShellNav
        ariaLabel="Profile navigation"
        activeDestination="profile"
        title={displayName}
        kicker={isSelfDashboard ? "Profile Dashboard" : "Public Profile"}
        description={
          isSelfDashboard
            ? "Your signed-in Castles account summary."
            : "A shareable Castles profile with public rating and visibility-safe status."
        }
        backLabel={onBack ? backLabel : undefined}
        onBack={onBack}
        destinations={navDestinations}
      />

      <section className="online-profile-hero" aria-label={`${displayName} profile summary`}>
        <div>
          <span className="online-profile-kicker">
            {isSelfDashboard ? "Account summary" : "Shareable profile"}
          </span>
          <strong className="online-profile-display-name">{displayName}</strong>
          <div className="online-profile-badges">
            <span>{ratingText}</span>
            <span>{presenceLabel(profile)}</span>
            {profile?.relationship.self && <span>Self</span>}
          </div>
        </div>
        {isSelfDashboard && onOpenAccountControls && (
          <button type="button" className="online-profile-button subtle" onClick={onOpenAccountControls}>
            Account Controls
          </button>
        )}
      </section>

      {profileStatus === "loading" && (
        <section className="online-profile-panel" role="status" aria-live="polite">
          <h2>Loading profile...</h2>
          <p>Profile data is loading from the public account summary.</p>
        </section>
      )}

      {profileStatus === "error" && (
        <section className="online-profile-panel error" role="alert">
          <h2>Profile unavailable.</h2>
          <p>This profile could not be loaded right now.</p>
        </section>
      )}

      {isSelfDashboard ? (
        <section className="online-profile-dashboard-grid" aria-label="Profile dashboard sections">
          <article className="online-profile-panel">
            <span className="online-profile-kicker">Games</span>
            <h2>My Games</h2>
            <p>{gameCount(activeGames)} active.</p>
            <p>{gameCount(completedGames)} completed.</p>
            {dashboardStatus === "loading" && <p role="status">Loading dashboard data...</p>}
            {dashboardStatus === "error" && <p className="online-profile-error">Some dashboard data is unavailable.</p>}
            {activeGames.length === 0 && completedGames.length === 0 && dashboardStatus === "ready" && (
              <p>No account games yet.</p>
            )}
          </article>

          <article className="online-profile-panel">
            <span className="online-profile-kicker">Challenges</span>
            <h2>Challenge Inbox</h2>
            <p>{formatCount(challengeCount, "challenge")} visible to this account.</p>
          </article>

          <article className="online-profile-panel">
            <span className="online-profile-kicker">Following</span>
            <h2>People</h2>
            <p>{formatCount(followingCount, "followed player")}.</p>
          </article>

          <article className="online-profile-panel">
            <span className="online-profile-kicker">Privacy</span>
            <h2>Visibility</h2>
            <p>{privacyLabel}</p>
          </article>

          <article className="online-profile-panel">
            <span className="online-profile-kicker">Sessions</span>
            <h2>Account Sessions</h2>
            <p>{formatCount(sessionCount, "active session")}.</p>
            <p>Session controls stay in the account dialog.</p>
          </article>
        </section>
      ) : (
        <section className="online-profile-dashboard-grid" aria-label="Public profile sections">
          <article className="online-profile-panel">
            <span className="online-profile-kicker">Rating</span>
            <h2>Current Rating</h2>
            <p>{profile?.rating ? formatCount(profile.rating.games, "rated game") : "No rated games yet."}</p>
          </article>
          <article className="online-profile-panel">
            <span className="online-profile-kicker">Presence</span>
            <h2>Status</h2>
            <p>{presenceLabel(profile)}</p>
          </article>
        </section>
      )}
    </main>
  );
};

export default OnlineProfileDashboard;
