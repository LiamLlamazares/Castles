import React from "react";
import AppShellNav, { AppShellDestination } from "./AppShellNav";
import {
  buildSpectatorUrl,
  copyOnlineInviteUrl,
  fetchOpenSeekDirectory,
  fetchOnlineGameDirectory,
  formatOnlineGameResult,
  type FetchOnlineAccountGamesOptions,
  type FetchOnlineAccountChallengesOptions,
  type OnlineAccountChallengeDirectoryResponse,
  type OnlineAccountChallengeListItem,
  type OnlineChallengeResponse,
  type FetchOpenSeekDirectoryOptions,
  type FetchOnlineGameSummariesOptions,
  type OnlineAccountFollowingResponse,
  type OnlineAccountPrivacyPatch,
  type OnlineAccountPrivacyResponse,
  type OnlineAccountProfileResponse,
  type OnlineAccountPublicProfile,
  type OnlineAccountSessionsResponse,
  type OnlineAccountSessionSummary,
  type OpenSeekResponse,
} from "../online/client";
import type { OnlineAccountChallengePolicy, OnlineAccountFollowPolicy, OnlineAccountPresencePolicy } from "../online/social";
import type { OnlineAccount } from "../online/accounts";
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
} from "../online/seeks";
import type { RecentOnlineGameRecord } from "../online/recentGames";
import { PieceType } from "../Constants";
import "../css/OnlineGameBrowser.css";

type OnlineBrowserTab = "lobby" | "watch" | "archive";
type OnlineBrowserSort = "newest" | "moves" | "watchers";
type OnlineBrowserTimeFilter = "all" | "timed" | "casual";
type OnlineFriendFilter = "all" | "followed";
type OnlineFollowingPresenceFilter = "all" | "online";
type OnlineAccountChallengeFilter = NonNullable<FetchOnlineAccountChallengesOptions["state"]>;
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
  | "signing-out"
  | "signing-out-all"
  | "deleting"
  | "ready"
  | "error";
type QuickMatchStatus = "idle" | "pending" | "matched" | "waiting" | "error";
type QuickMatchOutcome = "matched" | "waiting" | void;

interface QuickMatchSetupSummary {
  boardRadius: number;
  clock: string;
  scoring: string;
}

const LOBBY_AUTO_REFRESH_MS = 30_000;
const LOBBY_RATE_LIMIT_BACKOFF_MS = 60_000;
const ACCOUNT_CHALLENGE_AUTO_REFRESH_MS = 1_000;
const FOLLOWING_AUTO_REFRESH_MS = 30_000;
const GAME_SEARCH_DEBOUNCE_MS = 300;
const AUTO_REFRESH_PAUSED_MESSAGE = "Auto refresh paused after a rate limit. Use Refresh to check now.";

