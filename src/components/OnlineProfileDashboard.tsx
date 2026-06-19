import React from "react";
import AppShellNav, { type AppShellDestination } from "./AppShellNav";
import {
  OnlineRequestError,
  type FetchOnlineAccountChallengesOptions,
  type FetchOnlineAccountGamesOptions,
} from "../online/client";
import {
  ONLINE_ACCOUNT_PASSWORD_MAX_LENGTH,
  ONLINE_ACCOUNT_PASSWORD_MIN_LENGTH,
  type OnlineAccount,
  type OnlineAccountSessionsResponse,
} from "../online/accounts";
import type {
  OnlineAccountFollowingResponse,
  OnlineAccountPrivacyPatch,
  OnlineAccountPrivacyResponse,
  OnlineAccountPrivacySettings,
  OnlineAccountProfileResponse,
  OnlineAccountPublicProfile,
  OnlineAccountSearchProfile,
  OnlineAccountSearchResponse,
} from "../online/social";
import type { OnlineAccountChallengeDirectoryResponse } from "../online/challenges";
import type { OnlineGameDirectoryResponse, OnlineGameSummary } from "../online/readModel";
import "../css/OnlineProfileDashboard.css";

type LoadStatus = "idle" | "loading" | "ready" | "error";
type ProfileSectionId = "summary" | "games" | "rating" | "people" | "settings";

const SELF_PROFILE_SECTIONS: Array<{ id: ProfileSectionId; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "games", label: "Games" },
  { id: "rating", label: "Rating" },
  { id: "people", label: "People" },
  { id: "settings", label: "Settings" },
];
const PUBLIC_PROFILE_SECTIONS: Array<{ id: ProfileSectionId; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "rating", label: "Rating" },
  { id: "people", label: "People" },
];

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
  updateAccountPrivacy?: (patch: OnlineAccountPrivacyPatch) => Promise<OnlineAccountPrivacyResponse>;
  updateAccountPassword?: (input: { currentPassword?: string; newPassword: string }) => Promise<unknown>;
  loadAccountSessions?: () => Promise<OnlineAccountSessionsResponse>;
  searchProfiles?: (query: string) => Promise<OnlineAccountSearchResponse>;
  onOpenProfile?: (displayName: string) => void;
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

function onlineRequestErrorMessage(error: unknown): string | null {
  return error instanceof OnlineRequestError ? error.message : null;
}

function isProfileSectionAllowed(section: string | null, isSelfDashboard: boolean): section is ProfileSectionId {
  if (
    section !== "summary" &&
    section !== "games" &&
    section !== "rating" &&
    section !== "people" &&
    section !== "settings"
  ) {
    return false;
  }
  return isSelfDashboard || (section !== "games" && section !== "settings");
}

function readProfileSectionFromUrl(isSelfDashboard: boolean): ProfileSectionId {
  if (typeof window === "undefined") return "summary";
  const rawSection = new URL(window.location.href).searchParams.get("section");
  return isProfileSectionAllowed(rawSection, isSelfDashboard) ? rawSection : "summary";
}

function writeProfileSectionToUrl(section: ProfileSectionId, mode: "push" | "replace" = "push"): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (section === "summary") {
    url.searchParams.delete("section");
  } else {
    url.searchParams.set("section", section);
  }
  const nextPath = `${url.pathname}${url.search}${url.hash}`;
  if (nextPath === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  if (mode === "replace") {
    window.history.replaceState({}, "", nextPath);
  } else {
    window.history.pushState({}, "", nextPath);
  }
}

