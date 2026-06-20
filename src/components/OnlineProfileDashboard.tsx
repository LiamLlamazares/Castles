import React from "react";
import AppShellNav, { type AppShellDestination } from "./AppShellNav";
import {
  formatOnlineGameResult,
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
  OnlineAccountAvatar,
  OnlineAccountAvatarColor,
  OnlineAccountAvatarPreset,
  OnlineAccountProfilePatch,
  OnlineAccountPrivacyPatch,
  OnlineAccountPrivacyResponse,
  OnlineAccountPrivacySettings,
  OnlineAccountProfileResponse,
  OnlineAccountPublicProfile,
  OnlineAccountRatingHistoryEntry,
  OnlineAccountRatingHistoryResponse,
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
  { id: "games", label: "Games" },
  { id: "rating", label: "Rating" },
  { id: "people", label: "People" },
];

const AVATAR_PRESET_OPTIONS: Array<{ value: OnlineAccountAvatarPreset; label: string; mark: string }> = [
  { value: "monarch", label: "Monarch", mark: "M" },
  { value: "dragon", label: "Dragon", mark: "D" },
  { value: "knight", label: "Knight", mark: "K" },
  { value: "archer", label: "Archer", mark: "A" },
  { value: "eagle", label: "Eagle", mark: "E" },
  { value: "trebuchet", label: "Trebuchet", mark: "T" },
  { value: "swordsman", label: "Swordsman", mark: "S" },
  { value: "assassin", label: "Assassin", mark: "N" },
];

const AVATAR_COLOR_OPTIONS: Array<{ value: OnlineAccountAvatarColor; label: string }> = [
  { value: "green", label: "Green" },
  { value: "amber", label: "Amber" },
  { value: "blue", label: "Blue" },
  { value: "violet", label: "Violet" },
  { value: "red", label: "Red" },
  { value: "slate", label: "Slate" },
];

