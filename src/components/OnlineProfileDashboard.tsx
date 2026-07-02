import React from "react";
import AppShellNav, { type AppShellDestination } from "./AppShellNav";
import ThemeContext, { type ThemeMode } from "../contexts/ThemeContext";
import {
  formatOnlineGameResult,
  type OnlineChallengeResponse,
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
import {
  ONLINE_ACCOUNT_AVATAR_IMAGE_DATA_URL_MAX_LENGTH,
  ONLINE_ACCOUNT_AVATAR_IMAGE_MIME_TYPES,
  ONLINE_ACCOUNT_AVATAR_UPLOAD_SOURCE_MAX_BYTES,
} from "../online/social";
import type {
  OnlineAccountFollowingResponse,
  OnlineAccountAvatar,
  OnlineAccountAvatarImageMimeType,
  OnlineAccountAvatarPreset,
  OnlineAccountProfilePatch,
  OnlineAccountPrivacyPatch,
  OnlineAccountPrivacyResponse,
  OnlineAccountPrivacySettings,
  OnlineAccountProfileResponse,
  OnlineAccountPublicProfile,
  OnlineAccountPublicRatingHistoryPoint,
  OnlineAccountPublicRatingHistoryResponse,
  OnlineAccountRatingHistoryEntry,
  OnlineAccountRatingHistoryResponse,
  OnlineAccountSearchProfile,
  OnlineAccountSearchResponse,
} from "../online/social";
import type {
  OnlineAccountChallengeDirectoryResponse,
  OnlineAccountChallengeListItem,
} from "../online/challenges";
import type { OnlineGameDirectoryResponse, OnlineGameSummary } from "../online/readModel";
import type { PieceTheme } from "../Constants";
import {
  PIECE_THEME_OPTIONS,
  readPreferredPieceTheme,
  writePreferredPieceTheme,
} from "../preferences/displayPreferences";
import { readCachedProfileAvatar, rememberCachedProfileAvatar } from "../online/profileAvatarCache";
import "../css/OnlineProfileDashboard.css";

type LoadStatus = "idle" | "loading" | "ready" | "error";
type ProfileActionStatus = "idle" | "follow" | "unfollow" | "challenge" | "rematch";
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

const DEFAULT_PROFILE_AVATAR: OnlineAccountAvatar = { schemaVersion: 1, preset: "monarch", color: "green" };

const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "dark", label: "Night" },
  { value: "light", label: "Day" },
  { value: "system", label: "System" },
];

