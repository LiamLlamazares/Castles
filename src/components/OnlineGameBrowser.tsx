import React from "react";
import AppShellNav, { AppShellDestination } from "./AppShellNav";
import { OnlineAccountButton, OnlineAccountDialog } from "./OnlineAccountControls";
import {
  buildSpectatorUrl,
  copyOnlineInviteUrl,
  fetchOpenSeekDirectory,
  fetchOnlineGameDirectory,
  formatOnlineGameResult,
  OnlineRequestError,
  type FetchOnlineAccountGamesOptions,
  type FetchOnlineAccountHeadToHeadGamesOptions,
  type FetchOnlineAccountChallengesOptions,
  type OnlineAccountChallengeDirectoryResponse,
  type OnlineAccountChallengeListItem,
  type OnlineChallengeResponse,
  type FetchOpenSeekDirectoryOptions,
  type FetchOnlineGameSummariesOptions,
  type OnlineAccountFollowingResponse,
  type OnlineAccountProfileResponse,
  type OnlineAccountPublicProfile,
  type OnlineAccountSearchResponse,
  type OnlineAccountReportInput,
  type OnlineAccountReportResponse,
  type OnlineRatingLeaderboardEntry,
  type OnlineRatingLeaderboardResponse,
  type OpenSeekResponse,
} from "../online/client";
import {
  ONLINE_ACCOUNT_REPORT_DETAILS_MAX_LENGTH,
  type OnlineAccountReportReason,
  type OnlineAccountSearchProfile,
  OnlineRatingLeaderboardScope,
} from "../online/social";
import type { OnlineAccount, OnlineAccountOAuthProvidersResponse } from "../online/accounts";
import { countOnlineAccountChallengeNavigationActivity } from "../online/challenges";
import type {
  OnlineGameDirectoryResponse,
  OnlineGameSummaryBoardPreviewHex,
  OnlineGameSummary,
  OnlineGameSummaryParticipant,
  OnlineGameVisibility,
} from "../online/readModel";
import {
  ONLINE_GAME_DIRECTORY_SEARCH_MAX_LENGTH,
  canSpectateOnlineGameSummary,
  isSameOnlineIdentity,
  normalizeOnlineGameDirectorySearchQuery,
  onlineGameSummaryDirectorySearchText,
} from "../online/readModel";
import type { OnlineIdentity } from "../online/identity";
import type { OnlineJoinParams } from "../online/client";
import type {
  OpenSeekDirectoryResponse,
  OpenSeekSummary,
  OpenSeekVisibility,
} from "../online/seeks";
import type { RecentOnlineGameRecord } from "../online/recentGames";
import { PieceType } from "../Constants";
import "../css/OnlineGameBrowser.css";

type OnlineBrowserTab = "lobby" | "watch" | "archive";
type OnlineBrowserSort = "newest" | "moves" | "watchers";
type OnlineBrowserTimeFilter = "all" | "timed" | "casual";
type OnlineBrowserRatingFilter = "all" | "casual" | "rated";
type OnlineFriendFilter = "all" | "followed";
type OnlineFollowingPresenceFilter = "all" | "online";
type OnlineAccountChallengeFilter = NonNullable<FetchOnlineAccountChallengesOptions["state"]>;
type OnlineAccountChallengeIntent = "challenge" | "rematch";
interface OnlineAccountChallengeActionOptions {
  intent?: OnlineAccountChallengeIntent;
  sourceGameId?: string;
}
interface AccountHeadToHeadSummary {
  opponentDisplayName: string;
  games: OnlineGameSummary[];
  accountWins: number;
  opponentWins: number;
  latestGame: OnlineGameSummary;
}
interface AccountFollowedOpponentSummary {
  displayName: string;
  gameCount: number;
  activeCount: number;
  completedCount: number;
  latestGame: OnlineGameSummary;
}
type OpenSeekSideFilter = "all" | OpenSeekSummary["creatorSeat"];
type OpenSeekClockFilter = "all" | "timed" | "casual";
type OpenSeekVpFilter = "all" | "enabled" | "disabled";
type OnlineBrowserResultFilter =
  | "all"
  | "white"
  | "black"
  | "resignation"
  | "timeout"
  | "castle_control"
  | "victory_points"
  | "monarch_captured";
type OnlineAccountUiStatus =
  | "signed-out"
  | "checking"
  | "creating"
  | "signing-in"
  | "signing-out"
  | "signing-out-all"
  | "deleting"
  | "ready"
  | "error";
type QuickMatchStatus = "idle" | "pending" | "matched" | "waiting" | "error";
type QuickMatchOutcome = "matched" | "waiting" | void;
type FollowingNoteMap = Record<string, string>;
type AccountChallengeUnreadActivity = { incomingPending: number; acceptedReady: number };

interface QuickMatchSetupSummary {
  boardRadius: number;
  clock: string;
  scoring: string;
  rating: string;
}