const OnlineProfileDashboard: React.FC<OnlineProfileDashboardProps> = ({
  displayName,
  account,
  loadProfile,
  loadAccountGames,
  loadAccountChallenges,
  loadAccountFollowing,
  loadAccountPrivacy,
  updateAccountPrivacy,
  updateAccountPassword,
  loadAccountSessions,
  searchProfiles,
  onOpenProfile,
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
  const [privacySettings, setPrivacySettings] = React.useState<OnlineAccountPrivacySettings | null>(null);
  const [sessionCount, setSessionCount] = React.useState(0);
  const [dashboardStatus, setDashboardStatus] = React.useState<LoadStatus>("idle");
  const [activeSection, setActiveSection] = React.useState<ProfileSectionId>("summary");
  const [privacyStatus, setPrivacyStatus] = React.useState<LoadStatus>("idle");
  const [passwordStatus, setPasswordStatus] = React.useState<LoadStatus>("idle");
  const [settingsMessage, setSettingsMessage] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<OnlineAccountSearchProfile[]>([]);
  const [searchStatus, setSearchStatus] = React.useState<LoadStatus>("idle");
  const profileRequestRef = React.useRef(0);
  const dashboardRequestRef = React.useRef(0);
  const searchRequestRef = React.useRef(0);
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
    const section = readProfileSectionFromUrl(isSelfDashboard);
    setActiveSection(section);
    writeProfileSectionToUrl(section, "replace");
  }, [displayName, isSelfDashboard]);

  React.useEffect(() => {
    const handlePopState = () => {
      setActiveSection(readProfileSectionFromUrl(isSelfDashboard));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isSelfDashboard]);

  React.useEffect(() => {
    const requestId = ++dashboardRequestRef.current;
    setActiveGames([]);
    setCompletedGames([]);
    setChallengeCount(0);
    setFollowingCount(0);
    setPrivacyLabel("Loading");
    setPrivacySettings(null);
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
        setPrivacySettings(privacy);
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

  React.useEffect(() => {
    const requestId = ++searchRequestRef.current;
    const query = searchQuery.trim();
    if (!searchProfiles || query.length < 2) {
      setSearchResults([]);
      setSearchStatus("idle");
      return;
    }
    setSearchStatus("loading");
    const timeout = window.setTimeout(() => {
      searchProfiles(query)
        .then((response) => {
          if (requestId !== searchRequestRef.current) return;
          setSearchResults(response.profiles);
          setSearchStatus("ready");
        })
        .catch((error) => {
          if (requestId !== searchRequestRef.current) return;
          console.error("[OnlineProfileDashboard] Failed to search profiles", error);
          setSearchResults([]);
          setSearchStatus("error");
        });
    }, 160);
    return () => window.clearTimeout(timeout);
  }, [searchProfiles, searchQuery]);

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
  const ratedGameText = profile?.rating ? formatCount(profile.rating.games, "rated game") : "0 rated games";
  const profileSections = isSelfDashboard ? SELF_PROFILE_SECTIONS : PUBLIC_PROFILE_SECTIONS;
  const showsOverviewSection = activeSection === "summary";
  const showsGamesSection = showsOverviewSection || activeSection === "games";
  const showsRatingSection = showsOverviewSection || activeSection === "rating";
  const showsPeopleSection = showsOverviewSection || activeSection === "people";
  const showsSettingsSection = activeSection === "settings";
  const canSubmitPassword =
    !!updateAccountPassword &&
    newPassword.length >= ONLINE_ACCOUNT_PASSWORD_MIN_LENGTH &&
    newPassword.length <= ONLINE_ACCOUNT_PASSWORD_MAX_LENGTH &&
    passwordStatus !== "loading";

  const handleSectionChange = (section: ProfileSectionId) => {
    setActiveSection(section);
    writeProfileSectionToUrl(section);
  };

  const handlePrivacyChange = (field: keyof OnlineAccountPrivacyPatch, value: string) => {
    if (!privacySettings) return;
    setPrivacySettings({
      ...privacySettings,
      [field]: value,
    });
  };

  const handleSavePrivacy = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!privacySettings || !updateAccountPrivacy) return;
    setPrivacyStatus("loading");
    setSettingsMessage("");
    try {
      const response = await updateAccountPrivacy({
        followPolicy: privacySettings.followPolicy,
        presencePolicy: privacySettings.presencePolicy,
        challengePolicy: privacySettings.challengePolicy,
      });
      setPrivacySettings(response.privacy);
      setPrivacyLabel(
        `Follows ${response.privacy.followPolicy}; status ${response.privacy.presencePolicy}; challenges ${response.privacy.challengePolicy}`
      );
      setSettingsMessage("Privacy settings saved.");
      setPrivacyStatus("ready");
    } catch (error) {
      console.error("[OnlineProfileDashboard] Failed to update privacy settings", error);
      setSettingsMessage(onlineRequestErrorMessage(error) ?? "Privacy settings could not be saved.");
      setPrivacyStatus("error");
    }
  };

  const handleSavePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitPassword || !updateAccountPassword) return;
    setPasswordStatus("loading");
    setSettingsMessage("");
    try {
      await updateAccountPassword({
        ...(currentPassword ? { currentPassword } : {}),
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setSettingsMessage("Password updated.");
      setPasswordStatus("ready");
    } catch (error) {
      console.error("[OnlineProfileDashboard] Failed to update password", error);
      setSettingsMessage(onlineRequestErrorMessage(error) ?? "Password could not be updated.");
      setPasswordStatus("error");
    }
  };

  const searchSlot = searchProfiles ? (
    <div className="online-profile-search">
      <label>
        <span>Search players</span>
        <input
          type="search"
          role="searchbox"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder="Search players"
          autoComplete="off"
        />
      </label>
      {(searchStatus === "loading" || searchStatus === "error" || searchResults.length > 0) && (
        <div className="online-profile-search-results" role="listbox" aria-label="Player search results">
          {searchStatus === "loading" && <p role="status">Searching players...</p>}
          {searchStatus === "error" && <p className="online-profile-error">Player search failed.</p>}
          {searchStatus === "ready" && searchResults.map((result) => (
            <button
              key={result.displayName}
              type="button"
              role="option"
              aria-label={`${result.displayName} rating ${result.rating?.display ?? "1500?"}`}
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                onOpenProfile?.(result.displayName);
              }}
            >
              <span>{result.displayName}</span>
              <span>{result.rating?.display ?? "1500?"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

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
        endSlot={searchSlot}
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

      <section className="online-profile-tabs" aria-label="Profile sections">
        {profileSections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-pressed={activeSection === section.id}
            onClick={() => handleSectionChange(section.id)}
          >
            {section.label}
          </button>
        ))}
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
          {showsGamesSection && (
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
          )}

          {showsRatingSection && (
            <article className="online-profile-panel">
              <span className="online-profile-kicker">Rating</span>
              <h2>Current Rating</h2>
              <p>{ratedGameText}</p>
              <div className="online-profile-rating-strip" aria-label="Rating graph preview">
                <span>{profile?.rating?.display ?? "1500?"}</span>
              </div>
            </article>
          )}

          {showsPeopleSection && (
            <article className="online-profile-panel">
              <span className="online-profile-kicker">Challenges</span>
              <h2>Challenge Inbox</h2>
              <p>{formatCount(challengeCount, "challenge")} visible to this account.</p>
            </article>
          )}

          {showsPeopleSection && (
            <article className="online-profile-panel">
              <span className="online-profile-kicker">Following</span>
              <h2>People</h2>
              <p>{formatCount(followingCount, "followed player")}.</p>
            </article>
          )}

          {showsSettingsSection && (
            <article className="online-profile-panel">
              <span className="online-profile-kicker">Settings</span>
              <h2>Visibility</h2>
              <p>{privacyLabel}</p>
              {settingsMessage && (
                <p
                  className={privacyStatus === "error" || passwordStatus === "error" ? "online-profile-error" : ""}
                  role="status"
                  aria-live="polite"
                >
                  {settingsMessage}
                </p>
              )}
              {privacySettings && updateAccountPrivacy && (
                <form className="online-profile-settings-form" onSubmit={handleSavePrivacy}>
                  <label>
                    <span>Who can follow me</span>
                    <select
                      value={privacySettings.followPolicy}
                      onChange={(event) => handlePrivacyChange("followPolicy", event.currentTarget.value)}
                    >
                      <option value="everyone">Everyone</option>
                      <option value="nobody">Nobody</option>
                    </select>
                  </label>
                  <label>
                    <span>Who can see me online</span>
                    <select
                      value={privacySettings.presencePolicy}
                      onChange={(event) => handlePrivacyChange("presencePolicy", event.currentTarget.value)}
                    >
                      <option value="followed">Players I follow</option>
                      <option value="everyone">Everyone</option>
                      <option value="nobody">Nobody</option>
                    </select>
                  </label>
                  <label>
                    <span>Who can challenge me</span>
                    <select
                      value={privacySettings.challengePolicy}
                      onChange={(event) => handlePrivacyChange("challengePolicy", event.currentTarget.value)}
                    >
                      <option value="followed">Players I follow</option>
                      <option value="everyone">Everyone</option>
                      <option value="nobody">Nobody</option>
                    </select>
                  </label>
                  <button type="submit" className="online-profile-button" disabled={privacyStatus === "loading"}>
                    {privacyStatus === "loading" ? "Saving" : "Save Privacy"}
                  </button>
                </form>
              )}
              {updateAccountPassword && (
                <form className="online-profile-settings-form" onSubmit={handleSavePassword}>
                  <h3>Change Password</h3>
                  <p>Leave current password blank if this account does not have a local password yet.</p>
                  <label>
                    <span>Current password</span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.currentTarget.value)}
                      maxLength={ONLINE_ACCOUNT_PASSWORD_MAX_LENGTH}
                      autoComplete="current-password"
                    />
                  </label>
                  <label>
                    <span>New password</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.currentTarget.value)}
                      minLength={ONLINE_ACCOUNT_PASSWORD_MIN_LENGTH}
                      maxLength={ONLINE_ACCOUNT_PASSWORD_MAX_LENGTH}
                      autoComplete="new-password"
                    />
                  </label>
                  <button type="submit" className="online-profile-button" disabled={!canSubmitPassword}>
                    {passwordStatus === "loading" ? "Saving" : "Save Password"}
                  </button>
                </form>
              )}
            </article>
          )}

          {showsSettingsSection && (
            <article className="online-profile-panel">
              <span className="online-profile-kicker">Sessions</span>
              <h2>Account Sessions</h2>
              <p>{formatCount(sessionCount, "active session")}.</p>
              <p>Session controls stay in the account dialog.</p>
            </article>
          )}
        </section>
      ) : (
        <section className="online-profile-dashboard-grid" aria-label="Public profile sections">
          {showsRatingSection && (
            <article className="online-profile-panel">
              <span className="online-profile-kicker">Rating</span>
              <h2>Current Rating</h2>
              <p>{ratedGameText}</p>
            </article>
          )}
          {showsPeopleSection && (
            <article className="online-profile-panel">
              <span className="online-profile-kicker">Presence</span>
              <h2>Status</h2>
              <p>{presenceLabel(profile)}</p>
            </article>
          )}
        </section>
      )}
    </main>
  );
};

export default OnlineProfileDashboard;