interface OnlineProfileDashboardProps {
  displayName: string;
  account?: OnlineAccount | null;
  loadProfile: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  loadAccountGames?: (options?: FetchOnlineAccountGamesOptions) => Promise<OnlineGameDirectoryResponse>;
  loadPublicProfileGames?: (displayName: string) => Promise<OnlineGameDirectoryResponse>;
  loadPublicProfileLiveGames?: (displayName: string) => Promise<OnlineGameDirectoryResponse>;
  loadPublicProfileRatingHistory?: (displayName: string) => Promise<OnlineAccountPublicRatingHistoryResponse>;
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
  onSpectate?: (gameId: string) => void;
  onChallengeAccount?: (
    displayName: string,
    options?: { intent?: "challenge" | "rematch"; sourceGameId?: string }
  ) => void | Promise<void>;
  onCancelAccountChallenge?: (challengeId: string) => Promise<OnlineChallengeResponse>;
  onFollowAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onUnfollowAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onBack?: () => void;
  backLabel?: string;
  onOpenGame?: () => void;
  onTutorial?: () => void;
  onOpenOnlineBrowser?: () => void;
  onOpenPeople?: () => void;
  onOpenLibrary?: () => void;
  onOpenAccountControls?: () => void;
  onlineNotificationCount?: number;
  onlineNotificationLabel?: string;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function formatChallengeTimestamp(value: string): string {
  return `${value.slice(0, 10)} ${value.slice(11, 16)} UTC`;
}

function challengeOpponentDisplayName(item: OnlineAccountChallengeListItem): string {
  const identity = item.role === "challenger"
    ? item.summary.challengedIdentity
    : item.summary.challengerIdentity;
  return identity.kind === "registered" && identity.displayName ? identity.displayName : identity.id;
}

function presenceLabel(profile: OnlineAccountPublicProfile | null): string {
  if (!profile) return "Loading";
  if (profile.presence.visibility === "hidden" || profile.presence.status === null) {
    return "Presence private";
  }
  return profile.presence.status[0].toUpperCase() + profile.presence.status.slice(1);
}

function isPresencePrivate(profile: OnlineAccountPublicProfile | null): boolean {
  return profile?.presence.visibility === "hidden" || profile?.presence.status === null;
}

function isUploadedAvatar(avatar: OnlineAccountAvatar): avatar is OnlineAccountAvatar & { imageDataUrl: string } {
  return "imageDataUrl" in avatar;
}

function avatarMark(avatar: OnlineAccountAvatar): string {
  if (isUploadedAvatar(avatar)) return "";
  return AVATAR_PRESET_OPTIONS.find((option) => option.value === avatar.preset)?.mark ?? "C";
}

function avatarAccessibleName(displayName: string, avatar: OnlineAccountAvatar): string {
  if (isUploadedAvatar(avatar)) return `${displayName} uploaded profile picture`;
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
  if (isUploadedAvatar(avatar)) {
    return (
      <span
        className="online-profile-avatar online-profile-avatar-image"
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : avatarAccessibleName(displayName, avatar)}
        aria-hidden={decorative ? "true" : undefined}
      >
        <img src={avatar.imageDataUrl} alt="" />
      </span>
    );
  }
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

function gameHasRegisteredDisplayName(game: OnlineGameSummary, displayName: string): boolean {
  const target = displayName.trim().toLowerCase();
  return game.participants.some((participant) => {
    return (
      participant.identity.kind === "registered" &&
      participant.identity.displayName?.trim().toLowerCase() === target
    );
  });
}

function gameCount(games: OnlineGameSummary[]): string {
  return formatCount(games.length, "game");
}

function formatRatingDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

interface RatingLineGraphPoint {
  id: string;
  rating: number;
  label: string;
}

function ratingGraphDomain(points: RatingLineGraphPoint[]): { min: number; max: number; ticks: number[] } {
  const ratings = points.map((point) => point.rating);
  const rawMin = Math.min(...ratings);
  const rawMax = Math.max(...ratings);
  const spread = rawMax - rawMin;
  const padding = spread === 0 ? 50 : Math.max(20, Math.round(spread * 0.32));
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  return {
    min,
    max,
    ticks: [max, Math.round((min + max) / 2), min],
  };
}

function ratingGraphCoordinates(points: RatingLineGraphPoint[]): Array<RatingLineGraphPoint & { x: number; y: number }> {
  const domain = ratingGraphDomain(points);
  const width = 320;
  const height = 112;
  const left = 34;
  const right = 12;
  const top = 12;
  const bottom = 20;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  return points.map((point, index) => {
    const x = points.length === 1
      ? left + graphWidth / 2
      : left + (index / (points.length - 1)) * graphWidth;
    const normalized = (point.rating - domain.min) / Math.max(1, domain.max - domain.min);
    const y = top + (1 - normalized) * graphHeight;
    return { ...point, x, y };
  });
}

function selfRatingGraphPoints(entries: OnlineAccountRatingHistoryEntry[]): RatingLineGraphPoint[] {
  const chronological = entries.slice().reverse();
  if (chronological.length === 0) return [];
  const first = chronological[0];
  return [
    {
      id: `${first.gameId}-${first.side}-before`,
      rating: first.ratingBefore,
      label: `${first.ratingBefore} before first rated game`,
    },
    ...chronological.map((entry) => ({
      id: `${entry.gameId}-${entry.side}-after`,
      rating: entry.ratingAfter,
      label: `${entry.ratingAfter}${entry.provisional ? "?" : ""} after ${formatCount(entry.games, "rated game")}`,
    })),
  ];
}

function publicRatingGraphPoints(points: OnlineAccountPublicRatingHistoryPoint[]): RatingLineGraphPoint[] {
  return points.map((point) => ({
    id: `${point.appliedAt}-${point.games}-${point.rating}`,
    rating: point.rating,
    label: `${point.display} after ${formatCount(point.games, "rated game")}`,
  }));
}

function comparePublicRatingHistoryPoints(
  a: OnlineAccountPublicRatingHistoryPoint,
  b: OnlineAccountPublicRatingHistoryPoint
): number {
  const timeDelta = Date.parse(a.appliedAt) - Date.parse(b.appliedAt);
  if (timeDelta !== 0) return timeDelta;
  const gamesDelta = a.games - b.games;
  if (gamesDelta !== 0) return gamesDelta;
  return a.rating - b.rating;
}

function RatingLineGraph({
  points,
  fallback,
  label,
}: {
  points: RatingLineGraphPoint[];
  fallback: string;
  label: string;
}) {
  if (points.length === 0) {
    return (
      <div className="online-profile-rating-chart empty" role="img" aria-label={label}>
        <span>{fallback}</span>
      </div>
    );
  }
  const domain = ratingGraphDomain(points);
  const coordinates = ratingGraphCoordinates(points);
  const path = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const latest = coordinates[coordinates.length - 1];
  return (
    <div className="online-profile-rating-chart" role="img" aria-label={label}>
      <svg viewBox="0 0 320 112" focusable="false" aria-hidden="true">
        {domain.ticks.map((tick, index) => (
          <g key={`${tick}-${index}`}>
            <line x1="34" x2="308" y1={12 + index * 40} y2={12 + index * 40} />
            <text x="4" y={16 + index * 40}>{tick}</text>
          </g>
        ))}
        {coordinates.length > 1 && <polyline points={path} />}
        {coordinates.map((point) => (
          <circle key={point.id} cx={point.x} cy={point.y} r={point.id === latest.id ? 4 : 3}>
            <title>{point.label}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image upload."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read image upload."));
    reader.readAsDataURL(file);
  });
}

function imageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image upload."));
    image.src = dataUrl;
  });
}