const LOBBY_AUTO_REFRESH_MS = 30_000;
const LOBBY_RATE_LIMIT_BACKOFF_MS = 60_000;
const ACCOUNT_CHALLENGE_AUTO_REFRESH_MS = 1_000;
const ACCOUNT_CHALLENGE_EXPIRING_SOON_MS = 5 * 60 * 1000;
const FOLLOWING_AUTO_REFRESH_MS = 30_000;
const WATCH_FOLLOWED_LIVE_LIMIT = 4;
const ACCOUNT_FOLLOWED_OPPONENT_LIMIT = 4;
const GAME_SEARCH_DEBOUNCE_MS = 300;
const HEAD_TO_HEAD_HISTORY_PAGE_LIMIT = 5;
const AUTO_REFRESH_PAUSED_MESSAGE = "Auto refresh paused after a rate limit. Use Refresh to check now.";
const ACCOUNT_REPORT_REASON_OPTIONS: Array<{ value: OnlineAccountReportReason; label: string }> = [
  { value: "abuse", label: "Abuse" },
  { value: "cheating", label: "Cheating" },
  { value: "spam", label: "Spam" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Other" },
];

interface OnlineGameBrowserProps {
  loadGames?: (options?: FetchOnlineGameSummariesOptions) => Promise<OnlineGameDirectoryResponse>;
  loadOpenSeeks?: (options?: FetchOpenSeekDirectoryOptions) => Promise<OpenSeekDirectoryResponse>;
  onBack: () => void;
  onOpenGame?: () => void;
  onConfigureSetup?: () => void;
  onTutorial?: () => void;
  onOpenLibrary?: () => void;
  onOpenProfile?: (displayName?: string) => void;
  onCreateSeek?: (
    visibility?: OpenSeekVisibility,
    options?: { invitedDisplayNames?: string[] }
  ) => void | Promise<void>;
  onQuickMatch?: () => QuickMatchOutcome | Promise<QuickMatchOutcome>;
  quickMatchSetupSummary?: QuickMatchSetupSummary;
  onAcceptSeek?: (seekId: string) => void | Promise<void>;
  onCancelSeek?: (seekId: string) => void | Promise<void>;
  ownedSeekResponse?: OpenSeekResponse | null;
  onRefreshOwnedSeek?: () => void | Promise<void>;
  onJoinOwnedSeek?: () => void;
  ownedSeekIds?: string[];
  onReplay: (gameId: string) => void;
  onSpectate: (gameId: string) => void;
  resolveAccountGameJoin?: (game: OnlineGameSummary, seat: "w" | "b") => OnlineJoinParams | null;
  onReturnToAccountGame?: (join: OnlineJoinParams, visibility: OnlineGameVisibility) => void;
  onRejoinAccountGame?: (game: OnlineGameSummary) => void;
  onRejoinAccountChallengeGame?: (gameId: string, visibility: OnlineGameVisibility) => void;
  rejoiningAccountGameId?: string | null;
  recentOnlineGames?: RecentOnlineGameRecord[];
  onClearRecentOnlineGames?: () => void;
  account?: OnlineAccount | null;
  accountStatus?: OnlineAccountUiStatus;
  accountError?: string | null;
  onCreateAccount?: (displayName: string, password: string) => void | Promise<void>;
  onSignInAccount?: (displayName: string, password: string) => void | Promise<void>;
  loadAccountOAuthProviders?: () => Promise<OnlineAccountOAuthProvidersResponse>;
  onSignOutAccount?: () => void | Promise<void>;
  loadAccountGames?: (options?: FetchOnlineAccountGamesOptions) => Promise<OnlineGameDirectoryResponse>;
  loadAccountHeadToHeadGames?: (
    displayName: string,
    options?: FetchOnlineAccountHeadToHeadGamesOptions
  ) => Promise<OnlineGameDirectoryResponse>;
  loadAccountChallenges?: (options?: FetchOnlineAccountChallengesOptions) => Promise<OnlineAccountChallengeDirectoryResponse & { protocolVersion: number }>;
  onAcceptAccountChallenge?: (challengeId: string) => Promise<OnlineChallengeResponse>;
  onDeclineAccountChallenge?: (challengeId: string) => Promise<OnlineChallengeResponse>;
  onCancelAccountChallenge?: (challengeId: string) => Promise<OnlineChallengeResponse>;
  loadAccountProfile?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  searchAccountProfiles?: (query: string) => Promise<OnlineAccountSearchResponse>;
  loadAccountFollowing?: () => Promise<OnlineAccountFollowingResponse>;
  loadRatingLeaderboard?: (options?: { limit?: number; scope?: OnlineRatingLeaderboardScope }) => Promise<OnlineRatingLeaderboardResponse>;
  onFollowAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onUnfollowAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onBlockAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onUnblockAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onReportAccount?: (displayName: string, input: OnlineAccountReportInput) => Promise<OnlineAccountReportResponse>;
  onChallengeAccount?: (displayName: string, options?: OnlineAccountChallengeActionOptions) => void | Promise<void>;
  onCopyChallengeAccountInvite?: (displayName: string) => void | Promise<void>;
  backLabel?: string;
  initialTab?: OnlineBrowserTab;
  activeTab?: OnlineBrowserTab;
  onTabChange?: (tab: OnlineBrowserTab) => void;
  onlineNotificationCount?: number;
  onlineNotificationLabel?: string;
  onAccountChallengeNavigationActivityChange?: (count: number) => void;
}

function participantName(
  participants: OnlineGameSummaryParticipant[],
  seat: "w" | "b"
): string {
  const participant = participants.find((candidate) => candidate.seat === seat);
  if (!participant) return seat === "w" ? "White" : "Black";
  if (participant.identity.kind === "registered" && participant.identity.displayName) {
    return participant.identity.displayName;
  }
  return seat === "w" ? "White" : "Black";
}

function participantProfileName(
  participants: OnlineGameSummaryParticipant[],
  seat: "w" | "b"
): string | null {
  const participant = participants.find((candidate) => candidate.seat === seat);
  if (!participant) return null;
  return identityDisplayName(participant.identity);
}

function accountOpponentProfileNames(
  summary: OnlineGameSummary,
  account: OnlineAccount | null | undefined
): string[] {
  if (!account) return [];
  const accountParticipant = summary.participants.find((participant) =>
    identityMatchesAccount(participant.identity, account)
  );
  if (!accountParticipant) return [];
  const seen = new Set<string>();
  const opponents: string[] = [];
  for (const participant of summary.participants) {
    if (participant.seat === accountParticipant.seat) continue;
    const displayName = identityDisplayName(participant.identity);
    if (!displayName) continue;
    const key = normalizeDisplayNameKey(displayName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    opponents.push(displayName);
  }
  return opponents;
}

function accountCompletedGameForOpponent(
  summary: OnlineGameSummary,
  account: OnlineAccount,
  opponentKey: string
): { accountSeat: "w" | "b"; opponentDisplayName: string } | null {
  if (summary.status !== "complete" || summary.archiveState !== "archived" || !summary.result) {
    return null;
  }
  const accountParticipant = summary.participants.find((participant) =>
    identityMatchesAccount(participant.identity, account)
  );
  if (!accountParticipant || (accountParticipant.seat !== "w" && accountParticipant.seat !== "b")) {
    return null;
  }
  const opponent = summary.participants.find((participant) => participant.seat !== accountParticipant.seat);
  const opponentDisplayName = opponent ? identityDisplayName(opponent.identity) : null;
  if (!opponentDisplayName || normalizeDisplayNameKey(opponentDisplayName) !== opponentKey) {
    return null;
  }
  return { accountSeat: accountParticipant.seat, opponentDisplayName };
}

function identityDisplayName(identity: OnlineIdentity): string | null {
  return identity.kind === "registered" && identity.displayName ? identity.displayName : null;
}

function normalizeDisplayNameKey(displayName: string): string {
  return displayName.trim().toLowerCase();
}

function identityMatchesAccount(identity: OnlineIdentity | null | undefined, account: OnlineAccount): boolean {
  if (!identity || identity.kind !== "registered") return false;
  if (isSameOnlineIdentity(identity, account.identity)) return true;
  return Boolean(
    identity.displayName &&
      normalizeDisplayNameKey(identity.displayName) === normalizeDisplayNameKey(account.displayName)
  );
}

const PINNED_FOLLOWING_STORAGE_KEY_PREFIX = "castles_online_pinned_following_v1:";
const PINNED_FOLLOWING_LIMIT = 64;
const FOLLOWING_NOTES_STORAGE_KEY_PREFIX = "castles_online_following_notes_v1:";
const FOLLOWING_NOTES_LIMIT = 128;
const FOLLOWING_NOTE_MAX_LENGTH = 180;

function pinnedFollowingStorageKey(accountId: string): string {
  return `${PINNED_FOLLOWING_STORAGE_KEY_PREFIX}${accountId}`;
}

function followingNotesStorageKey(accountId: string): string {
  return `${FOLLOWING_NOTES_STORAGE_KEY_PREFIX}${accountId}`;
}

function normalizeFollowingNote(note: string): string {
  return note.replace(/\s+/g, " ").trim().slice(0, FOLLOWING_NOTE_MAX_LENGTH);
}

function readPinnedFollowingDisplayNames(accountId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(pinnedFollowingStorageKey(accountId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const pinned = new Set<string>();
    for (const candidate of parsed) {
      if (typeof candidate !== "string") continue;
      const key = normalizeDisplayNameKey(candidate);
      if (!key) continue;
      pinned.add(key);
      if (pinned.size >= PINNED_FOLLOWING_LIMIT) break;
    }
    return pinned;
  } catch {
    return new Set();
  }
}

function writePinnedFollowingDisplayNames(accountId: string, pinned: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(
      pinnedFollowingStorageKey(accountId),
      JSON.stringify([...pinned].slice(0, PINNED_FOLLOWING_LIMIT))
    );
  } catch {
    // Pinning is a local convenience; storage failures should not block play.
  }
}

function readFollowingNotes(accountId: string): FollowingNoteMap {
  try {
    const raw = window.localStorage.getItem(followingNotesStorageKey(accountId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const notes: FollowingNoteMap = {};
    for (const [candidateKey, candidateNote] of Object.entries(parsed)) {
      if (typeof candidateKey !== "string" || typeof candidateNote !== "string") continue;
      const key = normalizeDisplayNameKey(candidateKey);
      const note = normalizeFollowingNote(candidateNote);
      if (!key || !note) continue;
      notes[key] = note;
      if (Object.keys(notes).length >= FOLLOWING_NOTES_LIMIT) break;
    }
    return notes;
  } catch {
    return {};
  }
}

function writeFollowingNotes(accountId: string, notes: FollowingNoteMap): void {
  try {
    const trimmedNotes: FollowingNoteMap = {};
    for (const [candidateKey, candidateNote] of Object.entries(notes)) {
      const key = normalizeDisplayNameKey(candidateKey);
      const note = normalizeFollowingNote(candidateNote);
      if (!key || !note) continue;
      trimmedNotes[key] = note;
      if (Object.keys(trimmedNotes).length >= FOLLOWING_NOTES_LIMIT) break;
    }
    window.localStorage.setItem(followingNotesStorageKey(accountId), JSON.stringify(trimmedNotes));
  } catch {
    // Notes are local convenience data; storage failures should not block play.
  }
}

function isProfilePinned(
  profile: OnlineAccountPublicProfile,
  pinnedDisplayNames: ReadonlySet<string>
): boolean {
  return pinnedDisplayNames.has(normalizeDisplayNameKey(profile.displayName));
}

function gameHasFollowedParticipant(summary: OnlineGameSummary, followedDisplayNames: ReadonlySet<string>): boolean {
  if (followedDisplayNames.size === 0) return false;
  return summary.participants.some((participant) => {
    const displayName = identityDisplayName(participant.identity);
    return displayName ? followedDisplayNames.has(normalizeDisplayNameKey(displayName)) : false;
  });
}

function seekHasFollowedCreator(summary: OpenSeekSummary, followedDisplayNames: ReadonlySet<string>): boolean {
  if (followedDisplayNames.size === 0) return false;
  const displayName = identityDisplayName(summary.creatorIdentity);
  return displayName ? followedDisplayNames.has(normalizeDisplayNameKey(displayName)) : false;
}

function mergeOpenSeekSummaries(current: OpenSeekSummary[], next: OpenSeekSummary[]): OpenSeekSummary[] {
  const merged = new Map<string, OpenSeekSummary>();
  for (const seek of current) {
    merged.set(seek.seekId, seek);
  }
  for (const seek of next) {
    merged.set(seek.seekId, seek);
  }
  return [...merged.values()].sort(compareOpenSeekNewest);
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRecentOnlineGameTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRecentOnlineGameRole(record: RecentOnlineGameRecord): string {
  if (record.role === "spectator") return "Spectated";
  if (record.seat === "w") return "Played White";
  if (record.seat === "b") return "Played Black";
  return "Played";
}

function formatRecentOnlineGameScope(): string {
  return "Device-only replay";
}

function recentOnlineGameSearchText(record: RecentOnlineGameRecord): string {
  return [
    record.gameId,
    formatRecentOnlineGameRole(record),
    formatRecentOnlineGameScope(),
    record.status,
    record.seat === "w" ? "white" : record.seat === "b" ? "black" : "",
  ].join(" ").toLowerCase();
}

function compareNewest(left: OnlineGameSummary, right: OnlineGameSummary): number {
  if (left.updatedAt !== right.updatedAt) return right.updatedAt.localeCompare(left.updatedAt);
  return left.gameId.localeCompare(right.gameId);
}

function compareLatestCompletedGame(left: OnlineGameSummary, right: OnlineGameSummary): number {
  const leftCompletedAt = left.endedAt ?? left.updatedAt;
  const rightCompletedAt = right.endedAt ?? right.updatedAt;
  if (leftCompletedAt !== rightCompletedAt) return rightCompletedAt.localeCompare(leftCompletedAt);
  return compareNewest(left, right);
}

function spectatorCountValue(summary: OnlineGameSummary): number {
  const count = summary.livePreview.spectatorCount;
  return Number.isSafeInteger(count) && (count ?? 0) > 0 ? count ?? 0 : 0;
}

function compareMostMoves(left: OnlineGameSummary, right: OnlineGameSummary): number {
  if (left.livePreview.moveCount !== right.livePreview.moveCount) {
    return right.livePreview.moveCount - left.livePreview.moveCount;
  }
  return compareNewest(left, right);
}

function compareMostWatchedNow(left: OnlineGameSummary, right: OnlineGameSummary): number {
  const leftWatchers = spectatorCountValue(left);
  const rightWatchers = spectatorCountValue(right);
  if (leftWatchers !== rightWatchers) return rightWatchers - leftWatchers;
  return compareMostMoves(left, right);
}

function formatSideToMove(color: "w" | "b"): string {
  return color === "w" ? "White" : "Black";
}

function formatMoveCount(count: number): string {
  return `${count} ${count === 1 ? "move" : "moves"}`;
}

function formatPublicLiveCount(count: number): string {
  return `${count} public live ${count === 1 ? "game" : "games"}`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatGameVisibilityLabel(visibility: OnlineGameVisibility): string {
  switch (visibility) {
    case "public":
      return "Public";
    case "unlisted":
      return "Unlisted";
    case "private":
      return "Private";
    default:
      return visibility;
  }
}

function archiveDetailPanelId(gameId: string): string {
  return `online-archive-detail-${gameId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function formatAccountChallengeRole(role: OnlineAccountChallengeListItem["role"]): string {
  return role === "challenged" ? "Incoming" : "Outgoing";
}

function challengeOpponentName(item: OnlineAccountChallengeListItem): string {
  return challengeOpponentDisplayName(item) ?? (item.role === "challenged" ? "Challenger" : "Opponent");
}

function challengeOpponentDisplayName(item: OnlineAccountChallengeListItem): string | null {
  const identity =
    item.role === "challenged"
      ? item.summary.challengerIdentity
      : item.summary.challengedIdentity;
  return identityDisplayName(identity);
}

function isAccountChallengeShortcutItem(item: OnlineAccountChallengeListItem): boolean {
  return item.summary.status === "pending" || (item.summary.status === "accepted" && Boolean(item.summary.gameId));
}

function visibleAccountChallengesForFilter(
  items: OnlineAccountChallengeListItem[],
  filter: OnlineAccountChallengeFilter
): OnlineAccountChallengeListItem[] {
  return filter === "pending"
    ? items.filter((item) => item.summary.status === "pending")
    : items;
}

function accountChallengeActivityKey(item: OnlineAccountChallengeListItem): string | null {
  const summary = item.summary;
  if (summary.status === "pending" && item.role === "challenged") {
    return `incoming:${summary.challengeId}:${summary.updatedAt}`;
  }
  if (summary.status === "accepted" && summary.gameId) {
    return `accepted:${summary.challengeId}:${summary.gameId}:${summary.updatedAt}`;
  }
  return null;
}

function emptyAccountChallengeUnreadActivity(): AccountChallengeUnreadActivity {
  return { incomingPending: 0, acceptedReady: 0 };
}

function mergeAccountChallengeShortcutItems(
  current: OnlineAccountChallengeListItem[],
  incoming: OnlineAccountChallengeListItem[]
): OnlineAccountChallengeListItem[] {
  const next = new Map<string, OnlineAccountChallengeListItem>();
  for (const item of current) {
    if (item.summary.status === "accepted" && item.summary.gameId) {
      next.set(item.summary.challengeId, item);
    }
  }
  for (const item of incoming) {
    if (isAccountChallengeShortcutItem(item)) {
      next.set(item.summary.challengeId, item);
    }
  }
  return [...next.values()];
}

function mergeAccountChallengeRowsWithShortcuts(
  rows: OnlineAccountChallengeListItem[],
  shortcuts: OnlineAccountChallengeListItem[]
): OnlineAccountChallengeListItem[] {
  const next = new Map(rows.map((item) => [item.summary.challengeId, item]));
  for (const item of shortcuts) {
    if (!next.has(item.summary.challengeId)) {
      next.set(item.summary.challengeId, item);
    }
  }
  return [...next.values()];
}

function updateAccountChallengeShortcutItem(
  current: OnlineAccountChallengeListItem[],
  item: OnlineAccountChallengeListItem
): OnlineAccountChallengeListItem[] {
  const next = new Map(current.map((candidate) => [candidate.summary.challengeId, candidate]));
  if (isAccountChallengeShortcutItem(item)) {
    next.set(item.summary.challengeId, item);
  } else {
    next.delete(item.summary.challengeId);
  }
  return [...next.values()];
}

function pruneAccountChallengeShortcutItemsAfterLoadError(
  current: OnlineAccountChallengeListItem[]
): OnlineAccountChallengeListItem[] {
  return current.filter((item) => item.summary.status === "accepted" && Boolean(item.summary.gameId));
}

function formatChallengeSeatChoice(
  item: OnlineAccountChallengeListItem,
  account?: OnlineAccount | null
): string {
  if (item.summary.status === "accepted" && account) {
    if (identityMatchesAccount(item.summary.whiteIdentity, account)) {
      return "Your side White";
    }
    if (identityMatchesAccount(item.summary.blackIdentity, account)) {
      return "Your side Black";
    }
  }
  const seat = item.summary.challengerSeat;
  if (seat === "random") return "Random side";
  const challengerSide = seat === "w" ? "White" : "Black";
  if (item.role === "challenger") return `You chose ${challengerSide}`;
  return `They chose ${challengerSide}`;
}

function formatChallengeSetupSummary(item: OnlineAccountChallengeListItem): string[] {
  const setup = item.summary.setup;
  const clock = setup.timeControl ? `Timed ${setup.timeControl.initial}+${setup.timeControl.increment}` : "Casual";
  return [
    `Board Radius ${setup.board.config.nSquares}`,
    `Clock ${clock}`,
    `Scoring ${setup.gameRules?.vpModeEnabled ? "Victory points" : "Castle control"}`,
    `Rating ${formatRatingModeLabel(setup.ratingMode)}`,
  ];
}

function formatAccountChallengeStatus(item: OnlineAccountChallengeListItem): string {
  switch (item.summary.status) {
    case "pending":
      return item.role === "challenged" ? "Awaiting your response" : "Awaiting response";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return item.summary.status;
  }
}

function formatPendingAccountChallengeExpiry(
  item: OnlineAccountChallengeListItem,
  now = Date.now()
): { timeLabel: string; isSoon: boolean } | null {
  if (item.summary.status !== "pending") return null;
  const expiresAt = Date.parse(item.summary.expiresAt);
  if (Number.isNaN(expiresAt)) return null;
  const remainingMs = expiresAt - now;
  if (remainingMs <= 0) return null;
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (remainingMinutes < 60) {
    return {
      timeLabel: `${remainingMinutes} min left`,
      isSoon: remainingMs <= ACCOUNT_CHALLENGE_EXPIRING_SOON_MS,
    };
  }
  return {
    timeLabel: `Expires ${formatSeekExpiresAt(item.summary.expiresAt)}`,
    isSoon: remainingMs <= ACCOUNT_CHALLENGE_EXPIRING_SOON_MS,
  };
}

function formatSpectatorCount(count: number | undefined): string | null {
  if (!Number.isSafeInteger(count) || (count ?? 0) <= 0) return null;
  return `${count} watching`;
}

function formatPresenceLabel(profile: OnlineAccountPublicProfile): string {
  const presence = profile.presence;
  if (presence.visibility === "hidden") return "Presence hidden";
  switch (presence.status) {
    case "online":
      return "Online";
    case "recent":
      return "Active recently";
    case "away":
      return "Away";
    case "offline":
    default:
      return "Offline";
  }
}

function formatRelationshipLabel(profile: OnlineAccountPublicProfile): string {
  const relationship = profile.relationship;
  if (relationship.self) return "Self";
  if (relationship.blocked) return "Blocked";
  if (relationship.following && relationship.followedBy) return "Mutual friend";
  if (relationship.following) return "Following";
  if (relationship.followedBy) return "Follows you";
  return "Not followed";
}

function isProfileOnline(profile: OnlineAccountPublicProfile): boolean {
  return profile.presence.visibility === "visible" && profile.presence.status === "online";
}

function onlineRequestErrorMessage(error: unknown): string | null {
  return error instanceof OnlineRequestError ? error.message : null;
}

function formatAccountChallengeErrorMessage(
  error: unknown,
  displayName: string,
  intent: OnlineAccountChallengeIntent
): string | null {
  if (error instanceof OnlineRequestError && error.code === "not_allowed") {
    return intent === "rematch"
      ? `${displayName} is not available for rematches right now.`
      : `${displayName} is not available for challenges right now.`;
  }
  return onlineRequestErrorMessage(error);
}

function presenceBadgeClassName(profile: OnlineAccountPublicProfile): string {
  if (profile.presence.visibility === "hidden") return "presence-hidden";
  if (profile.presence.status === "online") return "presence-online";
  if (profile.presence.status === "recent") return "presence-recent";
  if (profile.presence.status === "away") return "presence-away";
  return "presence-offline";
}

function profileRatingTitle(profile: OnlineAccountPublicProfile): string {
  const rating = profile.rating;
  if (!rating) return "";
  const suffix = rating.games === 1 ? "rated game" : "rated games";
  return `${rating.games} ${suffix}`;
}

function compareProfilesByDisplayName(
  left: OnlineAccountPublicProfile,
  right: OnlineAccountPublicProfile
): number {
  return left.displayName.localeCompare(right.displayName);
}

function profilePresenceRank(profile: OnlineAccountPublicProfile): number {
  if (profile.presence.visibility === "hidden") return 4;
  switch (profile.presence.status) {
    case "online":
      return 0;
    case "recent":
      return 1;
    case "away":
      return 2;
    case "offline":
    default:
      return 3;
  }
}

function compareProfilesByPresence(
  left: OnlineAccountPublicProfile,
  right: OnlineAccountPublicProfile
): number {
  const rankDelta = profilePresenceRank(left) - profilePresenceRank(right);
  return rankDelta !== 0 ? rankDelta : compareProfilesByDisplayName(left, right);
}

function compareProfilesByPinnedPresence(
  pinnedDisplayNames: ReadonlySet<string>,
  left: OnlineAccountPublicProfile,
  right: OnlineAccountPublicProfile
): number {
  const leftPinned = isProfilePinned(left, pinnedDisplayNames);
  const rightPinned = isProfilePinned(right, pinnedDisplayNames);
  if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
  return compareProfilesByPresence(left, right);
}

function formatClockTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function previewClockRemainingMs(
  clock: NonNullable<OnlineGameSummary["livePreview"]["clock"]>,
  player: "w" | "b"
): number {
  const elapsedMs =
    clock.serverNow !== undefined &&
    clock.activeColor === player &&
    clock.runningSince !== null
      ? Math.max(0, clock.serverNow - clock.runningSince)
      : 0;
  return Math.max(0, clock.remainingMs[player] - elapsedMs);
}

function formatTimeControl(summary: OnlineGameSummary): string {
  const clock = summary.livePreview.clock;
  if (!clock) return "Casual";
  const initialMinutes = Math.floor(clock.timeControl.initialMs / 60_000);
  const incrementSeconds = Math.floor(clock.timeControl.incrementMs / 1_000);
  return `Timed ${initialMinutes}+${incrementSeconds}`;
}

function formatClockSnapshot(summary: OnlineGameSummary): string {
  const clock = summary.livePreview.clock;
  if (!clock) return "Casual";
  return `Clock W ${formatClockTime(previewClockRemainingMs(clock, "w"))} B ${formatClockTime(previewClockRemainingMs(clock, "b"))}`;
}

const PIECE_PREVIEW_LABELS: Record<PieceType, string> = {
  [PieceType.Swordsman]: "S",
  [PieceType.Archer]: "A",
  [PieceType.Knight]: "N",
  [PieceType.Trebuchet]: "T",
  [PieceType.Eagle]: "E",
  [PieceType.Giant]: "G",
  [PieceType.Assassin]: "X",
  [PieceType.Dragon]: "D",
  [PieceType.Monarch]: "M",
  [PieceType.Wolf]: "W",
  [PieceType.Healer]: "H",
  [PieceType.Ranger]: "R",
  [PieceType.Wizard]: "Z",
  [PieceType.Necromancer]: "C",
  [PieceType.Phoenix]: "P",
};
const BOARD_PREVIEW_CELL_CACHE = new Map<number, OnlineGameSummaryBoardPreviewHex[]>();

function boardPreviewPoint(
  hex: OnlineGameSummaryBoardPreviewHex,
  radius: number
): { x: number; y: number } {
  const scale = 42 / Math.max(1, radius);
  return {
    x: 50 + (hex.q + hex.r / 2) * scale,
    y: 50 + hex.r * scale * 0.86,
  };
}

function boardPreviewCells(radius: number): OnlineGameSummaryBoardPreviewHex[] {
  const cached = BOARD_PREVIEW_CELL_CACHE.get(radius);
  if (cached) return cached;

  const cells: OnlineGameSummaryBoardPreviewHex[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r += 1) {
      cells.push({ q, r, s: -q - r });
    }
  }
  BOARD_PREVIEW_CELL_CACHE.set(radius, cells);
  return cells;
}

function boardPreviewImageLabel(game: OnlineGameSummary): string {
  const preview = game.livePreview.boardPreview;
  const whitePieces = preview.pieces.filter((piece) => piece.color === "w").length;
  const blackPieces = preview.pieces.length - whitePieces;
  const whiteCastles = preview.castles.filter((castle) => castle.owner === "w").length;
  const blackCastles = preview.castles.length - whiteCastles;
  return [
    "Board preview:",
    `${whitePieces} White pieces`,
    `${blackPieces} Black pieces`,
    `${whiteCastles} White-controlled castles`,
    `${blackCastles} Black-controlled castles`,
  ].join(" ");
}

function boardPreviewSummary(game: OnlineGameSummary): { pieces: string; castles: string } {
  const preview = game.livePreview.boardPreview;
  const whitePieces = preview.pieces.filter((piece) => piece.color === "w").length;
  const blackPieces = preview.pieces.length - whitePieces;
  const whiteCastles = preview.castles.filter((castle) => castle.owner === "w").length;
  const blackCastles = preview.castles.length - whiteCastles;
  return {
    pieces: `Pieces W${whitePieces} B${blackPieces}`,
    castles: `Castles W${whiteCastles} B${blackCastles}`,
  };
}

function matchesResultFilter(summary: OnlineGameSummary, resultFilter: OnlineBrowserResultFilter): boolean {
  if (resultFilter === "all") return true;
  if (!summary.result) return false;
  if (resultFilter === "white") return summary.result.winner === "w";
  if (resultFilter === "black") return summary.result.winner === "b";
  return summary.result.reason === resultFilter;
}

function matchesRatingFilter(summary: OnlineGameSummary, ratingFilter: OnlineBrowserRatingFilter): boolean {
  return ratingFilter === "all" || (summary.ratingMode ?? "casual") === ratingFilter;
}

function seekSearchText(summary: OpenSeekSummary): string {
  const sideLabel = formatSeekSideLabel(summary.creatorSeat);
  const sideDetail = formatSeekSideDetail(summary, false);
  const clock = formatSeekClock(summary);
  const scoring = formatSeekScoringLabel(summary);
  const rating = formatSeekRatingLabel(summary);
  const creatorDisplayName = identityDisplayName(summary.creatorIdentity) ?? "";
  return [
    summary.seekId,
    creatorDisplayName,
    creatorDisplayName ? `${creatorDisplayName} creator` : "",
    summary.creatorSeat,
    sideLabel,
    sideDetail,
    summary.status,
    summary.visibility ?? "public",
    ...(summary.invitedDisplayNames ?? []),
    summary.invitedDisplayNames?.length ? `invited ${summary.invitedDisplayNames.join(" ")}` : "",
    summary.setup.board.config.nSquares,
    clock,
    summary.setup.timeControl ? `${summary.setup.timeControl.initial}+${summary.setup.timeControl.increment}` : "casual",
    scoring,
    rating,
    `${rating} game`,
  ].join(" ").toLowerCase();
}

function formatSeekClock(summary: OpenSeekSummary): string {
  const clock = summary.setup.timeControl;
  return clock ? `Timed ${clock.initial}+${clock.increment}` : "Casual";
}

function formatSeekScoringLabel(summary: OpenSeekSummary): string {
  return summary.setup.gameRules?.vpModeEnabled ? "Victory points" : "Castle control";
}

function formatRatingModeLabel(ratingMode: "casual" | "rated" | undefined): string {
  return ratingMode === "rated" ? "Rated" : "Casual";
}

function formatSeekRatingLabel(summary: OpenSeekSummary): string {
  return formatRatingModeLabel(summary.setup.ratingMode);
}

function matchesSeekRatingFilter(summary: OpenSeekSummary, ratingFilter: OnlineBrowserRatingFilter): boolean {
  return ratingFilter === "all" || (summary.setup.ratingMode ?? "casual") === ratingFilter;
}

function formatSeekExpiresAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSeekStatus(status: OpenSeekSummary["status"]): string {
  switch (status) {
    case "open":
      return "Open";
    case "accepted":
      return "Accepted";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function formatSeekSideLabel(side: OpenSeekSummary["creatorSeat"]): string {
  switch (side) {
    case "w":
      return "White";
    case "b":
      return "Black";
    case "random":
      return "Random";
    default:
      return side;
  }
}

function formatSeekSideDetail(summary: OpenSeekSummary, owned: boolean): string {
  if (summary.creatorSeat === "random") return "Creator side Random";
  const creatorSide = formatSeekSideLabel(summary.creatorSeat);
  if (owned) return `You play ${creatorSide}`;
  return summary.creatorSeat === "w"
    ? "Creator plays White; you play Black"
    : "Creator plays Black; you play White";
}

function formatOwnedSeekSideDetail(response: OpenSeekResponse): string {
  if (response.summary.creatorSeat !== "random") {
    return formatSeekSideDetail(response.summary, true);
  }
  if (!response.gameInvite) return "Creator side Random";
  return `You play ${formatSeekSideLabel(response.gameInvite.seat)}`;
}

function compareOpenSeekNewest(left: OpenSeekSummary, right: OpenSeekSummary): number {
  if (left.updatedAt !== right.updatedAt) return right.updatedAt.localeCompare(left.updatedAt);
  return left.seekId.localeCompare(right.seekId);
}

function formatLastChecked(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /429|rate.?limit(?:ed)?/i.test(error.message);
}

const OnlineGameBrowser: React.FC<OnlineGameBrowserProps> = ({
  loadGames = fetchOnlineGameDirectory,
  loadOpenSeeks = fetchOpenSeekDirectory,
  onBack,
  onOpenGame,
  onConfigureSetup,
  onTutorial,
  onOpenLibrary,
  onOpenProfile,
  onCreateSeek,
  onQuickMatch,
  quickMatchSetupSummary,
  onAcceptSeek,
  onCancelSeek,
  ownedSeekResponse,
  onRefreshOwnedSeek,
  onJoinOwnedSeek,
  ownedSeekIds = [],
  onReplay,
  onSpectate,
  resolveAccountGameJoin,
  onReturnToAccountGame,
  onRejoinAccountGame,
  onRejoinAccountChallengeGame,
  rejoiningAccountGameId = null,
  recentOnlineGames = [],
  onClearRecentOnlineGames,
  account = null,
  accountStatus = account ? "ready" : "signed-out",
  accountError = null,
  onCreateAccount,
  onSignInAccount,
  loadAccountOAuthProviders,
  onSignOutAccount,
  loadAccountGames,
  loadAccountHeadToHeadGames,
  loadAccountChallenges,
  onAcceptAccountChallenge,
  onDeclineAccountChallenge,
  onCancelAccountChallenge,
  loadAccountProfile,
  searchAccountProfiles,
  loadAccountFollowing,
  loadRatingLeaderboard,
  onFollowAccount,
  onUnfollowAccount,
  onBlockAccount,
  onUnblockAccount,
  onReportAccount,
  onChallengeAccount,
  onCopyChallengeAccountInvite,
  backLabel = "Back to game",
  initialTab = "lobby",
  activeTab,
  onTabChange,
  onlineNotificationCount = 0,
  onlineNotificationLabel,
  onAccountChallengeNavigationActivityChange,
}) => {
  const [uncontrolledTab, setUncontrolledTab] = React.useState<OnlineBrowserTab>(initialTab);
  const tab = activeTab ?? uncontrolledTab;
  const [games, setGames] = React.useState<OnlineGameSummary[]>([]);
  const [openSeeks, setOpenSeeks] = React.useState<OpenSeekSummary[]>([]);
  const [query, setQuery] = React.useState("");
  const [debouncedGameQuery, setDebouncedGameQuery] = React.useState("");
  const [loadedGameQuery, setLoadedGameQuery] = React.useState("");
  const [sort, setSort] = React.useState<OnlineBrowserSort>("newest");
  const [timeFilter, setTimeFilter] = React.useState<OnlineBrowserTimeFilter>("all");
  const [ratingFilter, setRatingFilter] = React.useState<OnlineBrowserRatingFilter>("all");
  const [friendFilter, setFriendFilter] = React.useState<OnlineFriendFilter>("all");
  const [seekSideFilter, setSeekSideFilter] = React.useState<OpenSeekSideFilter>("all");
  const [seekClockFilter, setSeekClockFilter] = React.useState<OpenSeekClockFilter>("all");
  const [seekVpFilter, setSeekVpFilter] = React.useState<OpenSeekVpFilter>("all");
  const [seekRatingFilter, setSeekRatingFilter] = React.useState<OnlineBrowserRatingFilter>("all");
  const [resultFilter, setResultFilter] = React.useState<OnlineBrowserResultFilter>("all");
  const [filterPanelOpenByTab, setFilterPanelOpenByTab] = React.useState<Record<OnlineBrowserTab, boolean>>({
    lobby: false,
    watch: false,
    archive: false,
  });
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>();
  const [copyMessage, setCopyMessage] = React.useState("");
  const [seekStatus, setSeekStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [seekActionById, setSeekActionById] = React.useState<Record<string, "accept" | "cancel" | undefined>>({});
  const [seekActionMessage, setSeekActionMessage] = React.useState("");
  const [quickMatchStatus, setQuickMatchStatus] = React.useState<QuickMatchStatus>("idle");
  const [createSeekPending, setCreateSeekPending] = React.useState(false);
  const [inviteDisplayName, setInviteDisplayName] = React.useState("");
  const [ownedSeekAction, setOwnedSeekAction] = React.useState<"refresh" | "join" | undefined>();
  const [lastSeekCheckedAt, setLastSeekCheckedAt] = React.useState("");
  const [isSeekLoadInFlight, setIsSeekLoadInFlight] = React.useState(false);
  const [isSeekLoadingMore, setIsSeekLoadingMore] = React.useState(false);
  const [seekNextCursor, setSeekNextCursor] = React.useState<string | undefined>();
  const [isAccountDialogOpen, setIsAccountDialogOpen] = React.useState(false);
  const [accountGames, setAccountGames] = React.useState<OnlineGameSummary[]>([]);
  const [accountGamesStatus, setAccountGamesStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [headToHeadDisplayName, setHeadToHeadDisplayName] = React.useState("");
  const [headToHeadGames, setHeadToHeadGames] = React.useState<OnlineGameSummary[]>([]);
  const [headToHeadGamesStatus, setHeadToHeadGamesStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [headToHeadNextCursor, setHeadToHeadNextCursor] = React.useState<string | undefined>();
  const [isHeadToHeadLoadingMore, setIsHeadToHeadLoadingMore] = React.useState(false);
  const [headToHeadMessage, setHeadToHeadMessage] = React.useState("");
  const [accountChallenges, setAccountChallenges] = React.useState<OnlineAccountChallengeListItem[]>([]);
  const [accountChallengeShortcutItems, setAccountChallengeShortcutItems] = React.useState<OnlineAccountChallengeListItem[]>([]);
  const [accountChallengesStatus, setAccountChallengesStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [accountChallengeActionById, setAccountChallengeActionById] = React.useState<Record<string, "accept" | "decline" | "cancel" | undefined>>({});
  const [accountChallengeFilter, setAccountChallengeFilter] = React.useState<OnlineAccountChallengeFilter>("all");
  const [accountChallengeUnreadActivity, setAccountChallengeUnreadActivity] =
    React.useState<AccountChallengeUnreadActivity>(() => emptyAccountChallengeUnreadActivity());
  const [socialLookupName, setSocialLookupName] = React.useState("");
  const [socialProfile, setSocialProfile] = React.useState<OnlineAccountPublicProfile | null>(null);
  const [socialLookupStatus, setSocialLookupStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [socialSearchResults, setSocialSearchResults] = React.useState<OnlineAccountSearchProfile[]>([]);
  const [socialSearchStatus, setSocialSearchStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [socialMessage, setSocialMessage] = React.useState("");
  const [socialAction, setSocialAction] = React.useState<"follow" | "unfollow" | "block" | "unblock" | "challenge" | "copy-invite" | "refresh" | "report" | undefined>();
  const [reportTargetDisplayName, setReportTargetDisplayName] = React.useState("");
  const [reportReason, setReportReason] = React.useState<OnlineAccountReportReason>("abuse");
  const [reportDetails, setReportDetails] = React.useState("");
  const [followingProfiles, setFollowingProfiles] = React.useState<OnlineAccountPublicProfile[]>([]);
  const [followingStatus, setFollowingStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ratingLeaderboardEntries, setRatingLeaderboardEntries] = React.useState<OnlineRatingLeaderboardEntry[]>([]);
  const [ratingLeaderboardStatus, setRatingLeaderboardStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ratingLeaderboardScope, setRatingLeaderboardScope] = React.useState<OnlineRatingLeaderboardScope>("global");
  const [followingPresenceFilter, setFollowingPresenceFilter] = React.useState<OnlineFollowingPresenceFilter>("all");
  const [pinnedFollowingDisplayNames, setPinnedFollowingDisplayNames] = React.useState<Set<string>>(() =>
    account ? readPinnedFollowingDisplayNames(account.accountId) : new Set()
  );
  const [followingNotes, setFollowingNotes] = React.useState<FollowingNoteMap>(() =>
    account ? readFollowingNotes(account.accountId) : {}
  );
  const [editingFollowingNoteKey, setEditingFollowingNoteKey] = React.useState<string | null>(null);
  const [followingNoteDraft, setFollowingNoteDraft] = React.useState("");
  const [selectedArchiveDetailGame, setSelectedArchiveDetailGame] = React.useState<OnlineGameSummary | null>(null);
  const requestIdRef = React.useRef(0);
  const seekRequestIdRef = React.useRef(0);
  const accountGamesRequestIdRef = React.useRef(0);
  const headToHeadGamesRequestIdRef = React.useRef(0);
  const accountChallengesRequestIdRef = React.useRef(0);
  const accountFollowingRequestIdRef = React.useRef(0);
  const ratingLeaderboardRequestIdRef = React.useRef(0);
  const socialLookupRequestIdRef = React.useRef(0);
  const socialSearchRequestIdRef = React.useRef(0);
  const socialMutationRequestIdRef = React.useRef(0);
  const gameLoadInFlightRef = React.useRef(false);
  const seekLoadInFlightRef = React.useRef(false);
  const ownedSeekRefreshInFlightRef = React.useRef(false);
  const accountChallengeLoadInFlightRef = React.useRef(false);
  const followingLoadInFlightRef = React.useRef(false);
  const seekAutoRefreshPausedUntilRef = React.useRef(0);
  const accountChallengeAutoRefreshPausedUntilRef = React.useRef(0);
  const followingAutoRefreshPausedUntilRef = React.useRef(0);
  const seekActionByIdRef = React.useRef(seekActionById);
  const accountChallengeActionByIdRef = React.useRef(accountChallengeActionById);
  const accountChallengesRef = React.useRef<OnlineAccountChallengeListItem[]>([]);
  const accountChallengeShortcutItemsRef = React.useRef<OnlineAccountChallengeListItem[]>([]);
  const completedAccountChallengeIdsRef = React.useRef(new Set<string>());
  const knownAccountChallengeActivityKeysRef = React.useRef(new Set<string>());
  const accountChallengeActivityBaselineReadyRef = React.useRef(false);
  const queuedSeekLoadRef = React.useRef<"foreground" | "background" | undefined>();
  const quickMatchButtonRef = React.useRef<HTMLButtonElement>(null);
  const archiveTabButtonRef = React.useRef<HTMLButtonElement>(null);
  const gameSearchInputRef = React.useRef<HTMLInputElement>(null);
  const socialProfileCardRef = React.useRef<HTMLElement>(null);
  const accountChallengesSectionRef = React.useRef<HTMLElement>(null);
  const ownedSeekPanelRef = React.useRef<HTMLElement>(null);
  const closedOwnedSeekPanelRef = React.useRef<HTMLElement>(null);
  const archiveDetailRef = React.useRef<HTMLElement>(null);
  const [recentClearMessage, setRecentClearMessage] = React.useState("");
  const canUseAccountSocial = Boolean(
    account &&
    loadAccountProfile &&
    loadAccountFollowing &&
    onFollowAccount &&
    onUnfollowAccount &&
    onBlockAccount &&
    onUnblockAccount
  );
  const canUseAccountChallenges = Boolean(account && loadAccountChallenges);

  React.useEffect(() => {
    if (activeTab === undefined) {
      setUncontrolledTab(initialTab);
    }
  }, [activeTab, initialTab]);

  const setBrowserTab = React.useCallback((nextTab: OnlineBrowserTab) => {
    setRecentClearMessage("");
    if (activeTab === undefined) {
      setUncontrolledTab(nextTab);
    }
    onTabChange?.(nextTab);
  }, [activeTab, onTabChange]);

  React.useEffect(() => {
    setRecentClearMessage("");
    if (tab !== "archive") {
      setSelectedArchiveDetailGame(null);
    }
  }, [tab]);

  React.useEffect(() => {
    setSelectedArchiveDetailGame(null);
  }, [account?.accountId]);

  React.useEffect(() => {
    const detail = archiveDetailRef.current;
    if (selectedArchiveDetailGame && detail) {
      detail.scrollIntoView?.({ block: "start", inline: "nearest" });
      detail.focus({ preventScroll: true });
    }
  }, [selectedArchiveDetailGame?.gameId]);

  React.useEffect(() => {
    seekActionByIdRef.current = seekActionById;
  }, [seekActionById]);

  React.useEffect(() => {
    accountChallengeActionByIdRef.current = accountChallengeActionById;
  }, [accountChallengeActionById]);

  React.useEffect(() => {
    accountChallengesRef.current = accountChallenges;
  }, [accountChallenges]);

  const commitAccountChallengeShortcutItems = React.useCallback((
    nextItems: OnlineAccountChallengeListItem[],
    options: { notifyNavigation?: boolean } = {}
  ) => {
    accountChallengeShortcutItemsRef.current = nextItems;
    setAccountChallengeShortcutItems(nextItems);
    if (options.notifyNavigation) {
      onAccountChallengeNavigationActivityChange?.(
        countOnlineAccountChallengeNavigationActivity(nextItems)
      );
    }
  }, [onAccountChallengeNavigationActivityChange]);

  const updateAccountChallengeShortcutItems = React.useCallback((
    updater: (current: OnlineAccountChallengeListItem[]) => OnlineAccountChallengeListItem[],
    options: { notifyNavigation?: boolean } = {}
  ) => {
    commitAccountChallengeShortcutItems(updater(accountChallengeShortcutItemsRef.current), options);
  }, [commitAccountChallengeShortcutItems]);

  const visibleOwnedSeekResponse = React.useMemo(() => {
    const status = ownedSeekResponse?.summary.status;
    return status === "open" || status === "accepted" ? ownedSeekResponse : null;
  }, [ownedSeekResponse]);
  const closedOwnedSeekResponse = React.useMemo(() => {
    const status = ownedSeekResponse?.summary.status;
    return status === "cancelled" || status === "expired" ? ownedSeekResponse : null;
  }, [ownedSeekResponse]);
  const terminalOwnedSeekMessage =
    closedOwnedSeekResponse
      ? "Your previous lobby listing is closed and no longer public."
      : "";

  React.useEffect(() => {
    if (!account) {
      setPinnedFollowingDisplayNames(new Set());
      setFollowingNotes({});
      setEditingFollowingNoteKey(null);
      setFollowingNoteDraft("");
      return;
    }
    setPinnedFollowingDisplayNames(readPinnedFollowingDisplayNames(account.accountId));
    setFollowingNotes(readFollowingNotes(account.accountId));
    setEditingFollowingNoteKey(null);
    setFollowingNoteDraft("");
  }, [account?.accountId]);

  const handleClearRecentOnlineGames = React.useCallback(() => {
    setRecentClearMessage("Recent device replay list cleared.");
    onClearRecentOnlineGames?.();
    archiveTabButtonRef.current?.focus();
  }, [onClearRecentOnlineGames]);

  const markAccountChallengeActivityKnown = React.useCallback((items: OnlineAccountChallengeListItem[]) => {
    const nextKeys = new Set(knownAccountChallengeActivityKeysRef.current);
    for (const item of items) {
      const key = accountChallengeActivityKey(item);
      if (key) nextKeys.add(key);
    }
    knownAccountChallengeActivityKeysRef.current = nextKeys;
    if (items.length > 0) {
      accountChallengeActivityBaselineReadyRef.current = true;
    }
  }, []);

  const reconcileAccountChallengeActivity = React.useCallback((items: OnlineAccountChallengeListItem[]) => {
    const previousKeys = knownAccountChallengeActivityKeysRef.current;
    const nextKeys = new Set<string>();
    let incomingPending = 0;
    let acceptedReady = 0;
    for (const item of items) {
      const key = accountChallengeActivityKey(item);
      if (!key) continue;
      nextKeys.add(key);
      if (accountChallengeActivityBaselineReadyRef.current && !previousKeys.has(key)) {
        if (item.summary.status === "pending" && item.role === "challenged") {
          incomingPending += 1;
        } else if (item.summary.status === "accepted" && item.summary.gameId) {
          acceptedReady += 1;
        }
      }
    }
    knownAccountChallengeActivityKeysRef.current = nextKeys;
    accountChallengeActivityBaselineReadyRef.current = true;
    if (incomingPending > 0 || acceptedReady > 0) {
      setAccountChallengeUnreadActivity((current) => ({
        incomingPending: current.incomingPending + incomingPending,
        acceptedReady: current.acceptedReady + acceptedReady,
      }));
    }
  }, []);

  const clearAccountChallengeUnreadActivity = React.useCallback(() => {
    setAccountChallengeUnreadActivity(emptyAccountChallengeUnreadActivity());
  }, []);

  const refreshAccountChallenges = React.useCallback(async (options: { background?: boolean; state?: OnlineAccountChallengeFilter } = {}) => {
    if (!account || !loadAccountChallenges) return;
    if (accountChallengeLoadInFlightRef.current) return;
    if (Object.values(accountChallengeActionByIdRef.current).some((action) => action !== undefined)) return;
    const background = options.background === true;
    const requestedFilter = options.state ?? accountChallengeFilter;
    const requestId = ++accountChallengesRequestIdRef.current;
    accountChallengeLoadInFlightRef.current = true;
    if (!background) {
      setAccountChallengesStatus("loading");
    }
    try {
      const response = await loadAccountChallenges({ state: requestedFilter });
      if (requestId !== accountChallengesRequestIdRef.current) return;
      const staleCompletedPendingChallengeIds = new Set<string>();
      const filteredChallenges = response.challenges.filter((item) => {
        const isStaleCompletedPending =
          item.summary.status === "pending" &&
          completedAccountChallengeIdsRef.current.has(item.summary.challengeId);
        if (isStaleCompletedPending) {
          staleCompletedPendingChallengeIds.add(item.summary.challengeId);
          return false;
        }
        return true;
      });
      if (requestedFilter === "all") {
        reconcileAccountChallengeActivity(filteredChallenges);
      }
      const preservedStaleShortcutItems = accountChallengeShortcutItemsRef.current.filter((item) =>
        staleCompletedPendingChallengeIds.has(item.summary.challengeId)
      );
      const preservedStaleCompletedRows = accountChallengesRef.current.filter((item) =>
        staleCompletedPendingChallengeIds.has(item.summary.challengeId) &&
        item.role === "challenger" &&
        item.summary.status === "cancelled"
      );
      const nextShortcutItems =
        requestedFilter === "all"
          ? mergeAccountChallengeShortcutItems(preservedStaleShortcutItems, filteredChallenges)
          : mergeAccountChallengeShortcutItems(accountChallengeShortcutItemsRef.current, filteredChallenges);
      const nextChallenges =
        requestedFilter === "all"
          ? mergeAccountChallengeRowsWithShortcuts(
              filteredChallenges,
              [...preservedStaleShortcutItems, ...preservedStaleCompletedRows]
            )
          : filteredChallenges;
      const visibleChallenges = visibleAccountChallengesForFilter(nextChallenges, accountChallengeFilter);
      accountChallengesRef.current = visibleChallenges;
      setAccountChallenges(visibleChallenges);
      commitAccountChallengeShortcutItems(nextShortcutItems, { notifyNavigation: requestedFilter === "all" });
      setAccountChallengesStatus("ready");
    } catch (error) {
      if (requestId !== accountChallengesRequestIdRef.current) return;
      if (isRateLimitError(error)) {
        accountChallengeAutoRefreshPausedUntilRef.current = Date.now() + LOBBY_RATE_LIMIT_BACKOFF_MS;
      }
      if (!background) {
        console.error("[OnlineGameBrowser] Failed to load account challenges", error);
        accountChallengesRef.current = [];
        setAccountChallenges([]);
        updateAccountChallengeShortcutItems(pruneAccountChallengeShortcutItemsAfterLoadError);
        setAccountChallengesStatus("error");
      }
    } finally {
      if (requestId === accountChallengesRequestIdRef.current) {
        accountChallengeLoadInFlightRef.current = false;
      }
    }
  }, [
    account?.accountId,
    accountChallengeFilter,
    commitAccountChallengeShortcutItems,
    loadAccountChallenges,
    reconcileAccountChallengeActivity,
    updateAccountChallengeShortcutItems,
  ]);

  const runAccountChallengeAction = React.useCallback(async (
    item: OnlineAccountChallengeListItem,
    action: "accept" | "decline" | "cancel"
  ) => {
    const challengeId = item.summary.challengeId;
    const handler =
      action === "accept"
        ? onAcceptAccountChallenge
        : action === "decline"
          ? onDeclineAccountChallenge
          : onCancelAccountChallenge;
    if (!handler) return;
    setSocialMessage("");
    setAccountChallengeActionById((current) => ({ ...current, [challengeId]: action }));
    try {
      const response = await handler(challengeId);
      if (response.summary.status !== "pending") {
        completedAccountChallengeIdsRef.current.add(challengeId);
      }
      markAccountChallengeActivityKnown([{ role: response.role, summary: response.summary }]);
      setAccountChallenges((current) => {
        const next = current
          .map((candidate) =>
            candidate.summary.challengeId === challengeId
              ? { role: response.role, summary: response.summary }
              : candidate
          )
          .filter((candidate) =>
            accountChallengeFilter === "all" || candidate.summary.status === "pending"
          );
        accountChallengesRef.current = next;
        return next;
      });
      updateAccountChallengeShortcutItems(
        (current) =>
          updateAccountChallengeShortcutItem(current, { role: response.role, summary: response.summary }),
        { notifyNavigation: true }
      );
      setAccountChallengesStatus("ready");
      setSocialMessage(
        action === "accept"
          ? "Challenge accepted."
          : action === "decline"
            ? "Challenge declined."
            : "Challenge cancelled."
      );
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to update account challenge", error);
      setSocialMessage(
        onlineRequestErrorMessage(error) ??
          (action === "accept"
            ? "Could not accept that challenge."
            : action === "decline"
              ? "Could not decline that challenge."
              : "Could not cancel that challenge.")
      );
    } finally {
      setAccountChallengeActionById((current) => {
        const next = { ...current };
        delete next[challengeId];
        return next;
      });
    }
  }, [
    accountChallengeFilter,
    markAccountChallengeActivityKnown,
    onAcceptAccountChallenge,
    onCancelAccountChallenge,
    onDeclineAccountChallenge,
    updateAccountChallengeShortcutItems,
  ]);

  const handleAccountChallengeFilterChange = React.useCallback((nextFilter: OnlineAccountChallengeFilter) => {
    if (nextFilter === accountChallengeFilter) return;
    accountChallengesRequestIdRef.current += 1;
    accountChallengeLoadInFlightRef.current = false;
    accountChallengesRef.current = [];
    setAccountChallenges([]);
    setAccountChallengesStatus(canUseAccountChallenges ? "loading" : "idle");
    setAccountChallengeFilter(nextFilter);
  }, [accountChallengeFilter, canUseAccountChallenges]);

  const refreshFollowingProfiles = React.useCallback(async (options: { quiet?: boolean; background?: boolean } = {}) => {
    if (!account || !loadAccountFollowing) return;
    if (followingLoadInFlightRef.current) return;
    const background = options.background === true;
    const requestId = ++accountFollowingRequestIdRef.current;
    followingLoadInFlightRef.current = true;
    if (!options.quiet && !background) {
      setFollowingStatus("loading");
      setSocialAction("refresh");
    }
    try {
      const response = await loadAccountFollowing();
      if (requestId !== accountFollowingRequestIdRef.current) return;
      setFollowingProfiles([...response.following].sort(compareProfilesByPresence));
      setFollowingStatus("ready");
    } catch (error) {
      if (requestId !== accountFollowingRequestIdRef.current) return;
      if (isRateLimitError(error)) {
        followingAutoRefreshPausedUntilRef.current = Date.now() + LOBBY_RATE_LIMIT_BACKOFF_MS;
      }
      if (!background) {
        console.error("[OnlineGameBrowser] Failed to load followed accounts", error);
        setFollowingProfiles([]);
        setFollowingStatus("error");
      }
    } finally {
      if (requestId === accountFollowingRequestIdRef.current) {
        followingLoadInFlightRef.current = false;
        if (!options.quiet && !background) {
          setSocialAction(undefined);
        }
      }
    }
  }, [account?.accountId, loadAccountFollowing]);

  const refreshRatingLeaderboard = React.useCallback(async () => {
    if (!account || !loadRatingLeaderboard) return;
    const requestId = ++ratingLeaderboardRequestIdRef.current;
    const scope = ratingLeaderboardScope;
    setRatingLeaderboardStatus("loading");
    try {
      const response = await loadRatingLeaderboard({ limit: 10, scope });
      if (requestId !== ratingLeaderboardRequestIdRef.current) return;
      if (response.scope !== scope) {
        throw new Error("Rating leaderboard response scope did not match the request.");
      }
      setRatingLeaderboardEntries(response.entries);
      setRatingLeaderboardStatus("ready");
    } catch (error) {
      if (requestId !== ratingLeaderboardRequestIdRef.current) return;
      console.error("[OnlineGameBrowser] Failed to load rating leaderboard", error);
      setRatingLeaderboardEntries([]);
      setRatingLeaderboardStatus("error");
    }
  }, [account?.accountId, loadRatingLeaderboard, ratingLeaderboardScope]);

  React.useEffect(() => {
    ratingLeaderboardRequestIdRef.current += 1;
    setRatingLeaderboardEntries([]);
    setRatingLeaderboardStatus(account && loadRatingLeaderboard ? "loading" : "idle");
    if (!account || !loadRatingLeaderboard) return;
    void refreshRatingLeaderboard();
  }, [account?.accountId, loadRatingLeaderboard, ratingLeaderboardScope, refreshRatingLeaderboard]);

  React.useEffect(() => {
    accountFollowingRequestIdRef.current += 1;
    socialLookupRequestIdRef.current += 1;
    socialSearchRequestIdRef.current += 1;
    socialMutationRequestIdRef.current += 1;
    followingLoadInFlightRef.current = false;
    followingAutoRefreshPausedUntilRef.current = 0;
    setSocialLookupName("");
    setSocialProfile(null);
    setSocialLookupStatus("idle");
    setSocialSearchResults([]);
    setSocialSearchStatus("idle");
    setSocialMessage("");
    setSocialAction(undefined);
    setReportTargetDisplayName("");
    setReportReason("abuse");
    setReportDetails("");
    setFollowingProfiles([]);
    setFollowingStatus(canUseAccountSocial ? "loading" : "idle");
    if (!canUseAccountSocial) return;
    void refreshFollowingProfiles({ quiet: true });
  }, [account?.accountId, canUseAccountSocial, refreshFollowingProfiles]);

  React.useEffect(() => {
    if (!canUseAccountSocial) return;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() < followingAutoRefreshPausedUntilRef.current) return;
      void refreshFollowingProfiles({ background: true });
    };
    const interval = window.setInterval(refreshIfVisible, FOLLOWING_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canUseAccountSocial, refreshFollowingProfiles]);

  React.useEffect(() => {
    accountChallengesRequestIdRef.current += 1;
    accountChallengeLoadInFlightRef.current = false;
    accountChallengeAutoRefreshPausedUntilRef.current = 0;
    completedAccountChallengeIdsRef.current.clear();
    knownAccountChallengeActivityKeysRef.current.clear();
    accountChallengeActivityBaselineReadyRef.current = false;
    accountChallengesRef.current = [];
    setAccountChallenges([]);
    accountChallengeShortcutItemsRef.current = [];
    setAccountChallengeShortcutItems([]);
    setAccountChallengeActionById({});
    setAccountChallengeFilter("all");
    setAccountChallengeUnreadActivity(emptyAccountChallengeUnreadActivity());
    setAccountChallengesStatus("idle");
  }, [account?.accountId, canUseAccountChallenges]);

  React.useEffect(() => {
    if (!canUseAccountChallenges) return;
    void refreshAccountChallenges();
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() < accountChallengeAutoRefreshPausedUntilRef.current) return;
      void refreshAccountChallenges({ background: true, state: "all" });
    };
    const interval = window.setInterval(refreshIfVisible, ACCOUNT_CHALLENGE_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canUseAccountChallenges, refreshAccountChallenges]);

  React.useEffect(() => {
    if (canUseAccountSocial) return;
    setFriendFilter("all");
  }, [canUseAccountSocial]);

  React.useEffect(() => {
    setFriendFilter("all");
  }, [account?.accountId]);

  React.useEffect(() => {
    if (quickMatchStatus !== "waiting") return;
    if (!visibleOwnedSeekResponse?.summary) return;
    ownedSeekPanelRef.current?.focus();
  }, [visibleOwnedSeekResponse?.summary, quickMatchStatus]);

  React.useEffect(() => {
    if (!closedOwnedSeekResponse?.summary) return;
    closedOwnedSeekPanelRef.current?.focus();
  }, [closedOwnedSeekResponse?.summary]);

  React.useEffect(() => {
    const status = ownedSeekResponse?.summary.status;
    if (!status || status === "open") return;
    if (quickMatchStatus === "waiting") {
      setQuickMatchStatus("idle");
    }
    setSeekActionMessage((current) =>
      current ||
      (status === "accepted"
        ? "Your lobby listing was accepted. Join the game from your lobby panel."
        : "Your previous lobby listing is closed and no longer public.")
    );
  }, [ownedSeekResponse?.summary.status, quickMatchStatus]);

  const directoryState = tab === "archive" ? "archived" : "active";

  React.useEffect(() => {
    if (tab === "watch" && resultFilter !== "all") {
      setResultFilter("all");
    }
  }, [resultFilter, tab]);

  React.useEffect(() => {
    if (tab === "archive" && sort === "watchers") {
      setSort("newest");
    }
  }, [sort, tab]);

  React.useEffect(() => {
    if (tab === "lobby") {
      setDebouncedGameQuery("");
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setDebouncedGameQuery(normalizeOnlineGameDirectorySearchQuery(query) ?? query.trim());
    }, GAME_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query, tab]);

  const gameDirectoryOptions = React.useMemo<FetchOnlineGameSummariesOptions>(() => ({
    state: directoryState,
    limit: 50,
    ...(timeFilter !== "all" ? { clock: timeFilter } : {}),
    ...(ratingFilter !== "all" && tab !== "lobby" ? { rating: ratingFilter } : {}),
    ...(tab === "archive" && resultFilter !== "all" ? { result: resultFilter } : {}),
    ...(debouncedGameQuery !== "" && tab !== "lobby" ? { query: debouncedGameQuery } : {}),
  }), [debouncedGameQuery, directoryState, ratingFilter, resultFilter, tab, timeFilter]);

  const accountGameDirectoryOptions = React.useMemo<FetchOnlineAccountGamesOptions>(() => ({
    state: "all",
    limit: 50,
    ...(timeFilter !== "all" ? { clock: timeFilter } : {}),
    ...(ratingFilter !== "all" ? { rating: ratingFilter } : {}),
    ...(resultFilter !== "all" ? { result: resultFilter } : {}),
    ...(debouncedGameQuery !== "" ? { query: debouncedGameQuery } : {}),
  }), [debouncedGameQuery, ratingFilter, resultFilter, timeFilter]);

  const loadPage = React.useCallback(async (
    mode: "replace" | "append",
    cursor?: string,
    options: { background?: boolean } = {}
  ) => {
    const background = options.background === true;
    if (background && gameLoadInFlightRef.current) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    gameLoadInFlightRef.current = true;
    if (mode === "replace" && !background) {
      setStatus("loading");
    } else if (mode === "append") {
      setIsLoadingMore(true);
    }
    if (!background) {
      setCopyMessage("");
      setRecentClearMessage("");
    }
    try {
      const response = await loadGames({
        ...gameDirectoryOptions,
        cursor,
      });
      if (requestIdRef.current !== requestId) return;
      if (!response || !Array.isArray(response.games)) {
        throw new Error("Public game directory response was malformed.");
      }
      const loadedGames = response.games;
      setGames((current) => mode === "append" ? [...current, ...loadedGames] : loadedGames);
      setLoadedGameQuery(gameDirectoryOptions.query ?? "");
      setNextCursor(response.nextCursor);
      setStatus("ready");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      console.error("[OnlineGameBrowser] Failed to load public games", error);
      if (mode === "replace" && !background) {
        setGames([]);
        setNextCursor(undefined);
      }
      if (!background) {
        setStatus("error");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoadingMore(false);
        gameLoadInFlightRef.current = false;
      }
    }
  }, [gameDirectoryOptions, loadGames]);

  const refreshGames = React.useCallback(() => {
    void loadPage("replace");
  }, [loadPage]);

  const loadMoreGames = React.useCallback(() => {
    if (!nextCursor) return;
    void loadPage("append", nextCursor);
  }, [loadPage, nextCursor]);

  React.useEffect(() => {
    refreshGames();
  }, [refreshGames]);

  React.useEffect(() => {
    if (tab !== "lobby") return;
    const refreshLiveGamesIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadPage("replace", undefined, { background: true });
    };
    const interval = window.setInterval(refreshLiveGamesIfVisible, LOBBY_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshLiveGamesIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadPage, tab]);

  React.useEffect(() => {
    if (tab !== "watch") return;
    const refreshWatchIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadPage("replace", undefined, { background: true });
    };
    const interval = window.setInterval(refreshWatchIfVisible, LOBBY_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshWatchIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadPage, tab]);

  const seekDirectoryOptions = React.useMemo<FetchOpenSeekDirectoryOptions>(() => ({
    state: "open",
    limit: 50,
    ...(seekSideFilter !== "all" ? { creatorSeat: seekSideFilter } : {}),
    ...(seekClockFilter !== "all" ? { clock: seekClockFilter } : {}),
    ...(seekVpFilter !== "all" ? { vp: seekVpFilter } : {}),
    ...(seekRatingFilter !== "all" ? { rating: seekRatingFilter } : {}),
  }), [seekClockFilter, seekRatingFilter, seekSideFilter, seekVpFilter]);
  const seekDirectoryOptionsRef = React.useRef(seekDirectoryOptions);

  React.useEffect(() => {
    seekDirectoryOptionsRef.current = seekDirectoryOptions;
  }, [seekDirectoryOptions]);

  const mergePendingOpenSeeks = React.useCallback((
    nextSeeks: OpenSeekSummary[],
    currentSeeks: OpenSeekSummary[]
  ): OpenSeekSummary[] => {
    const pendingIds = new Set(
      Object.entries(seekActionByIdRef.current)
        .filter(([, action]) => action !== undefined)
        .map(([seekId]) => seekId)
    );
    if (pendingIds.size === 0) return nextSeeks;
    const nextIds = new Set(nextSeeks.map((seek) => seek.seekId));
    const pendingSeeks = currentSeeks.filter(
      (seek) => pendingIds.has(seek.seekId) && !nextIds.has(seek.seekId)
    );
    return [...nextSeeks, ...pendingSeeks].sort(compareOpenSeekNewest);
  }, []);

  const loadOpenSeekPage = React.useCallback(async function runOpenSeekLoad(
    options: { background?: boolean; mode?: "replace" | "append"; cursor?: string } = {}
  ) {
    const background = options.background === true;
    const mode = options.mode ?? "replace";
    if (seekLoadInFlightRef.current) {
      if (mode === "append") return;
      if (!background) {
        queuedSeekLoadRef.current = "foreground";
      } else if (!queuedSeekLoadRef.current) {
        queuedSeekLoadRef.current = "background";
      }
      return;
    }
    seekLoadInFlightRef.current = true;
    setIsSeekLoadInFlight(true);
    const requestId = seekRequestIdRef.current + 1;
    seekRequestIdRef.current = requestId;
    if (mode === "append") {
      setIsSeekLoadingMore(true);
    } else if (!background) {
      setSeekStatus("loading");
      setSeekActionMessage("");
      setQuickMatchStatus("idle");
    }
    try {
      const response = await loadOpenSeeks({
        ...seekDirectoryOptionsRef.current,
        ...(options.cursor ? { cursor: options.cursor } : {}),
      });
      if (seekRequestIdRef.current !== requestId) return;
      setOpenSeeks((current) => {
        const nextSeeks = mode === "append"
          ? mergeOpenSeekSummaries(current, response.seeks)
          : response.seeks;
        return mergePendingOpenSeeks(nextSeeks, current);
      });
      setSeekNextCursor(response.nextCursor);
      setLastSeekCheckedAt(formatLastChecked(new Date()));
      setSeekStatus("ready");
      setSeekActionMessage((current) =>
        current === AUTO_REFRESH_PAUSED_MESSAGE || current === "Could not load more lobby listings." ? "" : current
      );
    } catch (error) {
      if (seekRequestIdRef.current !== requestId) return;
      console.error("[OnlineGameBrowser] Failed to load open seeks", error);
      if (isRateLimitError(error)) {
        seekAutoRefreshPausedUntilRef.current = Date.now() + LOBBY_RATE_LIMIT_BACKOFF_MS;
      }
      if (mode === "replace" && !background) {
        setOpenSeeks([]);
        setSeekNextCursor(undefined);
        setSeekStatus("error");
      } else if (mode === "append") {
        setSeekActionMessage("Could not load more lobby listings.");
      } else if (isRateLimitError(error)) {
        setSeekActionMessage(AUTO_REFRESH_PAUSED_MESSAGE);
      }
    } finally {
      seekLoadInFlightRef.current = false;
      const queuedLoad = queuedSeekLoadRef.current;
      queuedSeekLoadRef.current = undefined;
      if (queuedLoad) {
        void loadOpenSeekPage({ background: queuedLoad === "background" });
      } else {
        setIsSeekLoadInFlight(false);
      }
      if (requestId === seekRequestIdRef.current) {
        setIsSeekLoadingMore(false);
      }
    }
  }, [loadOpenSeeks, mergePendingOpenSeeks]);

  React.useEffect(() => {
    if (tab !== "lobby") return;
    void loadOpenSeekPage({ background: false });
  }, [loadOpenSeekPage, seekDirectoryOptions, tab]);

  const loadMoreOpenSeeks = React.useCallback(() => {
    if (!seekNextCursor) return;
    void loadOpenSeekPage({ mode: "append", cursor: seekNextCursor });
  }, [loadOpenSeekPage, seekNextCursor]);

  React.useEffect(() => {
    if (tab !== "lobby") return;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() < seekAutoRefreshPausedUntilRef.current) return;
      void loadOpenSeekPage({ background: true });
    };
    const interval = window.setInterval(refreshIfVisible, LOBBY_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadOpenSeekPage, tab]);

  const publicGames = React.useMemo(
    () => games.filter((game) => game.visibility === "public"),
    [games]
  );

  const publicActiveGames = React.useMemo(() => {
    return publicGames
      .filter((game) => game.status === "active")
      .sort(compareMostMoves);
  }, [publicGames]);
  const followedDisplayNames = React.useMemo(
    () => new Set(followingProfiles.map((profile) => normalizeDisplayNameKey(profile.displayName))),
    [followingProfiles]
  );
  const followingProfileByDisplayName = React.useMemo(() => {
    const profiles = new Map<string, OnlineAccountPublicProfile>();
    for (const profile of followingProfiles) {
      profiles.set(normalizeDisplayNameKey(profile.displayName), profile);
    }
    return profiles;
  }, [followingProfiles]);
  const sortedFollowingProfiles = React.useMemo(
    () => [...followingProfiles].sort((left, right) =>
      compareProfilesByPinnedPresence(pinnedFollowingDisplayNames, left, right)
    ),
    [followingProfiles, pinnedFollowingDisplayNames]
  );
  const onlineFollowingProfiles = React.useMemo(
    () => sortedFollowingProfiles.filter(isProfileOnline),
    [sortedFollowingProfiles]
  );
  const onlineNowRailProfiles = React.useMemo(
    () => onlineFollowingProfiles.slice(0, 6),
    [onlineFollowingProfiles]
  );
  const visibleFollowingProfiles = followingPresenceFilter === "online" ? onlineFollowingProfiles : sortedFollowingProfiles;
  const friendFilterActive = canUseAccountSocial && friendFilter === "followed";
  const friendFilterUnavailable = friendFilterActive && followingStatus !== "ready";
  const filteredPublicActiveGames = React.useMemo(() => {
    if (!friendFilterActive) return publicActiveGames;
    return publicActiveGames.filter((game) => gameHasFollowedParticipant(game, followedDisplayNames));
  }, [followedDisplayNames, friendFilterActive, publicActiveGames]);
  const accountChallengeByOpponentDisplayName = React.useMemo(() => {
    const challengeRowPriority = (item: OnlineAccountChallengeListItem): number => {
      if (item.summary.status === "pending" && item.role === "challenged") return 0;
      if (item.summary.status === "pending" && item.role === "challenger") return 1;
      if (item.summary.status === "accepted" && item.summary.gameId) return 2;
      return 3;
    };
    const challenges = new Map<string, OnlineAccountChallengeListItem>();
    for (const item of accountChallengeShortcutItems) {
      const itemPriority = challengeRowPriority(item);
      if (itemPriority > 2) continue;
      const key = normalizeDisplayNameKey(challengeOpponentName(item));
      const existing = challenges.get(key);
      if (!existing || itemPriority < challengeRowPriority(existing)) {
        challenges.set(key, item);
      }
    }
    return challenges;
  }, [accountChallengeShortcutItems]);
  const pendingIncomingChallengeCount = React.useMemo(
    () => accountChallenges.filter((item) => item.summary.status === "pending" && item.role === "challenged").length,
    [accountChallenges]
  );
  const pendingOutgoingChallengeCount = React.useMemo(
    () => accountChallenges.filter((item) => item.summary.status === "pending" && item.role === "challenger").length,
    [accountChallenges]
  );
  const hasPendingChallengeNotice = pendingIncomingChallengeCount > 0 || pendingOutgoingChallengeCount > 0;
  const unreadChallengeActivityCount =
    accountChallengeUnreadActivity.incomingPending + accountChallengeUnreadActivity.acceptedReady;
  const hasUnreadChallengeActivity = unreadChallengeActivityCount > 0;
  const hasChallengeNotice = hasPendingChallengeNotice || hasUnreadChallengeActivity;
  const liveGameByFollowedDisplayName = React.useMemo(() => {
    const liveGames = new Map<string, OnlineGameSummary>();
    for (const game of publicActiveGames) {
      for (const participant of game.participants) {
        const displayName = identityDisplayName(participant.identity);
        if (!displayName) continue;
        const key = normalizeDisplayNameKey(displayName);
        if (!followedDisplayNames.has(key) || liveGames.has(key)) continue;
        liveGames.set(key, game);
      }
    }
    return liveGames;
  }, [followedDisplayNames, publicActiveGames]);
  const watchFollowedLiveItems = React.useMemo<Array<{ profile: OnlineAccountPublicProfile; game: OnlineGameSummary }>>(() => {
    const seenGameIds = new Set<string>();
    const items: Array<{ profile: OnlineAccountPublicProfile; game: OnlineGameSummary }> = [];
    for (const profile of onlineFollowingProfiles) {
      if (profile.relationship.blocked || profile.relationship.self) continue;
      const game = liveGameByFollowedDisplayName.get(normalizeDisplayNameKey(profile.displayName));
      if (!game || seenGameIds.has(game.gameId)) continue;
      seenGameIds.add(game.gameId);
      items.push({ profile, game });
    }
    return items;
  }, [liveGameByFollowedDisplayName, onlineFollowingProfiles]);
  const visibleWatchFollowedLiveItems = React.useMemo(
    () => watchFollowedLiveItems.slice(0, WATCH_FOLLOWED_LIVE_LIMIT),
    [watchFollowedLiveItems]
  );
  const liveGameByRegisteredDisplayName = React.useMemo(() => {
    const liveGames = new Map<string, OnlineGameSummary>();
    for (const game of publicActiveGames) {
      for (const participant of game.participants) {
        const displayName = identityDisplayName(participant.identity);
        if (!displayName) continue;
        const key = normalizeDisplayNameKey(displayName);
        if (liveGames.has(key)) continue;
        liveGames.set(key, game);
      }
    }
    return liveGames;
  }, [publicActiveGames]);

  const activeHeadToHeadDisplayName = React.useMemo(() => {
    const displayName = headToHeadDisplayName.trim();
    if (!displayName) return "";
    return normalizeDisplayNameKey(displayName) === normalizeDisplayNameKey(query) ? displayName : "";
  }, [headToHeadDisplayName, query]);

  const visibleGames = React.useMemo(() => {
    const normalizedQuery = normalizeOnlineGameDirectorySearchQuery(query) ?? query.trim().toLowerCase();
    const shouldApplyLocalQueryFilter =
      normalizedQuery !== "" &&
      (normalizedQuery !== loadedGameQuery || (tab === "archive" && activeHeadToHeadDisplayName !== ""));
    const filtered = publicGames.filter((game) => {
      const tabMatches =
        tab === "watch"
          ? game.status === "active"
          : game.status === "complete" && game.archiveState === "archived";
      if (!tabMatches) return false;
      if (timeFilter === "timed" && !game.hasTimeControl) return false;
      if (timeFilter === "casual" && game.hasTimeControl) return false;
      if (!matchesRatingFilter(game, ratingFilter)) return false;
      if (tab === "archive" && !matchesResultFilter(game, resultFilter)) return false;
      if (friendFilterActive && !gameHasFollowedParticipant(game, followedDisplayNames)) return false;
      return !shouldApplyLocalQueryFilter || onlineGameSummaryDirectorySearchText(game).includes(normalizedQuery);
    });
    return filtered.sort(
      sort === "watchers" && tab === "watch"
        ? compareMostWatchedNow
        : sort === "moves"
          ? compareMostMoves
          : compareNewest
    );
  }, [activeHeadToHeadDisplayName, followedDisplayNames, friendFilterActive, loadedGameQuery, publicGames, query, ratingFilter, resultFilter, sort, tab, timeFilter]);

  const lobbyLiveGames = React.useMemo(() => {
    return filteredPublicActiveGames.slice(0, 5);
  }, [filteredPublicActiveGames]);
  const shouldShowLobbyLiveSection =
    status === "loading" || status === "error" || lobbyLiveGames.length > 0;

  const watchFeaturedGame = React.useMemo(() => {
    if (tab !== "watch" || visibleGames.length === 0) return null;
    return [...visibleGames].sort(sort === "watchers" ? compareMostWatchedNow : compareMostMoves)[0] ?? null;
  }, [sort, tab, visibleGames]);

  const watchSecondaryGames = React.useMemo(() => {
    if (tab !== "watch" || !watchFeaturedGame) return [];
    return visibleGames.filter((game) => game.gameId !== watchFeaturedGame.gameId);
  }, [tab, visibleGames, watchFeaturedGame]);

  const watchFeaturedReason =
    sort === "watchers" && watchFeaturedGame && spectatorCountValue(watchFeaturedGame) > 0
      ? "watchers"
      : "moves";

  const recentArchivedGames = React.useMemo(() => {
    if (tab !== "archive") return [];
    if (account && accountGamesStatus !== "ready") return [];
    if (timeFilter !== "all" || ratingFilter !== "all" || resultFilter !== "all") return [];
    if (friendFilterActive) return [];
    const excludedGameIds = new Set([
      ...publicGames.map((game) => game.gameId),
      ...accountGames.map((game) => game.gameId),
    ]);
    const normalizedQuery = normalizeOnlineGameDirectorySearchQuery(query) ?? query.trim().toLowerCase();
    return recentOnlineGames
      .filter((game) => game.status === "complete")
      .filter((game) => !excludedGameIds.has(game.gameId))
      .filter((game) => !normalizedQuery || recentOnlineGameSearchText(game).includes(normalizedQuery))
      .slice(0, 6);
  }, [account, accountGames, accountGamesStatus, friendFilterActive, publicGames, query, ratingFilter, recentOnlineGames, resultFilter, tab, timeFilter]);

  React.useEffect(() => {
    if (tab !== "archive" || !account || !loadAccountGames) {
      setAccountGames([]);
      setAccountGamesStatus("idle");
      return;
    }

    const requestId = ++accountGamesRequestIdRef.current;
    setAccountGamesStatus("loading");
    loadAccountGames(accountGameDirectoryOptions)
      .then((response) => {
        if (requestId !== accountGamesRequestIdRef.current) return;
        setAccountGames(response.games);
        setAccountGamesStatus("ready");
      })
      .catch(() => {
        if (requestId !== accountGamesRequestIdRef.current) return;
        setAccountGamesStatus("error");
      });

    return () => {
      accountGamesRequestIdRef.current += 1;
    };
  }, [account?.accountId, accountGameDirectoryOptions, loadAccountGames, tab]);

  const loadHeadToHeadPage = React.useCallback(async (mode: "replace" | "append", cursor?: string) => {
    if (!account || !loadAccountHeadToHeadGames || !activeHeadToHeadDisplayName) return;
    const requestId = ++headToHeadGamesRequestIdRef.current;
    if (mode === "replace") {
      setHeadToHeadGamesStatus("loading");
      setHeadToHeadNextCursor(undefined);
    } else {
      setIsHeadToHeadLoadingMore(true);
    }
    setHeadToHeadMessage("");
    try {
      const response = await loadAccountHeadToHeadGames(activeHeadToHeadDisplayName, {
        limit: HEAD_TO_HEAD_HISTORY_PAGE_LIMIT,
        cursor,
      });
      if (requestId !== headToHeadGamesRequestIdRef.current) return;
      setHeadToHeadGames((current) => {
        if (mode === "replace") return response.games;
        const seen = new Set(current.map((game) => game.gameId));
        return [
          ...current,
          ...response.games.filter((game) => {
            if (seen.has(game.gameId)) return false;
            seen.add(game.gameId);
            return true;
          }),
        ];
      });
      setHeadToHeadNextCursor(response.nextCursor);
      setHeadToHeadGamesStatus("ready");
    } catch (error) {
      if (requestId !== headToHeadGamesRequestIdRef.current) return;
      console.error("[OnlineGameBrowser] Failed to load head-to-head games", error);
      if (mode === "replace") {
        setHeadToHeadGames([]);
        setHeadToHeadNextCursor(undefined);
        setHeadToHeadGamesStatus("error");
        setHeadToHeadMessage("Could not load head-to-head games.");
      } else {
        setHeadToHeadMessage("Could not load more head-to-head games.");
      }
    } finally {
      if (requestId === headToHeadGamesRequestIdRef.current) {
        setIsHeadToHeadLoadingMore(false);
      }
    }
  }, [account, activeHeadToHeadDisplayName, loadAccountHeadToHeadGames]);

  React.useEffect(() => {
    if (tab !== "archive" || !account || !loadAccountHeadToHeadGames || !activeHeadToHeadDisplayName) {
      headToHeadGamesRequestIdRef.current += 1;
      setHeadToHeadGames([]);
      setHeadToHeadNextCursor(undefined);
      setHeadToHeadGamesStatus("idle");
      setHeadToHeadMessage("");
      setIsHeadToHeadLoadingMore(false);
      return;
    }

    void loadHeadToHeadPage("replace");

    return () => {
      headToHeadGamesRequestIdRef.current += 1;
    };
  }, [account, activeHeadToHeadDisplayName, loadAccountHeadToHeadGames, loadHeadToHeadPage, tab]);

  const loadMoreHeadToHeadGames = React.useCallback(() => {
    if (!headToHeadNextCursor || isHeadToHeadLoadingMore) return;
    void loadHeadToHeadPage("append", headToHeadNextCursor);
  }, [headToHeadNextCursor, isHeadToHeadLoadingMore, loadHeadToHeadPage]);

  const accountActiveGames = React.useMemo(() => {
    if (tab !== "archive") return [];
    const normalizedQuery = normalizeOnlineGameDirectorySearchQuery(query) ?? query.trim().toLowerCase();
    return accountGames
      .filter((game) => game.status === "active" && game.archiveState === "active")
      .filter((game) => timeFilter !== "timed" || game.hasTimeControl)
      .filter((game) => timeFilter !== "casual" || !game.hasTimeControl)
      .filter((game) => matchesRatingFilter(game, ratingFilter))
      .filter(() => resultFilter === "all")
      .filter((game) => !friendFilterActive || gameHasFollowedParticipant(game, followedDisplayNames))
      .filter((game) => !normalizedQuery || onlineGameSummaryDirectorySearchText(game).includes(normalizedQuery))
      .sort(compareNewest)
      .slice(0, 8);
  }, [accountGames, followedDisplayNames, friendFilterActive, query, ratingFilter, resultFilter, tab, timeFilter]);

  const accountArchivedGames = React.useMemo(() => {
    if (tab !== "archive") return [];
    const publicGameIds = new Set(publicGames.map((game) => game.gameId));
    const normalizedQuery = normalizeOnlineGameDirectorySearchQuery(query) ?? query.trim().toLowerCase();
    return accountGames
      .filter((game) => game.status === "complete" && game.archiveState === "archived")
      .filter((game) => !publicGameIds.has(game.gameId))
      .filter((game) => timeFilter !== "timed" || game.hasTimeControl)
      .filter((game) => timeFilter !== "casual" || !game.hasTimeControl)
      .filter((game) => matchesRatingFilter(game, ratingFilter))
      .filter((game) => matchesResultFilter(game, resultFilter))
      .filter((game) => !friendFilterActive || gameHasFollowedParticipant(game, followedDisplayNames))
      .filter((game) => !normalizedQuery || onlineGameSummaryDirectorySearchText(game).includes(normalizedQuery))
      .sort(sort === "moves" ? compareMostMoves : compareNewest)
      .slice(0, 12);
  }, [accountGames, followedDisplayNames, friendFilterActive, publicGames, query, ratingFilter, resultFilter, sort, tab, timeFilter]);

  const accountFollowedOpponentItems = React.useMemo<AccountFollowedOpponentSummary[]>(() => {
    if (
      tab !== "archive" ||
      !account ||
      !canUseAccountSocial ||
      followingStatus !== "ready" ||
      accountGamesStatus !== "ready"
    ) {
      return [];
    }
    const items = new Map<string, AccountFollowedOpponentSummary>();
    for (const game of accountGames) {
      for (const opponentDisplayName of accountOpponentProfileNames(game, account)) {
        const key = normalizeDisplayNameKey(opponentDisplayName);
        if (!followedDisplayNames.has(key)) continue;
        const canonicalProfile = followingProfileByDisplayName.get(key);
        const current = items.get(key);
        const isActive = game.status === "active" && game.archiveState === "active";
        const isCompleted = game.status === "complete" && game.archiveState === "archived";
        if (!current) {
          items.set(key, {
            displayName: canonicalProfile?.displayName ?? opponentDisplayName,
            gameCount: 1,
            activeCount: isActive ? 1 : 0,
            completedCount: isCompleted ? 1 : 0,
            latestGame: game,
          });
          continue;
        }
        current.gameCount += 1;
        current.activeCount += isActive ? 1 : 0;
        current.completedCount += isCompleted ? 1 : 0;
        if (compareNewest(game, current.latestGame) < 0) {
          current.latestGame = game;
        }
      }
    }
    return [...items.values()]
      .sort((left, right) => {
        if (left.activeCount !== right.activeCount) return right.activeCount - left.activeCount;
        if (left.gameCount !== right.gameCount) return right.gameCount - left.gameCount;
        const latestComparison = compareNewest(left.latestGame, right.latestGame);
        if (latestComparison !== 0) return latestComparison;
        return left.displayName.localeCompare(right.displayName);
      });
  }, [
    account,
    accountGames,
    accountGamesStatus,
    canUseAccountSocial,
    followedDisplayNames,
    followingProfileByDisplayName,
    followingStatus,
    tab,
  ]);
  const visibleAccountFollowedOpponentItems = React.useMemo(
    () => accountFollowedOpponentItems.slice(0, ACCOUNT_FOLLOWED_OPPONENT_LIMIT),
    [accountFollowedOpponentItems]
  );

  const accountHeadToHeadSummary = React.useMemo<AccountHeadToHeadSummary | null>(() => {
    const hasDedicatedHeadToHeadGames =
      !!activeHeadToHeadDisplayName && headToHeadGamesStatus === "ready";
    if (
      tab !== "archive" ||
      !account ||
      (!hasDedicatedHeadToHeadGames && accountGamesStatus !== "ready")
    ) {
      return null;
    }
    const opponentKey = normalizeDisplayNameKey(query);
    if (!opponentKey) return null;
    const sourceGames = hasDedicatedHeadToHeadGames ? headToHeadGames : accountGames;
    const games: OnlineGameSummary[] = [];
    let opponentDisplayName = query.trim();
    let accountWins = 0;
    let opponentWins = 0;
    for (const game of sourceGames) {
      const match = accountCompletedGameForOpponent(game, account, opponentKey);
      if (!match) continue;
      opponentDisplayName = match.opponentDisplayName;
      games.push(game);
      if (game.result?.winner === match.accountSeat) {
        accountWins += 1;
      } else {
        opponentWins += 1;
      }
    }
    if (games.length === 0) return null;
    const [latestGame] = [...games].sort(compareLatestCompletedGame);
    return { opponentDisplayName, games, accountWins, opponentWins, latestGame };
  }, [
    account,
    accountGames,
    accountGamesStatus,
    activeHeadToHeadDisplayName,
    headToHeadGames,
    headToHeadGamesStatus,
    query,
    tab,
  ]);

  const visibleOpenSeeks = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return openSeeks
      .filter((seek) => seek.status === "open")
      .filter((seek) => matchesSeekRatingFilter(seek, seekRatingFilter))
      .filter((seek) => !friendFilterActive || seekHasFollowedCreator(seek, followedDisplayNames))
      .filter((seek) => !normalizedQuery || seekSearchText(seek).includes(normalizedQuery))
      .sort(compareOpenSeekNewest);
  }, [followedDisplayNames, friendFilterActive, openSeeks, query, seekRatingFilter]);

  const emptyTitle =
    tab === "watch" ? "No public games in progress." : "No public completed games yet.";
  const hasActiveSeekFilters =
    query.trim() !== "" ||
    seekSideFilter !== "all" ||
    seekClockFilter !== "all" ||
    seekVpFilter !== "all" ||
    seekRatingFilter !== "all" ||
    friendFilterActive;
  const hasActiveFilters =
    query.trim() !== "" ||
    timeFilter !== "all" ||
    ratingFilter !== "all" ||
    friendFilterActive ||
    (tab === "archive" && resultFilter !== "all");
  const hasActiveSeekFieldFilters =
    seekSideFilter !== "all" ||
    seekClockFilter !== "all" ||
    seekVpFilter !== "all" ||
    seekRatingFilter !== "all" ||
    friendFilterActive;
  const hasActiveGameFieldFilters =
    timeFilter !== "all" ||
    ratingFilter !== "all" ||
    friendFilterActive ||
    (tab === "archive" && resultFilter !== "all");
  const hasActiveFilterPanelControls = tab === "lobby" ? hasActiveSeekFieldFilters : hasActiveGameFieldFilters;
  const filterPanelOpen = filterPanelOpenByTab[tab] || hasActiveFilterPanelControls;
  const filterToggleLabel = hasActiveFilterPanelControls
    ? "Filters active"
    : filterPanelOpen
      ? "Hide filters"
      : "Show filters";
  const filterStatusLabel = hasActiveFilterPanelControls
    ? "One or more filters are active"
    : "No filters active";
  const filterPanelId = `online-browser-${tab}-filters`;
  const toggleFilterPanel = () => {
    setFilterPanelOpenByTab((current) => ({
      ...current,
      [tab]: !filterPanelOpen,
    }));
  };
  const gameSearchAriaLabel =
    tab === "lobby"
      ? "Search lobby listings"
      : tab === "watch"
        ? "Search live public games"
        : "Search online archive";
  const gameSearchPlaceholder =
    tab === "lobby"
      ? "Listing id, creator side, clock, or scoring"
      : tab === "watch"
        ? "Player, game id, or move"
        : "Player, game id, result, or move";
  const gameBrowseControlsLabel =
    tab === "watch" ? "Browse live public games" : "Browse online archive";
  const filterPanelLabel = tab === "lobby" ? "Find lobby listings" : gameBrowseControlsLabel;
  const gameSortAriaLabel = tab === "archive" ? "Sort archive games" : "Sort public games";
  const accountArchiveStatusLabel =
    account && accountGamesStatus === "loading"
      ? "account games loading"
      : account && accountGamesStatus === "error"
        ? "account games unavailable"
        : account
          ? `${formatCount(accountActiveGames.length, "active account game")}, ${formatCount(accountArchivedGames.length, "account replay")}`
          : null;
  const archiveStatusParts = [
    accountArchiveStatusLabel,
    formatCount(visibleGames.length, "public replay"),
    recentArchivedGames.length > 0 ? formatCount(recentArchivedGames.length, "device replay") : null,
  ].filter(Boolean);
  const archiveStatusMessage = `${archiveStatusParts.join(", ")} shown${
    nextCursor ? "; more public replays available" : ""
  }`;
  const hasActiveOwnedSeek =
    ownedSeekIds.length > 0 &&
    (!ownedSeekResponse ||
      ownedSeekResponse.summary.status === "open" ||
      ownedSeekResponse.summary.status === "accepted");
  const hasCurrentSetupActions = !!onQuickMatch || !!onCreateSeek;
  const setupPromptAction = onConfigureSetup ?? onOpenGame ?? onBack;
  const quickMatchPending = quickMatchStatus === "pending";
  const quickMatchBlocking = quickMatchStatus === "pending" || quickMatchStatus === "matched";
  const quickMatchDisabled =
    !onQuickMatch ||
    quickMatchBlocking ||
    createSeekPending ||
    hasActiveOwnedSeek ||
    seekStatus === "loading" ||
    isSeekLoadInFlight;
  const createSeekDisabled =
    !onCreateSeek ||
    createSeekPending ||
    quickMatchBlocking ||
    hasActiveOwnedSeek ||
    seekStatus === "loading" ||
    isSeekLoadInFlight;
  const normalizedInviteDisplayName = inviteDisplayName.replace(/\s+/g, " ").trim();
  const createInvitedSeekDisabled = createSeekDisabled || !normalizedInviteDisplayName;
  const quickMatchMessage =
    quickMatchStatus === "pending"
      ? "Checking open lobby listings..."
      : quickMatchStatus === "matched"
        ? "Match found. Opening game..."
        : quickMatchStatus === "waiting"
          ? "No open listing for this setup found. Your setup is listed in the Lobby for someone to accept."
          : quickMatchStatus === "error"
            ? "Could not start quick match."
            : "";
  const createSeekMessage = createSeekPending ? "Creating lobby listing from current setup..." : "";
  const followedFilterDescription =
    "Shows loaded listings, public games, and account games involving accounts you follow. It does not change game visibility.";

  const renderGameParticipantLabel = (
    game: OnlineGameSummary,
    displayName: string,
    profileName: string | null
  ) => {
    if (!profileName || (!onOpenProfile && !canUseAccountSocial)) return displayName;
    return (
      <button
        type="button"
        className="online-game-player-link"
        onClick={() => {
          if (onOpenProfile) {
            onOpenProfile(profileName);
            return;
          }
          void handleSocialLookupByName(profileName, { focus: true });
        }}
        aria-label={`Open ${profileName} profile from ${game.gameId}`}
      >
        {displayName}
      </button>
    );
  };

  const renderGameRowSocialActions = (
    game: OnlineGameSummary,
    options: {
      allowChallenge?: boolean;
      allowHistory?: boolean;
      challengeIntent?: OnlineAccountChallengeIntent;
    } = {}
  ) => {
    if (!canUseAccountSocial) return null;
    const opponentProfileNames = accountOpponentProfileNames(game, account);
    if (opponentProfileNames.length === 0) return null;
    const challengeIntent = options.challengeIntent ?? "challenge";
    const challengeLabel = challengeIntent === "rematch" ? "Rematch" : "Challenge";
    return opponentProfileNames.map((profileName) => {
      const profileKey = normalizeDisplayNameKey(profileName);
      const isFollowed = followedDisplayNames.has(profileKey);
      const pendingChallenge = accountChallengeByOpponentDisplayName.get(profileKey);
      return (
        <React.Fragment key={`${game.gameId}:${profileKey}`}>
          {options.allowHistory && (
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={() => showVisiblePlayerHistory(profileName)}
              disabled={socialAction !== undefined}
              aria-label={`Show ${profileName} game history from ${game.gameId}`}
            >
              History
            </button>
          )}
          {!isFollowed && onFollowAccount && (
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={() => void runSocialProfileAction("follow", profileName)}
              disabled={socialAction !== undefined}
              aria-label={`Follow ${profileName} from ${game.gameId}`}
            >
              Follow
            </button>
          )}
          {options.allowChallenge && !pendingChallenge && onChallengeAccount && (
            <button
              type="button"
              className="online-browser-button neutral"
              onClick={() => void runSocialChallengeAction(
                profileName,
                challengeIntent === "rematch"
                  ? { intent: "rematch", sourceGameId: game.gameId }
                  : undefined
              )}
              disabled={socialAction !== undefined}
              aria-label={`${challengeLabel} ${profileName} from ${game.gameId}`}
            >
              {challengeLabel}
            </button>
          )}
        </React.Fragment>
      );
    });
  };

  const renderArchiveDetailPage = (game: OnlineGameSummary) => {
    const white = participantName(game.participants, "w");
    const black = participantName(game.participants, "b");
    const resultLabel = game.result ? formatOnlineGameResult(game.result) : "Completed";
    const clockSnapshot = game.livePreview.clock ? formatClockSnapshot(game) : null;
    const detailId = archiveDetailPanelId(game.gameId);

    return (
      <section
        id={detailId}
        ref={archiveDetailRef}
        className="online-browser-archive-detail"
        aria-label={`Archive details for ${game.gameId}`}
        tabIndex={-1}
      >
        <div className="online-browser-archive-detail-header">
          <div className="online-browser-archive-detail-title">
            <span className="online-browser-section-kicker">Archive details</span>
            <strong>{white} vs {black}</strong>
            <span>{game.gameId}</span>
          </div>
          <div className="online-browser-archive-detail-actions">
            <button
              type="button"
              className="online-browser-button primary"
              onClick={() => onReplay(game.gameId)}
              aria-label={`Analyze replay from archive details ${white} vs ${black}, ${game.gameId}`}
            >
              Analyze Replay
            </button>
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={() => setSelectedArchiveDetailGame(null)}
              aria-label={`Close archive details for ${game.gameId}`}
            >
              Close
            </button>
          </div>
        </div>
        <dl className="online-browser-archive-detail-grid">
          <div>
            <dt>White</dt>
            <dd>{white}</dd>
          </div>
          <div>
            <dt>Black</dt>
            <dd>{black}</dd>
          </div>
          <div>
            <dt>Result</dt>
            <dd>{resultLabel}</dd>
          </div>
          <div>
            <dt>Replay</dt>
            <dd>{formatMoveCount(game.livePreview.moveCount)}</dd>
          </div>
          <div>
            <dt>Final phase</dt>
            <dd>{formatSideToMove(game.livePreview.sideToMove)} to move, {game.livePreview.turnPhase}</dd>
          </div>
          <div>
            <dt>Last move</dt>
            <dd>{game.livePreview.lastMove ? game.livePreview.lastMove.notation : "None"}</dd>
          </div>
          <div>
            <dt>Time control</dt>
            <dd>{formatTimeControl(game)}</dd>
          </div>
          {clockSnapshot && (
            <div>
              <dt>Final clock</dt>
              <dd>{clockSnapshot}</dd>
            </div>
          )}
          <div>
            <dt>Rating</dt>
            <dd>{formatRatingModeLabel(game.ratingMode)}</dd>
          </div>
          <div>
            <dt>Visibility</dt>
            <dd>{formatGameVisibilityLabel(game.visibility)}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatUpdatedAt(game.createdAt)}</dd>
          </div>
          <div>
            <dt>Ended</dt>
            <dd>{game.endedAt ? formatUpdatedAt(game.endedAt) : "Unknown"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatUpdatedAt(game.updatedAt)}</dd>
          </div>
        </dl>
      </section>
    );
  };

  const renderPublicGameRow = (
    game: OnlineGameSummary,
    options: {
      compact?: boolean;
      featured?: boolean;
      context?: "watch" | "archive";
      featuredReason?: "moves" | "watchers";
      showOpponentHistoryActions?: boolean;
      showOpponentSocialActions?: boolean;
    } = {}
  ) => {
    const white = participantName(game.participants, "w");
    const black = participantName(game.participants, "b");
    const whiteProfileName = participantProfileName(game.participants, "w");
    const blackProfileName = participantProfileName(game.participants, "b");
    const resultLabel = game.result ? formatOnlineGameResult(game.result) : null;
    const context = options.context ?? tab;
    const isArchivedGame = context === "archive" && game.status === "complete" && game.archiveState === "archived";
    const primaryActionLabel = isArchivedGame ? "Analyze Replay" : "Spectate";
    const primaryActionAriaLabel = isArchivedGame
      ? `Analyze replay ${white} vs ${black}, ${game.gameId}`
      : `Spectate ${white} vs ${black}, ${game.gameId}`;
    const featuredKicker = isArchivedGame ? "Selected replay" : "Current live selection";
    const spectatorCountLabel = isArchivedGame
      ? null
      : formatSpectatorCount(game.livePreview.spectatorCount);
    const className = [
      "online-game-row",
      "online-public-game-row",
      options.compact ? "online-game-row-compact" : "",
      options.featured ? "online-game-row-featured" : "",
    ].filter(Boolean).join(" ");
    const boardPreview = game.livePreview.boardPreview;
    const previewCells = boardPreviewCells(boardPreview.radius);
    const boardPreviewLabel = boardPreviewImageLabel(game);
    const boardPreviewText = boardPreviewSummary(game);
    const rowAriaLabel = isArchivedGame
      ? `${white} vs ${black} replay ${game.gameId}, ${resultLabel ?? "completed game"}`
      : `${options.featured ? `${featuredKicker} ` : ""}${white} vs ${black} ${game.gameId}`;

    return (
      <article
        key={game.gameId}
        className={className}
        aria-label={rowAriaLabel}
      >
        <div className="online-game-board-preview-stack">
          <div className="online-game-board-preview">
            <svg viewBox="0 0 100 100" role="img" aria-label={boardPreviewLabel} focusable="false">
              <g className="online-game-board-preview-cells">
                {previewCells.map((hex) => {
                  const point = boardPreviewPoint(hex, boardPreview.radius);
                  return <circle key={`${hex.q},${hex.r},${hex.s}`} cx={point.x} cy={point.y} r="1.15" />;
                })}
              </g>
              <g className="online-game-board-preview-castles">
                {boardPreview.castles.map((castle) => {
                  const point = boardPreviewPoint(castle, boardPreview.radius);
                  return (
                    <rect
                      key={`${castle.q},${castle.r},${castle.s}`}
                      className={`owner-${castle.owner}`}
                      x={point.x - 2.2}
                      y={point.y - 2.2}
                      width="4.4"
                      height="4.4"
                      rx="0.8"
                    />
                  );
                })}
              </g>
              <g className="online-game-board-preview-pieces">
                {boardPreview.pieces.map((piece) => {
                  const point = boardPreviewPoint(piece, boardPreview.radius);
                  return (
                    <g
                      key={`${piece.q},${piece.r},${piece.s},${piece.color},${piece.type}`}
                      className={`piece-${piece.color}`}
                    >
                      <circle cx={point.x} cy={point.y} r={piece.type === PieceType.Monarch ? 3.5 : 2.8} />
                      {piece.type === PieceType.Monarch && (
                        <text x={point.x} y={point.y + 1.35} textAnchor="middle">
                          {PIECE_PREVIEW_LABELS[piece.type]}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
          <div className="online-game-board-preview-summary" aria-hidden="true">
            <span>{boardPreviewText.pieces}</span>
            <span>{boardPreviewText.castles}</span>
          </div>
        </div>
        <div className="online-game-row-main">
          <div className="online-game-players">
            {options.featured && <span className="online-game-kicker">{featuredKicker}</span>}
            <strong className="online-game-player-line">
              {renderGameParticipantLabel(game, white, whiteProfileName)}
              <span aria-hidden="true"> vs </span>
              {renderGameParticipantLabel(game, black, blackProfileName)}
            </strong>
            <span>{game.gameId}</span>
          </div>
          <div className="online-game-meta">
            <span className={`online-game-pill ${game.status}`}>
              {game.status === "active" ? "Live" : "Complete"}
            </span>
            {!isArchivedGame && <span>{formatMoveCount(game.livePreview.moveCount)}</span>}
            {options.featured && !isArchivedGame && (
              <span>
                {options.featuredReason === "watchers"
                  ? "Most watched in current list"
                  : "Most moves in current list"}
              </span>
            )}
            {isArchivedGame && <span>Replay length {formatMoveCount(game.livePreview.moveCount)}</span>}
            {!isArchivedGame && (
              <span>
                {formatSideToMove(game.livePreview.sideToMove)} to move, {game.livePreview.turnPhase}
              </span>
            )}
            {isArchivedGame && (
              <span>
                Final position {formatSideToMove(game.livePreview.sideToMove)}, {game.livePreview.turnPhase}
              </span>
            )}
            {game.livePreview.lastMove && (
              <span>{isArchivedGame ? "Last move" : "Last"} {game.livePreview.lastMove.notation}</span>
            )}
            {spectatorCountLabel && <span>{spectatorCountLabel}</span>}
            <span>{!isArchivedGame && game.hasTimeControl ? formatClockSnapshot(game) : formatTimeControl(game)}</span>
            <span>Rating {formatRatingModeLabel(game.ratingMode)}</span>
            {isArchivedGame && game.endedAt ? (
              <>
                <span>Ended {formatUpdatedAt(game.endedAt)}</span>
                <span>Started {formatUpdatedAt(game.createdAt)}</span>
              </>
            ) : (
              <span>Updated {formatUpdatedAt(game.updatedAt)}</span>
            )}
          </div>
          {resultLabel && <div className="online-game-result">{resultLabel}</div>}
        </div>
        <div className="online-game-actions">
          {isArchivedGame && (
            <button
              type="button"
              className="online-browser-button neutral"
              onClick={() => setSelectedArchiveDetailGame(game)}
              aria-expanded={selectedArchiveDetailGame?.gameId === game.gameId}
              aria-controls={archiveDetailPanelId(game.gameId)}
              aria-label={`Show archive details for ${white} vs ${black}, ${game.gameId}`}
            >
              Details
            </button>
          )}
          <button
            type="button"
            className="online-browser-button primary"
            onClick={() => {
              if (isArchivedGame) {
                onReplay(game.gameId);
              } else {
                onSpectate(game.gameId);
              }
            }}
            aria-label={primaryActionAriaLabel}
          >
            {primaryActionLabel}
          </button>
          {!isArchivedGame && (
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={() => copySpectatorLink(game.gameId)}
              aria-label={`Copy spectator link for ${game.gameId}`}
            >
              Copy Link
            </button>
          )}
          {options.showOpponentSocialActions && renderGameRowSocialActions(game, {
            allowChallenge: isArchivedGame,
            allowHistory: options.showOpponentHistoryActions,
            challengeIntent: isArchivedGame ? "rematch" : "challenge",
          })}
        </div>
      </article>
    );
  };

  const renderRecentOnlineGameRow = (record: RecentOnlineGameRecord) => {
    return (
      <article key={record.gameId} className="online-game-row online-recent-game-row">
        <div className="online-game-row-main">
          <div className="online-game-players">
            <span className="online-game-kicker">Recent on this device</span>
            <strong>{record.gameId}</strong>
            <span>{formatRecentOnlineGameRole(record)}</span>
          </div>
          <div className="online-game-meta">
            <span className="online-game-pill complete">Complete</span>
            <span>Last opened {formatRecentOnlineGameTime(record.lastSeenAt)}</span>
            <span>{formatRecentOnlineGameScope()}</span>
          </div>
        </div>
        <div className="online-game-actions">
          <button
            type="button"
            className="online-browser-button primary"
            onClick={() => onReplay(record.gameId)}
            aria-label={`Analyze recent online replay ${record.gameId}`}
          >
            Analyze Replay
          </button>
        </div>
      </article>
    );
  };

  const renderAccountActiveGameRow = (game: OnlineGameSummary) => {
    const white = participantName(game.participants, "w");
    const black = participantName(game.participants, "b");
    const whiteProfileName = participantProfileName(game.participants, "w");
    const blackProfileName = participantProfileName(game.participants, "b");
    const accountSeat = account
      ? game.participants.find((participant) =>
          identityMatchesAccount(participant.identity, account)
        )?.seat
      : undefined;
    const storedJoin =
      accountSeat && resolveAccountGameJoin ? resolveAccountGameJoin(game, accountSeat) : null;
    const canReturn = !!storedJoin && !!onReturnToAccountGame;
    const canRejoin = !!accountSeat && !storedJoin && !!onRejoinAccountGame;
    const isRejoining = rejoiningAccountGameId === game.gameId;
    const canSpectate = canSpectateOnlineGameSummary(game);
    const accountSeatLabel = accountSeat === "w" ? "Your seat White" : accountSeat === "b" ? "Your seat Black" : "Account seat unavailable";
    const sideToMoveLabel = game.livePreview.sideToMove === "w" ? "White" : "Black";
    const accountTurnLabel =
      accountSeat && game.livePreview.sideToMove === accountSeat ? "Your turn" : `Waiting for ${sideToMoveLabel}`;

    return (
      <article key={game.gameId} className="online-game-row online-account-active-game-row" aria-label={`Active account game ${game.gameId}`}>
        <div className="online-game-row-main">
          <div className="online-game-players">
            <span className="online-game-kicker">Active account game</span>
            <strong className="online-game-player-line">
              {renderGameParticipantLabel(game, white, whiteProfileName)}
              <span aria-hidden="true"> vs </span>
              {renderGameParticipantLabel(game, black, blackProfileName)}
            </strong>
            <span>{game.gameId}</span>
          </div>
          <div className="online-game-meta">
            <span className="online-game-pill active">Live</span>
            <span>{accountSeatLabel}</span>
            <span>{formatMoveCount(game.livePreview.moveCount)}</span>
            <span>{formatSideToMove(game.livePreview.sideToMove)} to move, {game.livePreview.turnPhase}</span>
            <span>{accountTurnLabel}</span>
            {game.livePreview.lastMove && <span>Last {game.livePreview.lastMove.notation}</span>}
            <span>{game.hasTimeControl ? formatClockSnapshot(game) : formatTimeControl(game)}</span>
            <span>Rating {formatRatingModeLabel(game.ratingMode)}</span>
            {!storedJoin && <span>Player token not in this browser session</span>}
          </div>
        </div>
        <div className="online-game-actions">
          {canReturn && storedJoin ? (
            <button
              type="button"
              className="online-browser-button primary"
              onClick={() => onReturnToAccountGame(storedJoin, game.visibility)}
              aria-label={`Return to account game ${white} vs ${black}, ${game.gameId}`}
            >
              Return to Game
            </button>
          ) : canRejoin ? (
            <button
              type="button"
              className="online-browser-button primary"
              onClick={() => onRejoinAccountGame?.(game)}
              disabled={isRejoining}
              aria-label={`Rejoin account game ${white} vs ${black}, ${game.gameId}`}
            >
              {isRejoining ? "Rejoining..." : "Rejoin Game"}
            </button>
          ) : canSpectate ? (
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={() => onSpectate(game.gameId)}
              aria-label={`Spectate account game ${white} vs ${black}, ${game.gameId}`}
            >
              Spectate
            </button>
          ) : (
            <span className="online-game-action-note">Open from original browser session or invite link</span>
          )}
          {renderGameRowSocialActions(game, { allowHistory: true })}
        </div>
      </article>
    );
  };

  const renderLiveOverview = (
    liveGameCount: number,
    featuredGame: OnlineGameSummary | null,
    label: string,
    featuredReason: "moves" | "watchers" = "moves"
  ) => {
    const featuredWhite = featuredGame ? participantName(featuredGame.participants, "w") : "";
    const featuredBlack = featuredGame ? participantName(featuredGame.participants, "b") : "";
    const leaderLabel =
      featuredGame && featuredReason === "watchers"
        ? `${featuredWhite} vs ${featuredBlack}, ${formatSpectatorCount(featuredGame.livePreview.spectatorCount) ?? "watching now"}, ${formatMoveCount(featuredGame.livePreview.moveCount)}`
        : featuredGame
          ? `${featuredWhite} vs ${featuredBlack}, ${formatMoveCount(featuredGame.livePreview.moveCount)}`
          : "";
    return (
      <div className="online-browser-live-overview" role="group" aria-label={label}>
        <div className="online-browser-live-stat">
          <span>Live now</span>
          <strong>{formatPublicLiveCount(liveGameCount)}</strong>
        </div>
        <div className="online-browser-live-stat">
          <span>Selected by</span>
          <strong>
            {featuredGame
              ? featuredReason === "watchers"
                ? "Most watched in current list"
                : "Most moves in current list"
              : liveGameCount > 0
                ? "No visible game"
                : "No public live games"}
          </strong>
        </div>
        <div className="online-browser-live-stat online-browser-live-stat-wide">
          <span>Current selection</span>
          <strong>
            {featuredGame
              ? leaderLabel
              : liveGameCount > 0
                ? "No matching public games"
                : "Waiting for public games"}
          </strong>
        </div>
        <div className="online-browser-live-stat">
          <span>Visibility</span>
          <strong>Public only</strong>
        </div>
      </div>
    );
  };

  const renderAccountHeadToHeadSummary = (summary: AccountHeadToHeadSummary) => {
    const accountDisplayName = account?.displayName ?? "You";
    const opponentKey = normalizeDisplayNameKey(summary.opponentDisplayName);
    const pendingChallenge = accountChallengeByOpponentDisplayName.get(opponentKey);
    return (
      <section
        className="online-browser-live-overview online-browser-head-to-head-summary"
        aria-label={`Head-to-head with ${summary.opponentDisplayName}`}
      >
        <div className="online-browser-live-stat">
          <span>Head-to-head</span>
          <strong>{formatCount(summary.games.length, "game")}</strong>
        </div>
        <div className="online-browser-live-stat">
          <span>{accountDisplayName}</span>
          <strong>{accountDisplayName} {summary.accountWins}</strong>
        </div>
        <div className="online-browser-live-stat">
          <span>{summary.opponentDisplayName}</span>
          <strong>{summary.opponentDisplayName} {summary.opponentWins}</strong>
        </div>
        <div className="online-browser-live-stat online-browser-live-stat-wide">
          <span>Last game</span>
          <strong>Last game {summary.latestGame.gameId}</strong>
          <div className="online-browser-head-to-head-action-row">
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={() => setSelectedArchiveDetailGame(summary.latestGame)}
              aria-expanded={selectedArchiveDetailGame?.gameId === summary.latestGame.gameId}
              aria-controls={archiveDetailPanelId(summary.latestGame.gameId)}
              aria-label={`Show archive details for latest head-to-head game ${summary.latestGame.gameId}`}
            >
              Details
            </button>
            <button
              type="button"
              className="online-browser-button primary"
              onClick={() => onReplay(summary.latestGame.gameId)}
              aria-label={`Analyze latest head-to-head replay ${summary.latestGame.gameId}`}
            >
              Analyze
            </button>
            {onChallengeAccount && !pendingChallenge ? (
              <button
                type="button"
                className="online-browser-button neutral"
                onClick={() => void runSocialChallengeAction(summary.opponentDisplayName, {
                  intent: "rematch",
                  sourceGameId: summary.latestGame.gameId,
                })}
                disabled={socialAction !== undefined}
                aria-label={`Rematch ${summary.opponentDisplayName} from head-to-head summary ${summary.latestGame.gameId}`}
              >
                Rematch
              </button>
            ) : pendingChallenge ? (
              <span className="online-game-action-note">Challenge pending</span>
            ) : null}
          </div>
        </div>
      </section>
    );
  };

  const renderAccountFollowedOpponentStrip = () => {
    if (visibleAccountFollowedOpponentItems.length === 0) return null;
    return (
      <section
        className="online-browser-account-subsection online-browser-account-friends"
        aria-label="Followed opponents in your account archive"
      >
        <div className="online-browser-side-list-header">
          <div className="online-browser-side-list-heading">
            <span className="online-browser-section-kicker">Following</span>
            <strong>Followed opponents in your games</strong>
          </div>
          <span>
            {formatCount(accountFollowedOpponentItems.length, "opponent")}
            {accountFollowedOpponentItems.length > visibleAccountFollowedOpponentItems.length
              ? `, +${accountFollowedOpponentItems.length - visibleAccountFollowedOpponentItems.length} more`
              : ""}
          </span>
        </div>
        <div className="online-browser-account-friend-rows">
          {visibleAccountFollowedOpponentItems.map((item) => {
            const profileKey = normalizeDisplayNameKey(item.displayName);
            const pendingChallenge = accountChallengeByOpponentDisplayName.get(profileKey);
            const detailParts = [
              formatCount(item.gameCount, "game"),
              item.activeCount > 0 ? formatCount(item.activeCount, "live game") : null,
              item.completedCount > 0 ? formatCount(item.completedCount, "replay") : null,
              `Latest ${item.latestGame.gameId}`,
            ].filter(Boolean);
            return (
              <article
                key={profileKey}
                className="online-browser-account-friend-row"
                aria-label={`Followed opponent ${item.displayName} in account archive`}
              >
                <div className="online-browser-account-friend-main">
                  <strong>{item.displayName}</strong>
                  <span>{detailParts.join("; ")}</span>
                </div>
                <div className="online-browser-account-friend-actions">
                  <button
                    type="button"
                    className="online-browser-button subtle"
                    onClick={() => showVisiblePlayerHistory(item.displayName)}
                    disabled={socialAction !== undefined}
                    aria-label={`Show ${item.displayName} game history from followed account archive`}
                  >
                    History
                  </button>
                  {onChallengeAccount && !pendingChallenge ? (
                    <button
                      type="button"
                      className="online-browser-button neutral"
                      onClick={() => void runSocialChallengeAction(item.displayName)}
                      disabled={socialAction !== undefined}
                      aria-label={`Challenge ${item.displayName} from followed account archive`}
                    >
                      Challenge
                    </button>
                  ) : pendingChallenge ? (
                    <span className="online-game-action-note">Challenge pending</span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  const runQuickMatch = async () => {
    if (!onQuickMatch || quickMatchDisabled) return;
    setQuickMatchStatus("pending");
    setSeekActionMessage("");
    let shouldRestoreFocus = false;
    try {
      const outcome = await onQuickMatch();
      setQuickMatchStatus(outcome === "matched" ? "matched" : "waiting");
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to start quick match", error);
      shouldRestoreFocus = true;
      setQuickMatchStatus("error");
      setSeekActionMessage(onlineRequestErrorMessage(error) ?? "");
    } finally {
      if (shouldRestoreFocus) {
        window.setTimeout(() => quickMatchButtonRef.current?.focus(), 0);
      }
    }
  };

  const runCreateSeek = async (
    visibility: OpenSeekVisibility = "public",
    options: { invitedDisplayNames?: string[] } = {}
  ) => {
    if (!onCreateSeek || createSeekDisabled) return;
    if (visibility === "invited" && !options.invitedDisplayNames?.length) return;
    setCreateSeekPending(true);
    setQuickMatchStatus("idle");
    setSeekActionMessage("");
    try {
      if (options.invitedDisplayNames?.length) {
        await onCreateSeek(visibility, options);
      } else {
        await onCreateSeek(visibility);
      }
      setSeekActionMessage(
        visibility === "invited" && options.invitedDisplayNames?.length
          ? `Listed for ${options.invitedDisplayNames.join(", ")}.`
          : visibility === "followed"
          ? "Listed for accounts you follow."
          : "Listed in the public Lobby."
      );
      if (visibility === "invited") {
        setInviteDisplayName("");
      }
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to list current setup", error);
      setSeekActionMessage(onlineRequestErrorMessage(error) ?? "Could not list the current setup.");
    } finally {
      setCreateSeekPending(false);
    }
  };

  const runSeekAction = async (seekId: string, action: "accept" | "cancel") => {
    const handler = action === "accept" ? onAcceptSeek : onCancelSeek;
    if (!handler) return;
    setSeekActionById((current) => {
      const next = { ...current, [seekId]: action };
      seekActionByIdRef.current = next;
      return next;
    });
    setQuickMatchStatus("idle");
    setSeekActionMessage("");
    try {
      await handler(seekId);
      setSeekActionMessage(action === "accept" ? "Opening accepted game..." : "Lobby listing cancelled.");
      if (action === "cancel") {
        setOpenSeeks((current) => current.filter((seek) => seek.seekId !== seekId));
      }
    } catch (error) {
      console.error(`[OnlineGameBrowser] Failed to ${action} open seek`, error);
      setSeekActionMessage(
        onlineRequestErrorMessage(error) ??
        (action === "accept" ? "Could not accept that lobby listing." : "Could not cancel that lobby listing.")
      );
    } finally {
      setSeekActionById((current) => {
        const next = { ...current };
        delete next[seekId];
        seekActionByIdRef.current = next;
        return next;
      });
    }
  };

  const runOwnedSeekRefresh = React.useCallback(async (options: { background?: boolean } = {}) => {
    if (!onRefreshOwnedSeek) return;
    const background = options.background === true;
    if (ownedSeekRefreshInFlightRef.current) return;
    ownedSeekRefreshInFlightRef.current = true;
    if (!background) {
      setOwnedSeekAction("refresh");
      setQuickMatchStatus("idle");
      setSeekActionMessage("");
    }
    try {
      await onRefreshOwnedSeek();
      if (!background) {
        setSeekActionMessage("Your lobby listing was refreshed.");
      }
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to refresh owned open seek", error);
      if (isRateLimitError(error)) {
        seekAutoRefreshPausedUntilRef.current = Date.now() + LOBBY_RATE_LIMIT_BACKOFF_MS;
      }
      if (!background) {
        setSeekActionMessage(onlineRequestErrorMessage(error) ?? "Could not refresh your lobby listing.");
      }
    } finally {
      ownedSeekRefreshInFlightRef.current = false;
      if (!background) {
        setOwnedSeekAction(undefined);
      }
    }
  }, [onRefreshOwnedSeek]);

  React.useEffect(() => {
    if (tab !== "lobby") return;
    if (ownedSeekResponse?.summary.status !== "open") return;
    if (!onRefreshOwnedSeek) return;
    const refreshOwnedIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() < seekAutoRefreshPausedUntilRef.current) return;
      void runOwnedSeekRefresh({ background: true });
    };
    const interval = window.setInterval(refreshOwnedIfVisible, LOBBY_AUTO_REFRESH_MS);
    const handleVisibilityChange = () => {
      refreshOwnedIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onRefreshOwnedSeek, ownedSeekResponse?.summary.status, runOwnedSeekRefresh, tab]);

  const runOwnedSeekJoin = () => {
    if (!onJoinOwnedSeek) return;
    setOwnedSeekAction("join");
    onJoinOwnedSeek();
  };

  const openWatchFromLobby = () => {
    setQuery("");
    setTimeFilter("all");
    setSort("moves");
    setBrowserTab("watch");
  };

  const copySpectatorLink = async (gameId: string) => {
    setRecentClearMessage("");
    try {
      await copyOnlineInviteUrl(buildSpectatorUrl(window.location.href, gameId));
      setCopyMessage("Spectator link copied.");
    } catch {
      setCopyMessage("Could not copy the spectator link.");
    }
  };

  const handleSocialLookupByName = React.useCallback(async (displayName: string, options: { quiet?: boolean; focus?: boolean } = {}) => {
    if (!displayName || !loadAccountProfile) return;
    const requestId = ++socialLookupRequestIdRef.current;
    const accountId = account?.accountId;
    setSocialLookupName(displayName);
    setSocialSearchResults([]);
    setSocialSearchStatus("idle");
    if (!options.quiet) {
      setSocialLookupStatus("loading");
      setSocialMessage("");
    }
    try {
      const response = await loadAccountProfile(displayName);
      if (requestId !== socialLookupRequestIdRef.current || accountId !== account?.accountId) return;
      setSocialProfile(response.profile);
      setSocialLookupStatus("ready");
      if (!options.quiet) {
        setSocialMessage(`Found ${response.profile.displayName}.`);
      }
      if (options.focus) {
        window.setTimeout(() => socialProfileCardRef.current?.focus(), 0);
      }
    } catch (error) {
      if (requestId !== socialLookupRequestIdRef.current || accountId !== account?.accountId) return;
      console.error("[OnlineGameBrowser] Failed to load account profile", error);
      setSocialProfile(null);
      setSocialLookupStatus("error");
      if (!options.quiet) {
        setSocialMessage("No visible account found with that exact name.");
      }
    }
  }, [account?.accountId, loadAccountProfile]);

  const handleSocialLookupSubmit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = socialLookupName.trim();
    await handleSocialLookupByName(displayName);
  }, [handleSocialLookupByName, socialLookupName]);

  React.useEffect(() => {
    const requestId = ++socialSearchRequestIdRef.current;
    const query = socialLookupName.trim();
    const loadedProfileMatchesQuery =
      socialProfile !== null &&
      normalizeDisplayNameKey(socialProfile.displayName) === normalizeDisplayNameKey(query);
    if (!canUseAccountSocial || !searchAccountProfiles || query.length < 2 || loadedProfileMatchesQuery) {
      setSocialSearchResults([]);
      setSocialSearchStatus("idle");
      return;
    }
    setSocialSearchStatus("loading");
    const timeout = window.setTimeout(() => {
      searchAccountProfiles(query)
        .then((response) => {
          if (requestId !== socialSearchRequestIdRef.current) return;
          setSocialSearchResults(response.profiles);
          setSocialSearchStatus("ready");
        })
        .catch((error) => {
          if (requestId !== socialSearchRequestIdRef.current) return;
          console.error("[OnlineGameBrowser] Failed to search account profiles", error);
          setSocialSearchResults([]);
          setSocialSearchStatus("error");
        });
    }, 160);
    return () => window.clearTimeout(timeout);
  }, [canUseAccountSocial, searchAccountProfiles, socialLookupName, socialProfile]);

  const handleSocialSearchSelection = React.useCallback((profile: OnlineAccountSearchProfile) => {
    setSocialLookupName(profile.displayName);
    setSocialSearchResults([]);
    setSocialSearchStatus("idle");
    if (onOpenProfile) {
      onOpenProfile(profile.displayName);
      return;
    }
    void handleSocialLookupByName(profile.displayName, { focus: true });
  }, [handleSocialLookupByName, onOpenProfile]);

  const openSignedInAccountProfile = React.useCallback(() => {
    if (!account) return;
    setIsAccountDialogOpen(false);
    if (onOpenProfile) {
      onOpenProfile(account.displayName);
      return;
    }
    if (!canUseAccountSocial) return;
    void handleSocialLookupByName(account.displayName, { focus: true });
  }, [account, canUseAccountSocial, handleSocialLookupByName, onOpenProfile]);

  const removePinnedFollowingProfile = React.useCallback((displayName: string) => {
    const accountId = account?.accountId;
    const key = normalizeDisplayNameKey(displayName);
    if (!accountId || !key) return;
    setPinnedFollowingDisplayNames((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      writePinnedFollowingDisplayNames(accountId, next);
      return next;
    });
  }, [account?.accountId]);

  const removeFollowingNote = React.useCallback((displayName: string) => {
    const accountId = account?.accountId;
    const key = normalizeDisplayNameKey(displayName);
    if (!accountId || !key) return;
    setFollowingNotes((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      writeFollowingNotes(accountId, next);
      return next;
    });
    setEditingFollowingNoteKey((current) => (current === key ? null : current));
    setFollowingNoteDraft((currentDraft) => (editingFollowingNoteKey === key ? "" : currentDraft));
  }, [account?.accountId, editingFollowingNoteKey]);

  const togglePinnedFollowingProfile = React.useCallback((displayName: string) => {
    const accountId = account?.accountId;
    const key = normalizeDisplayNameKey(displayName);
    if (!accountId || !key) return;
    setPinnedFollowingDisplayNames((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      writePinnedFollowingDisplayNames(accountId, next);
      return next;
    });
  }, [account?.accountId]);

  const openFollowingNoteEditor = React.useCallback((displayName: string) => {
    const key = normalizeDisplayNameKey(displayName);
    if (!key) return;
    setEditingFollowingNoteKey(key);
    setFollowingNoteDraft(followingNotes[key] ?? "");
  }, [followingNotes]);

  const cancelFollowingNoteEditor = React.useCallback(() => {
    setEditingFollowingNoteKey(null);
    setFollowingNoteDraft("");
  }, []);

  const saveFollowingNote = React.useCallback((
    event: React.FormEvent<HTMLFormElement>,
    displayName: string
  ) => {
    event.preventDefault();
    const accountId = account?.accountId;
    const key = normalizeDisplayNameKey(displayName);
    if (!accountId || !key) return;
    const note = normalizeFollowingNote(followingNoteDraft);
    setFollowingNotes((current) => {
      const next = { ...current };
      if (note) {
        next[key] = note;
      } else {
        delete next[key];
      }
      writeFollowingNotes(accountId, next);
      return next;
    });
    setEditingFollowingNoteKey(null);
    setFollowingNoteDraft("");
    setSocialMessage(note ? `Private note saved for ${displayName}.` : `Private note cleared for ${displayName}.`);
  }, [account?.accountId, followingNoteDraft]);

  const clearFollowingNote = React.useCallback((displayName: string) => {
    const accountId = account?.accountId;
    const key = normalizeDisplayNameKey(displayName);
    if (!accountId || !key) return;
    setFollowingNotes((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      writeFollowingNotes(accountId, next);
      return next;
    });
    setEditingFollowingNoteKey(null);
    setFollowingNoteDraft("");
    setSocialMessage(`Private note cleared for ${displayName}.`);
  }, [account?.accountId]);

  const mergeSocialProfile = React.useCallback((profile: OnlineAccountPublicProfile) => {
    setSocialProfile((current) =>
      current?.displayName.toLowerCase() === profile.displayName.toLowerCase()
        ? profile
        : current
    );
    setFollowingProfiles((current) => {
      const withoutProfile = current.filter(
        (candidate) => candidate.displayName.toLowerCase() !== profile.displayName.toLowerCase()
      );
      if (profile.relationship.following && !profile.relationship.blocked && !profile.relationship.self) {
        return [...withoutProfile, profile].sort(compareProfilesByPresence);
      }
      return withoutProfile.sort(compareProfilesByPresence);
    });
  }, []);

  const runSocialProfileAction = React.useCallback(async (
    action: "follow" | "unfollow" | "block" | "unblock",
    displayName: string
  ) => {
    const handlers = {
      follow: onFollowAccount,
      unfollow: onUnfollowAccount,
      block: onBlockAccount,
      unblock: onUnblockAccount,
    };
    const handler = handlers[action];
    if (!handler) return false;
    const requestId = ++socialMutationRequestIdRef.current;
    const accountId = account?.accountId;
    setSocialAction(action);
    setSocialMessage("");
    try {
      const response = await handler(displayName);
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return false;
      mergeSocialProfile(response.profile);
      if (action === "unfollow" || action === "block" || !response.profile.relationship.following) {
        removePinnedFollowingProfile(response.profile.displayName);
        removeFollowingNote(response.profile.displayName);
      }
      setSocialLookupStatus("ready");
      setSocialMessage(
        action === "follow"
          ? `Following ${response.profile.displayName}.`
          : action === "unfollow"
            ? `Unfollowed ${response.profile.displayName}.`
            : action === "block"
              ? `Blocked ${response.profile.displayName}.`
              : `Unblocked ${response.profile.displayName}.`
      );
      void refreshFollowingProfiles({ quiet: true });
      return true;
    } catch (error) {
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return false;
      console.error(`[OnlineGameBrowser] Failed to ${action} account`, error);
      setSocialMessage(
        onlineRequestErrorMessage(error) ??
          (action === "follow"
            ? "Could not follow that account."
            : action === "unfollow"
              ? "Could not unfollow that account."
              : action === "block"
                ? "Could not block that account."
              : "Could not unblock that account.")
      );
      return false;
    } finally {
      if (requestId === socialMutationRequestIdRef.current && accountId === account?.accountId) {
        setSocialAction(undefined);
      }
    }
  }, [
    account?.accountId,
    mergeSocialProfile,
    removePinnedFollowingProfile,
    removeFollowingNote,
    onBlockAccount,
    onFollowAccount,
    onUnblockAccount,
    onUnfollowAccount,
    refreshFollowingProfiles,
  ]);

  const pruneAccountChallengesForOpponent = React.useCallback((displayName: string) => {
    const opponentKey = normalizeDisplayNameKey(displayName);
    const keepChallenge = (item: OnlineAccountChallengeListItem) =>
      normalizeDisplayNameKey(challengeOpponentDisplayName(item) ?? "") !== opponentKey;
    setAccountChallenges((current) => {
      const next = current.filter(keepChallenge);
      accountChallengesRef.current = next;
      return next;
    });
    updateAccountChallengeShortcutItems((current) => current.filter(keepChallenge), { notifyNavigation: true });
  }, [updateAccountChallengeShortcutItems]);

  const blockAccountChallengeOpponent = React.useCallback(async (displayName: string) => {
    const blocked = await runSocialProfileAction("block", displayName);
    if (blocked) {
      pruneAccountChallengesForOpponent(displayName);
    }
  }, [pruneAccountChallengesForOpponent, runSocialProfileAction]);

  const openSocialReport = React.useCallback((
    displayName: string,
    profile?: OnlineAccountPublicProfile
  ) => {
    if (!onReportAccount) return;
    setReportTargetDisplayName(displayName);
    setReportReason("abuse");
    setReportDetails("");
    setSocialMessage("");
    if (profile) {
      setSocialLookupName(profile.displayName);
      setSocialProfile(profile);
      setSocialLookupStatus("ready");
    }
  }, [onReportAccount]);

  const cancelSocialReport = React.useCallback(() => {
    setReportTargetDisplayName("");
    setReportReason("abuse");
    setReportDetails("");
  }, []);

  const submitSocialReport = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onReportAccount || !reportTargetDisplayName) return;
    const requestId = ++socialMutationRequestIdRef.current;
    const accountId = account?.accountId;
    const targetDisplayName = reportTargetDisplayName;
    setSocialAction("report");
    setSocialMessage("");
    try {
      const response = await onReportAccount(targetDisplayName, {
        reason: reportReason,
        details: reportDetails,
      });
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      setSocialMessage(`Report submitted for ${response.report.targetDisplayName}.`);
      setReportTargetDisplayName("");
      setReportReason("abuse");
      setReportDetails("");
    } catch (error) {
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      console.error("[OnlineGameBrowser] Failed to report account", error);
      setSocialMessage(onlineRequestErrorMessage(error) ?? `Could not submit a report for ${targetDisplayName}.`);
    } finally {
      if (requestId === socialMutationRequestIdRef.current && accountId === account?.accountId) {
        setSocialAction(undefined);
      }
    }
  }, [
    account?.accountId,
    onReportAccount,
    reportDetails,
    reportReason,
    reportTargetDisplayName,
  ]);

  const runSocialChallengeAction = React.useCallback(async (
    displayName: string,
    options: OnlineAccountChallengeActionOptions = {}
  ) => {
    if (!onChallengeAccount) return;
    const intent = options.intent ?? "challenge";
    const requestId = ++socialMutationRequestIdRef.current;
    const accountId = account?.accountId;
    setSocialAction("challenge");
    setSocialMessage("");
    try {
      if (options.intent || options.sourceGameId) {
        await onChallengeAccount(displayName, options);
      } else {
        await onChallengeAccount(displayName);
      }
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      setSocialMessage(
        intent === "rematch"
          ? `Rematch challenge created for ${displayName}.`
          : `Challenge created for ${displayName}.`
      );
    } catch (error) {
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      console.error("[OnlineGameBrowser] Failed to challenge account", error);
      const serverMessage = formatAccountChallengeErrorMessage(error, displayName, intent);
      setSocialMessage(serverMessage ?? (
        intent === "rematch"
          ? `Could not create a rematch challenge for ${displayName}.`
          : `Could not create a challenge for ${displayName}.`
      ));
    } finally {
      if (requestId === socialMutationRequestIdRef.current && accountId === account?.accountId) {
        setSocialAction(undefined);
      }
    }
  }, [account?.accountId, onChallengeAccount]);

  const runSocialCopyChallengeInviteAction = React.useCallback(async (displayName: string) => {
    if (!onCopyChallengeAccountInvite) return;
    const requestId = ++socialMutationRequestIdRef.current;
    const accountId = account?.accountId;
    setSocialAction("copy-invite");
    setSocialMessage("");
    try {
      await onCopyChallengeAccountInvite(displayName);
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      setSocialMessage(`Challenge invite copied for ${displayName}.`);
    } catch (error) {
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      console.error("[OnlineGameBrowser] Failed to copy account challenge invite", error);
      setSocialMessage(onlineRequestErrorMessage(error) ?? `Could not copy a challenge invite for ${displayName}.`);
    } finally {
      if (requestId === socialMutationRequestIdRef.current && accountId === account?.accountId) {
        setSocialAction(undefined);
      }
    }
  }, [account?.accountId, onCopyChallengeAccountInvite]);

  const selectSocialProfile = React.useCallback((profile: OnlineAccountPublicProfile, message = `Selected ${profile.displayName}.`) => {
    setSocialLookupName(profile.displayName);
    setSocialProfile(profile);
    setSocialLookupStatus("ready");
    setSocialMessage(message);
    window.setTimeout(() => socialProfileCardRef.current?.focus(), 0);
  }, []);

  const showVisiblePlayerHistory = React.useCallback((displayName: string) => {
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) return;
    setQuery(trimmedDisplayName);
    setSort("newest");
    setTimeFilter("all");
    setResultFilter("all");
    setFriendFilter("all");
    setHeadToHeadDisplayName(trimmedDisplayName);
    setCopyMessage("");
    setRecentClearMessage("");
    setSocialMessage(`Showing visible games with ${trimmedDisplayName}.`);
    setBrowserTab("archive");
    window.setTimeout(() => gameSearchInputRef.current?.focus(), 0);
  }, [setBrowserTab]);

  const clearVisiblePlayerHistory = React.useCallback(() => {
    setHeadToHeadDisplayName("");
    setHeadToHeadMessage("");
    setQuery("");
    setCopyMessage("");
    setRecentClearMessage("");
    setSocialMessage("");
    window.setTimeout(() => gameSearchInputRef.current?.focus(), 0);
  }, []);

  const focusAccountChallenges = React.useCallback(() => {
    setSocialMessage("");
    clearAccountChallengeUnreadActivity();
    if (accountChallengeFilter !== "pending") {
      handleAccountChallengeFilterChange("pending");
    }
    window.setTimeout(() => accountChallengesSectionRef.current?.focus(), 0);
  }, [accountChallengeFilter, clearAccountChallengeUnreadActivity, handleAccountChallengeFilterChange]);

  const onlineDestinationNotificationCount = Math.max(
    onlineNotificationCount,
    pendingIncomingChallengeCount + accountChallengeUnreadActivity.acceptedReady
  );
  const navDestinations: AppShellDestination[] = [
    { id: "play", label: "Play", onClick: onOpenGame ?? onBack },
    ...(onTutorial ? [{ id: "learn" as const, label: "Tutorial", onClick: onTutorial }] : []),
    {
      id: "online",
      label: "Online",
      notificationCount: onlineDestinationNotificationCount,
      notificationSingularLabel: "challenge activity",
      notificationPluralLabel: onlineNotificationLabel ?? "challenge activities",
    },
    ...(onOpenProfile ? [{ id: "profile" as const, label: "Profile", onClick: onOpenProfile }] : []),
    ...(onOpenLibrary ? [{ id: "library" as const, label: "Library", onClick: onOpenLibrary }] : []),
  ];
  const accountStatusMessage = (() => {
    switch (accountStatus) {
      case "checking":
        return "Checking saved account...";
      case "creating":
        return "Creating account...";
      case "signing-in":
        return "Signing in...";
      case "signing-out":
        return "Signing out...";
      case "signing-out-all":
        return "Signing out everywhere...";
      case "deleting":
        return "Deleting account...";
      default:
        return accountError || "";
    }
  })();
  const accountStatusMessageClassName = [
    "online-browser-account-message",
    accountStatus === "error" || Boolean(accountError)
      ? "error"
      : "",
  ].filter(Boolean).join(" ");
  const socialLookupDisplayName = socialLookupName.trim();
  const socialBusy = socialLookupStatus === "loading" || socialAction !== undefined;
  const canSubmitSocialLookup = socialLookupDisplayName.length >= 2 && !socialBusy;
  const canSubmitSocialReport = Boolean(onReportAccount && reportTargetDisplayName && !socialBusy);
  const reportDetailsRemaining = ONLINE_ACCOUNT_REPORT_DETAILS_MAX_LENGTH - reportDetails.length;
  const socialMessageClassName = [
    "online-browser-social-message",
    socialLookupStatus === "error" || socialMessage.startsWith("Could not") || socialMessage.startsWith("No visible")
      ? "error"
      : "",
  ].filter(Boolean).join(" ");
  const socialProfileKey = socialProfile ? normalizeDisplayNameKey(socialProfile.displayName) : null;
  const socialProfileLiveGame = socialProfileKey ? liveGameByRegisteredDisplayName.get(socialProfileKey) ?? null : null;
  const socialProfileAccountChallenge = socialProfileKey
    ? accountChallengeByOpponentDisplayName.get(socialProfileKey)
    : undefined;
  const socialProfilePendingChallenge =
    socialProfileAccountChallenge?.summary.status === "pending" ? socialProfileAccountChallenge : undefined;
  const socialProfileAcceptedChallenge =
    socialProfileAccountChallenge?.summary.status === "accepted" ? socialProfileAccountChallenge : undefined;
  const socialProfileAcceptedChallengeGameId = socialProfileAcceptedChallenge?.summary.gameId;
  const socialProfileLiveGameWhite = socialProfileLiveGame
    ? participantName(socialProfileLiveGame.participants, "w")
    : "";
  const socialProfileLiveGameBlack = socialProfileLiveGame
    ? participantName(socialProfileLiveGame.participants, "b")
    : "";
  const socialProfileHeadToHeadRematchGame =
    socialProfileKey &&
    accountHeadToHeadSummary &&
    normalizeDisplayNameKey(accountHeadToHeadSummary.opponentDisplayName) === socialProfileKey
      ? accountHeadToHeadSummary.latestGame
      : null;
  const pendingChallengeNoticeTitle =
    pendingIncomingChallengeCount > 0
      ? `${formatCount(pendingIncomingChallengeCount, "incoming challenge")} awaiting your response`
      : `${formatCount(pendingOutgoingChallengeCount, "sent challenge")} awaiting response`;
  const challengeNoticeTitle =
    hasPendingChallengeNotice
      ? pendingChallengeNoticeTitle
      : `${formatCount(accountChallengeUnreadActivity.acceptedReady, "accepted challenge game")} ready`;
  const accountChipDisplayName = account?.displayName ?? "Guest";
  const accountChipActionLabel = account ? "Open account controls" : "Open account sign in";
  const accountNavSlot = (
    <OnlineAccountButton
      displayName={accountChipDisplayName}
      onClick={() => setIsAccountDialogOpen(true)}
      ariaLabel={`${accountChipDisplayName} account. ${accountChipActionLabel}`}
      title={accountChipActionLabel}
      className="online-browser-account-chip"
    />
  );

  return (
    <div className="online-browser-page">
      <AppShellNav
        ariaLabel="Online navigation"
        activeDestination="online"
        title="Online"
        kicker="Lobby, Watch, Archive"
        description="Create or accept lobby listings, watch live public games, and replay completed public games."
        backLabel={backLabel}
        onBack={onBack}
        destinations={navDestinations}
        endSlot={accountNavSlot}
      />

      <OnlineAccountDialog
        isOpen={isAccountDialogOpen}
        onClose={() => setIsAccountDialogOpen(false)}
        account={account}
        accountStatus={accountStatus}
        accountError={accountError}
        onCreateAccount={onCreateAccount}
        onSignInAccount={onSignInAccount}
        loadAccountOAuthProviders={loadAccountOAuthProviders}
        onViewProfile={account && (onOpenProfile || canUseAccountSocial) ? openSignedInAccountProfile : undefined}
        onSignOutAccount={onSignOutAccount}
      />

      {account && (onOpenProfile || canUseAccountSocial) && (
        <section className="online-browser-account-panel online-browser-account-handoff" aria-label="Online account">
          <div className="online-browser-account-copy">
            <span className="online-browser-section-kicker">Account</span>
            <strong>{account.displayName}</strong>
            <p>Use Profile for account settings, sessions, privacy, password changes, and dashboard history.</p>
            {accountStatusMessage && (
              <p className={accountStatusMessageClassName} role="status" aria-live="polite">
                {accountStatusMessage}
              </p>
            )}
          </div>
          <div className="online-browser-account-actions">
            <button
              type="button"
              className="online-browser-button primary"
              onClick={openSignedInAccountProfile}
              disabled={!onOpenProfile && socialLookupStatus === "loading"}
            >
              {!onOpenProfile && socialLookupStatus === "loading" ? "Opening Profile" : "My Profile"}
            </button>
          </div>
        </section>
      )}

      {account && canUseAccountSocial && (
        <section className="online-browser-social-panel" aria-label="People">
          <div className="online-browser-section-header online-browser-social-header">
            <div>
              <span className="online-browser-section-kicker">People</span>
              <h2>People</h2>
              <p>Search account names, follow players you trust, and block accounts you do not want to interact with.</p>
            </div>
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={() => void refreshFollowingProfiles()}
              disabled={followingStatus === "loading" || socialAction === "refresh"}
            >
              {followingStatus === "loading" || socialAction === "refresh" ? "Refreshing" : "Refresh Following"}
            </button>
          </div>

          <div className="online-browser-social-grid">
            <form className="online-browser-social-search" onSubmit={handleSocialLookupSubmit}>
              <label>
                <span>Search account name</span>
                <input
                  type="text"
                  aria-label="Search account name"
                  value={socialLookupName}
                  onChange={(event) => setSocialLookupName(event.currentTarget.value)}
                  minLength={2}
                  maxLength={32}
                  autoComplete="off"
                />
              </label>
              <button
                type="submit"
                className="online-browser-button primary"
                disabled={!canSubmitSocialLookup}
              >
                {socialLookupStatus === "loading" ? "Finding" : "Find Account"}
              </button>
              {searchAccountProfiles && (
                <div className="online-browser-social-search-results" role="listbox" aria-label="Account search suggestions">
                  {socialSearchStatus === "loading" && <span>Searching...</span>}
                  {socialSearchStatus === "error" && <span>Search unavailable.</span>}
                  {socialSearchStatus === "ready" && socialSearchResults.length === 0 && (
                    <span>No matching accounts.</span>
                  )}
                  {socialSearchResults.map((profile) => (
                    <button
                      key={profile.displayName}
                      type="button"
                      role="option"
                      onClick={() => handleSocialSearchSelection(profile)}
                      aria-label={`${profile.displayName} rating ${profile.rating?.display ?? "unrated"}`}
                    >
                      <span>{profile.displayName}</span>
                      <span>{profile.rating?.display ?? "unrated"}</span>
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>

          <p className={socialMessageClassName} role="status" aria-live="polite" aria-atomic="true">
            {socialMessage}
          </p>

          {reportTargetDisplayName && onReportAccount && (
            <form
              className="online-browser-report-panel"
              aria-label={`Report ${reportTargetDisplayName}`}
              onSubmit={submitSocialReport}
            >
              <div className="online-browser-following-list-title">
                <strong>Report {reportTargetDisplayName}</strong>
                <span>{reportReason}</span>
              </div>
              <div className="online-browser-report-fields">
                <label>
                  <span>Reason</span>
                  <select
                    value={reportReason}
                    onChange={(event) => setReportReason(event.currentTarget.value as OnlineAccountReportReason)}
                    disabled={socialAction !== undefined}
                  >
                    {ACCOUNT_REPORT_REASON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Details</span>
                  <textarea
                    value={reportDetails}
                    onChange={(event) => setReportDetails(event.currentTarget.value)}
                    maxLength={ONLINE_ACCOUNT_REPORT_DETAILS_MAX_LENGTH}
                    rows={3}
                    disabled={socialAction !== undefined}
                  />
                </label>
              </div>
              <div className="online-browser-report-actions">
                <span>{reportDetailsRemaining} left</span>
                <button
                  type="submit"
                  className="online-browser-button primary"
                  disabled={!canSubmitSocialReport}
                >
                  {socialAction === "report" ? "Submitting" : "Submit Report"}
                </button>
                <button
                  type="button"
                  className="online-browser-button subtle"
                  onClick={cancelSocialReport}
                  disabled={socialAction !== undefined}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {canUseAccountChallenges && hasChallengeNotice && (
            <section
              className="online-browser-challenge-notice"
              aria-label={hasPendingChallengeNotice ? "Pending challenge notice" : "Challenge activity notice"}
            >
              <div>
                <span className="online-browser-section-kicker">Challenges</span>
                <strong>{challengeNoticeTitle}</strong>
                <div className="online-browser-social-badges">
                  {hasUnreadChallengeActivity && <span>New activity</span>}
                  {pendingIncomingChallengeCount > 0 && <span>Incoming</span>}
                  {pendingOutgoingChallengeCount > 0 && (
                    <span>{formatCount(pendingOutgoingChallengeCount, "sent challenge")}</span>
                  )}
                  {accountChallengeUnreadActivity.acceptedReady > 0 && (
                    <span>{formatCount(accountChallengeUnreadActivity.acceptedReady, "game ready")}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="online-browser-button primary"
                onClick={focusAccountChallenges}
              >
                View Challenges
              </button>
            </section>
          )}

          {loadRatingLeaderboard && (
            <section className="online-browser-following-list online-browser-rating-leaders" aria-label="Rating leaders">
              <div className="online-browser-following-list-heading">
                <div className="online-browser-following-list-title">
                  <strong>Rating leaders</strong>
                  <span>
                    {ratingLeaderboardStatus === "loading"
                      ? "Loading"
                      : ratingLeaderboardStatus === "error"
                        ? "Unavailable"
                        : formatCount(ratingLeaderboardEntries.length, "player")}
                  </span>
                </div>
                <div className="online-browser-following-filter" aria-label="Rating leaderboard scope">
                  <button
                    type="button"
                    className={ratingLeaderboardScope === "global" ? "active" : ""}
                    aria-pressed={ratingLeaderboardScope === "global"}
                    onClick={() => setRatingLeaderboardScope("global")}
                  >
                    Global
                  </button>
                  <button
                    type="button"
                    className={ratingLeaderboardScope === "following" ? "active" : ""}
                    aria-pressed={ratingLeaderboardScope === "following"}
                    onClick={() => setRatingLeaderboardScope("following")}
                  >
                    Following
                  </button>
                </div>
                <button
                  type="button"
                  className="online-browser-button subtle"
                  onClick={() => void refreshRatingLeaderboard()}
                  disabled={ratingLeaderboardStatus === "loading"}
                >
                  {ratingLeaderboardStatus === "loading" ? "Refreshing" : "Refresh Leaders"}
                </button>
              </div>
              {ratingLeaderboardStatus === "error" ? (
                <p>Could not load rating leaders.</p>
              ) : ratingLeaderboardStatus === "loading" && ratingLeaderboardEntries.length === 0 ? (
                <p>Loading rating leaders...</p>
              ) : ratingLeaderboardEntries.length === 0 ? (
                <p>{ratingLeaderboardScope === "following" ? "No followed players have rated games yet." : "No rated games yet."}</p>
              ) : (
                <div className="online-browser-following-rows">
                  {ratingLeaderboardEntries.map((entry, index) => {
                    const suffix = entry.rating.games === 1 ? "rated game" : "rated games";
                    return (
                      <article key={entry.displayName} className="online-browser-following-row online-browser-rating-leader-row">
                        <div>
                          <strong>
                            <span className="online-browser-rating-rank">{index + 1}</span>
                            {onOpenProfile ? (
                              <button
                                type="button"
                                className="online-game-player-link"
                                onClick={() => onOpenProfile(entry.displayName)}
                                aria-label={`Open ${entry.displayName} profile from rating leaders`}
                              >
                                {entry.displayName}
                              </button>
                            ) : (
                              entry.displayName
                            )}
                          </strong>
                          <div className="online-browser-social-badges">
                            <span className="online-browser-rating-badge" title={`${entry.rating.games} ${suffix}`}>
                              {entry.rating.display}
                            </span>
                            <span>{entry.rating.provisional ? "Provisional" : "Established"}</span>
                            <span>{formatCount(entry.rating.games, "rated game")}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {followingStatus === "ready" && onlineNowRailProfiles.length > 0 && (
            <section className="online-browser-online-now" aria-label="Online followed players now">
              <div className="online-browser-online-now-heading">
                <div className="online-browser-following-list-title">
                  <strong>Online now</strong>
                  <span>{formatCount(onlineFollowingProfiles.length, "player")}</span>
                </div>
                {onlineFollowingProfiles.length > onlineNowRailProfiles.length && (
                  <span className="online-browser-online-now-overflow">
                    +{onlineFollowingProfiles.length - onlineNowRailProfiles.length} more online
                  </span>
                )}
              </div>
              <div className="online-browser-online-now-rows">
                {onlineNowRailProfiles.map((profile) => {
                  const profileKey = normalizeDisplayNameKey(profile.displayName);
                  const liveGame = liveGameByFollowedDisplayName.get(profileKey);
                  const accountChallenge = accountChallengeByOpponentDisplayName.get(profileKey);
                  const pendingChallenge = accountChallenge?.summary.status === "pending" ? accountChallenge : undefined;
                  const acceptedChallenge = accountChallenge?.summary.status === "accepted" ? accountChallenge : undefined;
                  const acceptedChallengeGameId = acceptedChallenge?.summary.gameId;
                  const canInteractWithProfile = !profile.relationship.blocked && !profile.relationship.self;
                  const pinned = isProfilePinned(profile, pinnedFollowingDisplayNames);
                  const liveGameWhite = liveGame ? participantName(liveGame.participants, "w") : "";
                  const liveGameBlack = liveGame ? participantName(liveGame.participants, "b") : "";
                  return (
                    <article key={profile.displayName} className="online-browser-online-now-card">
                      <div className="online-browser-online-now-main">
                        <strong>
                          {onOpenProfile ? (
                            <button
                              type="button"
                              className="online-game-player-link"
                              onClick={() => onOpenProfile(profile.displayName)}
                              aria-label={`Open ${profile.displayName} profile from online now`}
                            >
                              {profile.displayName}
                            </button>
                          ) : (
                            profile.displayName
                          )}
                        </strong>
                        <div className="online-browser-social-badges">
                          {profile.rating && (
                            <span className="online-browser-rating-badge" title={profileRatingTitle(profile)}>
                              {profile.rating.display}
                            </span>
                          )}
                          <span className={presenceBadgeClassName(profile)}>{formatPresenceLabel(profile)}</span>
                          {pinned && <span className="online-browser-pinned-badge">Pinned</span>}
                          {liveGame && <span>Playing now</span>}
                          {pendingChallenge && (
                            <span>{pendingChallenge.role === "challenged" ? "Incoming challenge" : "Challenge sent"}</span>
                          )}
                          {acceptedChallengeGameId && <span>Game ready</span>}
                        </div>
                      </div>
                      <div className="online-browser-online-now-actions">
                        {liveGame && canInteractWithProfile && (
                          <button
                            type="button"
                            className="online-browser-button primary"
                            onClick={() => onSpectate(liveGame.gameId)}
                            aria-label={`Watch ${profile.displayName}'s live game from online now ${liveGameWhite} vs ${liveGameBlack}, ${liveGame.gameId}`}
                          >
                            Watch
                          </button>
                        )}
                        {acceptedChallengeGameId && onRejoinAccountChallengeGame && (
                          <button
                            type="button"
                            className="online-browser-button primary"
                            onClick={() => onRejoinAccountChallengeGame(acceptedChallengeGameId, acceptedChallenge.summary.visibility)}
                            disabled={rejoiningAccountGameId === acceptedChallengeGameId}
                            aria-label={`Join accepted challenge game ${acceptedChallengeGameId} against ${profile.displayName} from online now`}
                          >
                            {rejoiningAccountGameId === acceptedChallengeGameId ? "Joining..." : "Join Game"}
                          </button>
                        )}
                        {!accountChallenge && onChallengeAccount && canInteractWithProfile && (
                          <button
                            type="button"
                            className="online-browser-button neutral"
                            onClick={() => void runSocialChallengeAction(profile.displayName)}
                            disabled={socialAction !== undefined}
                            aria-label={`Challenge ${profile.displayName} from online now`}
                          >
                            Challenge
                          </button>
                        )}
                        {!accountChallenge && onCopyChallengeAccountInvite && canInteractWithProfile && (
                          <button
                            type="button"
                            className="online-browser-button subtle"
                            onClick={() => void runSocialCopyChallengeInviteAction(profile.displayName)}
                            disabled={socialAction !== undefined}
                            aria-label={`Copy challenge invite for ${profile.displayName} from online now`}
                          >
                            Copy Invite
                          </button>
                        )}
                        {canInteractWithProfile && (
                          <button
                            type="button"
                            className="online-browser-button subtle"
                            onClick={() => showVisiblePlayerHistory(profile.displayName)}
                            disabled={socialAction !== undefined}
                            aria-label={`Show ${profile.displayName} game history from online now`}
                          >
                            History
                          </button>
                        )}
                        <button
                          type="button"
                          className="online-browser-button subtle"
                          onClick={() => togglePinnedFollowingProfile(profile.displayName)}
                          disabled={socialAction !== undefined}
                          aria-label={`${pinned ? "Unpin" : "Pin"} ${profile.displayName} from online now`}
                        >
                          {pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          className="online-browser-button subtle"
                          onClick={() => selectSocialProfile(profile, `Selected ${profile.displayName} from online now.`)}
                          disabled={socialAction !== undefined}
                          aria-label={`Select ${profile.displayName} from online now`}
                        >
                          Select
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {canUseAccountChallenges && (
            <section
              ref={accountChallengesSectionRef}
              className="online-browser-following-list online-browser-account-challenges"
              aria-label="Account challenges"
              tabIndex={-1}
            >
              <div className="online-browser-following-list-heading">
                <div className="online-browser-following-list-title">
                  <strong>Challenges</strong>
                  <span>
                    {accountChallengesStatus === "loading"
                      ? "Loading"
                      : accountChallengesStatus === "error"
                        ? "Unavailable"
                        : accountChallengesStatus === "ready"
                          ? accountChallengeFilter === "pending"
                            ? formatCount(accountChallenges.length, "pending challenge")
                            : formatCount(accountChallenges.length, "challenge")
                          : "Not checked"}
                  </span>
                </div>
                <div className="online-browser-following-filter" role="group" aria-label="Account challenge inbox filter">
                  <button
                    type="button"
                    aria-label="Show pending account challenges"
                    aria-pressed={accountChallengeFilter === "pending"}
                    className={accountChallengeFilter === "pending" ? "active" : ""}
                    onClick={() => handleAccountChallengeFilterChange("pending")}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    aria-label="Show all account challenges"
                    aria-pressed={accountChallengeFilter === "all"}
                    className={accountChallengeFilter === "all" ? "active" : ""}
                    onClick={() => handleAccountChallengeFilterChange("all")}
                  >
                    All
                  </button>
                </div>
              </div>
              <div className="online-browser-account-challenge-actions">
                <button
                  type="button"
                  className="online-browser-button subtle"
                  onClick={() => void refreshAccountChallenges()}
                  disabled={accountChallengesStatus === "loading"}
                >
                  {accountChallengesStatus === "loading" ? "Refreshing" : "Refresh Inbox"}
                </button>
              </div>
              {accountChallengesStatus === "error" ? (
                <p>Could not load account challenges.</p>
              ) : accountChallengesStatus === "loading" && accountChallenges.length === 0 ? (
                <p>Loading account challenges...</p>
              ) : accountChallengesStatus === "idle" ? (
                <p>Refresh challenges to check targeted invites.</p>
              ) : accountChallenges.length === 0 ? (
                <p>
                  {accountChallengeFilter === "pending"
                    ? "No pending account challenges."
                    : "No account challenges yet."}
                </p>
              ) : (
                <div className="online-browser-following-rows">
                  {accountChallenges.map((item) => {
                    const challengeId = item.summary.challengeId;
                    const pendingAction = accountChallengeActionById[challengeId];
                    const expiry = formatPendingAccountChallengeExpiry(item);
                    const canActOnChallenge = item.summary.status === "pending" && !pendingAction;
                    const acceptedChallengeGameId =
                      item.summary.status === "accepted" ? item.summary.gameId : undefined;
                    const opponentDisplayName = challengeOpponentDisplayName(item);
                    const opponentName = opponentDisplayName ?? challengeOpponentName(item);
                    return (
                      <article key={challengeId} className="online-browser-following-row">
                        <div>
                          <strong>
                            {opponentDisplayName && onOpenProfile ? (
                              <button
                                type="button"
                                className="online-game-player-link"
                                onClick={() => onOpenProfile(opponentDisplayName)}
                                aria-label={`Open ${opponentDisplayName} profile from account challenge ${challengeId}`}
                              >
                                {opponentName}
                              </button>
                            ) : (
                              opponentName
                            )}
                          </strong>
                          <div className="online-browser-social-badges">
                            <span>{formatAccountChallengeRole(item.role)}</span>
                            {item.summary.intent === "rematch" && <span>Rematch</span>}
                            <span>{formatAccountChallengeStatus(item)}</span>
                            <span>{formatChallengeSeatChoice(item, account)}</span>
                            {formatChallengeSetupSummary(item).map((detail) => (
                              <span key={detail}>{detail}</span>
                            ))}
                            {expiry?.isSoon && <span className="online-browser-expiring-badge">Expires soon</span>}
                          </div>
                        </div>
                        <div className="online-browser-account-challenge-side">
                          <div className="online-browser-social-badges online-browser-account-challenge-meta">
                            {expiry && <span>{expiry.timeLabel}</span>}
                            <span>{formatUpdatedAt(item.summary.updatedAt)}</span>
                            <span>{challengeId}</span>
                            {item.summary.rematch?.sourceGameId && (
                              <span>Source game {item.summary.rematch.sourceGameId}</span>
                            )}
                            {item.summary.gameId && <span>Game {item.summary.gameId}</span>}
                          </div>
                          <div className="online-browser-social-actions">
                            {item.summary.status === "pending" && item.role === "challenged" && onAcceptAccountChallenge && (
                              <button
                                type="button"
                                className="online-browser-button primary"
                                onClick={() => void runAccountChallengeAction(item, "accept")}
                                disabled={!canActOnChallenge}
                                aria-label={`Accept challenge from ${opponentName}`}
                              >
                                {pendingAction === "accept" ? "Joining..." : "Accept & Join"}
                              </button>
                            )}
                            {item.summary.status === "pending" && item.role === "challenged" && onDeclineAccountChallenge && (
                              <button
                                type="button"
                                className="online-browser-button subtle"
                                onClick={() => void runAccountChallengeAction(item, "decline")}
                                disabled={!canActOnChallenge}
                                aria-label={`Decline challenge from ${opponentName}`}
                              >
                                {pendingAction === "decline" ? "Declining" : "Decline"}
                              </button>
                            )}
                            {item.summary.status === "pending" && item.role === "challenger" && onCancelAccountChallenge && (
                              <button
                                type="button"
                                className="online-browser-button subtle online-browser-button-danger"
                                onClick={() => void runAccountChallengeAction(item, "cancel")}
                                disabled={!canActOnChallenge}
                                aria-label={`Cancel challenge to ${opponentName}`}
                              >
                                {pendingAction === "cancel" ? "Cancelling" : "Cancel"}
                              </button>
                            )}
                            {opponentDisplayName && onReportAccount && (
                              <button
                                type="button"
                                className="online-browser-button subtle"
                                onClick={() => openSocialReport(opponentDisplayName)}
                                disabled={socialAction !== undefined}
                                aria-label={`Report ${opponentDisplayName} from challenge row`}
                              >
                                Report
                              </button>
                            )}
                            {opponentDisplayName && onBlockAccount && (
                              <button
                                type="button"
                                className="online-browser-button subtle online-browser-button-danger"
                                onClick={() => void blockAccountChallengeOpponent(opponentDisplayName)}
                                disabled={socialAction !== undefined}
                                aria-label={`Block ${opponentDisplayName} from challenge row`}
                              >
                                Block
                              </button>
                            )}
                            {acceptedChallengeGameId && onRejoinAccountChallengeGame && (
                              <button
                                type="button"
                                className="online-browser-button primary"
                                onClick={() => onRejoinAccountChallengeGame(acceptedChallengeGameId, item.summary.visibility)}
                                disabled={rejoiningAccountGameId === acceptedChallengeGameId}
                                aria-label={`Join accepted challenge game ${acceptedChallengeGameId} against ${opponentName}`}
                              >
                                {rejoiningAccountGameId === acceptedChallengeGameId ? "Joining..." : "Join Game"}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {socialProfile && (
            <article
              ref={socialProfileCardRef}
              className="online-browser-profile-card"
              aria-label={`Profile ${socialProfile.displayName}`}
              tabIndex={-1}
            >
              <div className="online-browser-profile-main">
                <strong>
                  {onOpenProfile ? (
                    <button
                      type="button"
                      className="online-game-player-link"
                      onClick={() => onOpenProfile(socialProfile.displayName)}
                      aria-label={`Open ${socialProfile.displayName} public profile`}
                    >
                      {socialProfile.displayName}
                    </button>
                  ) : (
                    socialProfile.displayName
                  )}
                </strong>
                <div className="online-browser-social-badges">
                  {socialProfile.rating && (
                    <span className="online-browser-rating-badge" title={profileRatingTitle(socialProfile)}>
                      {socialProfile.rating.display}
                    </span>
                  )}
                  <span className={presenceBadgeClassName(socialProfile)}>{formatPresenceLabel(socialProfile)}</span>
                  <span>{formatRelationshipLabel(socialProfile)}</span>
                  {socialProfilePendingChallenge && (
                    <span>{socialProfilePendingChallenge.role === "challenged" ? "Incoming challenge" : "Challenge sent"}</span>
                  )}
                  {socialProfileAcceptedChallengeGameId && <span>Game ready</span>}
                </div>
              </div>
              {!socialProfile.relationship.self && (
                <div className="online-browser-social-actions">
                  {socialProfile.relationship.blocked ? (
                    <>
                      <button
                        type="button"
                        className="online-browser-button subtle"
                        onClick={() => void runSocialProfileAction("unblock", socialProfile.displayName)}
                        disabled={socialAction !== undefined}
                        aria-label={`Unblock ${socialProfile.displayName}`}
                      >
                        {socialAction === "unblock" ? "Unblocking" : "Unblock"}
                      </button>
                      {onReportAccount && (
                        <button
                          type="button"
                          className="online-browser-button subtle online-browser-button-danger"
                          onClick={() => openSocialReport(socialProfile.displayName, socialProfile)}
                          disabled={socialAction !== undefined}
                          aria-label={`Report ${socialProfile.displayName}`}
                        >
                          Report
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {socialProfileLiveGame && (
                        <button
                          type="button"
                          className="online-browser-button primary"
                          onClick={() => onSpectate(socialProfileLiveGame.gameId)}
                          disabled={socialAction !== undefined}
                          aria-label={`Watch ${socialProfile.displayName}'s live game from profile ${socialProfileLiveGameWhite} vs ${socialProfileLiveGameBlack}, ${socialProfileLiveGame.gameId}`}
                        >
                          Watch
                        </button>
                      )}
                      {socialProfileAcceptedChallengeGameId && onRejoinAccountChallengeGame && (
                        <button
                          type="button"
                          className="online-browser-button primary"
                          onClick={() => onRejoinAccountChallengeGame(
                            socialProfileAcceptedChallengeGameId,
                            socialProfileAcceptedChallenge.summary.visibility
                          )}
                          disabled={rejoiningAccountGameId === socialProfileAcceptedChallengeGameId}
                          aria-label={`Join accepted challenge game ${socialProfileAcceptedChallengeGameId} against ${socialProfile.displayName}`}
                        >
                          {rejoiningAccountGameId === socialProfileAcceptedChallengeGameId ? "Joining..." : "Join Game"}
                        </button>
                      )}
                      {!socialProfileAccountChallenge && onChallengeAccount && (
                        <button
                          type="button"
                          className="online-browser-button neutral"
                          onClick={() => void runSocialChallengeAction(socialProfile.displayName)}
                          disabled={socialAction !== undefined}
                          aria-label={`Challenge ${socialProfile.displayName}`}
                        >
                          {socialAction === "challenge" ? "Challenging" : "Challenge"}
                        </button>
                      )}
                      {!socialProfileAccountChallenge && onChallengeAccount && socialProfileHeadToHeadRematchGame && (
                        <button
                          type="button"
                          className="online-browser-button neutral"
                          onClick={() => void runSocialChallengeAction(socialProfile.displayName, {
                            intent: "rematch",
                            sourceGameId: socialProfileHeadToHeadRematchGame.gameId,
                          })}
                          disabled={socialAction !== undefined}
                          aria-label={`Rematch ${socialProfile.displayName} from latest head-to-head game ${socialProfileHeadToHeadRematchGame.gameId}`}
                        >
                          Rematch
                        </button>
                      )}
                      {!socialProfileAccountChallenge && onCopyChallengeAccountInvite && (
                        <button
                          type="button"
                          className="online-browser-button subtle"
                          onClick={() => void runSocialCopyChallengeInviteAction(socialProfile.displayName)}
                          disabled={socialAction !== undefined}
                          aria-label={`Copy challenge invite for ${socialProfile.displayName}`}
                        >
                          {socialAction === "copy-invite" ? "Copying" : "Copy Invite"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="online-browser-button subtle"
                        onClick={() => showVisiblePlayerHistory(socialProfile.displayName)}
                        disabled={socialAction !== undefined}
                        aria-label={`Show ${socialProfile.displayName} game history from profile`}
                      >
                        History
                      </button>
                      {socialProfile.relationship.following ? (
                        <button
                          type="button"
                          className="online-browser-button subtle"
                          onClick={() => void runSocialProfileAction("unfollow", socialProfile.displayName)}
                          disabled={socialAction !== undefined}
                          aria-label={`Unfollow ${socialProfile.displayName}`}
                        >
                          {socialAction === "unfollow" ? "Unfollowing" : "Unfollow"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="online-browser-button primary"
                          onClick={() => void runSocialProfileAction("follow", socialProfile.displayName)}
                          disabled={socialAction !== undefined}
                          aria-label={`Follow ${socialProfile.displayName}`}
                        >
                          {socialAction === "follow" ? "Following" : "Follow"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="online-browser-button subtle online-browser-button-danger"
                        onClick={() => void runSocialProfileAction("block", socialProfile.displayName)}
                        disabled={socialAction !== undefined}
                        aria-label={`Block ${socialProfile.displayName}`}
                      >
                        {socialAction === "block" ? "Blocking" : "Block"}
                      </button>
                      {onReportAccount && (
                        <button
                          type="button"
                          className="online-browser-button subtle online-browser-button-danger"
                          onClick={() => openSocialReport(socialProfile.displayName, socialProfile)}
                          disabled={socialAction !== undefined}
                          aria-label={`Report ${socialProfile.displayName}`}
                        >
                          Report
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </article>
          )}

          <section className="online-browser-following-list" aria-label="Followed players">
            <div className="online-browser-following-list-heading">
              <div className="online-browser-following-list-title">
                <strong>Following</strong>
                <span>
                  {followingStatus === "loading"
                    ? "Loading"
                    : followingStatus === "error"
                      ? "Unavailable"
                      : followingPresenceFilter === "online"
                        ? `${onlineFollowingProfiles.length} online`
                        : formatCount(followingProfiles.length, "player")}
                </span>
              </div>
              <div className="online-browser-following-filter" role="group" aria-label="Followed players filter">
                <button
                  type="button"
                  aria-label="Show all followed players"
                  aria-pressed={followingPresenceFilter === "all"}
                  className={followingPresenceFilter === "all" ? "active" : ""}
                  onClick={() => setFollowingPresenceFilter("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  aria-label="Show online followed players"
                  aria-pressed={followingPresenceFilter === "online"}
                  className={followingPresenceFilter === "online" ? "active" : ""}
                  onClick={() => setFollowingPresenceFilter("online")}
                >
                  Online
                </button>
              </div>
            </div>
            {followingStatus === "error" ? (
              <p>Could not load followed players.</p>
            ) : followingStatus === "loading" && followingProfiles.length === 0 ? (
              <p>Loading followed players...</p>
            ) : followingProfiles.length === 0 ? (
              <p>No followed players yet.</p>
            ) : visibleFollowingProfiles.length === 0 ? (
              <p>No followed players online.</p>
            ) : (
              <div className="online-browser-following-rows">
                {visibleFollowingProfiles.map((profile) => {
                  const profileKey = normalizeDisplayNameKey(profile.displayName);
                  const liveGame = liveGameByFollowedDisplayName.get(profileKey);
                  const accountChallenge = accountChallengeByOpponentDisplayName.get(profileKey);
                  const pendingChallenge = accountChallenge?.summary.status === "pending" ? accountChallenge : undefined;
                  const acceptedChallenge = accountChallenge?.summary.status === "accepted" ? accountChallenge : undefined;
                  const acceptedChallengeGameId = acceptedChallenge?.summary.gameId;
                  const pendingChallengeId = pendingChallenge?.summary.challengeId;
                  const pendingChallengeAction = pendingChallengeId
                    ? accountChallengeActionById[pendingChallengeId]
                    : undefined;
                  const canActOnPendingChallenge =
                    !!pendingChallenge &&
                    pendingChallenge.summary.status === "pending" &&
                    pendingChallengeAction === undefined;
                  const canInteractWithProfile = !profile.relationship.blocked && !profile.relationship.self;
                  const pinned = isProfilePinned(profile, pinnedFollowingDisplayNames);
                  const privateNote = followingNotes[profileKey] ?? "";
                  const isEditingPrivateNote = editingFollowingNoteKey === profileKey;
                  const liveGameWhite = liveGame ? participantName(liveGame.participants, "w") : "";
                  const liveGameBlack = liveGame ? participantName(liveGame.participants, "b") : "";
                  const latestHeadToHeadRematchGame =
                    accountHeadToHeadSummary &&
                    normalizeDisplayNameKey(accountHeadToHeadSummary.opponentDisplayName) === profileKey
                      ? accountHeadToHeadSummary.latestGame
                      : null;
                  return (
                    <article key={profile.displayName} className="online-browser-following-row">
                      <div>
                        <strong>
                          {onOpenProfile ? (
                            <button
                              type="button"
                              className="online-game-player-link"
                              onClick={() => onOpenProfile(profile.displayName)}
                              aria-label={`Open ${profile.displayName} profile from following`}
                            >
                              {profile.displayName}
                            </button>
                          ) : (
                            profile.displayName
                          )}
                        </strong>
                        <div className="online-browser-social-badges">
                          {profile.rating && (
                            <span className="online-browser-rating-badge" title={profileRatingTitle(profile)}>
                              {profile.rating.display}
                            </span>
                          )}
                          <span className={presenceBadgeClassName(profile)}>{formatPresenceLabel(profile)}</span>
                          {pinned && <span className="online-browser-pinned-badge">Pinned</span>}
                          {liveGame && <span>Playing now</span>}
                          {pendingChallenge && (
                            <span>{pendingChallenge.role === "challenged" ? "Incoming challenge" : "Challenge sent"}</span>
                          )}
                          {acceptedChallengeGameId && <span>Game ready</span>}
                          <span>{formatRelationshipLabel(profile)}</span>
                          {privateNote && <span>Private note</span>}
                        </div>
                        {privateNote && !isEditingPrivateNote && (
                          <p className="online-browser-private-note">
                            <span>Private note</span>
                            {privateNote}
                          </p>
                        )}
                        {isEditingPrivateNote && (
                          <form
                            className="online-browser-private-note-editor"
                            onSubmit={(event) => saveFollowingNote(event, profile.displayName)}
                          >
                            <label>
                              <span>Private note for {profile.displayName}</span>
                              <textarea
                                value={followingNoteDraft}
                                onChange={(event) => setFollowingNoteDraft(event.currentTarget.value)}
                                maxLength={FOLLOWING_NOTE_MAX_LENGTH}
                                rows={2}
                              />
                            </label>
                            <div className="online-browser-private-note-actions">
                              <button type="submit" className="online-browser-button primary">
                                Save Note
                              </button>
                              <button
                                type="button"
                                className="online-browser-button subtle"
                                onClick={cancelFollowingNoteEditor}
                              >
                                Cancel
                              </button>
                              {privateNote && (
                                <button
                                  type="button"
                                  className="online-browser-button subtle online-browser-button-danger"
                                  onClick={() => clearFollowingNote(profile.displayName)}
                                  aria-label={`Clear private note for ${profile.displayName}`}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </form>
                        )}
                      </div>
                      <div className="online-browser-social-actions">
                        {liveGame && canInteractWithProfile && (
                          <button
                            type="button"
                            className="online-browser-button primary"
                            onClick={() => onSpectate(liveGame.gameId)}
                            aria-label={`Watch ${profile.displayName}'s live game ${liveGameWhite} vs ${liveGameBlack}, ${liveGame.gameId}`}
                          >
                            Watch
                          </button>
                        )}
                        {pendingChallenge?.role === "challenged" && onAcceptAccountChallenge && (
                          <button
                            type="button"
                            className="online-browser-button primary"
                            onClick={() => void runAccountChallengeAction(pendingChallenge, "accept")}
                            disabled={!canActOnPendingChallenge}
                            aria-label={`Accept challenge from ${profile.displayName}`}
                          >
                            {pendingChallengeAction === "accept" ? "Joining..." : "Accept & Join"}
                          </button>
                        )}
                        {pendingChallenge?.role === "challenged" && onDeclineAccountChallenge && (
                          <button
                            type="button"
                            className="online-browser-button subtle"
                            onClick={() => void runAccountChallengeAction(pendingChallenge, "decline")}
                            disabled={!canActOnPendingChallenge}
                            aria-label={`Decline challenge from ${profile.displayName}`}
                          >
                            {pendingChallengeAction === "decline" ? "Declining" : "Decline"}
                          </button>
                        )}
                        {pendingChallenge?.role === "challenger" && onCancelAccountChallenge && (
                          <button
                            type="button"
                            className="online-browser-button subtle online-browser-button-danger"
                            onClick={() => void runAccountChallengeAction(pendingChallenge, "cancel")}
                            disabled={!canActOnPendingChallenge}
                            aria-label={`Cancel challenge to ${profile.displayName}`}
                          >
                            {pendingChallengeAction === "cancel" ? "Cancelling" : "Cancel"}
                          </button>
                        )}
                        {acceptedChallengeGameId && onRejoinAccountChallengeGame && (
                          <button
                            type="button"
                            className="online-browser-button primary"
                            onClick={() => onRejoinAccountChallengeGame(acceptedChallengeGameId, acceptedChallenge.summary.visibility)}
                            disabled={rejoiningAccountGameId === acceptedChallengeGameId}
                            aria-label={`Join accepted challenge game ${acceptedChallengeGameId} against ${profile.displayName}`}
                          >
                            {rejoiningAccountGameId === acceptedChallengeGameId ? "Joining..." : "Join Game"}
                          </button>
                        )}
                        {!accountChallenge && onChallengeAccount && canInteractWithProfile && (
                          <button
                            type="button"
                            className="online-browser-button neutral"
                            onClick={() => void runSocialChallengeAction(profile.displayName)}
                            disabled={socialAction !== undefined}
                            aria-label={`Challenge ${profile.displayName}`}
                          >
                            Challenge
                          </button>
                        )}
                        {!accountChallenge && onChallengeAccount && canInteractWithProfile && latestHeadToHeadRematchGame && (
                          <button
                            type="button"
                            className="online-browser-button neutral"
                            onClick={() => void runSocialChallengeAction(profile.displayName, {
                              intent: "rematch",
                              sourceGameId: latestHeadToHeadRematchGame.gameId,
                            })}
                            disabled={socialAction !== undefined}
                            aria-label={`Rematch ${profile.displayName} from latest head-to-head game ${latestHeadToHeadRematchGame.gameId}`}
                          >
                            Rematch
                          </button>
                        )}
                        {!accountChallenge && onCopyChallengeAccountInvite && canInteractWithProfile && (
                          <button
                            type="button"
                            className="online-browser-button subtle"
                            onClick={() => void runSocialCopyChallengeInviteAction(profile.displayName)}
                            disabled={socialAction !== undefined}
                            aria-label={`Copy challenge invite for ${profile.displayName}`}
                          >
                            {socialAction === "copy-invite" ? "Copying" : "Copy Invite"}
                          </button>
                        )}
                        {canInteractWithProfile && (
                          <button
                            type="button"
                            className="online-browser-button subtle"
                            onClick={() => showVisiblePlayerHistory(profile.displayName)}
                            disabled={socialAction !== undefined}
                            aria-label={`Show ${profile.displayName} game history from following list`}
                          >
                            History
                          </button>
                        )}
                        <button
                          type="button"
                          className="online-browser-button subtle"
                          onClick={() => openFollowingNoteEditor(profile.displayName)}
                          disabled={socialAction !== undefined}
                          aria-label={`${privateNote ? "Edit" : "Add"} private note for ${profile.displayName}`}
                        >
                          {privateNote ? "Edit Note" : "Note"}
                        </button>
                        <button
                          type="button"
                          className="online-browser-button subtle"
                          onClick={() => togglePinnedFollowingProfile(profile.displayName)}
                          disabled={socialAction !== undefined}
                          aria-label={`${pinned ? "Unpin" : "Pin"} ${profile.displayName} from following list`}
                        >
                          {pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          className="online-browser-button subtle"
                          onClick={() => selectSocialProfile(profile)}
                          disabled={socialAction !== undefined}
                          aria-label={`Select ${profile.displayName}`}
                        >
                          Select
                        </button>
                        {onReportAccount && (
                          <button
                            type="button"
                            className="online-browser-button subtle online-browser-button-danger"
                            onClick={() => openSocialReport(profile.displayName, profile)}
                            disabled={socialAction !== undefined}
                            aria-label={`Report ${profile.displayName} from following list`}
                          >
                            Report
                          </button>
                        )}
                        <button
                          type="button"
                          className="online-browser-button subtle"
                          onClick={() => void runSocialProfileAction("unfollow", profile.displayName)}
                          disabled={socialAction !== undefined}
                          aria-label={`Unfollow ${profile.displayName} from following list`}
                        >
                          Unfollow
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      )}

      <section
        className={`online-browser-toolbar online-browser-toolbar-${tab} ${filterPanelOpen ? "filters-open" : "filters-closed"}`}
        aria-label="Online browser controls"
      >
        <div className="online-browser-tabs" role="group" aria-label="Online game lists">
          <button
            type="button"
            aria-label="Lobby games"
            aria-pressed={tab === "lobby"}
            className={tab === "lobby" ? "active" : ""}
            onClick={() => setBrowserTab("lobby")}
          >
            Lobby
          </button>
          <button
            type="button"
            aria-label="Live public games"
            aria-pressed={tab === "watch"}
            className={tab === "watch" ? "active" : ""}
            onClick={() => setBrowserTab("watch")}
          >
            Watch
          </button>
          <button
            type="button"
            aria-label="Online Archive"
            aria-pressed={tab === "archive"}
            className={tab === "archive" ? "active" : ""}
            onClick={() => setBrowserTab("archive")}
            ref={archiveTabButtonRef}
          >
            Archive
          </button>
        </div>
        <label className="online-browser-search">
          <span>Search</span>
          <input
            type="search"
            aria-label={gameSearchAriaLabel}
            ref={gameSearchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={tab === "lobby" ? undefined : ONLINE_GAME_DIRECTORY_SEARCH_MAX_LENGTH}
            placeholder={gameSearchPlaceholder}
          />
        </label>
        <div className="online-browser-toolbar-actions" role="group" aria-label={`${tab} controls`}>
          <button
            type="button"
            className={`online-browser-button subtle online-browser-filter-toggle ${hasActiveFilterPanelControls ? "active" : ""}`}
            onClick={toggleFilterPanel}
            aria-expanded={filterPanelOpen}
            aria-controls={filterPanelId}
            aria-label={`${filterToggleLabel}. ${filterStatusLabel}`}
          >
            <span>Filters</span>
            {hasActiveFilterPanelControls && <span className="online-browser-filter-active-label">Active</span>}
          </button>
          {tab === "lobby" ? (
            <button
              type="button"
              className="online-browser-button neutral"
              onClick={() => void loadOpenSeekPage({ background: false })}
              disabled={seekStatus === "loading" || isSeekLoadInFlight || quickMatchBlocking}
              aria-label="Refresh lobby listings"
            >
              {seekStatus === "loading" ? "Refreshing..." : "Refresh listings"}
            </button>
          ) : (
            <button
              type="button"
              className="online-browser-button neutral"
              onClick={refreshGames}
              disabled={status === "loading"}
              aria-label={tab === "archive" ? "Refresh online archive" : "Refresh live public games"}
            >
              {status === "loading" ? "Refreshing..." : tab === "archive" ? "Refresh archive" : "Refresh games"}
            </button>
          )}
        </div>
        {filterPanelOpen && (
          tab === "lobby" ? (
            <div id={filterPanelId} className="online-browser-filter-panel" role="group" aria-label="Find lobby listings">
              <div className="online-browser-control-title">Listing filters</div>
              <div className="online-browser-filter-grid">
                <label className="online-browser-select">
                  <span>Creator side</span>
                  <select
                    aria-label="Lobby creator side filter"
                    value={seekSideFilter}
                    onChange={(event) => setSeekSideFilter(event.currentTarget.value as OpenSeekSideFilter)}
                  >
                    <option value="all">All creator sides</option>
                    <option value="random">Random</option>
                    <option value="w">White</option>
                    <option value="b">Black</option>
                  </select>
                </label>
                <label className="online-browser-select">
                  <span>Clock</span>
                  <select
                    aria-label="Lobby clock filter"
                    value={seekClockFilter}
                    onChange={(event) => setSeekClockFilter(event.currentTarget.value as OpenSeekClockFilter)}
                  >
                    <option value="all">All clocks</option>
                    <option value="timed">Timed</option>
                    <option value="casual">Casual</option>
                  </select>
                </label>
                <label className="online-browser-select">
                  <span>Scoring</span>
                  <select
                    aria-label="Lobby scoring filter"
                    value={seekVpFilter}
                    onChange={(event) => setSeekVpFilter(event.currentTarget.value as OpenSeekVpFilter)}
                  >
                    <option value="all">All scoring</option>
                    <option value="enabled">Victory points</option>
                    <option value="disabled">Castle control</option>
                  </select>
                </label>
                <label className="online-browser-select">
                  <span>Rating</span>
                  <select
                    aria-label="Lobby rating filter"
                    value={seekRatingFilter}
                    onChange={(event) => setSeekRatingFilter(event.currentTarget.value as OnlineBrowserRatingFilter)}
                  >
                    <option value="all">All ratings</option>
                    <option value="casual">Casual</option>
                    <option value="rated">Rated</option>
                  </select>
                </label>
                {canUseAccountSocial && (
                  <label className="online-browser-select">
                    <span>People</span>
                    <select
                      aria-label="Followed players filter"
                      value={friendFilter}
                      onChange={(event) => setFriendFilter(event.currentTarget.value as OnlineFriendFilter)}
                    >
                      <option value="all">All players</option>
                      <option value="followed" disabled={followingStatus !== "ready"}>
                        Followed players only
                      </option>
                    </select>
                  </label>
                )}
              </div>
            </div>
          ) : (
            <div id={filterPanelId} className="online-browser-filter-panel" role="group" aria-label={filterPanelLabel}>
              <div className="online-browser-control-title">{tab === "watch" ? "Live-game filters" : "Archive filters"}</div>
              <div className="online-browser-filter-grid">
                <label className="online-browser-select">
                  <span>Sort</span>
                  <select
                    aria-label={gameSortAriaLabel}
                    value={tab === "archive" && sort === "watchers" ? "newest" : sort}
                    onChange={(event) => setSort(event.currentTarget.value as OnlineBrowserSort)}
                  >
                    <option value="newest">Newest</option>
                    <option value="moves">Most moves</option>
                    {tab === "watch" && <option value="watchers">Most watched in current list</option>}
                  </select>
                </label>
                <label className="online-browser-select">
                  <span>Clock</span>
                  <select
                    aria-label="Time control filter"
                    value={timeFilter}
                    onChange={(event) => setTimeFilter(event.currentTarget.value as OnlineBrowserTimeFilter)}
                  >
                    <option value="all">All clocks</option>
                    <option value="timed">Timed</option>
                    <option value="casual">Casual</option>
                  </select>
                </label>
                <label className="online-browser-select">
                  <span>Rating</span>
                  <select
                    aria-label="Rating filter"
                    value={ratingFilter}
                    onChange={(event) => setRatingFilter(event.currentTarget.value as OnlineBrowserRatingFilter)}
                  >
                    <option value="all">All ratings</option>
                    <option value="casual">Casual</option>
                    <option value="rated">Rated</option>
                  </select>
                </label>
                {canUseAccountSocial && (
                  <label className="online-browser-select">
                    <span>People</span>
                    <select
                      aria-label="Followed players filter"
                      value={friendFilter}
                      onChange={(event) => setFriendFilter(event.currentTarget.value as OnlineFriendFilter)}
                    >
                      <option value="all">All players</option>
                      <option value="followed" disabled={followingStatus !== "ready"}>
                        Followed players only
                      </option>
                    </select>
                  </label>
                )}
                {tab === "archive" && (
                  <label className="online-browser-select">
                    <span>Result</span>
                    <select
                      aria-label="Result filter"
                      value={resultFilter}
                      onChange={(event) => setResultFilter(event.currentTarget.value as OnlineBrowserResultFilter)}
                    >
                      <option value="all">All results</option>
                      <option value="white">White wins</option>
                      <option value="black">Black wins</option>
                      <option value="resignation">Resignation</option>
                      <option value="timeout">Timeout</option>
                      <option value="castle_control">Castle control</option>
                      <option value="victory_points">Victory points</option>
                      <option value="monarch_captured">Monarch captured</option>
                    </select>
                  </label>
                )}
              </div>
            </div>
          )
        )}
      </section>

      {canUseAccountSocial && friendFilter === "followed" && (
        <div className={`online-browser-filter-note ${friendFilterUnavailable ? "error" : ""}`}>
          {friendFilterUnavailable
            ? "Following list unavailable. Use Refresh Following to retry, or switch back to All players."
            : followedFilterDescription}
        </div>
      )}

      <div className="online-browser-status-line" role="status" aria-live="polite">
        {tab === "lobby"
          ? seekStatus === "loading"
            ? "Loading lobby listings..."
            : seekStatus === "error"
              ? "Could not load lobby listings."
              : copyMessage || seekActionMessage || quickMatchMessage || createSeekMessage || terminalOwnedSeekMessage || (
                <>
                  {visibleOpenSeeks.length} lobby listings shown
                  {seekNextCursor ? <span aria-hidden="true">; more listings available</span> : null}
                  {lastSeekCheckedAt ? <span aria-hidden="true">; last checked {lastSeekCheckedAt}</span> : null}
                </>
              )
          : status === "loading"
            ? tab === "archive" ? "Loading online archive..." : "Loading public games..."
            : status === "error"
              ? tab === "archive" ? "Could not load online archive." : "Could not load public games."
              : copyMessage || (tab === "archive" ? recentClearMessage : "") ||
                (tab === "archive"
                  ? archiveStatusMessage
                  : `${visibleGames.length} public live games shown${nextCursor ? "; more available" : ""}`)}
      </div>
      {tab === "lobby" && seekStatus === "ready" && lastSeekCheckedAt ? (
        <div className="online-browser-visually-hidden" aria-live="off">
          Last checked {lastSeekCheckedAt}
        </div>
      ) : null}

      {tab === "lobby" ? (
        seekStatus === "error" ? (
          <button
            type="button"
            className="online-browser-button neutral"
            onClick={() => void loadOpenSeekPage()}
          >
            Retry
          </button>
        ) : (
          <main className="online-browser-list" aria-label="Online lobby">
            <section
              className={`online-browser-quick-match-panel ${hasCurrentSetupActions ? "" : "setup-needed"}`}
              aria-label={hasCurrentSetupActions ? "Play from current setup" : "Set up lobby play"}
            >
              <div className="online-browser-quick-match-copy">
                <span className="online-browser-section-kicker">
                  {hasCurrentSetupActions ? "Play from current setup" : "Setup needed"}
                </span>
                <strong>
                  {hasCurrentSetupActions
                    ? "Try open listings with your current Play setup"
                    : "Choose a Play setup before lobby play"}
                </strong>
                <p>
                  {hasCurrentSetupActions
                    ? "Quick Match tries open listings for this setup, then lists yours if none are available. Filters only change the listings below."
                    : "Quick Match and lobby listings use the board, pieces, clock, and scoring from Play."}
                </p>
              </div>
              {quickMatchSetupSummary && (
                <div className="online-browser-quick-match-summary" aria-label="Quick match setup summary">
                  <span>Radius {quickMatchSetupSummary.boardRadius}</span>
                  <span>{quickMatchSetupSummary.clock}</span>
                  <span>{quickMatchSetupSummary.scoring}</span>
                  <span>{quickMatchSetupSummary.rating}</span>
                </div>
              )}
              <div className="online-browser-quick-match-actions">
                {hasCurrentSetupActions ? (
                  <>
                    {onQuickMatch && (
                      <button
                        type="button"
                        ref={quickMatchButtonRef}
                        className="online-browser-button primary online-browser-quick-match"
                        onClick={() => void runQuickMatch()}
                        disabled={quickMatchDisabled}
                        aria-label="Quick Match: try open lobby listings or list yours"
                      >
                        {quickMatchPending ? "Matching..." : quickMatchStatus === "matched" ? "Opening..." : "Quick Match"}
                      </button>
                    )}
                    {onCreateSeek && (
                      <>
                        <button
                          type="button"
                          className="online-browser-button neutral online-browser-create-seek"
                          onClick={() => void runCreateSeek()}
                          disabled={createSeekDisabled}
                          aria-label="Create public lobby listing from current Play setup"
                        >
                          {createSeekPending ? "Listing..." : "Create Lobby Listing"}
                        </button>
                        {account && (
                          <>
                            <button
                              type="button"
                              className="online-browser-button subtle online-browser-create-seek"
                              onClick={() => void runCreateSeek("followed")}
                              disabled={createSeekDisabled}
                              aria-label="Create followed-player lobby listing from current Play setup"
                            >
                              {createSeekPending ? "Listing..." : "List for Followed Players"}
                            </button>
                            <label className="online-browser-invite-field">
                              <span>Invite account</span>
                              <input
                                type="text"
                                aria-label="Invite account to lobby listing"
                                value={inviteDisplayName}
                                onChange={(event) => setInviteDisplayName(event.currentTarget.value)}
                                maxLength={32}
                                disabled={createSeekPending || quickMatchBlocking}
                              />
                            </label>
                            <button
                              type="button"
                              className="online-browser-button subtle online-browser-create-seek"
                              onClick={() => void runCreateSeek("invited", {
                                invitedDisplayNames: [normalizedInviteDisplayName],
                              })}
                              disabled={createInvitedSeekDisabled}
                              aria-label="Create invite-only lobby listing from current Play setup"
                            >
                              {createSeekPending ? "Listing..." : "List for Invited Account"}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="online-browser-button primary online-browser-setup-action"
                    onClick={setupPromptAction}
                    aria-label="Configure a Play setup for online lobby"
                  >
                    Configure Setup
                  </button>
                )}
              </div>
            </section>
            {visibleOwnedSeekResponse?.summary && (
              <section
                className="online-seek-owner-panel"
                aria-label="Your lobby listing"
                ref={ownedSeekPanelRef}
                tabIndex={-1}
              >
                <div className="online-game-row-main">
                  <div className="online-game-players">
                    <strong>Your lobby listing</strong>
                    <span>{visibleOwnedSeekResponse.summary.seekId}</span>
                  </div>
                  <div className="online-game-meta">
                    <span className={`online-game-pill ${visibleOwnedSeekResponse.summary.status}`}>
                      {formatSeekStatus(visibleOwnedSeekResponse.summary.status)}
                    </span>
                    <span>{formatOwnedSeekSideDetail(visibleOwnedSeekResponse)}</span>
                    <span>{formatSeekClock(visibleOwnedSeekResponse.summary)}</span>
                    <span>{formatSeekScoringLabel(visibleOwnedSeekResponse.summary)}</span>
                    <span>Rating {formatSeekRatingLabel(visibleOwnedSeekResponse.summary)}</span>
                    <span>Expires {formatSeekExpiresAt(visibleOwnedSeekResponse.summary.expiresAt)}</span>
                  </div>
                </div>
                <div className="online-game-actions">
                  {visibleOwnedSeekResponse.summary.status === "open" && (
                    <>
                      <button
                        type="button"
                        className="online-browser-button neutral"
                        onClick={() => void runOwnedSeekRefresh()}
                        disabled={!onRefreshOwnedSeek || ownedSeekAction !== undefined || quickMatchBlocking}
                        aria-label="Refresh your lobby listing"
                      >
                        {ownedSeekAction === "refresh" ? "Refreshing..." : "Refresh Listing"}
                      </button>
                      <button
                        type="button"
                        className="online-browser-button neutral"
                        onClick={() => void runSeekAction(visibleOwnedSeekResponse.summary.seekId, "cancel")}
                        disabled={!onCancelSeek || seekActionById[visibleOwnedSeekResponse.summary.seekId] !== undefined || quickMatchBlocking}
                        aria-label="Cancel your lobby listing"
                      >
                        {seekActionById[visibleOwnedSeekResponse.summary.seekId] === "cancel" ? "Cancelling..." : "Cancel"}
                      </button>
                    </>
                  )}
                  {visibleOwnedSeekResponse.summary.status === "accepted" && visibleOwnedSeekResponse.gameInvite && (
                    <button
                      type="button"
                      className="online-browser-button primary"
                      onClick={runOwnedSeekJoin}
                      disabled={!onJoinOwnedSeek || ownedSeekAction !== undefined || quickMatchBlocking}
                      aria-label="Join accepted game"
                    >
                      {ownedSeekAction === "join" ? "Joining..." : "Join Game"}
                    </button>
                  )}
                </div>
              </section>
            )}
            {closedOwnedSeekResponse?.summary && (
              <section
                className="online-browser-closed-listing"
                aria-label="Closed lobby listing"
                ref={closedOwnedSeekPanelRef}
                tabIndex={-1}
              >
                <div className="online-browser-quick-match-copy">
                  <span className="online-browser-section-kicker">Lobby listing closed</span>
                  <strong>This listing is no longer public</strong>
                  <p>
                    Cancelled and expired listings are removed from the Lobby. Create a new listing from your
                    current Play setup when you want another opponent.
                  </p>
                  <div className="online-game-meta">
                    <span className={`online-game-pill ${closedOwnedSeekResponse.summary.status}`}>
                      {formatSeekStatus(closedOwnedSeekResponse.summary.status)}
                    </span>
                    <span>{closedOwnedSeekResponse.summary.seekId}</span>
                  </div>
                </div>
              </section>
            )}
            <section className="online-browser-lobby-listings" aria-label="Open lobby listings">
              <div className="online-browser-section-header online-browser-section-header-compact">
                <div>
                  <span className="online-browser-section-kicker">Lobby</span>
                  <h2>Open listings</h2>
                  <p>
                    {seekStatus === "loading"
                      ? "Loading lobby listings..."
                      : `${visibleOpenSeeks.length} open ${visibleOpenSeeks.length === 1 ? "listing" : "listings"}`}
                  </p>
                </div>
              </div>
              {visibleOpenSeeks.length === 0 && seekStatus === "ready" ? (
                <div className="online-browser-empty">
                  <h2>
                    {friendFilterActive
                      ? "No loaded lobby listings include followed players."
                      : hasActiveSeekFilters
                        ? "No lobby listings match these filters."
                        : "No lobby listings yet."}
                  </h2>
                  <p>
                    {friendFilterActive
                      ? seekNextCursor
                        ? "Load more listings to search another page, or follow players from People."
                        : "Refresh listings or follow players from People."
                      : hasActiveSeekFilters
                      ? "Try a different creator side, clock, scoring, or search setting."
                      : hasCurrentSetupActions
                        ? "Create a lobby listing from this setup or use Quick Match. Public listings appear only while players are waiting."
                        : "Choose a setup from Play, then return here to create or join a lobby listing."}
                  </p>
                </div>
              ) : (
                visibleOpenSeeks.map((seek) => {
                  const owned = ownedSeekIds.includes(seek.seekId);
                  const pendingAction = seekActionById[seek.seekId];
                  const radius = seek.setup.board.config.nSquares;
                  const creatorDisplayName = identityDisplayName(seek.creatorIdentity);
                  return (
                    <article
                      key={seek.seekId}
                      className="online-game-row online-seek-row"
                      aria-label={
                        creatorDisplayName
                          ? `Lobby listing by ${creatorDisplayName}, ${seek.seekId}`
                          : `Lobby listing ${seek.seekId}`
                      }
                    >
                      <div className="online-game-row-main">
                        <div className="online-game-players">
                          <strong className="online-game-player-line">
                            <span>Lobby listing</span>
                            {creatorDisplayName && (
                              <>
                                <span aria-hidden="true"> by </span>
                                {canUseAccountSocial ? (
                                  <button
                                    type="button"
                                    className="online-game-player-link"
                                    onClick={() => void handleSocialLookupByName(creatorDisplayName, { focus: true })}
                                    aria-label={`Open ${creatorDisplayName} profile from lobby listing ${seek.seekId}`}
                                  >
                                    {creatorDisplayName}
                                  </button>
                                ) : (
                                  <span>{creatorDisplayName}</span>
                                )}
                              </>
                            )}
                          </strong>
                          <span>{seek.seekId}</span>
                        </div>
                        <div className="online-game-meta">
                          <span className="online-game-pill active">Open</span>
                          {seek.visibility === "followed" && <span>Followed only</span>}
                          {seek.visibility === "invited" && <span>Invite-only</span>}
                          {seek.visibility === "invited" && seek.invitedDisplayNames?.length ? (
                            <span>Invited {seek.invitedDisplayNames.join(", ")}</span>
                          ) : null}
                          <span>{creatorDisplayName ? `Creator ${creatorDisplayName}` : "Creator unregistered"}</span>
                          <span>{formatSeekSideDetail(seek, owned)}</span>
                          <span>Board Radius {radius}</span>
                          <span>Clock {formatSeekClock(seek)}</span>
                          <span>Scoring {formatSeekScoringLabel(seek)}</span>
                          <span>Rating {formatSeekRatingLabel(seek)}</span>
                          <span>Expires {formatSeekExpiresAt(seek.expiresAt)}</span>
                        </div>
                      </div>
                      <div className="online-game-actions">
                        {owned ? (
                          <button
                            type="button"
                            className="online-browser-button neutral"
                            onClick={() => void runSeekAction(seek.seekId, "cancel")}
                            disabled={!onCancelSeek || pendingAction !== undefined || quickMatchBlocking}
                            aria-label={`Cancel lobby listing ${seek.seekId}`}
                          >
                            {pendingAction === "cancel" ? "Cancelling..." : "Cancel"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="online-browser-button primary"
                            onClick={() => void runSeekAction(seek.seekId, "accept")}
                            disabled={!onAcceptSeek || pendingAction !== undefined || quickMatchBlocking}
                            aria-label={`Accept lobby listing ${seek.seekId}`}
                          >
                            {pendingAction === "accept" ? "Accepting..." : "Accept"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
              {seekNextCursor && seekStatus === "ready" && (
                <button
                  type="button"
                  className="online-browser-button neutral online-browser-load-more"
                  onClick={loadMoreOpenSeeks}
                  disabled={isSeekLoadInFlight}
                >
                  {isSeekLoadingMore ? "Loading..." : "Load more listings"}
                </button>
              )}
            </section>
            {shouldShowLobbyLiveSection && (
              <section className="online-browser-live-section" aria-label="Current public games">
                <div className="online-browser-section-header">
                  <div>
                    <span className="online-browser-section-kicker">Watch</span>
                    <h2>Current games</h2>
                    <p>
                      {status === "loading"
                        ? "Loading public games..."
                        : status === "error"
                          ? "Could not load live games."
                          : copyMessage || `${filteredPublicActiveGames.length} public games in progress`}
                    </p>
                  </div>
                  <div className="online-browser-section-actions">
                    <button
                      type="button"
                      className="online-browser-button subtle"
                      onClick={openWatchFromLobby}
                      aria-label="Open Watch tab"
                    >
                      Open Watch
                    </button>
                  </div>
                </div>
                {renderLiveOverview(filteredPublicActiveGames.length, lobbyLiveGames[0] ?? null, "Lobby live games overview")}
                {status === "error" ? (
                  <div className="online-browser-empty online-browser-empty-compact">
                    <h2>Live games are unavailable.</h2>
                    <p>Refresh live games to try again.</p>
                  </div>
                ) : (
                  <div className="online-browser-live-list">
                    {lobbyLiveGames[0] && renderPublicGameRow(lobbyLiveGames[0], { featured: true, context: "watch" })}
                    {lobbyLiveGames.slice(1).map((game) =>
                      renderPublicGameRow(game, { compact: true, context: "watch" })
                    )}
                  </div>
                )}
              </section>
            )}
          </main>
        )
      ) : status === "error" ? (
        <button type="button" className="online-browser-button neutral" onClick={refreshGames}>
          Retry
        </button>
      ) : tab === "watch" ? (
        <main className="online-browser-watch-surface" aria-label="Public live games">
          <section className="online-browser-live-section" aria-label="Watch public games summary">
            <div className="online-browser-section-header">
              <div>
                <span className="online-browser-section-kicker">Watch</span>
                <h2>Live public games</h2>
                <p>
                  {status === "loading"
                    ? "Loading public games..."
                    : copyMessage || `${visibleGames.length} public games shown`}
                </p>
              </div>
            </div>
            {renderLiveOverview(
              friendFilterActive ? visibleGames.length : publicActiveGames.length,
              watchFeaturedGame,
              "Watch live games overview",
              watchFeaturedReason
            )}
            {canUseAccountSocial && followingStatus === "ready" && visibleWatchFollowedLiveItems.length > 0 && (
              <section className="online-browser-watch-friends" aria-label="Followed players live now">
                <div className="online-browser-side-list-header">
                  <div className="online-browser-side-list-heading">
                    <span className="online-browser-section-kicker">Following</span>
                    <strong>Followed players live now</strong>
                  </div>
                  <span>
                    {formatCount(watchFollowedLiveItems.length, "public game")}
                    {watchFollowedLiveItems.length > visibleWatchFollowedLiveItems.length
                      ? `, +${watchFollowedLiveItems.length - visibleWatchFollowedLiveItems.length} more`
                      : ""}
                  </span>
                </div>
                <div className="online-browser-watch-friend-rows">
                  {visibleWatchFollowedLiveItems.map(({ profile, game }) => {
                    const white = participantName(game.participants, "w");
                    const black = participantName(game.participants, "b");
                    return (
                      <article
                        key={`${profile.displayName}:${game.gameId}`}
                        className="online-browser-watch-friend-row"
                      >
                        <div className="online-browser-watch-friend-main">
                          <strong>{profile.displayName}</strong>
                          <span>{white} vs {black}</span>
                          <span>{game.gameId}</span>
                        </div>
                        <div className="online-browser-watch-friend-actions">
                          <button
                            type="button"
                            className="online-browser-button primary"
                            onClick={() => onSpectate(game.gameId)}
                            aria-label={`Watch ${profile.displayName}'s live game from Watch ${white} vs ${black}, ${game.gameId}`}
                          >
                            Watch
                          </button>
                          <button
                            type="button"
                            className="online-browser-button subtle"
                            onClick={() => showVisiblePlayerHistory(profile.displayName)}
                            disabled={socialAction !== undefined}
                            aria-label={`Show ${profile.displayName} game history from Watch live strip`}
                          >
                            History
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            {visibleGames.length === 0 && status === "ready" ? (
              <section className="online-browser-empty online-browser-empty-compact">
                <h2>{friendFilterActive ? "No loaded public games include followed players." : hasActiveFilters ? "No public games match these filters." : emptyTitle}</h2>
                <p>
                  {friendFilterActive
                    ? "Refresh live games, load more when available, or follow players from People."
                    : hasActiveFilters
                    ? "Try a different search or clock setting."
                    : "Open Lobby to start a public game, or check Archive for completed replays. Private and unlisted games stay off this page."}
                </p>
              </section>
            ) : (
              <div className="online-browser-watch-grid">
                {watchFeaturedGame && (
                  <section
                    className="online-browser-featured-game"
                    aria-label={
                      watchFeaturedReason === "watchers"
                        ? "Current public live selection by most watched in current list"
                        : "Current public live selection by most moves in current list"
                    }
                  >
                    {renderPublicGameRow(watchFeaturedGame, {
                      featured: true,
                      context: "watch",
                      featuredReason: watchFeaturedReason,
                    })}
                  </section>
                )}
                {watchSecondaryGames.length > 0 && (
                  <section className="online-browser-side-list" aria-label="Other public live games">
                    <div className="online-browser-side-list-header">
                      <span className="online-browser-section-kicker">More games</span>
                      <strong>{watchSecondaryGames.length} more public {watchSecondaryGames.length === 1 ? "game" : "games"}</strong>
                    </div>
                    {watchSecondaryGames.map((game) =>
                      renderPublicGameRow(game, { compact: true, context: "watch" })
                    )}
                  </section>
                )}
              </div>
            )}
            {nextCursor && status === "ready" && (
              <button
                type="button"
                className="online-browser-button neutral online-browser-load-more"
                onClick={loadMoreGames}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </section>
        </main>
      ) : (
        <main className="online-browser-list" aria-label="Online archive">
          <>
            {selectedArchiveDetailGame && renderArchiveDetailPage(selectedArchiveDetailGame)}
            {activeHeadToHeadDisplayName && (
              <section className="online-browser-history-filter-note" aria-label="Archive player history filter">
                <span aria-live="polite">
                  Showing games with <strong>{activeHeadToHeadDisplayName}</strong>.
                </span>
                <button
                  type="button"
                  className="online-browser-button subtle"
                  onClick={clearVisiblePlayerHistory}
                  aria-label={`Clear game history filter for ${activeHeadToHeadDisplayName}`}
                >
                  Clear History Filter
                </button>
              </section>
            )}
            {account && (
              <section className="online-browser-account-games" aria-label="Your account games">
                <div className="online-browser-side-list-header">
                  <div className="online-browser-side-list-heading">
                    <span className="online-browser-section-kicker">Your games</span>
                    <strong>Account archive</strong>
                  </div>
                  <button
                    type="button"
                    className="online-browser-button subtle online-browser-clear-recent"
                    onClick={() => {
                      const requestId = ++accountGamesRequestIdRef.current;
                      setAccountGamesStatus("loading");
                      loadAccountGames?.(accountGameDirectoryOptions)
                        .then((response) => {
                          if (requestId !== accountGamesRequestIdRef.current) return;
                          setAccountGames(response.games);
                          setAccountGamesStatus("ready");
                        })
                        .catch(() => {
                          if (requestId !== accountGamesRequestIdRef.current) return;
                          setAccountGamesStatus("error");
                        });
                    }}
                    disabled={!loadAccountGames || accountGamesStatus === "loading"}
                    aria-label="Refresh your account archive"
                  >
                    {accountGamesStatus === "loading" ? "Refreshing..." : "Refresh Account Games"}
                  </button>
                </div>
                <p>
                  Active and completed private, unlisted, and public games played as {account.displayName} appear here. Active games can return from this browser session or rejoin through your account when available.
                </p>
                {renderAccountFollowedOpponentStrip()}
                {accountHeadToHeadSummary && renderAccountHeadToHeadSummary(accountHeadToHeadSummary)}
                {accountHeadToHeadSummary && (
                  <section
                    className="online-browser-account-subsection"
                    aria-label={`Head-to-head games with ${accountHeadToHeadSummary.opponentDisplayName}`}
                  >
                    <div className="online-browser-side-list-header">
                      <div className="online-browser-side-list-heading">
                        <span className="online-browser-section-kicker">Pair history</span>
                        <strong>Head-to-head games</strong>
                      </div>
                      <span>{formatCount(accountHeadToHeadSummary.games.length, "game")}</span>
                    </div>
                    {[...accountHeadToHeadSummary.games]
                      .sort(compareLatestCompletedGame)
                      .map((game) =>
                        renderPublicGameRow(game, { context: "archive", showOpponentSocialActions: true })
                      )}
                    {headToHeadMessage && (
                      <p
                        className={`online-browser-filter-note${headToHeadGamesStatus === "error" || headToHeadMessage.includes("Could not") ? " error" : ""}`}
                        role="status"
                        aria-live="polite"
                      >
                        {headToHeadMessage}
                      </p>
                    )}
                    {headToHeadNextCursor && (
                      <button
                        type="button"
                        className="online-browser-button neutral online-browser-load-more"
                        onClick={loadMoreHeadToHeadGames}
                        disabled={isHeadToHeadLoadingMore}
                        aria-label={`Load more head-to-head games with ${accountHeadToHeadSummary.opponentDisplayName}`}
                      >
                        {isHeadToHeadLoadingMore ? "Loading..." : "Load more head-to-head games"}
                      </button>
                    )}
                  </section>
                )}
                {accountGamesStatus === "error" && !accountHeadToHeadSummary ? (
                  <div className="online-browser-empty online-browser-empty-compact">
                    <h2>Account games are unavailable.</h2>
                    <p>Refresh your account archive to try again.</p>
                  </div>
                ) : accountGamesStatus === "loading" && accountActiveGames.length === 0 && accountArchivedGames.length === 0 ? (
                  <div className="online-browser-empty online-browser-empty-compact">
                    <h2>Loading account games...</h2>
                    <p>Your private and unlisted active games and completed replays will appear here.</p>
                  </div>
                ) : accountActiveGames.length === 0 && accountArchivedGames.length === 0 && accountGamesStatus === "ready" ? (
                  <div className="online-browser-empty online-browser-empty-compact">
                    <h2>
                      {friendFilterActive
                        ? "No loaded account games include followed players."
                      : hasActiveFilters && accountGames.length > 0
                        ? "No account games match these filters."
                        : "No account games yet."}
                    </h2>
                    <p>
                      {friendFilterActive
                        ? "Refresh your account archive or follow players from People."
                        : hasActiveFilters && accountGames.length > 0
                        ? "Try a different search, clock, or result setting."
                        : "Signed-in games appear here after you play. Public Archive remains separate from this private account history."}
                    </p>
                  </div>
                ) : (
                  <>
                    {accountActiveGames.length > 0 && (
                      <section className="online-browser-account-subsection" aria-label="Active account games">
                        <div className="online-browser-side-list-header">
                          <div className="online-browser-side-list-heading">
                            <span className="online-browser-section-kicker">Live</span>
                            <strong>Active games</strong>
                          </div>
                          <span>{formatCount(accountActiveGames.length, "game")}</span>
                        </div>
                        {accountActiveGames.map(renderAccountActiveGameRow)}
                      </section>
                    )}
                    {accountArchivedGames.length > 0 && (
                      <section className="online-browser-account-subsection" aria-label="Completed account games">
                        <div className="online-browser-side-list-header">
                          <div className="online-browser-side-list-heading">
                            <span className="online-browser-section-kicker">Replays</span>
                            <strong>Completed games</strong>
                          </div>
                          <span>{formatCount(accountArchivedGames.length, "replay")}</span>
                        </div>
                        {accountArchivedGames.map((game) =>
                          renderPublicGameRow(game, {
                            context: "archive",
                            showOpponentHistoryActions: true,
                            showOpponentSocialActions: true,
                          })
                        )}
                      </section>
                    )}
                  </>
                )}
              </section>
            )}
            {recentArchivedGames.length > 0 && (
              <section className="online-browser-recent-games" aria-label="Recent online games on this device">
                <div className="online-browser-side-list-header">
                  <div className="online-browser-side-list-heading">
                    <span className="online-browser-section-kicker">On this device</span>
                    <strong>Recent completed online games</strong>
                  </div>
                  {onClearRecentOnlineGames && (
                    <button
                      type="button"
                      className="online-browser-button subtle online-browser-clear-recent"
                      onClick={handleClearRecentOnlineGames}
                      aria-label="Clear recent online replays on this device"
                    >
                      Clear Recent Replays
                    </button>
                  )}
                </div>
                <p>
                  Completed online games opened in this browser can be replayed here when they are not already in your account or public archive.
                  Search can match these local game ids; clock and result filters require server archive details.
                </p>
                {recentArchivedGames.map(renderRecentOnlineGameRow)}
              </section>
            )}
            <section className="online-browser-public-archive" aria-label="Public archive games">
              <div className="online-browser-side-list-header">
                <div className="online-browser-side-list-heading">
                  <span className="online-browser-section-kicker">Public</span>
                  <strong>Public archive</strong>
                </div>
                <span>{formatCount(visibleGames.length, "replay")}</span>
              </div>
              {visibleGames.length === 0 && status === "ready" ? (
                <section className="online-browser-archive-empty">
                  <h2>{friendFilterActive ? "No loaded public replays include followed players." : hasActiveFilters ? "No public replays match these filters." : emptyTitle}</h2>
                  <p>
                    {friendFilterActive
                      ? "Refresh the public archive, load more when available, or follow players from People."
                      : hasActiveFilters
                      ? "Try a different search, clock, or result setting. Account and public replays use full server details; device-only replays appear only when their local game id can match."
                      : "Public replays appear after public games finish. Private and unlisted games stay out of the archive."}
                  </p>
                </section>
              ) : visibleGames.map((game) => renderPublicGameRow(game, { context: "archive" }))}
            </section>
            {nextCursor && status === "ready" && (
              <button
                type="button"
                className="online-browser-button neutral online-browser-load-more"
                onClick={loadMoreGames}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </button>
            )}
          </>
        </main>
      )}
    </div>
  );
};

export default OnlineGameBrowser;