interface OnlineProfileDashboardProps {
  displayName: string;
  account?: OnlineAccount | null;
  loadProfile: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  loadAccountGames?: (options?: FetchOnlineAccountGamesOptions) => Promise<OnlineGameDirectoryResponse>;
  loadPublicProfileGames?: (displayName: string) => Promise<OnlineGameDirectoryResponse>;
  loadAccountChallenges?: (
    options?: FetchOnlineAccountChallengesOptions
  ) => Promise<OnlineAccountChallengeDirectoryResponse & { protocolVersion: number }>;
  loadAccountRatingHistory?: () => Promise<OnlineAccountRatingHistoryResponse>;
  loadAccountFollowing?: () => Promise<OnlineAccountFollowingResponse>;
  loadAccountPrivacy?: () => Promise<OnlineAccountPrivacyResponse>;
  updateAccountProfile?: (patch: OnlineAccountProfilePatch) => Promise<OnlineAccountProfileResponse>;
  updateAccountPrivacy?: (patch: OnlineAccountPrivacyPatch) => Promise<OnlineAccountPrivacyResponse>;
  updateAccountPassword?: (input: { currentPassword?: string; newPassword: string }) => Promise<unknown>;
  loadAccountSessions?: () => Promise<OnlineAccountSessionsResponse>;
  onSignOutAllAccountSessions?: () => void | Promise<void>;
  onDeleteAccount?: () => void | Promise<void>;
  searchProfiles?: (query: string) => Promise<OnlineAccountSearchResponse>;
  onOpenProfile?: (displayName: string) => void;
  onReplay?: (gameId: string) => void;
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

function avatarMark(avatar: OnlineAccountAvatar): string {
  return AVATAR_PRESET_OPTIONS.find((option) => option.value === avatar.preset)?.mark ?? "C";
}

function avatarAccessibleName(displayName: string, avatar: OnlineAccountAvatar): string {
  return `${displayName} profile avatar, ${avatar.preset} on ${avatar.color}`;
}

function OnlineProfileAvatar({
  displayName,
  avatar,
  decorative = false,
}: {
  displayName: string;
  avatar: OnlineAccountAvatar;
  decorative?: boolean;
}) {
  if (decorative) {
    return (
      <span
        className={`online-profile-avatar online-profile-avatar-${avatar.color}`}
        aria-hidden="true"
      >
        <span>{avatarMark(avatar)}</span>
      </span>
    );
  }
  return (
    <span
      className={`online-profile-avatar online-profile-avatar-${avatar.color}`}
      role="img"
      aria-label={avatarAccessibleName(displayName, avatar)}
    >
      <span aria-hidden="true">{avatarMark(avatar)}</span>
    </span>
  );
}

function participantDisplayName(game: OnlineGameSummary, seat: "w" | "b"): string {
  const participant = game.participants.find((candidate) => candidate.seat === seat);
  if (participant?.identity.kind === "registered" && participant.identity.displayName) {
    return participant.identity.displayName;
  }
  return seat === "w" ? "White" : "Black";
}

function publicGameTitle(game: OnlineGameSummary): string {
  return `${participantDisplayName(game, "w")} vs ${participantDisplayName(game, "b")}`;
}

function gameCount(games: OnlineGameSummary[]): string {
  return formatCount(games.length, "game");
}

function formatRatingDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function ratingGraphBarHeight(entry: OnlineAccountRatingHistoryEntry, entries: OnlineAccountRatingHistoryEntry[]): string {
  const values = entries.flatMap((candidate) => [candidate.ratingBefore, candidate.ratingAfter]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return "50%";
  const normalized = (entry.ratingAfter - min) / (max - min);
  return `${Math.round(30 + normalized * 62)}%`;
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
  return isSelfDashboard || section !== "settings";
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
  loadPublicProfileGames,
  loadAccountChallenges,
  loadAccountRatingHistory,
  loadAccountFollowing,
  loadAccountPrivacy,
  updateAccountProfile,
  updateAccountPrivacy,
  updateAccountPassword,
  loadAccountSessions,
  onSignOutAllAccountSessions,
  onDeleteAccount,
  searchProfiles,
  onOpenProfile,
  onReplay,
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
  const [avatarDraft, setAvatarDraft] = React.useState<OnlineAccountAvatar | null>(null);
  const [profileStatus, setProfileStatus] = React.useState<LoadStatus>("loading");
  const [activeGames, setActiveGames] = React.useState<OnlineGameSummary[]>([]);
  const [completedGames, setCompletedGames] = React.useState<OnlineGameSummary[]>([]);
  const [publicGames, setPublicGames] = React.useState<OnlineGameSummary[]>([]);
  const [publicGamesStatus, setPublicGamesStatus] = React.useState<LoadStatus>("idle");
  const [ratingHistory, setRatingHistory] = React.useState<OnlineAccountRatingHistoryEntry[]>([]);
  const [challengeCount, setChallengeCount] = React.useState(0);
  const [followingCount, setFollowingCount] = React.useState(0);
  const [privacyLabel, setPrivacyLabel] = React.useState("Loading");
  const [privacySettings, setPrivacySettings] = React.useState<OnlineAccountPrivacySettings | null>(null);
  const [sessionCount, setSessionCount] = React.useState(0);
  const [dashboardStatus, setDashboardStatus] = React.useState<LoadStatus>("idle");
  const [activeSection, setActiveSection] = React.useState<ProfileSectionId>("summary");
  const [avatarStatus, setAvatarStatus] = React.useState<LoadStatus>("idle");
  const [privacyStatus, setPrivacyStatus] = React.useState<LoadStatus>("idle");
  const [passwordStatus, setPasswordStatus] = React.useState<LoadStatus>("idle");
  const [sessionActionStatus, setSessionActionStatus] = React.useState<LoadStatus>("idle");
  const [deleteAccountStatus, setDeleteAccountStatus] = React.useState<LoadStatus>("idle");
  const [isDeleteAccountConfirmOpen, setIsDeleteAccountConfirmOpen] = React.useState(false);
  const [settingsMessage, setSettingsMessage] = React.useState("");
  const [settingsMessageTone, setSettingsMessageTone] = React.useState<"status" | "error">("status");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<OnlineAccountSearchProfile[]>([]);
  const [searchStatus, setSearchStatus] = React.useState<LoadStatus>("idle");
  const profileRequestRef = React.useRef(0);
  const dashboardRequestRef = React.useRef(0);
  const publicGamesRequestRef = React.useRef(0);
  const searchRequestRef = React.useRef(0);
  const deleteAccountConfirmPanelId = React.useId();
  const deleteAccountConfirmHeadingId = React.useId();
  const deleteAccountConfirmDescriptionId = React.useId();
  const isSelfDashboard =
    !!account && account.displayName.trim().toLowerCase() === displayName.trim().toLowerCase();

  React.useEffect(() => {
    const requestId = ++profileRequestRef.current;
    setProfile(null);
    setAvatarDraft(null);
    setProfileStatus("loading");
    loadProfile(displayName)
      .then((response) => {
        if (requestId !== profileRequestRef.current) return;
        setProfile(response.profile);
        setAvatarDraft(response.profile.avatar);
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
    setRatingHistory([]);
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
    const ratingHistoryLoad = loadAccountRatingHistory?.() ?? Promise.resolve(null);
    const challengesLoad = loadAccountChallenges?.({ state: "all" }) ?? Promise.resolve(null);
    const followingLoad = loadAccountFollowing?.() ?? Promise.resolve(null);
    const privacyLoad = loadAccountPrivacy?.() ?? Promise.resolve(null);
    const sessionsLoad = loadAccountSessions?.() ?? Promise.resolve(null);

    Promise.allSettled([
      activeGamesLoad,
      completedGamesLoad,
      ratingHistoryLoad,
      challengesLoad,
      followingLoad,
      privacyLoad,
      sessionsLoad,
    ] as const).then((results) => {
      if (requestId !== dashboardRequestRef.current) return;
      const [
        activeGamesResult,
        completedGamesResult,
        ratingHistoryResult,
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
      if (ratingHistoryResult.status === "fulfilled" && ratingHistoryResult.value) {
        setRatingHistory(ratingHistoryResult.value.entries);
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
    loadAccountRatingHistory,
    loadAccountFollowing,
    loadAccountGames,
    loadAccountPrivacy,
    loadAccountSessions,
  ]);

  React.useEffect(() => {
    const requestId = ++publicGamesRequestRef.current;
    setPublicGames([]);
    if (isSelfDashboard || !loadPublicProfileGames) {
      setPublicGamesStatus("idle");
      return;
    }
    setPublicGamesStatus("loading");
    loadPublicProfileGames(displayName)
      .then((response) => {
        if (requestId !== publicGamesRequestRef.current) return;
        setPublicGames(response.games);
        setPublicGamesStatus("ready");
      })
      .catch((error) => {
        if (requestId !== publicGamesRequestRef.current) return;
        console.error("[OnlineProfileDashboard] Failed to load public profile games", error);
        setPublicGames([]);
        setPublicGamesStatus("error");
      });
  }, [displayName, isSelfDashboard, loadPublicProfileGames]);

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
  const canSubmitAvatar = !!updateAccountProfile && !!avatarDraft && avatarStatus !== "loading";

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

  const handleAvatarPresetChange = (preset: OnlineAccountAvatarPreset) => {
    setAvatarDraft((current) => ({
      schemaVersion: 1,
      preset,
      color: current?.color ?? "green",
    }));
  };

  const handleAvatarColorChange = (color: OnlineAccountAvatarColor) => {
    setAvatarDraft((current) => ({
      schemaVersion: 1,
      preset: current?.preset ?? "monarch",
      color,
    }));
  };

  const handleSaveAvatar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitAvatar || !updateAccountProfile || !avatarDraft) return;
    setAvatarStatus("loading");
    setSettingsMessage("");
    setSettingsMessageTone("status");
    try {
      const response = await updateAccountProfile({ avatar: avatarDraft });
      setProfile(response.profile);
      setAvatarDraft(response.profile.avatar);
      setSettingsMessage("Avatar saved.");
      setSettingsMessageTone("status");
      setAvatarStatus("ready");
    } catch (error) {
      console.error("[OnlineProfileDashboard] Failed to update profile avatar", error);
      setSettingsMessage(onlineRequestErrorMessage(error) ?? "Avatar could not be saved.");
      setSettingsMessageTone("error");
      setAvatarStatus("error");
    }
  };

  const handleSavePrivacy = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!privacySettings || !updateAccountPrivacy) return;
    setPrivacyStatus("loading");
    setSettingsMessage("");
    setSettingsMessageTone("status");
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
      setSettingsMessageTone("status");
      setPrivacyStatus("ready");
    } catch (error) {
      console.error("[OnlineProfileDashboard] Failed to update privacy settings", error);
      setSettingsMessage(onlineRequestErrorMessage(error) ?? "Privacy settings could not be saved.");
      setSettingsMessageTone("error");
      setPrivacyStatus("error");
    }
  };

  const handleSavePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitPassword || !updateAccountPassword) return;
    setPasswordStatus("loading");
    setSettingsMessage("");
    setSettingsMessageTone("status");
    try {
      await updateAccountPassword({
        ...(currentPassword ? { currentPassword } : {}),
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setSettingsMessage("Password updated.");
      setSettingsMessageTone("status");
      setPasswordStatus("ready");
    } catch (error) {
      console.error("[OnlineProfileDashboard] Failed to update password", error);
      setSettingsMessage(onlineRequestErrorMessage(error) ?? "Password could not be updated.");
      setSettingsMessageTone("error");
      setPasswordStatus("error");
    }
  };

  const handleSignOutAllSessions = async () => {
    if (!onSignOutAllAccountSessions) return;
    setSessionActionStatus("loading");
    setSettingsMessage("");
    setSettingsMessageTone("status");
    try {
      await onSignOutAllAccountSessions();
      setSessionActionStatus("ready");
      setSettingsMessage("Signed out everywhere.");
      setSettingsMessageTone("status");
    } catch (error) {
      console.error("[OnlineProfileDashboard] Failed to sign out all sessions", error);
      setSettingsMessage(onlineRequestErrorMessage(error) ?? "Could not sign out everywhere.");
      setSettingsMessageTone("error");
      setSessionActionStatus("error");
    }
  };

  const handleDeleteAccount = async () => {
    if (!onDeleteAccount) return;
    setDeleteAccountStatus("loading");
    setSettingsMessage("");
    setSettingsMessageTone("status");
    try {
      await onDeleteAccount();
      setIsDeleteAccountConfirmOpen(false);
      setDeleteAccountStatus("ready");
      setSettingsMessage("Account deleted.");
      setSettingsMessageTone("status");
    } catch (error) {
      console.error("[OnlineProfileDashboard] Failed to delete account", error);
      setSettingsMessage(onlineRequestErrorMessage(error) ?? "Could not delete account.");
      setSettingsMessageTone("error");
      setDeleteAccountStatus("error");
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
        {profile && <OnlineProfileAvatar displayName={displayName} avatar={profile.avatar} />}
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
              <div className="online-profile-rating-strip" role="img" aria-label="Rating history graph">
                {ratingHistory.length === 0 ? (
                  <span>{profile?.rating?.display ?? "1500?"}</span>
                ) : (
                  ratingHistory.slice().reverse().map((entry) => (
                    <span
                      key={`${entry.gameId}-${entry.side}`}
                      className={entry.ratingDelta >= 0 ? "gain" : "loss"}
                      style={{ height: ratingGraphBarHeight(entry, ratingHistory) }}
                    />
                  ))
                )}
              </div>
              <h3>Rating History</h3>
              {ratingHistory.length === 0 ? (
                <p>No rated games yet.</p>
              ) : (
                <ol className="online-profile-rating-history">
                  {ratingHistory.map((entry) => (
                    <li key={`${entry.gameId}-${entry.side}`}>
                      {onOpenProfile ? (
                        <button
                          type="button"
                          className="online-profile-inline-link"
                          onClick={() => onOpenProfile(entry.opponentDisplayName)}
                          aria-label={`Open ${entry.opponentDisplayName} profile from rating history ${entry.gameId}`}
                        >
                          {entry.opponentDisplayName}
                        </button>
                      ) : (
                        <span>{entry.opponentDisplayName}</span>
                      )}
                      <span>{entry.result}</span>
                      <span>{entry.ratingAfter}{entry.provisional ? "?" : ""}</span>
                      <span>{formatRatingDelta(entry.ratingDelta)}</span>
                    </li>
                  ))}
                </ol>
              )}
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
                  className={settingsMessageTone === "error" ? "online-profile-error" : ""}
                  role="status"
                  aria-live="polite"
                >
                  {settingsMessage}
                </p>
              )}
              {avatarDraft && updateAccountProfile && (
                <form className="online-profile-settings-form" onSubmit={handleSaveAvatar}>
                  <h3>Profile Picture</h3>
                  <div className="online-profile-avatar-settings">
                    <OnlineProfileAvatar displayName={displayName} avatar={avatarDraft} decorative />
                    <fieldset>
                      <legend>Avatar</legend>
                      <div className="online-profile-choice-grid">
                        {AVATAR_PRESET_OPTIONS.map((option) => (
                          <label key={option.value}>
                            <input
                              type="radio"
                              name="online-profile-avatar-preset"
                              checked={avatarDraft.preset === option.value}
                              onChange={() => handleAvatarPresetChange(option.value)}
                            />
                            <span>{option.label} avatar</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>Color</legend>
                      <div className="online-profile-choice-grid compact">
                        {AVATAR_COLOR_OPTIONS.map((option) => (
                          <label key={option.value}>
                            <input
                              type="radio"
                              name="online-profile-avatar-color"
                              checked={avatarDraft.color === option.value}
                              onChange={() => handleAvatarColorChange(option.value)}
                            />
                            <span>{option.label} avatar color</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  <button type="submit" className="online-profile-button" disabled={!canSubmitAvatar}>
                    {avatarStatus === "loading" ? "Saving" : "Save Avatar"}
                  </button>
                </form>
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
              <div className="online-profile-security-actions">
                {onOpenAccountControls && (
                  <button type="button" className="online-profile-button subtle" onClick={onOpenAccountControls}>
                    Account Dialog
                  </button>
                )}
                {onSignOutAllAccountSessions && (
                  <button
                    type="button"
                    className="online-profile-button subtle"
                    onClick={handleSignOutAllSessions}
                    disabled={sessionActionStatus === "loading" || deleteAccountStatus === "loading"}
                  >
                    {sessionActionStatus === "loading" ? "Signing Out Everywhere" : "Sign Out Everywhere"}
                  </button>
                )}
                {onDeleteAccount && (
                  <button
                    type="button"
                    className="online-profile-button danger"
                    onClick={() => setIsDeleteAccountConfirmOpen(true)}
                    disabled={deleteAccountStatus === "loading"}
                    aria-expanded={isDeleteAccountConfirmOpen}
                    aria-controls={isDeleteAccountConfirmOpen ? deleteAccountConfirmPanelId : undefined}
                  >
                    Delete Account
                  </button>
                )}
              </div>
              {account && onDeleteAccount && isDeleteAccountConfirmOpen && (
                <section
                  className="online-profile-delete-panel"
                  id={deleteAccountConfirmPanelId}
                  aria-labelledby={deleteAccountConfirmHeadingId}
                  aria-describedby={deleteAccountConfirmDescriptionId}
                >
                  <h3 id={deleteAccountConfirmHeadingId}>Remove {account.displayName}</h3>
                  <p id={deleteAccountConfirmDescriptionId}>
                    This deletes the sign-in account, signs it out everywhere, and removes ordinary social account
                    state. Game history is retained under its existing visibility: public games may still show this
                    display name in public archives, private and unlisted games stay hidden except to still-authorized
                    credentials or registered participants, and the display name stays reserved. This cannot be undone.
                  </p>
                  <div className="online-profile-security-actions">
                    <button
                      type="button"
                      className="online-profile-button danger"
                      onClick={handleDeleteAccount}
                      disabled={deleteAccountStatus === "loading"}
                    >
                      {deleteAccountStatus === "loading" ? "Deleting" : "Confirm Delete"}
                    </button>
                    <button
                      type="button"
                      className="online-profile-button subtle"
                      onClick={() => setIsDeleteAccountConfirmOpen(false)}
                      disabled={deleteAccountStatus === "loading"}
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              )}
            </article>
          )}
        </section>
      ) : (
        <section className="online-profile-dashboard-grid" aria-label="Public profile sections">
          {showsGamesSection && (
            <article
              className="online-profile-panel"
              role="region"
              aria-label={`Public games for ${displayName}`}
            >
              <span className="online-profile-kicker">Games</span>
              <h2>Public Games</h2>
              {publicGamesStatus === "loading" ? (
                <p role="status">Loading public games...</p>
              ) : publicGamesStatus === "error" ? (
                <p className="online-profile-error">Public games could not be loaded.</p>
              ) : publicGames.length === 0 ? (
                <p>No public completed games yet.</p>
              ) : (
                <ol className="online-profile-public-games">
                  {publicGames.map((game) => (
                    <li key={game.gameId}>
                      <div>
                        <strong>{publicGameTitle(game)}</strong>
                        <span>{game.result ? formatOnlineGameResult(game.result) : game.status}</span>
                      </div>
                      {onReplay && (
                        <button
                          type="button"
                          className="online-profile-button subtle"
                          onClick={() => onReplay(game.gameId)}
                          aria-label={`Analyze replay ${game.gameId} from ${displayName} public profile`}
                        >
                          Analyze Replay
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          )}
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