async function compressAvatarImageDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  const image = await imageFromDataUrl(dataUrl);
  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const sourceX = ((image.naturalWidth || image.width) - sourceSize) / 2;
  const sourceY = ((image.naturalHeight || image.height) - sourceSize) / 2;
  context.clearRect(0, 0, size, size);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  return canvas.toDataURL("image/webp", 0.84);
}

async function prepareAvatarImageDataUrl(file: File): Promise<string> {
  if (!ONLINE_ACCOUNT_AVATAR_IMAGE_MIME_TYPES.has(file.type as OnlineAccountAvatarImageMimeType)) {
    throw new Error("Use a PNG, JPEG, or WebP image.");
  }
  if (file.size > ONLINE_ACCOUNT_AVATAR_UPLOAD_SOURCE_MAX_BYTES) {
    throw new Error("Use an image smaller than 2 MB.");
  }
  const original = await fileToDataUrl(file);
  const compressed = await compressAvatarImageDataUrl(original).catch(() => original);
  const selected = compressed.length <= original.length ? compressed : original;
  if (selected.length > ONLINE_ACCOUNT_AVATAR_IMAGE_DATA_URL_MAX_LENGTH) {
    throw new Error("Use a smaller image; the saved avatar must stay under 96 KB.");
  }
  return selected;
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
  loadPublicProfileLiveGames,
  loadPublicProfileRatingHistory,
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
  onSpectate,
  onChallengeAccount,
  onCancelAccountChallenge,
  onFollowAccount,
  onUnfollowAccount,
  onBack,
  backLabel = "Back",
  onOpenGame,
  onTutorial,
  onOpenOnlineBrowser,
  onOpenPeople,
  onOpenLibrary,
  onOpenAccountControls,
  onlineNotificationCount = 0,
  onlineNotificationLabel = "challenge activities",
}) => {
  const themeContext = React.useContext(ThemeContext);
  const themeMode = themeContext?.themeMode ?? "dark";
  const setThemeMode = themeContext?.setThemeMode ?? (() => {});
  const [profile, setProfile] = React.useState<OnlineAccountPublicProfile | null>(null);
  const [cachedAvatar, setCachedAvatar] = React.useState<OnlineAccountAvatar | null>(() =>
    readCachedProfileAvatar(displayName)
  );
  const [avatarDraft, setAvatarDraft] = React.useState<OnlineAccountAvatar | null>(null);
  const [pieceThemePreference, setPieceThemePreference] = React.useState<PieceTheme>(() => readPreferredPieceTheme());
  const [profileStatus, setProfileStatus] = React.useState<LoadStatus>("loading");
  const [activeGames, setActiveGames] = React.useState<OnlineGameSummary[]>([]);
  const [completedGames, setCompletedGames] = React.useState<OnlineGameSummary[]>([]);
  const [publicGames, setPublicGames] = React.useState<OnlineGameSummary[]>([]);
  const [publicLiveGames, setPublicLiveGames] = React.useState<OnlineGameSummary[]>([]);
  const [publicGamesStatus, setPublicGamesStatus] = React.useState<LoadStatus>("idle");
  const [publicLiveGamesStatus, setPublicLiveGamesStatus] = React.useState<LoadStatus>("idle");
  const [publicRatingHistory, setPublicRatingHistory] = React.useState<OnlineAccountPublicRatingHistoryPoint[]>([]);
  const [publicRatingHistoryStatus, setPublicRatingHistoryStatus] = React.useState<LoadStatus>("idle");
  const [ratingHistory, setRatingHistory] = React.useState<OnlineAccountRatingHistoryEntry[]>([]);
  const [challengeRecords, setChallengeRecords] = React.useState<OnlineAccountChallengeListItem[]>([]);
  const [challengeActionById, setChallengeActionById] = React.useState<Record<string, "cancel" | undefined>>({});
  const [challengeMessage, setChallengeMessage] = React.useState("");
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
  const [profileActionStatus, setProfileActionStatus] = React.useState<ProfileActionStatus>("idle");
  const [isDeleteAccountConfirmOpen, setIsDeleteAccountConfirmOpen] = React.useState(false);
  const [settingsMessage, setSettingsMessage] = React.useState("");
  const [settingsMessageTone, setSettingsMessageTone] = React.useState<"status" | "error">("status");
  const [profileActionMessage, setProfileActionMessage] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<OnlineAccountSearchProfile[]>([]);
  const [searchStatus, setSearchStatus] = React.useState<LoadStatus>("idle");
  const profileRequestRef = React.useRef(0);
  const dashboardRequestRef = React.useRef(0);
  const publicGamesRequestRef = React.useRef(0);
  const publicLiveGamesRequestRef = React.useRef(0);
  const publicRatingHistoryRequestRef = React.useRef(0);
  const searchRequestRef = React.useRef(0);
  const deleteAccountConfirmPanelId = React.useId();
  const deleteAccountConfirmHeadingId = React.useId();
  const deleteAccountConfirmDescriptionId = React.useId();
  const isSelfDashboard =
    !!account && account.displayName.trim().toLowerCase() === displayName.trim().toLowerCase();

  React.useEffect(() => {
    const requestId = ++profileRequestRef.current;
    setProfile(null);
    setCachedAvatar(readCachedProfileAvatar(displayName));
    setAvatarDraft(null);
    setProfileStatus("loading");
    setProfileActionStatus("idle");
    setProfileActionMessage("");
    loadProfile(displayName)
      .then((response) => {
        if (requestId !== profileRequestRef.current) return;
        setProfile(response.profile);
        setCachedAvatar(response.profile.avatar);
        rememberCachedProfileAvatar(response.profile.displayName, response.profile.avatar);
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
    const requestId = ++publicLiveGamesRequestRef.current;
    setPublicLiveGames([]);
    if (isSelfDashboard || !loadPublicProfileLiveGames) {
      setPublicLiveGamesStatus("idle");
      return;
    }
    setPublicLiveGamesStatus("loading");
    loadPublicProfileLiveGames(displayName)
      .then((response) => {
        if (requestId !== publicLiveGamesRequestRef.current) return;
        setPublicLiveGames(response.games);
        setPublicLiveGamesStatus("ready");
      })
      .catch((error) => {
        if (requestId !== publicLiveGamesRequestRef.current) return;
        console.error("[OnlineProfileDashboard] Failed to load public live profile games", error);
        setPublicLiveGames([]);
        setPublicLiveGamesStatus("error");
      });
  }, [displayName, isSelfDashboard, loadPublicProfileLiveGames]);

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
    setChallengeRecords([]);
    setChallengeActionById({});
    setChallengeMessage("");
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
        setChallengeRecords(challengesResult.value.challenges);
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
    const requestId = ++publicRatingHistoryRequestRef.current;
    setPublicRatingHistory([]);
    if (isSelfDashboard || !loadPublicProfileRatingHistory) {
      setPublicRatingHistoryStatus("idle");
      return;
    }
    setPublicRatingHistoryStatus("loading");
    loadPublicProfileRatingHistory(displayName)
      .then((response) => {
        if (requestId !== publicRatingHistoryRequestRef.current) return;
        setPublicRatingHistory(response.points);
        setPublicRatingHistoryStatus("ready");
      })
      .catch((error) => {
        if (requestId !== publicRatingHistoryRequestRef.current) return;
        console.error("[OnlineProfileDashboard] Failed to load public rating history", error);
        setPublicRatingHistory([]);
        setPublicRatingHistoryStatus("error");
      });
  }, [displayName, isSelfDashboard, loadPublicProfileRatingHistory]);

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
        }]
      : []),
    ...(onOpenPeople
      ? [{
          id: "people" as const,
          label: "People",
          onClick: onOpenPeople,
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
  const publicRatingHistoryChronological = publicRatingHistory.slice().sort(comparePublicRatingHistoryPoints);
  const publicRatingHistoryRecent = publicRatingHistoryChronological.slice().reverse();
  const selfRatingChartPoints = selfRatingGraphPoints(ratingHistory);
  const publicRatingChartPoints = publicRatingGraphPoints(publicRatingHistoryChronological);
  const profileSections = isSelfDashboard ? SELF_PROFILE_SECTIONS : PUBLIC_PROFILE_SECTIONS;
  const showsOverviewSection = activeSection === "summary";
  const showsGamesSection = showsOverviewSection || activeSection === "games";
  const showsRatingSection = showsOverviewSection || activeSection === "rating";
  const showsPeopleSection = showsOverviewSection || activeSection === "people";
  const showsSettingsSection = activeSection === "settings";
  const publicProfileReady = profileStatus === "ready" && !!profile && !isSelfDashboard;
  const profilePublicGames = publicGames.filter((game) => gameHasRegisteredDisplayName(game, displayName));
  const profilePublicLiveGames = publicLiveGames.filter((game) => gameHasRegisteredDisplayName(game, displayName));
  const firstPublicLiveGame = profilePublicLiveGames.find((game) => game.status === "active") ?? null;
  const latestPublicGame = profilePublicGames[0] ?? null;
  const sharedCompletedPublicGame =
    account && !isSelfDashboard
      ? profilePublicGames.find((game) =>
          game.status === "complete" &&
          gameHasRegisteredDisplayName(game, account.displayName)
        ) ?? null
      : null;
  const canUseSignedInPublicActions =
    Boolean(account && profile && publicProfileReady && !profile.relationship.self && !profile.relationship.blocked);
  const canFollowProfile = canUseSignedInPublicActions && !!onFollowAccount && !profile?.relationship.following;
  const canUnfollowProfile = canUseSignedInPublicActions && !!onUnfollowAccount && !!profile?.relationship.following;
  const canChallengeProfile = canUseSignedInPublicActions && !!onChallengeAccount;
  const canRematchProfile = canChallengeProfile && !!sharedCompletedPublicGame;
  const canWatchProfile = publicProfileReady && !!onSpectate && !!firstPublicLiveGame;
  const canAnalyzeProfile = publicProfileReady && !!onReplay && !!latestPublicGame;
  const hasPublicProfileActions =
    publicProfileReady &&
    (canFollowProfile || canUnfollowProfile || canChallengeProfile || canWatchProfile || canAnalyzeProfile || canRematchProfile);
  const canSubmitPassword =
    !!updateAccountPassword &&
    newPassword.length >= ONLINE_ACCOUNT_PASSWORD_MIN_LENGTH &&
    newPassword.length <= ONLINE_ACCOUNT_PASSWORD_MAX_LENGTH &&
    passwordStatus !== "loading";
  const canSubmitAvatar = !!updateAccountProfile && !!avatarDraft && avatarStatus !== "loading";
  const displayAvatar = profile?.avatar ?? (profileStatus === "loading" ? cachedAvatar : null) ?? DEFAULT_PROFILE_AVATAR;

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

  const handlePieceThemePreferenceChange = (theme: PieceTheme) => {
    setPieceThemePreference(theme);
    writePreferredPieceTheme(theme);
  };

  const handleAvatarUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setAvatarStatus("loading");
    setSettingsMessage("");
    setSettingsMessageTone("status");
    try {
      const imageDataUrl = await prepareAvatarImageDataUrl(file);
      setAvatarDraft({
        schemaVersion: 1,
        imageDataUrl,
      });
      setSettingsMessage("Image ready. Save avatar to publish it.");
      setSettingsMessageTone("status");
      setAvatarStatus("ready");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Avatar image could not be prepared.");
      setSettingsMessageTone("error");
      setAvatarStatus("error");
    }
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
      setCachedAvatar(response.profile.avatar);
      rememberCachedProfileAvatar(response.profile.displayName, response.profile.avatar);
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

  const runPublicProfileAction = async (
    action: ProfileActionStatus,
    run: () => Promise<void>,
    successMessage: string
  ) => {
    setProfileActionStatus(action);
    setProfileActionMessage("");
    try {
      await run();
      setProfileActionMessage(successMessage);
    } catch (error) {
      console.error("[OnlineProfileDashboard] Public profile action failed", error);
      setProfileActionMessage(onlineRequestErrorMessage(error) ?? "Profile action could not be completed.");
    } finally {
      setProfileActionStatus("idle");
    }
  };

  const handleCancelChallengeRecord = async (item: OnlineAccountChallengeListItem) => {
    if (!onCancelAccountChallenge) return;
    const challengeId = item.summary.challengeId;
    const opponent = challengeOpponentDisplayName(item);
    setChallengeActionById((current) => ({ ...current, [challengeId]: "cancel" }));
    setChallengeMessage("");
    try {
      const response = await onCancelAccountChallenge(challengeId);
      setChallengeRecords((current) =>
        current.map((record) =>
          record.summary.challengeId === challengeId
            ? { role: response.role, summary: response.summary }
            : record
        )
      );
      setChallengeMessage(`Challenge to ${opponent} cancelled.`);
    } catch (error) {
      console.error("[OnlineProfileDashboard] Failed to cancel challenge", error);
      setChallengeMessage(onlineRequestErrorMessage(error) ?? "Could not cancel challenge.");
    } finally {
      setChallengeActionById((current) => {
        const next = { ...current };
        delete next[challengeId];
        return next;
      });
    }
  };

  const handleFollowProfile = () => {
    if (!onFollowAccount) return;
    void runPublicProfileAction("follow", async () => {
      const response = await onFollowAccount(displayName);
      setProfile(response.profile);
      setAvatarDraft(response.profile.avatar);
    }, `Following ${displayName}.`);
  };

  const handleUnfollowProfile = () => {
    if (!onUnfollowAccount) return;
    void runPublicProfileAction("unfollow", async () => {
      const response = await onUnfollowAccount(displayName);
      setProfile(response.profile);
      setAvatarDraft(response.profile.avatar);
    }, `Unfollowed ${displayName}.`);
  };

  const handleChallengeProfile = () => {
    if (!onChallengeAccount) return;
    void runPublicProfileAction("challenge", async () => {
      await onChallengeAccount(displayName);
    }, `Challenge created for ${displayName}.`);
  };

  const handleRematchProfile = () => {
    if (!onChallengeAccount || !sharedCompletedPublicGame) return;
    const sourceGameId = sharedCompletedPublicGame.gameId;
    void runPublicProfileAction("rematch", async () => {
      await onChallengeAccount(displayName, { intent: "rematch", sourceGameId });
    }, `Rematch created for ${displayName}.`);
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
        <OnlineProfileAvatar displayName={displayName} avatar={displayAvatar} />
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
        {hasPublicProfileActions && (
          <div className="online-profile-hero-actions" role="group" aria-label={`Profile actions for ${displayName}`}>
            {canChallengeProfile && (
              <button
                type="button"
                className="online-profile-button"
                onClick={handleChallengeProfile}
                disabled={profileActionStatus !== "idle"}
                aria-label={`Challenge ${displayName}`}
              >
                {profileActionStatus === "challenge" ? "Creating..." : "Challenge"}
              </button>
            )}
            {canFollowProfile && (
              <button
                type="button"
                className="online-profile-button subtle"
                onClick={handleFollowProfile}
                disabled={profileActionStatus !== "idle"}
                aria-label={`Follow ${displayName}`}
              >
                {profileActionStatus === "follow" ? "Following..." : "Follow"}
              </button>
            )}
            {canUnfollowProfile && (
              <button
                type="button"
                className="online-profile-button subtle"
                onClick={handleUnfollowProfile}
                disabled={profileActionStatus !== "idle"}
                aria-label={`Unfollow ${displayName}`}
              >
                {profileActionStatus === "unfollow" ? "Updating..." : "Unfollow"}
              </button>
            )}
            {canWatchProfile && firstPublicLiveGame && (
              <button
                type="button"
                className="online-profile-button"
                onClick={() => onSpectate?.(firstPublicLiveGame.gameId)}
                aria-label={`Watch ${displayName} live game ${firstPublicLiveGame.gameId}`}
              >
                Watch Live
              </button>
            )}
            {canAnalyzeProfile && latestPublicGame && (
              <button
                type="button"
                className="online-profile-button subtle"
                onClick={() => onReplay?.(latestPublicGame.gameId)}
                aria-label={`Analyze latest public game ${latestPublicGame.gameId} from ${displayName} profile`}
              >
                Analyze Recent
              </button>
            )}
            {canRematchProfile && sharedCompletedPublicGame && (
              <button
                type="button"
                className="online-profile-button subtle"
                onClick={handleRematchProfile}
                disabled={profileActionStatus !== "idle"}
                aria-label={`Rematch ${displayName} from ${sharedCompletedPublicGame.gameId}`}
              >
                {profileActionStatus === "rematch" ? "Creating..." : "Rematch"}
              </button>
            )}
            {profileActionMessage && (
              <p className="online-profile-action-message" role="status" aria-live="polite">
                {profileActionMessage}
              </p>
            )}
          </div>
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
                <p>No account games yet. Signed-in games will appear here for review.</p>
              )}
            </article>
          )}

          {showsRatingSection && (
            <article className="online-profile-panel">
              <span className="online-profile-kicker">Rating</span>
              <h2>Current Rating</h2>
              <p>{ratedGameText}</p>
              <RatingLineGraph
                points={selfRatingChartPoints}
                fallback={profile?.rating?.display ?? "1500?"}
                label="Rating history graph"
              />
              <h3>Rating History</h3>
              {ratingHistory.length === 0 ? (
                <p>No rated games yet. Rated games will add graph points here.</p>
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
              {challengeRecords.length === 0 ? (
                <p>No challenge records.</p>
              ) : (
                <>
                  <p>{formatCount(challengeRecords.length, "challenge record")} visible to this account.</p>
                  {challengeMessage && (
                    <p role="status" aria-live="polite">
                      {challengeMessage}
                    </p>
                  )}
                  <ol className="online-profile-challenge-records">
                    {challengeRecords.map((item) => (
                      <li key={item.summary.challengeId}>
                        <strong>
                          {item.role === "challenger" ? "To" : "From"} {challengeOpponentDisplayName(item)}
                        </strong>
                        <span>{item.summary.status}</span>
                        <span>Created {formatChallengeTimestamp(item.summary.createdAt)}</span>
                        <span>Expires {formatChallengeTimestamp(item.summary.expiresAt)}</span>
                        {item.summary.gameId && <span>Game {item.summary.gameId}</span>}
                        {item.summary.sourceGameId && <span>Source {item.summary.sourceGameId}</span>}
                        {item.summary.status === "pending" && item.role === "challenger" && onCancelAccountChallenge && (
                          <button
                            type="button"
                            className="online-profile-button danger"
                            onClick={() => void handleCancelChallengeRecord(item)}
                            disabled={challengeActionById[item.summary.challengeId] === "cancel"}
                            aria-label={`Cancel challenge to ${challengeOpponentDisplayName(item)}`}
                          >
                            {challengeActionById[item.summary.challengeId] === "cancel" ? "Cancelling" : "Cancel"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
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
                    <fieldset className="online-profile-avatar-upload">
                      <legend>Upload</legend>
                      <label>
                        <span>Upload PNG, JPEG, or WebP</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleAvatarUploadChange}
                        />
                      </label>
                      <p>Images are cropped locally and saved as a small profile picture.</p>
                    </fieldset>
                  </div>
                  <button type="submit" className="online-profile-button" disabled={!canSubmitAvatar}>
                    {avatarStatus === "loading" ? "Saving" : "Save Avatar"}
                  </button>
                </form>
              )}
              <div className="online-profile-settings-form online-profile-display-settings">
                <h3>Display</h3>
                <label>
                  <span>Theme</span>
                  <select
                    aria-label="Theme preference"
                    value={themeMode}
                    onChange={(event) => setThemeMode(event.currentTarget.value as ThemeMode)}
                  >
                    {THEME_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Piece set for new games</span>
                  <select
                    aria-label="Piece set preference"
                    value={pieceThemePreference}
                    onChange={(event) => handlePieceThemePreferenceChange(event.currentTarget.value as PieceTheme)}
                  >
                    {PIECE_THEME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <p>Piece set applies when you create the next Play setup.</p>
              </div>
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
              ) : profilePublicGames.length === 0 ? (
                <p>No public completed games with this player yet. Private and unlisted games stay hidden.</p>
              ) : (
                <ol className="online-profile-public-games">
                  {profilePublicGames.map((game) => (
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
              <RatingLineGraph
                points={publicRatingHistoryStatus === "loading" ? [] : publicRatingChartPoints}
                fallback={publicRatingHistoryStatus === "loading" ? "Loading" : profile?.rating?.display ?? "1500?"}
                label="Public rating history graph"
              />
              <h3>Rating History</h3>
              {publicRatingHistoryStatus === "error" ? (
                <p className="online-profile-error">Public rating history could not be loaded.</p>
              ) : publicRatingHistoryChronological.length === 0 ? (
                <p>No public rating history yet. Rated games will add graph points here.</p>
              ) : (
                <ol className="online-profile-rating-history public">
                  {publicRatingHistoryRecent.map((point) => (
                    <li key={`${point.appliedAt}-${point.games}-${point.rating}`}>
                      <span>{point.display}</span>
                      <span>{formatCount(point.games, "rated game")}</span>
                      <span>{new Date(point.appliedAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          )}
          {showsPeopleSection && (
            <article className="online-profile-panel">
              <span className="online-profile-kicker">Presence</span>
              <h2>Status</h2>
              <p>{presenceLabel(profile)}</p>
              {isPresencePrivate(profile) && <p>Online status is private for this viewer.</p>}
            </article>
          )}
        </section>
      )}
    </main>
  );
};

export default OnlineProfileDashboard;