interface OnlineGameBrowserProps {
  loadGames?: (options?: FetchOnlineGameSummariesOptions) => Promise<OnlineGameDirectoryResponse>;
  loadOpenSeeks?: (options?: FetchOpenSeekDirectoryOptions) => Promise<OpenSeekDirectoryResponse>;
  onBack: () => void;
  onOpenGame?: () => void;
  onConfigureSetup?: () => void;
  onTutorial?: () => void;
  onOpenLibrary?: () => void;
  onCreateSeek?: () => void | Promise<void>;
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
  rejoiningAccountGameId?: string | null;
  recentOnlineGames?: RecentOnlineGameRecord[];
  onClearRecentOnlineGames?: () => void;
  account?: OnlineAccount | null;
  accountStatus?: OnlineAccountUiStatus;
  accountError?: string | null;
  onCreateAccount?: (displayName: string) => void | Promise<void>;
  onSignOutAccount?: () => void | Promise<void>;
  accountSessionId?: string | null;
  loadAccountSessions?: () => Promise<OnlineAccountSessionsResponse>;
  onSignOutAllAccountSessions?: () => void | Promise<void>;
  onDeleteAccount?: () => void | Promise<void>;
  loadAccountGames?: (options?: FetchOnlineAccountGamesOptions) => Promise<OnlineGameDirectoryResponse>;
  loadAccountChallenges?: (options?: FetchOnlineAccountChallengesOptions) => Promise<OnlineAccountChallengeDirectoryResponse & { protocolVersion: number }>;
  onAcceptAccountChallenge?: (challengeId: string) => Promise<OnlineChallengeResponse>;
  onDeclineAccountChallenge?: (challengeId: string) => Promise<OnlineChallengeResponse>;
  onCancelAccountChallenge?: (challengeId: string) => Promise<OnlineChallengeResponse>;
  loadAccountProfile?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  loadAccountFollowing?: () => Promise<OnlineAccountFollowingResponse>;
  onFollowAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onUnfollowAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onBlockAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onUnblockAccount?: (displayName: string) => Promise<OnlineAccountProfileResponse>;
  onChallengeAccount?: (displayName: string) => void | Promise<void>;
  loadAccountPrivacy?: () => Promise<OnlineAccountPrivacyResponse>;
  onUpdateAccountPrivacy?: (patch: OnlineAccountPrivacyPatch) => Promise<OnlineAccountPrivacyResponse>;
  backLabel?: string;
  initialTab?: OnlineBrowserTab;
  activeTab?: OnlineBrowserTab;
  onTabChange?: (tab: OnlineBrowserTab) => void;
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

function identityDisplayName(identity: OnlineIdentity): string | null {
  return identity.kind === "registered" && identity.displayName ? identity.displayName : null;
}

function normalizeDisplayNameKey(displayName: string): string {
  return displayName.trim().toLowerCase();
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

function formatAccountChallengeRole(role: OnlineAccountChallengeListItem["role"]): string {
  return role === "challenged" ? "Incoming" : "Outgoing";
}

function challengeOpponentName(item: OnlineAccountChallengeListItem): string {
  const identity =
    item.role === "challenged"
      ? item.summary.challengerIdentity
      : item.summary.challengedIdentity;
  return identityDisplayName(identity) ?? (item.role === "challenged" ? "Challenger" : "Opponent");
}

function formatChallengeSeatChoice(item: OnlineAccountChallengeListItem): string {
  const seat = item.summary.challengerSeat;
  if (seat === "random") return "Random side";
  const challengerSide = seat === "w" ? "White" : "Black";
  if (item.role === "challenger") return `You chose ${challengerSide}`;
  return `They chose ${challengerSide}`;
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

function formatSpectatorCount(count: number | undefined): string | null {
  if (!Number.isSafeInteger(count) || (count ?? 0) <= 0) return null;
  return `${count} watching`;
}

function formatFollowPolicy(policy: OnlineAccountFollowPolicy): string {
  return policy === "everyone" ? "Everyone" : "Nobody";
}

function formatChallengePolicy(policy: OnlineAccountChallengePolicy): string {
  switch (policy) {
    case "everyone":
      return "Everyone";
    case "followed":
      return "Accounts I follow";
    case "nobody":
      return "Nobody";
    default:
      return policy;
  }
}

function formatPresencePolicy(policy: OnlineAccountPresencePolicy): string {
  switch (policy) {
    case "everyone":
      return "Everyone";
    case "followed":
      return "Accounts I follow";
    case "nobody":
      return "Nobody";
    default:
      return policy;
  }
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

function presenceBadgeClassName(profile: OnlineAccountPublicProfile): string {
  if (profile.presence.visibility === "hidden") return "presence-hidden";
  if (profile.presence.status === "online") return "presence-online";
  if (profile.presence.status === "recent") return "presence-recent";
  if (profile.presence.status === "away") return "presence-away";
  return "presence-offline";
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

function matchesResultFilter(summary: OnlineGameSummary, resultFilter: OnlineBrowserResultFilter): boolean {
  if (resultFilter === "all") return true;
  if (!summary.result) return false;
  if (resultFilter === "white") return summary.result.winner === "w";
  if (resultFilter === "black") return summary.result.winner === "b";
  return summary.result.reason === resultFilter;
}

function seekSearchText(summary: OpenSeekSummary): string {
  const sideLabel = formatSeekSideLabel(summary.creatorSeat);
  const sideDetail = formatSeekSideDetail(summary, false);
  const clock = formatSeekClock(summary);
  const scoring = formatSeekScoringLabel(summary);
  return [
    summary.seekId,
    summary.creatorSeat,
    sideLabel,
    sideDetail,
    summary.status,
    summary.setup.board.config.nSquares,
    clock,
    summary.setup.timeControl ? `${summary.setup.timeControl.initial}+${summary.setup.timeControl.increment}` : "casual",
    scoring,
  ].join(" ").toLowerCase();
}

function formatSeekClock(summary: OpenSeekSummary): string {
  const clock = summary.setup.timeControl;
  return clock ? `Timed ${clock.initial}+${clock.increment}` : "Casual";
}

function formatSeekScoringLabel(summary: OpenSeekSummary): string {
  return summary.setup.gameRules?.vpModeEnabled ? "Victory points" : "Castle control";
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
  rejoiningAccountGameId = null,
  recentOnlineGames = [],
  onClearRecentOnlineGames,
  account = null,
  accountStatus = account ? "ready" : "signed-out",
  accountError = null,
  onCreateAccount,
  onSignOutAccount,
  accountSessionId = null,
  loadAccountSessions,
  onSignOutAllAccountSessions,
  onDeleteAccount,
  loadAccountGames,
  loadAccountChallenges,
  onAcceptAccountChallenge,
  onDeclineAccountChallenge,
  onCancelAccountChallenge,
  loadAccountProfile,
  loadAccountFollowing,
  onFollowAccount,
  onUnfollowAccount,
  onBlockAccount,
  onUnblockAccount,
  onChallengeAccount,
  loadAccountPrivacy,
  onUpdateAccountPrivacy,
  backLabel = "Back to game",
  initialTab = "lobby",
  activeTab,
  onTabChange,
}) => {
  const [uncontrolledTab, setUncontrolledTab] = React.useState<OnlineBrowserTab>(initialTab);
  const tab = activeTab ?? uncontrolledTab;
  const [games, setGames] = React.useState<OnlineGameSummary[]>([]);
  const [openSeeks, setOpenSeeks] = React.useState<OpenSeekSummary[]>([]);
  const [query, setQuery] = React.useState("");
  const [debouncedGameQuery, setDebouncedGameQuery] = React.useState("");
  const [sort, setSort] = React.useState<OnlineBrowserSort>("newest");
  const [timeFilter, setTimeFilter] = React.useState<OnlineBrowserTimeFilter>("all");
  const [friendFilter, setFriendFilter] = React.useState<OnlineFriendFilter>("all");
  const [seekSideFilter, setSeekSideFilter] = React.useState<OpenSeekSideFilter>("all");
  const [seekClockFilter, setSeekClockFilter] = React.useState<OpenSeekClockFilter>("all");
  const [seekVpFilter, setSeekVpFilter] = React.useState<OpenSeekVpFilter>("all");
  const [resultFilter, setResultFilter] = React.useState<OnlineBrowserResultFilter>("all");
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>();
  const [copyMessage, setCopyMessage] = React.useState("");
  const [seekStatus, setSeekStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [seekActionById, setSeekActionById] = React.useState<Record<string, "accept" | "cancel" | undefined>>({});
  const [seekActionMessage, setSeekActionMessage] = React.useState("");
  const [quickMatchStatus, setQuickMatchStatus] = React.useState<QuickMatchStatus>("idle");
  const [createSeekPending, setCreateSeekPending] = React.useState(false);
  const [ownedSeekAction, setOwnedSeekAction] = React.useState<"refresh" | "join" | undefined>();
  const [lastSeekCheckedAt, setLastSeekCheckedAt] = React.useState("");
  const [isSeekLoadInFlight, setIsSeekLoadInFlight] = React.useState(false);
  const [isSeekLoadingMore, setIsSeekLoadingMore] = React.useState(false);
  const [seekNextCursor, setSeekNextCursor] = React.useState<string | undefined>();
  const [accountDisplayName, setAccountDisplayName] = React.useState("");
  const [accountActionMessage, setAccountActionMessage] = React.useState("");
  const [isDeleteAccountConfirmOpen, setIsDeleteAccountConfirmOpen] = React.useState(false);
  const [accountSessions, setAccountSessions] = React.useState<OnlineAccountSessionSummary[]>([]);
  const [accountSessionsStatus, setAccountSessionsStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [accountGames, setAccountGames] = React.useState<OnlineGameSummary[]>([]);
  const [accountGamesStatus, setAccountGamesStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [accountChallenges, setAccountChallenges] = React.useState<OnlineAccountChallengeListItem[]>([]);
  const [accountChallengesStatus, setAccountChallengesStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [accountChallengeActionById, setAccountChallengeActionById] = React.useState<Record<string, "accept" | "decline" | "cancel" | undefined>>({});
  const [accountChallengeFilter, setAccountChallengeFilter] = React.useState<OnlineAccountChallengeFilter>("pending");
  const [socialLookupName, setSocialLookupName] = React.useState("");
  const [socialProfile, setSocialProfile] = React.useState<OnlineAccountPublicProfile | null>(null);
  const [socialLookupStatus, setSocialLookupStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [socialMessage, setSocialMessage] = React.useState("");
  const [socialAction, setSocialAction] = React.useState<"follow" | "unfollow" | "block" | "unblock" | "challenge" | "refresh" | "privacy" | undefined>();
  const [followingProfiles, setFollowingProfiles] = React.useState<OnlineAccountPublicProfile[]>([]);
  const [followingStatus, setFollowingStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [followingPresenceFilter, setFollowingPresenceFilter] = React.useState<OnlineFollowingPresenceFilter>("all");
  const [followPolicy, setFollowPolicy] = React.useState<OnlineAccountFollowPolicy>("everyone");
  const [followPolicyDraft, setFollowPolicyDraft] = React.useState<OnlineAccountFollowPolicy>("everyone");
  const [presencePolicy, setPresencePolicy] = React.useState<OnlineAccountPresencePolicy>("followed");
  const [presencePolicyDraft, setPresencePolicyDraft] = React.useState<OnlineAccountPresencePolicy>("followed");
  const [challengePolicy, setChallengePolicy] = React.useState<OnlineAccountChallengePolicy>("followed");
  const [challengePolicyDraft, setChallengePolicyDraft] = React.useState<OnlineAccountChallengePolicy>("followed");
  const [privacyStatus, setPrivacyStatus] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const requestIdRef = React.useRef(0);
  const seekRequestIdRef = React.useRef(0);
  const accountGamesRequestIdRef = React.useRef(0);
  const accountChallengesRequestIdRef = React.useRef(0);
  const accountSessionsRequestIdRef = React.useRef(0);
  const accountFollowingRequestIdRef = React.useRef(0);
  const accountPrivacyRequestIdRef = React.useRef(0);
  const socialLookupRequestIdRef = React.useRef(0);
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
  const completedAccountChallengeIdsRef = React.useRef(new Set<string>());
  const queuedSeekLoadRef = React.useRef<"foreground" | "background" | undefined>();
  const quickMatchButtonRef = React.useRef<HTMLButtonElement>(null);
  const archiveTabButtonRef = React.useRef<HTMLButtonElement>(null);
  const deleteAccountConfirmButtonRef = React.useRef<HTMLButtonElement>(null);
  const socialProfileCardRef = React.useRef<HTMLElement>(null);
  const ownedSeekPanelRef = React.useRef<HTMLElement>(null);
  const closedOwnedSeekPanelRef = React.useRef<HTMLElement>(null);
  const [recentClearMessage, setRecentClearMessage] = React.useState("");
  const deleteAccountConfirmPanelId = React.useId();
  const deleteAccountConfirmHeadingId = React.useId();
  const deleteAccountConfirmDescriptionId = React.useId();
  const followPolicyHintId = React.useId();
  const presencePolicyHintId = React.useId();
  const challengePolicyHintId = React.useId();
  const canUseAccountSocial = Boolean(
    account &&
    loadAccountProfile &&
    loadAccountFollowing &&
    onFollowAccount &&
    onUnfollowAccount &&
    onBlockAccount &&
    onUnblockAccount &&
    loadAccountPrivacy &&
    onUpdateAccountPrivacy
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
  }, [tab]);

  React.useEffect(() => {
    seekActionByIdRef.current = seekActionById;
  }, [seekActionById]);

  React.useEffect(() => {
    accountChallengeActionByIdRef.current = accountChallengeActionById;
  }, [accountChallengeActionById]);

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

  const handleClearRecentOnlineGames = React.useCallback(() => {
    setRecentClearMessage("Recent device replay list cleared.");
    onClearRecentOnlineGames?.();
    archiveTabButtonRef.current?.focus();
  }, [onClearRecentOnlineGames]);

  const handleCreateAccountSubmit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = accountDisplayName.trim();
    if (!displayName || !onCreateAccount) return;
    setAccountActionMessage("");
    try {
      await onCreateAccount(displayName);
      setAccountDisplayName("");
      setAccountActionMessage("Online account created.");
    } catch {
      setAccountActionMessage("Could not create that online account name.");
    }
  }, [accountDisplayName, onCreateAccount]);

  const refreshAccountSessions = React.useCallback(async () => {
    if (!account || !loadAccountSessions) return;
    const requestId = ++accountSessionsRequestIdRef.current;
    setAccountSessionsStatus("loading");
    try {
      const response = await loadAccountSessions();
      if (requestId !== accountSessionsRequestIdRef.current) return;
      setAccountSessions(response.sessions);
      setAccountSessionsStatus("ready");
    } catch {
      if (requestId !== accountSessionsRequestIdRef.current) return;
      setAccountSessionsStatus("error");
    }
  }, [account?.accountId, loadAccountSessions]);

  const refreshAccountChallenges = React.useCallback(async (options: { background?: boolean } = {}) => {
    if (!account || !loadAccountChallenges) return;
    if (accountChallengeLoadInFlightRef.current) return;
    if (Object.values(accountChallengeActionByIdRef.current).some((action) => action !== undefined)) return;
    const background = options.background === true;
    const requestId = ++accountChallengesRequestIdRef.current;
    accountChallengeLoadInFlightRef.current = true;
    if (!background) {
      setAccountChallengesStatus("loading");
    }
    try {
      const response = await loadAccountChallenges({ state: accountChallengeFilter });
      if (requestId !== accountChallengesRequestIdRef.current) return;
      setAccountChallenges(
        response.challenges.filter((item) =>
          item.summary.status !== "pending" ||
          !completedAccountChallengeIdsRef.current.has(item.summary.challengeId)
        )
      );
      setAccountChallengesStatus("ready");
    } catch (error) {
      if (requestId !== accountChallengesRequestIdRef.current) return;
      if (isRateLimitError(error)) {
        accountChallengeAutoRefreshPausedUntilRef.current = Date.now() + LOBBY_RATE_LIMIT_BACKOFF_MS;
      }
      if (!background) {
        console.error("[OnlineGameBrowser] Failed to load account challenges", error);
        setAccountChallenges([]);
        setAccountChallengesStatus("error");
      }
    } finally {
      if (requestId === accountChallengesRequestIdRef.current) {
        accountChallengeLoadInFlightRef.current = false;
      }
    }
  }, [account?.accountId, accountChallengeFilter, loadAccountChallenges]);

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
      setAccountChallenges((current) =>
        current
          .map((candidate) =>
            candidate.summary.challengeId === challengeId
              ? { role: response.role, summary: response.summary }
              : candidate
          )
          .filter((candidate) =>
            accountChallengeFilter === "all" || candidate.summary.status === "pending"
          )
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
        action === "accept"
          ? "Could not accept that challenge."
          : action === "decline"
            ? "Could not decline that challenge."
            : "Could not cancel that challenge."
      );
    } finally {
      setAccountChallengeActionById((current) => {
        const next = { ...current };
        delete next[challengeId];
        return next;
      });
    }
  }, [accountChallengeFilter, onAcceptAccountChallenge, onCancelAccountChallenge, onDeclineAccountChallenge]);

  const handleAccountChallengeFilterChange = React.useCallback((nextFilter: OnlineAccountChallengeFilter) => {
    if (nextFilter === accountChallengeFilter) return;
    accountChallengesRequestIdRef.current += 1;
    accountChallengeLoadInFlightRef.current = false;
    setAccountChallenges([]);
    setAccountChallengesStatus(canUseAccountChallenges ? "loading" : "idle");
    setAccountChallengeFilter(nextFilter);
  }, [accountChallengeFilter, canUseAccountChallenges]);

  const handleSignOutAllAccountSessions = React.useCallback(async () => {
    if (!onSignOutAllAccountSessions) return;
    setAccountActionMessage("");
    try {
      await onSignOutAllAccountSessions();
      setAccountSessions([]);
      setAccountSessionsStatus("idle");
    } catch {
      setAccountActionMessage("Could not sign out everywhere.");
    }
  }, [onSignOutAllAccountSessions]);

  const handleDeleteAccount = React.useCallback(async () => {
    if (!onDeleteAccount) return;
    setAccountActionMessage("");
    accountSessionsRequestIdRef.current += 1;
    setAccountSessions([]);
    setAccountSessionsStatus("idle");
    try {
      await onDeleteAccount();
      setIsDeleteAccountConfirmOpen(false);
      setAccountSessions([]);
      setAccountSessionsStatus("idle");
    } catch {
      setAccountActionMessage("Could not delete account.");
      void refreshAccountSessions();
    }
  }, [onDeleteAccount, refreshAccountSessions]);

  React.useEffect(() => {
    accountSessionsRequestIdRef.current += 1;
    setAccountSessions([]);
    setAccountSessionsStatus(account && loadAccountSessions ? "loading" : "idle");
    if (!account || !loadAccountSessions) return;
    const requestId = accountSessionsRequestIdRef.current;
    loadAccountSessions()
      .then((response) => {
        if (requestId !== accountSessionsRequestIdRef.current) return;
        setAccountSessions(response.sessions);
        setAccountSessionsStatus("ready");
      })
      .catch(() => {
        if (requestId !== accountSessionsRequestIdRef.current) return;
        setAccountSessionsStatus("error");
      });
  }, [account?.accountId, loadAccountSessions]);

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

  const refreshAccountPrivacy = React.useCallback(async () => {
    if (!account || !loadAccountPrivacy) return;
    const requestId = ++accountPrivacyRequestIdRef.current;
    setPrivacyStatus("loading");
    try {
      const response = await loadAccountPrivacy();
      if (requestId !== accountPrivacyRequestIdRef.current) return;
      setFollowPolicy(response.privacy.followPolicy);
      setFollowPolicyDraft(response.privacy.followPolicy);
      setPresencePolicy(response.privacy.presencePolicy);
      setPresencePolicyDraft(response.privacy.presencePolicy);
      setChallengePolicy(response.privacy.challengePolicy);
      setChallengePolicyDraft(response.privacy.challengePolicy);
      setPrivacyStatus("ready");
    } catch (error) {
      if (requestId !== accountPrivacyRequestIdRef.current) return;
      console.error("[OnlineGameBrowser] Failed to load account privacy", error);
      setPrivacyStatus("error");
    }
  }, [account?.accountId, loadAccountPrivacy]);

  React.useEffect(() => {
    accountFollowingRequestIdRef.current += 1;
    accountPrivacyRequestIdRef.current += 1;
    socialLookupRequestIdRef.current += 1;
    socialMutationRequestIdRef.current += 1;
    followingLoadInFlightRef.current = false;
    followingAutoRefreshPausedUntilRef.current = 0;
    setSocialLookupName("");
    setSocialProfile(null);
    setSocialLookupStatus("idle");
    setSocialMessage("");
    setSocialAction(undefined);
    setFollowingProfiles([]);
    setFollowingStatus(canUseAccountSocial ? "loading" : "idle");
    setFollowPolicy("everyone");
    setFollowPolicyDraft("everyone");
    setPresencePolicy("followed");
    setPresencePolicyDraft("followed");
    setChallengePolicy("followed");
    setChallengePolicyDraft("followed");
    setPrivacyStatus(canUseAccountSocial ? "loading" : "idle");
    if (!canUseAccountSocial) return;
    void refreshFollowingProfiles({ quiet: true });
    void refreshAccountPrivacy();
  }, [account?.accountId, canUseAccountSocial, refreshAccountPrivacy, refreshFollowingProfiles]);

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
    setAccountChallenges([]);
    setAccountChallengeActionById({});
    setAccountChallengeFilter("pending");
    setAccountChallengesStatus("idle");
  }, [account?.accountId, canUseAccountChallenges]);

  React.useEffect(() => {
    if (!canUseAccountChallenges) return;
    void refreshAccountChallenges();
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() < accountChallengeAutoRefreshPausedUntilRef.current) return;
      void refreshAccountChallenges({ background: true });
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
    if (accountStatus !== "error") return;
    setAccountActionMessage("");
  }, [accountStatus]);

  React.useEffect(() => {
    if (canUseAccountSocial) return;
    setFriendFilter("all");
  }, [canUseAccountSocial]);

  React.useEffect(() => {
    setFriendFilter("all");
  }, [account?.accountId]);

  React.useEffect(() => {
    if (!isDeleteAccountConfirmOpen) return;
    deleteAccountConfirmButtonRef.current?.focus();
  }, [isDeleteAccountConfirmOpen]);

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
    ...(tab === "archive" && resultFilter !== "all" ? { result: resultFilter } : {}),
    ...(debouncedGameQuery !== "" && tab !== "lobby" ? { query: debouncedGameQuery } : {}),
  }), [debouncedGameQuery, directoryState, resultFilter, tab, timeFilter]);

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
  }), [seekClockFilter, seekSideFilter, seekVpFilter]);
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
  const onlineFollowingProfiles = React.useMemo(
    () => followingProfiles.filter(isProfileOnline),
    [followingProfiles]
  );
  const onlineNowRailProfiles = React.useMemo(
    () => onlineFollowingProfiles.slice(0, 6),
    [onlineFollowingProfiles]
  );
  const visibleFollowingProfiles = followingPresenceFilter === "online" ? onlineFollowingProfiles : followingProfiles;
  const friendFilterActive = canUseAccountSocial && friendFilter === "followed";
  const friendFilterUnavailable = friendFilterActive && followingStatus !== "ready";
  const filteredPublicActiveGames = React.useMemo(() => {
    if (!friendFilterActive) return publicActiveGames;
    return publicActiveGames.filter((game) => gameHasFollowedParticipant(game, followedDisplayNames));
  }, [followedDisplayNames, friendFilterActive, publicActiveGames]);
  const accountChallengeByOpponentDisplayName = React.useMemo(() => {
    const challenges = new Map<string, OnlineAccountChallengeListItem>();
    for (const item of accountChallenges) {
      if (item.summary.status !== "pending") continue;
      const key = normalizeDisplayNameKey(challengeOpponentName(item));
      const existing = challenges.get(key);
      if (!existing || (existing.role !== "challenged" && item.role === "challenged")) {
        challenges.set(key, item);
      }
    }
    return challenges;
  }, [accountChallenges]);
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

  const visibleGames = React.useMemo(() => {
    const normalizedQuery = normalizeOnlineGameDirectorySearchQuery(query) ?? query.trim().toLowerCase();
    const filtered = publicGames.filter((game) => {
      const tabMatches =
        tab === "watch"
          ? game.status === "active"
          : game.status === "complete" && game.archiveState === "archived";
      if (!tabMatches) return false;
      if (timeFilter === "timed" && !game.hasTimeControl) return false;
      if (timeFilter === "casual" && game.hasTimeControl) return false;
      if (tab === "archive" && !matchesResultFilter(game, resultFilter)) return false;
      if (friendFilterActive && !gameHasFollowedParticipant(game, followedDisplayNames)) return false;
      return !normalizedQuery || onlineGameSummaryDirectorySearchText(game).includes(normalizedQuery);
    });
    return filtered.sort(
      sort === "watchers" && tab === "watch"
        ? compareMostWatchedNow
        : sort === "moves"
          ? compareMostMoves
          : compareNewest
    );
  }, [followedDisplayNames, friendFilterActive, publicGames, query, resultFilter, sort, tab, timeFilter]);

  const lobbyLiveGames = React.useMemo(() => {
    return filteredPublicActiveGames.slice(0, 5);
  }, [filteredPublicActiveGames]);

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
    if (timeFilter !== "all" || resultFilter !== "all") return [];
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
  }, [account, accountGames, accountGamesStatus, friendFilterActive, publicGames, query, recentOnlineGames, resultFilter, tab, timeFilter]);

  React.useEffect(() => {
    if (tab !== "archive" || !account || !loadAccountGames) {
      setAccountGames([]);
      setAccountGamesStatus("idle");
      return;
    }

    const requestId = ++accountGamesRequestIdRef.current;
    setAccountGamesStatus("loading");
    loadAccountGames({ state: "all", limit: 50 })
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
  }, [account?.accountId, loadAccountGames, tab]);

  const accountActiveGames = React.useMemo(() => {
    if (tab !== "archive") return [];
    const normalizedQuery = normalizeOnlineGameDirectorySearchQuery(query) ?? query.trim().toLowerCase();
    return accountGames
      .filter((game) => game.status === "active" && game.archiveState === "active")
      .filter((game) => timeFilter !== "timed" || game.hasTimeControl)
      .filter((game) => timeFilter !== "casual" || !game.hasTimeControl)
      .filter(() => resultFilter === "all")
      .filter((game) => !friendFilterActive || gameHasFollowedParticipant(game, followedDisplayNames))
      .filter((game) => !normalizedQuery || onlineGameSummaryDirectorySearchText(game).includes(normalizedQuery))
      .sort(compareNewest)
      .slice(0, 8);
  }, [accountGames, followedDisplayNames, friendFilterActive, query, resultFilter, tab, timeFilter]);

  const accountArchivedGames = React.useMemo(() => {
    if (tab !== "archive") return [];
    const publicGameIds = new Set(publicGames.map((game) => game.gameId));
    const normalizedQuery = normalizeOnlineGameDirectorySearchQuery(query) ?? query.trim().toLowerCase();
    return accountGames
      .filter((game) => game.status === "complete" && game.archiveState === "archived")
      .filter((game) => !publicGameIds.has(game.gameId))
      .filter((game) => timeFilter !== "timed" || game.hasTimeControl)
      .filter((game) => timeFilter !== "casual" || !game.hasTimeControl)
      .filter((game) => matchesResultFilter(game, resultFilter))
      .filter((game) => !friendFilterActive || gameHasFollowedParticipant(game, followedDisplayNames))
      .filter((game) => !normalizedQuery || onlineGameSummaryDirectorySearchText(game).includes(normalizedQuery))
      .sort(sort === "moves" ? compareMostMoves : compareNewest)
      .slice(0, 12);
  }, [accountGames, followedDisplayNames, friendFilterActive, publicGames, query, resultFilter, sort, tab, timeFilter]);

  const visibleOpenSeeks = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return openSeeks
      .filter((seek) => seek.status === "open")
      .filter((seek) => !friendFilterActive || seekHasFollowedCreator(seek, followedDisplayNames))
      .filter((seek) => !normalizedQuery || seekSearchText(seek).includes(normalizedQuery))
      .sort(compareOpenSeekNewest);
  }, [followedDisplayNames, friendFilterActive, openSeeks, query]);

  const emptyTitle =
    tab === "watch" ? "No public games in progress." : "No public completed games yet.";
  const hasActiveSeekFilters =
    query.trim() !== "" ||
    seekSideFilter !== "all" ||
    seekClockFilter !== "all" ||
    seekVpFilter !== "all" ||
    friendFilterActive;
  const hasActiveFilters =
    query.trim() !== "" || timeFilter !== "all" || friendFilterActive || (tab === "archive" && resultFilter !== "all");
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
    if (!canUseAccountSocial || !profileName) return displayName;
    return (
      <button
        type="button"
        className="online-game-player-link"
        onClick={() => void handleSocialLookupByName(profileName, { focus: true })}
        aria-label={`Open ${profileName} profile from ${game.gameId}`}
      >
        {displayName}
      </button>
    );
  };

  const renderPublicGameRow = (
    game: OnlineGameSummary,
    options: {
      compact?: boolean;
      featured?: boolean;
      context?: "watch" | "archive";
      featuredReason?: "moves" | "watchers";
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
    const featuredKicker = isArchivedGame
      ? "Featured replay"
      : options.featuredReason === "watchers"
        ? "Most watched in current list"
        : "Most active live game";
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
    const rowAriaLabel = isArchivedGame
      ? `${white} vs ${black} replay ${game.gameId}, ${resultLabel ?? "completed game"}`
      : `${options.featured ? `${featuredKicker} ` : ""}${white} vs ${black} ${game.gameId}`;

    return (
      <article
        key={game.gameId}
        className={className}
        aria-label={rowAriaLabel}
      >
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
                  ? "Current-list watcher leader"
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
          isSameOnlineIdentity(participant.identity, account.identity)
        )?.seat
      : undefined;
    const storedJoin =
      accountSeat && resolveAccountGameJoin ? resolveAccountGameJoin(game, accountSeat) : null;
    const canReturn = !!storedJoin && !!onReturnToAccountGame;
    const canRejoin = !storedJoin && !!onRejoinAccountGame;
    const isRejoining = rejoiningAccountGameId === game.gameId;
    const canSpectate = canSpectateOnlineGameSummary(game);
    const seatLabel = accountSeat === "w" ? "White" : accountSeat === "b" ? "Black" : "unknown";

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
            <span>Your seat {seatLabel}</span>
            <span>{formatMoveCount(game.livePreview.moveCount)}</span>
            <span>{formatSideToMove(game.livePreview.sideToMove)} to move, {game.livePreview.turnPhase}</span>
            {game.livePreview.lastMove && <span>Last {game.livePreview.lastMove.notation}</span>}
            <span>{game.hasTimeControl ? formatClockSnapshot(game) : formatTimeControl(game)}</span>
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
          <span>Featured by</span>
          <strong>
            {featuredGame
              ? featuredReason === "watchers"
                ? "Most watched in current list"
                : "Most moves"
              : liveGameCount > 0
                ? "No visible game"
                : "No featured game"}
          </strong>
        </div>
        <div className="online-browser-live-stat online-browser-live-stat-wide">
          <span>Activity leader</span>
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
    } finally {
      if (shouldRestoreFocus) {
        window.setTimeout(() => quickMatchButtonRef.current?.focus(), 0);
      }
    }
  };

  const runCreateSeek = async () => {
    if (!onCreateSeek || createSeekDisabled) return;
    setCreateSeekPending(true);
    setQuickMatchStatus("idle");
    setSeekActionMessage("");
    try {
      await onCreateSeek();
    } catch (error) {
      console.error("[OnlineGameBrowser] Failed to list current setup", error);
      setSeekActionMessage("Could not list the current setup.");
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
      setSeekActionMessage(action === "accept" ? "Could not accept that lobby listing." : "Could not cancel that lobby listing.");
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
        setSeekActionMessage("Could not refresh your lobby listing.");
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
    if (!handler) return;
    const requestId = ++socialMutationRequestIdRef.current;
    const accountId = account?.accountId;
    setSocialAction(action);
    setSocialMessage("");
    try {
      const response = await handler(displayName);
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      mergeSocialProfile(response.profile);
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
    } catch (error) {
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      console.error(`[OnlineGameBrowser] Failed to ${action} account`, error);
      setSocialMessage(
        action === "follow"
          ? "Could not follow that account."
          : action === "unfollow"
            ? "Could not unfollow that account."
            : action === "block"
              ? "Could not block that account."
              : "Could not unblock that account."
      );
    } finally {
      if (requestId === socialMutationRequestIdRef.current && accountId === account?.accountId) {
        setSocialAction(undefined);
      }
    }
  }, [
    account?.accountId,
    mergeSocialProfile,
    onBlockAccount,
    onFollowAccount,
    onUnblockAccount,
    onUnfollowAccount,
    refreshFollowingProfiles,
  ]);

  const runSocialChallengeAction = React.useCallback(async (displayName: string) => {
    if (!onChallengeAccount) return;
    const requestId = ++socialMutationRequestIdRef.current;
    const accountId = account?.accountId;
    setSocialAction("challenge");
    setSocialMessage("");
    try {
      await onChallengeAccount(displayName);
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      setSocialMessage(`Challenge created for ${displayName}.`);
    } catch (error) {
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      console.error("[OnlineGameBrowser] Failed to challenge account", error);
      setSocialMessage(`Could not create a challenge for ${displayName}.`);
    } finally {
      if (requestId === socialMutationRequestIdRef.current && accountId === account?.accountId) {
        setSocialAction(undefined);
      }
    }
  }, [account?.accountId, onChallengeAccount]);

  const selectSocialProfile = React.useCallback((profile: OnlineAccountPublicProfile, message = `Selected ${profile.displayName}.`) => {
    setSocialLookupName(profile.displayName);
    setSocialProfile(profile);
    setSocialLookupStatus("ready");
    setSocialMessage(message);
    window.setTimeout(() => socialProfileCardRef.current?.focus(), 0);
  }, []);

  const handleFollowPolicySubmit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onUpdateAccountPrivacy) return;
    const requestId = ++socialMutationRequestIdRef.current;
    const accountId = account?.accountId;
    setSocialAction("privacy");
    setSocialMessage("");
    try {
      const response = await onUpdateAccountPrivacy({ followPolicy: followPolicyDraft });
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      setFollowPolicy(response.privacy.followPolicy);
      setFollowPolicyDraft(response.privacy.followPolicy);
      setPrivacyStatus("ready");
      setSocialMessage(
        `New follow permission: ${formatFollowPolicy(response.privacy.followPolicy)}. Existing follows are not removed.`
      );
    } catch (error) {
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      console.error("[OnlineGameBrowser] Failed to update follow privacy", error);
      setPrivacyStatus("error");
      setSocialMessage("Could not save follow privacy.");
    } finally {
      if (requestId === socialMutationRequestIdRef.current && accountId === account?.accountId) {
        setSocialAction(undefined);
      }
    }
  }, [account?.accountId, followPolicyDraft, onUpdateAccountPrivacy]);

  const handlePresencePolicySubmit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onUpdateAccountPrivacy) return;
    const requestId = ++socialMutationRequestIdRef.current;
    const accountId = account?.accountId;
    setSocialAction("privacy");
    setSocialMessage("");
    try {
      const response = await onUpdateAccountPrivacy({ presencePolicy: presencePolicyDraft });
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      setPresencePolicy(response.privacy.presencePolicy);
      setPresencePolicyDraft(response.privacy.presencePolicy);
      setPrivacyStatus("ready");
      setSocialMessage(
        `New online status visibility: ${formatPresencePolicy(response.privacy.presencePolicy)}. Exact session activity stays private.`
      );
      void refreshFollowingProfiles({ quiet: true });
      if (socialProfile) {
        void handleSocialLookupByName(socialProfile.displayName, { quiet: true });
      }
    } catch (error) {
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      console.error("[OnlineGameBrowser] Failed to update presence privacy", error);
      setPrivacyStatus("error");
      setSocialMessage("Could not save online status visibility.");
    } finally {
      if (requestId === socialMutationRequestIdRef.current && accountId === account?.accountId) {
        setSocialAction(undefined);
      }
    }
  }, [
    account?.accountId,
    handleSocialLookupByName,
    onUpdateAccountPrivacy,
    presencePolicyDraft,
    refreshFollowingProfiles,
    socialProfile,
  ]);

  const handleChallengePolicySubmit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onUpdateAccountPrivacy) return;
    const requestId = ++socialMutationRequestIdRef.current;
    const accountId = account?.accountId;
    setSocialAction("privacy");
    setSocialMessage("");
    try {
      const response = await onUpdateAccountPrivacy({ challengePolicy: challengePolicyDraft });
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      setChallengePolicy(response.privacy.challengePolicy);
      setChallengePolicyDraft(response.privacy.challengePolicy);
      setPrivacyStatus("ready");
      setSocialMessage(
        `New challenge permission: ${formatChallengePolicy(response.privacy.challengePolicy)}. Existing challenge links are not removed.`
      );
    } catch (error) {
      if (requestId !== socialMutationRequestIdRef.current || accountId !== account?.accountId) return;
      console.error("[OnlineGameBrowser] Failed to update challenge privacy", error);
      setPrivacyStatus("error");
      setSocialMessage("Could not save challenge privacy.");
    } finally {
      if (requestId === socialMutationRequestIdRef.current && accountId === account?.accountId) {
        setSocialAction(undefined);
      }
    }
  }, [account?.accountId, challengePolicyDraft, onUpdateAccountPrivacy]);

  const navDestinations: AppShellDestination[] = [
    { id: "play", label: "Play", onClick: onOpenGame ?? onBack },
    ...(onTutorial ? [{ id: "learn" as const, label: "Tutorial", onClick: onTutorial }] : []),
    { id: "online", label: "Online" },
    ...(onOpenLibrary ? [{ id: "library" as const, label: "Library", onClick: onOpenLibrary }] : []),
  ];
  const accountStatusMessage = (() => {
    switch (accountStatus) {
      case "checking":
        return "Checking saved account...";
      case "creating":
        return "Creating account...";
      case "signing-out":
        return "Signing out...";
      case "signing-out-all":
        return "Signing out everywhere...";
      case "deleting":
        return "Deleting account...";
      default:
        return accountError || accountActionMessage;
    }
  })();
  const currentAccountSession =
    accountSessionId
      ? accountSessions.find((session) => session.sessionId === accountSessionId) ??
        accountSessions.find((session) => session.current)
      : accountSessions.find((session) => session.current);
  const accountSessionCountLabel =
    accountSessionsStatus === "loading"
      ? "Loading active sessions..."
      : accountSessionsStatus === "error"
        ? "Could not load active sessions."
        : accountSessionsStatus === "ready"
          ? `${formatCount(accountSessions.length, "active session")} for this account.`
          : "";
  const accountStatusMessageClassName = [
    "online-browser-account-message",
    accountStatus === "error" || Boolean(accountError) || accountActionMessage.startsWith("Could not")
      ? "error"
      : "",
  ].filter(Boolean).join(" ");
  const socialLookupDisplayName = socialLookupName.trim();
  const socialBusy = socialLookupStatus === "loading" || socialAction !== undefined;
  const canSubmitSocialLookup = socialLookupDisplayName.length >= 2 && !socialBusy;
  const socialMessageClassName = [
    "online-browser-social-message",
    socialLookupStatus === "error" || socialMessage.startsWith("Could not") || socialMessage.startsWith("No visible")
      ? "error"
      : "",
  ].filter(Boolean).join(" ");
  const canSaveFollowPolicy =
    canUseAccountSocial &&
    privacyStatus === "ready" &&
    socialAction !== "privacy" &&
    followPolicyDraft !== followPolicy;
  const canSavePresencePolicy =
    canUseAccountSocial &&
    privacyStatus === "ready" &&
    socialAction !== "privacy" &&
    presencePolicyDraft !== presencePolicy;
  const canSaveChallengePolicy =
    canUseAccountSocial &&
    privacyStatus === "ready" &&
    socialAction !== "privacy" &&
    challengePolicyDraft !== challengePolicy;
  const privacyControlDisabled = privacyStatus !== "ready" || socialAction === "privacy";

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
      />

      <section className="online-browser-account-panel" aria-label="Online account">
        <div className="online-browser-account-copy">
          <span className="online-browser-section-kicker">Account</span>
          {account ? (
            <>
              <strong>{account.displayName}</strong>
              <p>Your signed-in games appear in your account archive.</p>
              {accountSessionCountLabel && (
                <p className="online-browser-account-session-summary">
                  {accountSessionCountLabel}
                  {currentAccountSession ? ` Current session last used ${formatUpdatedAt(currentAccountSession.lastUsedAt)}.` : ""}
                </p>
              )}
            </>
          ) : (
            <>
              <strong>Play with a display name</strong>
              <p>Create a browser account to keep your online games attached to this display name.</p>
            </>
          )}
          {accountStatusMessage && (
            <p className={accountStatusMessageClassName} role="status" aria-live="polite">
              {accountStatusMessage}
            </p>
          )}
        </div>
        {account ? (
          <div className="online-browser-account-actions">
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={refreshAccountSessions}
              disabled={!loadAccountSessions || accountSessionsStatus === "loading" || accountStatus === "signing-out" || accountStatus === "signing-out-all" || accountStatus === "deleting"}
            >
              {accountSessionsStatus === "loading" ? "Refreshing" : "Refresh Sessions"}
            </button>
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={onSignOutAccount}
              disabled={!onSignOutAccount || accountStatus === "signing-out" || accountStatus === "signing-out-all" || accountStatus === "deleting"}
            >
              {accountStatus === "signing-out" ? "Signing Out" : "Sign Out"}
            </button>
            <button
              type="button"
              className="online-browser-button subtle online-browser-button-danger"
              onClick={handleSignOutAllAccountSessions}
              disabled={!onSignOutAllAccountSessions || accountStatus === "signing-out" || accountStatus === "signing-out-all" || accountStatus === "deleting"}
            >
              {accountStatus === "signing-out-all" ? "Signing Out Everywhere" : "Sign Out Everywhere"}
            </button>
            <button
              type="button"
              className="online-browser-button subtle online-browser-button-danger"
              onClick={() => setIsDeleteAccountConfirmOpen(true)}
              disabled={!onDeleteAccount || accountStatus === "signing-out" || accountStatus === "signing-out-all" || accountStatus === "deleting"}
              aria-expanded={isDeleteAccountConfirmOpen}
              aria-controls={isDeleteAccountConfirmOpen ? deleteAccountConfirmPanelId : undefined}
            >
              Delete Account
            </button>
          </div>
        ) : (
          <form className="online-browser-account-form" onSubmit={handleCreateAccountSubmit}>
            <label>
              <span>Display name</span>
              <input
                type="text"
                value={accountDisplayName}
                onChange={(event) => setAccountDisplayName(event.currentTarget.value)}
                minLength={2}
                maxLength={32}
                autoComplete="nickname"
              />
            </label>
            <button
              type="submit"
              className="online-browser-button primary"
              disabled={!onCreateAccount || accountStatus === "creating" || accountDisplayName.trim().length < 2}
            >
              {accountStatus === "creating" ? "Creating..." : "Create Account"}
            </button>
          </form>
        )}
      </section>
      {account && isDeleteAccountConfirmOpen && (
        <section
          className="online-browser-account-delete-panel"
          id={deleteAccountConfirmPanelId}
          aria-labelledby={deleteAccountConfirmHeadingId}
          aria-describedby={deleteAccountConfirmDescriptionId}
        >
          <div>
            <span className="online-browser-section-kicker">Delete account</span>
            <strong id={deleteAccountConfirmHeadingId}>Remove {account.displayName}</strong>
            <p id={deleteAccountConfirmDescriptionId}>
              This deletes the sign-in account and signs it out everywhere. Active and completed game records stay in game history and may still show this display name. The display name stays reserved. This cannot be undone.
            </p>
          </div>
          <div className="online-browser-account-actions">
            <button
              type="button"
              className="online-browser-button subtle online-browser-button-danger"
              onClick={handleDeleteAccount}
              disabled={accountStatus === "deleting"}
              ref={deleteAccountConfirmButtonRef}
            >
              {accountStatus === "deleting" ? "Deleting" : "Confirm Delete"}
            </button>
            <button
              type="button"
              className="online-browser-button subtle"
              onClick={() => setIsDeleteAccountConfirmOpen(false)}
              disabled={accountStatus === "deleting"}
            >
              Cancel
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
              <p>Find exact account names, follow players you trust, and block accounts you do not want to interact with.</p>
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
                <span>Exact account name</span>
                <input
                  type="text"
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
            </form>

            <form className="online-browser-follow-policy" onSubmit={handleFollowPolicySubmit}>
              <label>
                <span>Who can newly follow me</span>
                <select
                  value={followPolicyDraft}
                  onChange={(event) => setFollowPolicyDraft(event.currentTarget.value as OnlineAccountFollowPolicy)}
                  disabled={privacyControlDisabled}
                  aria-describedby={followPolicyHintId}
                >
                  <option value="everyone">Everyone can follow</option>
                  <option value="nobody">Nobody new</option>
                </select>
              </label>
              <span
                id={followPolicyHintId}
                className={`online-browser-field-hint ${privacyStatus === "error" ? "error" : ""}`}
              >
                {privacyStatus === "error"
                  ? "Could not load social privacy."
                  : "Existing follows are not removed."}
              </span>
              <button
                type="submit"
                className="online-browser-button subtle"
                disabled={!canSaveFollowPolicy}
              >
                {socialAction === "privacy" ? "Saving" : "Save Privacy"}
              </button>
            </form>

            <form className="online-browser-follow-policy" onSubmit={handlePresencePolicySubmit}>
              <label>
                <span>Who can see me online</span>
                <select
                  value={presencePolicyDraft}
                  onChange={(event) => setPresencePolicyDraft(event.currentTarget.value as OnlineAccountPresencePolicy)}
                  disabled={privacyControlDisabled}
                  aria-describedby={presencePolicyHintId}
                >
                  <option value="followed">Accounts I follow</option>
                  <option value="everyone">Everyone</option>
                  <option value="nobody">Nobody</option>
                </select>
              </label>
              <span
                id={presencePolicyHintId}
                className={`online-browser-field-hint ${privacyStatus === "error" ? "error" : ""}`}
              >
                {privacyStatus === "error"
                  ? "Could not load social privacy."
                  : "Only coarse status is shared."}
              </span>
              <button
                type="submit"
                className="online-browser-button subtle"
                disabled={!canSavePresencePolicy}
              >
                {socialAction === "privacy" ? "Saving" : "Save Status"}
              </button>
            </form>

            <form className="online-browser-follow-policy" onSubmit={handleChallengePolicySubmit}>
              <label>
                <span>Who can challenge me</span>
                <select
                  value={challengePolicyDraft}
                  onChange={(event) => setChallengePolicyDraft(event.currentTarget.value as OnlineAccountChallengePolicy)}
                  disabled={privacyControlDisabled}
                  aria-describedby={challengePolicyHintId}
                >
                  <option value="followed">Accounts I follow</option>
                  <option value="everyone">Everyone</option>
                  <option value="nobody">Nobody</option>
                </select>
              </label>
              <span
                id={challengePolicyHintId}
                className={`online-browser-field-hint ${privacyStatus === "error" ? "error" : ""}`}
              >
                {privacyStatus === "error"
                  ? "Could not load social privacy."
                  : "Existing challenge links are not removed."}
              </span>
              <button
                type="submit"
                className="online-browser-button subtle"
                disabled={!canSaveChallengePolicy}
              >
                {socialAction === "privacy" ? "Saving" : "Save Challenges"}
              </button>
            </form>
          </div>

          <p className={socialMessageClassName} role="status" aria-live="polite" aria-atomic="true">
            {socialMessage}
          </p>

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
                  const pendingChallenge = accountChallengeByOpponentDisplayName.get(profileKey);
                  const canInteractWithProfile = !profile.relationship.blocked && !profile.relationship.self;
                  const liveGameWhite = liveGame ? participantName(liveGame.participants, "w") : "";
                  const liveGameBlack = liveGame ? participantName(liveGame.participants, "b") : "";
                  return (
                    <article key={profile.displayName} className="online-browser-online-now-card">
                      <div className="online-browser-online-now-main">
                        <strong>{profile.displayName}</strong>
                        <div className="online-browser-social-badges">
                          <span className={presenceBadgeClassName(profile)}>{formatPresenceLabel(profile)}</span>
                          {liveGame && <span>Playing now</span>}
                          {pendingChallenge && (
                            <span>{pendingChallenge.role === "challenged" ? "Incoming challenge" : "Challenge sent"}</span>
                          )}
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
                        {!pendingChallenge && onChallengeAccount && canInteractWithProfile && (
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
            <section className="online-browser-following-list online-browser-account-challenges" aria-label="Account challenges">
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
                    const canActOnChallenge = item.summary.status === "pending" && !pendingAction;
                    return (
                      <article key={challengeId} className="online-browser-following-row">
                        <div>
                          <strong>{challengeOpponentName(item)}</strong>
                          <div className="online-browser-social-badges">
                            <span>{formatAccountChallengeRole(item.role)}</span>
                            <span>{formatAccountChallengeStatus(item)}</span>
                            <span>{formatChallengeSeatChoice(item)}</span>
                          </div>
                        </div>
                        <div className="online-browser-account-challenge-side">
                          <div className="online-browser-social-badges online-browser-account-challenge-meta">
                            <span>{formatUpdatedAt(item.summary.updatedAt)}</span>
                            <span>{challengeId}</span>
                          </div>
                          <div className="online-browser-social-actions">
                            {item.summary.status === "pending" && item.role === "challenged" && onAcceptAccountChallenge && (
                              <button
                                type="button"
                                className="online-browser-button primary"
                                onClick={() => void runAccountChallengeAction(item, "accept")}
                                disabled={!canActOnChallenge}
                                aria-label={`Accept challenge from ${challengeOpponentName(item)}`}
                              >
                                {pendingAction === "accept" ? "Accepting" : "Accept"}
                              </button>
                            )}
                            {item.summary.status === "pending" && item.role === "challenged" && onDeclineAccountChallenge && (
                              <button
                                type="button"
                                className="online-browser-button subtle"
                                onClick={() => void runAccountChallengeAction(item, "decline")}
                                disabled={!canActOnChallenge}
                                aria-label={`Decline challenge from ${challengeOpponentName(item)}`}
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
                                aria-label={`Cancel challenge to ${challengeOpponentName(item)}`}
                              >
                                {pendingAction === "cancel" ? "Cancelling" : "Cancel"}
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
                <strong>{socialProfile.displayName}</strong>
                <div className="online-browser-social-badges">
                  <span className={presenceBadgeClassName(socialProfile)}>{formatPresenceLabel(socialProfile)}</span>
                  <span>{formatRelationshipLabel(socialProfile)}</span>
                </div>
              </div>
              {!socialProfile.relationship.self && (
                <div className="online-browser-social-actions">
                  {socialProfile.relationship.blocked ? (
                    <button
                      type="button"
                      className="online-browser-button subtle"
                      onClick={() => void runSocialProfileAction("unblock", socialProfile.displayName)}
                      disabled={socialAction !== undefined}
                      aria-label={`Unblock ${socialProfile.displayName}`}
                    >
                      {socialAction === "unblock" ? "Unblocking" : "Unblock"}
                    </button>
                  ) : (
                    <>
                      {onChallengeAccount && (
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
                  const pendingChallenge = accountChallengeByOpponentDisplayName.get(profileKey);
                  const pendingChallengeId = pendingChallenge?.summary.challengeId;
                  const pendingChallengeAction = pendingChallengeId
                    ? accountChallengeActionById[pendingChallengeId]
                    : undefined;
                  const canActOnPendingChallenge =
                    !!pendingChallenge &&
                    pendingChallenge.summary.status === "pending" &&
                    pendingChallengeAction === undefined;
                  const canInteractWithProfile = !profile.relationship.blocked && !profile.relationship.self;
                  const liveGameWhite = liveGame ? participantName(liveGame.participants, "w") : "";
                  const liveGameBlack = liveGame ? participantName(liveGame.participants, "b") : "";
                  return (
                    <article key={profile.displayName} className="online-browser-following-row">
                      <div>
                        <strong>{profile.displayName}</strong>
                        <div className="online-browser-social-badges">
                          <span className={presenceBadgeClassName(profile)}>{formatPresenceLabel(profile)}</span>
                          {liveGame && <span>Playing now</span>}
                          {pendingChallenge && (
                            <span>{pendingChallenge.role === "challenged" ? "Incoming challenge" : "Challenge sent"}</span>
                          )}
                          <span>{formatRelationshipLabel(profile)}</span>
                        </div>
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
                            {pendingChallengeAction === "accept" ? "Accepting" : "Accept"}
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
                        {!pendingChallenge && onChallengeAccount && canInteractWithProfile && (
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
                        <button
                          type="button"
                          className="online-browser-button subtle"
                          onClick={() => selectSocialProfile(profile)}
                          disabled={socialAction !== undefined}
                          aria-label={`Select ${profile.displayName}`}
                        >
                          Select
                        </button>
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

      <section className={`online-browser-toolbar online-browser-toolbar-${tab}`} aria-label="Online browser controls">
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
        {tab === "lobby" ? (
          <div className="online-browser-filter-panel" role="group" aria-label="Find lobby listings">
            <div className="online-browser-control-title">Find lobby listings</div>
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
              <button
                type="button"
                className="online-browser-button neutral"
                onClick={() => void loadOpenSeekPage({ background: false })}
                disabled={seekStatus === "loading" || isSeekLoadInFlight || quickMatchBlocking}
                aria-label="Refresh lobby listings"
              >
                {seekStatus === "loading" ? "Refreshing..." : "Refresh listings"}
              </button>
            </div>
          </div>
        ) : (
          <div className="online-browser-filter-panel" role="group" aria-label={gameBrowseControlsLabel}>
            <div className="online-browser-control-title">{tab === "watch" ? "Browse live games" : "Browse archive"}</div>
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
        )}
        <label className="online-browser-search">
          <span>Search</span>
          <input
            type="search"
            aria-label={gameSearchAriaLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={tab === "lobby" ? undefined : ONLINE_GAME_DIRECTORY_SEARCH_MAX_LENGTH}
            placeholder={gameSearchPlaceholder}
          />
        </label>
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
                      <button
                        type="button"
                        className="online-browser-button neutral online-browser-create-seek"
                        onClick={() => void runCreateSeek()}
                        disabled={createSeekDisabled}
                        aria-label="Create public lobby listing from current Play setup"
                      >
                        {createSeekPending ? "Listing..." : "Create Lobby Listing"}
                      </button>
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
                        ? "Use Quick Match or Create Lobby Listing above, or change setup from Play."
                        : "Configure setup, then return here to find or create a lobby listing."}
                  </p>
                </div>
              ) : (
                visibleOpenSeeks.map((seek) => {
                  const owned = ownedSeekIds.includes(seek.seekId);
                  const pendingAction = seekActionById[seek.seekId];
                  const radius = seek.setup.board.config.nSquares;
                  return (
                    <article
                      key={seek.seekId}
                      className="online-game-row online-seek-row"
                      aria-label={`Lobby listing ${seek.seekId}`}
                    >
                      <div className="online-game-row-main">
                        <div className="online-game-players">
                          <strong>Lobby listing</strong>
                          <span>{seek.seekId}</span>
                        </div>
                        <div className="online-game-meta">
                          <span className="online-game-pill active">Open</span>
                          <span>{formatSeekSideDetail(seek, owned)}</span>
                          <span>Board Radius {radius}</span>
                          <span>Clock {formatSeekClock(seek)}</span>
                          <span>Scoring {formatSeekScoringLabel(seek)}</span>
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
                  <button
                    type="button"
                    className="online-browser-button subtle"
                    onClick={refreshGames}
                    disabled={status === "loading"}
                    aria-label="Refresh live public games"
                  >
                    {status === "loading" ? "Refreshing..." : "Refresh live games"}
                  </button>
                </div>
              </div>
              {renderLiveOverview(filteredPublicActiveGames.length, lobbyLiveGames[0] ?? null, "Lobby live games overview")}
              {status === "error" ? (
                <div className="online-browser-empty online-browser-empty-compact">
                  <h2>Live games are unavailable.</h2>
                  <p>Refresh live games to try again.</p>
                </div>
              ) : lobbyLiveGames.length === 0 && status === "ready" ? (
                <div className="online-browser-empty online-browser-empty-compact">
                  <h2>{friendFilterActive ? "No loaded public games include followed players." : "No public games in progress."}</h2>
                  <p>
                    {friendFilterActive
                      ? "Refresh live games or follow players from People."
                      : "Accepted lobby games appear here automatically."}
                  </p>
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
              <button
                type="button"
                className="online-browser-button subtle"
                onClick={refreshGames}
                disabled={status === "loading"}
                aria-label="Refresh live public games"
              >
                {status === "loading" ? "Refreshing..." : "Refresh live games"}
              </button>
            </div>
            {renderLiveOverview(
              friendFilterActive ? visibleGames.length : publicActiveGames.length,
              watchFeaturedGame,
              "Watch live games overview",
              watchFeaturedReason
            )}
            {visibleGames.length === 0 && status === "ready" ? (
              <section className="online-browser-empty online-browser-empty-compact">
                <h2>{friendFilterActive ? "No loaded public games include followed players." : hasActiveFilters ? "No public games match these filters." : emptyTitle}</h2>
                <p>
                  {friendFilterActive
                    ? "Refresh live games, load more when available, or follow players from People."
                    : hasActiveFilters
                    ? "Try a different search or clock setting."
                    : "Accepted public lobby games appear here automatically. Private and unlisted games stay off this page."}
                </p>
              </section>
            ) : (
              <div className="online-browser-watch-grid">
                {watchFeaturedGame && (
                  <section
                    className="online-browser-featured-game"
                    aria-label={
                      watchFeaturedReason === "watchers"
                        ? "Most watched public live game in current list"
                        : "Most active public live game"
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
                      loadAccountGames?.({ state: "all", limit: 50 })
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
                  Active and completed private, unlisted, and public games played as {account.displayName} appear here. Active games can return to play only when this browser session still has the saved player token.
                </p>
                {accountGamesStatus === "error" ? (
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
                        : "Active games and finished replays will appear here after you play while signed in."}
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
                        {accountArchivedGames.map((game) => renderPublicGameRow(game, { context: "archive" }))}
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
                <section className="online-browser-empty">
                  <h2>{friendFilterActive ? "No loaded public replays include followed players." : hasActiveFilters ? "No public replays match these filters." : emptyTitle}</h2>
                  <p>
                    {friendFilterActive
                      ? "Refresh the public archive, load more when available, or follow players from People."
                      : hasActiveFilters
                      ? "Try a different search, clock, or result setting. Account and public replays use full server details; device-only replays appear only when their local game id can match."
                      : "Private and unlisted games stay out of the public archive. Shared spectator links still work for people who already have them."}
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
