import { generateKeyPairSync, sign as signJwt } from "node:crypto";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { getStartingBoard, getStartingPieces } from "../../../ConstantImports";
import { SanctuaryGenerator } from "../../../Classes/Systems/SanctuaryGenerator";
import { PieceType, SanctuaryType } from "../../../Constants";
import { serializeOnlineGameSetup } from "../../serialization";
import {
  createOnlineActionAcceptedEvent,
  ONLINE_EVENT_SCHEMA_VERSION,
  type OnlineGameCredentials,
  OnlineGameEvent,
} from "../../events";
import { ONLINE_MAX_ADDITIONAL_SEAT_CREDENTIALS, OnlineGameRoom } from "../../OnlineGameRoom";
import { OnlineGameService } from "../../OnlineGameService";
import { createOnlineHttpServer } from "../createOnlineHttpServer";
import { OnlineGameSeatCredentialTerminalError } from "../OnlineGameStore";
import { MemoryOnlineAccountStore } from "../OnlineAccountStore";
import { PostgresOnlineAccountStore } from "../PostgresOnlineAccountStore";
import {
  createChallengeAcceptedEvent,
  ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
  projectOnlineChallengeSummaries,
  type AuthenticatedOnlineIdentity,
  type OnlineChallengeEvent,
  type OnlineChallengeVisibility,
  type OnlineChallengeSummary,
} from "../../challenges";
import {
  ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
  ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
  projectOnlineGameSummaries,
  type OnlinePersonalGameDirectoryListOptions,
  type OnlineGameDirectoryResponse,
  type OnlineGameSummary,
} from "../../readModel";
import {
  ONLINE_SEEK_DIRECTORY_MAX_LIMIT,
  ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
  ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
  createOpenSeekAcceptedEvent,
  encodeOpenSeekDirectoryCursor,
  type OpenSeekSummary,
} from "../../seeks";
import { ONLINE_PROTOCOL_VERSION } from "../../protocolVersion";
import { hashOnlineToken, verifyOnlineToken } from "../onlineTokenCredentials";
import { createDefaultOnlineRating } from "../../ratings";

const servers: Array<{ close: (callback: () => void) => void }> = [];

function createSetup() {
  const board = getStartingBoard(6);
  const pieces = getStartingPieces(6);
  const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, [
    SanctuaryType.WolfCovenant,
    SanctuaryType.SacredSpring,
  ]);

  return serializeOnlineGameSetup({
    board,
    pieces,
    sanctuaries,
    sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
    gameRules: { vpModeEnabled: false },
    initialPoolTypes: [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring],
    pieceTheme: "Castles",
  });
}

function createClockedSetup() {
  return {
    ...createSetup(),
    timeControl: { initial: 1, increment: 0 },
  };
}

function createTaggedClockedSetup(pieceTheme: "Castles" | "Chess" = "Castles") {
  return {
    ...createClockedSetup(),
    pieceTheme,
  };
}

function openSeekSummary(
  seekId: string,
  overrides: Partial<OpenSeekSummary> = {}
): OpenSeekSummary {
  return {
    schemaVersion: ONLINE_SEEK_SUMMARY_SCHEMA_VERSION,
    seekId,
    creatorIdentity: { kind: "session", id: `${seekId}_creator` },
    creatorSeat: "random",
    setup: createClockedSetup(),
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2999-06-01T12:10:00.000Z",
    status: "open",
    lastEventId: `${seekId}_evt`,
    ...overrides,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listen(server: { listen: (port: number, callback: () => void) => void; address: () => AddressInfo | string | null }) {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return (server.address() as AddressInfo).port;
}

function nextSocketMessage(socket: WebSocket, description = "WebSocket message"): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${description}`));
    }, 3_000);
    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const onMessage = (data: WebSocket.RawData) => {
      cleanup();
      try {
        resolve(JSON.parse(data.toString("utf8")));
      } catch (error) {
        reject(error);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.once("message", onMessage);
    socket.once("error", onError);
  });
}

function versionedMessage<T extends Record<string, unknown>>(
  message: T
): T & { protocolVersion: typeof ONLINE_PROTOCOL_VERSION } {
  return {
    protocolVersion: ONLINE_PROTOCOL_VERSION,
    ...message,
  };
}

function fragmentChallengeToken(url: string): string {
  const fragment = new URL(url).hash.slice(1);
  const token = new URLSearchParams(fragment).get("challengeToken");
  if (!token) throw new Error(`Missing challenge token in ${url}`);
  return token;
}

function bearer(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

const googleTestKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const googleTestPublicJwk = googleTestKeyPair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;

function fakeGoogleIdToken(claims: Record<string, unknown>): string {
  const signingInput = [
    base64UrlJson({ alg: "RS256", kid: "google-test-key", typ: "JWT" }),
    base64UrlJson(claims),
  ].join(".");
  const signature = signJwt("RSA-SHA256", Buffer.from(signingInput), googleTestKeyPair.privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

function fakeGoogleJwks(): Record<string, unknown> {
  return {
    keys: [
      {
        ...googleTestPublicJwk,
        kid: "google-test-key",
        use: "sig",
        alg: "RS256",
      },
    ],
  };
}

async function createAccountViaApi(
  port: number,
  displayName: string,
  password = "account-password"
): Promise<any> {
  const response = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName, password }),
  });
  const body = await response.json();
  expect(response.status).toBe(201);
  return body;
}

class FakePostgresAccountQueryable {
  readonly accounts = new Map<string, any>();
  readonly accountsByDisplayName = new Map<string, string>();
  readonly displayNameRegistry = new Map<string, string>();
  readonly sessionsByTokenHash = new Map<string, any>();
  readonly ratingRows = new Map<string, any>();
  readonly follows = new Set<string>();
  readonly blocks = new Set<string>();
  readonly reports: any[] = [];
  readonly reportAudits: any[] = [];
  private transactionSnapshot?: {
    accounts: Map<string, any>;
    accountsByDisplayName: Map<string, string>;
    displayNameRegistry: Map<string, string>;
    sessionsByTokenHash: Map<string, any>;
    ratingRows: Map<string, any>;
    follows: Set<string>;
    blocks: Set<string>;
    reports: any[];
    reportAudits: any[];
  };

  release(): void {}

  async query(text: string, values: unknown[] = []): Promise<{ rows: any[] }> {
    const normalizedText = text.replace(/\s+/g, " ").trim();
    if (normalizedText === "BEGIN") {
      this.transactionSnapshot = {
        accounts: new Map(Array.from(this.accounts.entries()).map(([key, value]) => [key, { ...value }])),
        accountsByDisplayName: new Map(this.accountsByDisplayName),
        displayNameRegistry: new Map(this.displayNameRegistry),
        sessionsByTokenHash: new Map(
          Array.from(this.sessionsByTokenHash.entries()).map(([key, value]) => [key, { ...value }])
        ),
        ratingRows: new Map(Array.from(this.ratingRows.entries()).map(([key, value]) => [key, { ...value }])),
        follows: new Set(this.follows),
        blocks: new Set(this.blocks),
        reports: this.reports.map((report) => ({ ...report })),
        reportAudits: this.reportAudits.map((audit) => ({ ...audit })),
      };
      return { rows: [] };
    }
    if (normalizedText === "COMMIT") {
      this.transactionSnapshot = undefined;
      return { rows: [] };
    }
    if (normalizedText === "ROLLBACK") {
      if (this.transactionSnapshot) {
        this.accounts.clear();
        this.accountsByDisplayName.clear();
        this.displayNameRegistry.clear();
        this.sessionsByTokenHash.clear();
        this.ratingRows.clear();
        this.follows.clear();
        this.blocks.clear();
        this.reports.splice(0);
        this.reportAudits.splice(0);
        for (const [key, value] of this.transactionSnapshot.accounts) this.accounts.set(key, value);
        for (const [key, value] of this.transactionSnapshot.accountsByDisplayName) this.accountsByDisplayName.set(key, value);
        for (const [key, value] of this.transactionSnapshot.displayNameRegistry) this.displayNameRegistry.set(key, value);
        for (const [key, value] of this.transactionSnapshot.sessionsByTokenHash) this.sessionsByTokenHash.set(key, value);
        for (const [key, value] of this.transactionSnapshot.ratingRows) this.ratingRows.set(key, value);
        for (const key of this.transactionSnapshot.follows) this.follows.add(key);
        for (const key of this.transactionSnapshot.blocks) this.blocks.add(key);
        this.reports.push(...this.transactionSnapshot.reports.map((report) => ({ ...report })));
        this.reportAudits.push(...this.transactionSnapshot.reportAudits.map((audit) => ({ ...audit })));
        this.transactionSnapshot = undefined;
      }
      return { rows: [] };
    }
    if (
      normalizedText === "SELECT 1" ||
      normalizedText.startsWith("SELECT pg_advisory_xact_lock") ||
      normalizedText.startsWith("CREATE TABLE") ||
      normalizedText.startsWith("ALTER TABLE") ||
      normalizedText.startsWith("CREATE INDEX") ||
      normalizedText.startsWith("CREATE UNIQUE INDEX") ||
      normalizedText.startsWith("DO $$")
    ) {
      return { rows: [] };
    }

    if (normalizedText.startsWith("SELECT payload FROM online_account_ratings WHERE account_id")) {
      const [accountId] = values as string[];
      const rating = this.ratingRows.get(accountId);
      return { rows: rating ? [{ payload: rating }] : [] };
    }

    if (normalizedText.startsWith("SELECT a.display_name, r.payload FROM online_account_ratings r INNER JOIN online_accounts a")) {
      const [limit] = values as number[];
      const rows = Array.from(this.ratingRows.entries())
        .flatMap(([accountId, rating]) => {
          const account = this.accounts.get(accountId);
          return account ? [{ display_name: account.display_name, payload: rating }] : [];
        })
        .sort((left, right) => {
          if (left.payload.rating !== right.payload.rating) return right.payload.rating - left.payload.rating;
          if (left.payload.games !== right.payload.games) return right.payload.games - left.payload.games;
          return String(left.display_name).localeCompare(String(right.display_name));
        })
        .slice(0, limit);
      return { rows };
    }

    if (normalizedText.startsWith("WITH visible_accounts AS")) {
      const [viewerAccountId, limit] = values as [string, number];
      const visibleAccountIds = new Set([viewerAccountId]);
      for (const key of this.follows) {
        const [followerAccountId, followedAccountId] = key.split("|");
        if (
          followerAccountId === viewerAccountId &&
          !this.blocks.has(`${followedAccountId}|${viewerAccountId}`) &&
          !this.blocks.has(`${viewerAccountId}|${followedAccountId}`)
        ) {
          visibleAccountIds.add(followedAccountId);
        }
      }
      const rows = Array.from(visibleAccountIds)
        .flatMap((accountId) => {
          const account = this.accounts.get(accountId);
          const rating = this.ratingRows.get(accountId);
          return account && rating ? [{ display_name: account.display_name, payload: rating }] : [];
        })
        .sort((left, right) => {
          if (left.payload.rating !== right.payload.rating) return right.payload.rating - left.payload.rating;
          if (left.payload.games !== right.payload.games) return right.payload.games - left.payload.games;
          return String(left.display_name).localeCompare(String(right.display_name));
        })
        .slice(0, limit);
      return { rows };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_display_names")) {
      if (values.length === 0) {
        for (const account of this.accounts.values()) {
          if (!this.displayNameRegistry.has(account.display_name_normalized)) {
            this.displayNameRegistry.set(account.display_name_normalized, account.display_name);
          }
        }
        return { rows: [] };
      }
      const [displayNameNormalized, displayName] = values as string[];
      if (this.displayNameRegistry.has(displayNameNormalized)) {
        const error = new Error("duplicate key value") as Error & { code: string; constraint: string };
        error.code = "23505";
        error.constraint = "online_account_display_names_pkey";
        throw error;
      }
      this.displayNameRegistry.set(displayNameNormalized, displayName);
      return { rows: [] };
    }

    if (normalizedText.startsWith("INSERT INTO online_accounts")) {
      const [accountId, displayName, displayNameNormalized, passwordHash, createdAt] = values as string[];
      if (this.accounts.has(accountId) || this.accountsByDisplayName.has(displayNameNormalized)) {
        const error = new Error("duplicate key value") as Error & { code: string; constraint: string };
        error.code = "23505";
        error.constraint = this.accountsByDisplayName.has(displayNameNormalized)
          ? "online_accounts_display_name_normalized_key"
          : "online_accounts_pkey";
        throw error;
      }
      const row = {
        account_id: accountId,
        display_name: displayName,
        display_name_normalized: displayNameNormalized,
        password_hash: passwordHash,
        created_at: createdAt,
        updated_at: createdAt,
      };
      this.accounts.set(accountId, row);
      this.accountsByDisplayName.set(displayNameNormalized, accountId);
      return { rows: [row] };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_sessions")) {
      const [sessionId, accountId, tokenHash, createdAt] = values as string[];
      this.sessionsByTokenHash.set(tokenHash, {
        session_id: sessionId,
        account_id: accountId,
        token_hash: tokenHash,
        created_at: createdAt,
        last_used_at: createdAt,
      });
      return { rows: [] };
    }

    if (normalizedText.includes("FROM online_account_sessions s INNER JOIN online_accounts a")) {
      const [tokenHash] = values as string[];
      const session = this.sessionsByTokenHash.get(tokenHash);
      if (!session) return { rows: [] };
      const account = this.accounts.get(session.account_id);
      if (!account) return { rows: [] };
      return { rows: [{ ...account, session_id: session.session_id }] };
    }

    if (normalizedText.startsWith("UPDATE online_account_sessions")) {
      const [sessionId, usedAt] = values as string[];
      for (const session of this.sessionsByTokenHash.values()) {
        if (session.session_id === sessionId) {
          session.last_used_at = usedAt;
        }
      }
      return { rows: [] };
    }

    if (normalizedText.startsWith("SELECT session_id, created_at, last_used_at FROM online_account_sessions")) {
      const [accountId] = values as string[];
      const rows = Array.from(this.sessionsByTokenHash.values())
        .filter((session) => session.account_id === accountId)
        .sort((left, right) => {
          if (left.last_used_at !== right.last_used_at) return right.last_used_at.localeCompare(left.last_used_at);
          if (left.created_at !== right.created_at) return right.created_at.localeCompare(left.created_at);
          return left.session_id.localeCompare(right.session_id);
        })
        .map((session) => ({
          session_id: session.session_id,
          created_at: session.created_at,
          last_used_at: session.last_used_at,
        }));
      return { rows };
    }

    if (normalizedText.startsWith("SELECT account_id, display_name, created_at, updated_at, password_hash FROM online_accounts WHERE display_name_normalized")) {
      const [displayNameNormalized] = values as string[];
      const accountId = this.accountsByDisplayName.get(displayNameNormalized);
      const account = accountId ? this.accounts.get(accountId) : undefined;
      return { rows: account ? [account] : [] };
    }

    if (normalizedText.startsWith("SELECT account_id, display_name, created_at, updated_at FROM online_accounts WHERE display_name_normalized")) {
      const [displayNameNormalized] = values as string[];
      const accountId = this.accountsByDisplayName.get(displayNameNormalized);
      const account = accountId ? this.accounts.get(accountId) : undefined;
      return { rows: account ? [account] : [] };
    }

    if (normalizedText.startsWith("SELECT account_id, display_name, created_at, updated_at FROM online_accounts WHERE account_id")) {
      const [accountId] = values as string[];
      const account = this.accounts.get(accountId);
      return { rows: account ? [account] : [] };
    }

    if (normalizedText.startsWith("SELECT 1 FROM online_account_blocks")) {
      const [blockerAccountId, blockedAccountId] = values as string[];
      return { rows: this.blocks.has(`${blockerAccountId}|${blockedAccountId}`) ? [{ "?column?": 1 }] : [] };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_reports")) {
      const [
        reportId,
        reporterAccountId,
        reporterDisplayName,
        targetAccountId,
        targetDisplayName,
        reason,
        details,
        createdAt,
      ] = values as string[];
      this.reports.push({
        report_id: reportId,
        reporter_account_id: reporterAccountId,
        reporter_display_name: reporterDisplayName,
        target_account_id: targetAccountId,
        target_display_name: targetDisplayName,
        reason,
        details,
        status: "open",
        moderator_note: "",
        created_at: createdAt,
        updated_at: createdAt,
        reviewed_at: null,
      });
      return { rows: [] };
    }

    if (normalizedText.startsWith("SELECT report_id, reporter_display_name, target_display_name, reason, details, moderator_note, status, created_at, updated_at, reviewed_at FROM online_account_reports WHERE status")) {
      const [status] = values as [string];
      const hasReasonFilter = normalizedText.includes("AND reason =");
      const hasReporterFilter = normalizedText.includes("LOWER(reporter_display_name)");
      const hasTargetFilter = normalizedText.includes("LOWER(target_display_name)");
      const hasCursorFilter = normalizedText.includes("created_at <");
      let index = 1;
      const reason = hasReasonFilter ? (values[index++] as string) : undefined;
      const reporterDisplayName = hasReporterFilter ? String(values[index++]).toLowerCase() : undefined;
      const targetDisplayName = hasTargetFilter ? String(values[index++]).toLowerCase() : undefined;
      const cursorCreatedAt = hasCursorFilter ? String(values[index++]) : undefined;
      const cursorReportId = hasCursorFilter ? String(values[index++]) : undefined;
      const limit = values[index] as number;
      const rows = this.reports
        .filter((report) => report.status === status)
        .filter((report) => !reason || report.reason === reason)
        .filter((report) => !reporterDisplayName || String(report.reporter_display_name).toLowerCase() === reporterDisplayName)
        .filter((report) => !targetDisplayName || String(report.target_display_name).toLowerCase() === targetDisplayName)
        .filter(
          (report) =>
            !cursorCreatedAt ||
            String(report.created_at) < cursorCreatedAt ||
            (String(report.created_at) === cursorCreatedAt && String(report.report_id) < String(cursorReportId))
        )
        .sort((left, right) => {
          if (left.created_at !== right.created_at) return String(right.created_at).localeCompare(String(left.created_at));
          return String(right.report_id).localeCompare(String(left.report_id));
        })
        .slice(0, limit)
        .map((report) => ({
          report_id: report.report_id,
          reporter_display_name: report.reporter_display_name,
          target_display_name: report.target_display_name,
          reason: report.reason,
          details: report.details,
          moderator_note: report.moderator_note,
          status: report.status,
          created_at: report.created_at,
          updated_at: report.updated_at,
          reviewed_at: report.reviewed_at,
        }));
      return { rows };
    }

    if (normalizedText.startsWith("SELECT report_id, reporter_display_name, target_display_name, reason, details, moderator_note, status, created_at, updated_at, reviewed_at FROM online_account_reports WHERE report_id")) {
      const [reportId] = values as string[];
      const report = this.reports.find((candidate) => candidate.report_id === reportId);
      return { rows: report ? [{ ...report }] : [] };
    }

    if (normalizedText.startsWith("SELECT report_id FROM online_account_reports WHERE report_id")) {
      const [reportId] = values as string[];
      const report = this.reports.find((candidate) => candidate.report_id === reportId);
      return { rows: report ? [{ report_id: report.report_id }] : [] };
    }

    if (normalizedText.startsWith("UPDATE online_account_reports SET status")) {
      const [reportId, status, moderatorNote, reviewedAt, updatedAt] = values as [string, string, string, string | null, string];
      const report = this.reports.find((candidate) => candidate.report_id === reportId);
      if (!report) return { rows: [] };
      report.status = status;
      report.moderator_note = moderatorNote;
      report.reviewed_at = reviewedAt;
      report.updated_at = updatedAt;
      return { rows: [{ ...report }] };
    }

    if (normalizedText.startsWith("INSERT INTO online_account_report_audit")) {
      const [
        auditId,
        reportId,
        action,
        actor,
        previousStatus,
        nextStatus,
        note,
        createdAt,
      ] = values as string[];
      this.reportAudits.push({
        audit_id: auditId,
        report_id: reportId,
        action,
        actor,
        previous_status: previousStatus,
        next_status: nextStatus,
        note,
        created_at: createdAt,
      });
      return { rows: [] };
    }

    if (normalizedText.startsWith("SELECT audit_id, report_id, action, actor, previous_status, next_status, note, created_at FROM online_account_report_audit WHERE report_id")) {
      const [reportId, limit] = values as [string, number];
      const rows = this.reportAudits
        .filter((audit) => audit.report_id === reportId)
        .sort((left, right) => {
          if (left.created_at !== right.created_at) return String(right.created_at).localeCompare(String(left.created_at));
          return String(right.audit_id).localeCompare(String(left.audit_id));
        })
        .slice(0, limit)
        .map((audit) => ({ ...audit }));
      return { rows };
    }

    if (normalizedText.startsWith("DELETE FROM online_account_sessions WHERE account_id")) {
      const [accountId] = values as string[];
      const rows: Array<{ session_id: string }> = [];
      for (const [tokenHash, session] of Array.from(this.sessionsByTokenHash.entries())) {
        if (session.account_id === accountId) {
          this.sessionsByTokenHash.delete(tokenHash);
          rows.push({ session_id: session.session_id });
        }
      }
      return { rows };
    }

    if (normalizedText.startsWith("DELETE FROM online_account_sessions")) {
      const [tokenHash] = values as string[];
      const session = this.sessionsByTokenHash.get(tokenHash);
      if (!session) return { rows: [] };
      this.sessionsByTokenHash.delete(tokenHash);
      return { rows: [{ session_id: session.session_id }] };
    }

    if (normalizedText.startsWith("DELETE FROM online_accounts")) {
      const [accountId] = values as string[];
      const account = this.accounts.get(accountId);
      if (!account) return { rows: [] };
      this.accounts.delete(accountId);
      this.accountsByDisplayName.delete(account.display_name_normalized);
      for (const [tokenHash, session] of Array.from(this.sessionsByTokenHash.entries())) {
        if (session.account_id === accountId) {
          this.sessionsByTokenHash.delete(tokenHash);
        }
      }
      return { rows: [{ account_id: accountId }] };
    }

    throw new Error(`Unexpected query: ${normalizedText}`);
  }
}

function createPostgresAccountStore(queryable: FakePostgresAccountQueryable): PostgresOnlineAccountStore {
  return new PostgresOnlineAccountStore({
    queryable,
    transactionClientFactory: async () => queryable,
  });
}

function pendingChallengeSummary(
  challengeId: string,
  overrides: Partial<OnlineChallengeSummary> = {}
): OnlineChallengeSummary {
  const challengerIdentity = {
    kind: "session" as const,
    id: `${challengeId}_challenger`,
  };
  const challengedIdentity = {
    kind: "session" as const,
    id: `${challengeId}_challenged`,
  };

  return {
    schemaVersion: ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
    challengeId,
    challengerIdentity,
    challengedIdentity,
    challengerSeat: "w",
    visibility: "unlisted",
    setup: createSetup(),
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    expiresAt: "2026-06-01T12:05:00.000Z",
    status: "pending",
    lastEventId: `${challengeId}_created`,
    ...overrides,
  };
}

function challengeCredentialFor(
  summary: OnlineChallengeSummary,
  role: "challenger" | "challenged"
) {
  return {
    challengeId: summary.challengeId,
    role,
    identity: (
      role === "challenger" ? summary.challengerIdentity : summary.challengedIdentity
    ) as AuthenticatedOnlineIdentity,
  };
}

function summaryForGame(
  gameId: string,
  visibility: OnlineGameSummary["visibility"]
): OnlineGameSummary {
  return {
    schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
    gameId,
    rulesetVersion: "castles-beta-v1",
    createdAt: "2026-05-31T12:00:00.000Z",
    updatedAt: "2026-05-31T12:00:00.000Z",
    version: 0,
    status: "active",
    visibility,
    archiveState: "active",
    hasTimeControl: true,
    participants: [
      { seat: "w", role: "white", identity: { kind: "anonymous", id: `anon_${gameId}_w` } },
      { seat: "b", role: "black", identity: { kind: "anonymous", id: `anon_${gameId}_b` } },
    ],
    livePreview: {
      sideToMove: "w",
      turnPhase: "Movement",
      moveCount: 0,
      boardPreview: {
        radius: 6,
        pieces: [
          { q: 0, r: 6, s: -6, color: "w", type: PieceType.Monarch },
          { q: 0, r: -6, s: 6, color: "b", type: PieceType.Monarch },
        ],
        castles: [
          { q: 0, r: 6, s: -6, owner: "w" },
          { q: 0, r: -6, s: 6, owner: "b" },
        ],
      },
      clock: {
        timeControl: { initialMs: 60_000, incrementMs: 0 },
        remainingMs: { w: 60_000, b: 60_000 },
        activeColor: "w",
        runningSince: 0,
      },
    },
    lastEventId: `evt-${gameId}`,
  };
}

function withoutPreviewClock(
  livePreview: OnlineGameSummary["livePreview"]
): OnlineGameSummary["livePreview"] {
  const nextLivePreview = { ...livePreview };
  delete nextLivePreview.clock;
  return nextLivePreview;
}

function waitForSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket open"));
    }, 3_000);
    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.off("open", onOpen);
      socket.off("error", onError);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.once("open", onOpen);
    socket.once("error", onError);
  });
}

function waitForSocketClose(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket close"));
    }, 3_000);
    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.off("close", onClose);
      socket.off("error", onError);
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.once("close", onClose);
    socket.once("error", onError);
  });
}

async function waitForCondition(
  predicate: () => boolean,
  description: string,
  getDetails: () => string = () => ""
): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(5);
  }
  const details = getDetails();
  throw new Error(`Timed out waiting for ${description}.${details ? ` ${details}` : ""}`);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(resolve);
        })
    )
  );
});

describe("createOnlineHttpServer", () => {
  it("creates accounts and uses server-resolved account identity for open seeks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();

    expect(accountResponse.status).toBe(201);
    expect(account).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      account: {
        displayName: "Liam",
        identity: { kind: "registered", displayName: "Liam" },
      },
      session: {
        token: expect.any(String),
      },
    });

    const meResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/me`, {
      headers: bearer(account.session.token),
    });
    const me = await meResponse.json();

    expect(meResponse.status).toBe(200);
    expect(me.account).toEqual(account.account);

    const createSeekResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(account.session.token) },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "random",
      }),
    });
    const seek = await createSeekResponse.json();

    expect(createSeekResponse.status).toBe(201);
    expect(seek.summary.creatorIdentity).toEqual(account.account.identity);
  });

  it("requires account passwords and signs in from a second device", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const missingPasswordResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "NoPassword" }),
    });
    const account = await createAccountViaApi(port, "Liam", "correct-horse-battery-staple");
    const wrongPasswordResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "liam", password: "wrong-password" }),
    });
    const secondDeviceResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "liam", password: "correct-horse-battery-staple" }),
    });
    const secondDevice = await secondDeviceResponse.json();
    const firstMeResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/me`, {
      headers: bearer(account.session.token),
    });
    const secondMeResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/me`, {
      headers: bearer(secondDevice.session.token),
    });

    expect(missingPasswordResponse.status).toBe(400);
    expect(wrongPasswordResponse.status).toBe(401);
    expect(secondDeviceResponse.status).toBe(200);
    expect(secondDevice).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      account: {
        accountId: account.account.accountId,
        displayName: "Liam",
      },
      session: {
        sessionId: expect.any(String),
        token: expect.any(String),
      },
    });
    expect(secondDevice.session.sessionId).not.toBe(account.session.sessionId);
    expect(secondDevice.session.token).not.toBe(account.session.token);
    expect(JSON.stringify(secondDevice)).not.toContain("correct-horse-battery-staple");
    expect(firstMeResponse.status).toBe(200);
    expect(secondMeResponse.status).toBe(200);
  });

  it("reports Google OAuth provider availability without exposing provider secrets", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);

    const disabledResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/oauth/providers`);
    const disabled = await disabledResponse.json();

    expect(disabledResponse.status).toBe(200);
    expect(disabled).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      providers: [{ provider: "google", enabled: false }],
    });
    expect(JSON.stringify(disabled)).not.toContain("secret");
  });

  it("starts and completes Google OAuth into an account session without putting account tokens in URLs", async () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    let tokenRequestBody = "";
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "https://oauth.example/certs") {
        return new Response(JSON.stringify(fakeGoogleJwks()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      tokenRequestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        id_token: fakeGoogleIdToken({
          iss: "https://accounts.google.com",
          aud: "google-client-id",
          exp: Math.floor(now / 1000) + 300,
          sub: "google-subject-123",
          nonce: new URLSearchParams(lastAuthorizationRedirect.search).get("nonce"),
          email: "liam@example.com",
          email_verified: true,
          name: "Liam Google",
        }),
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    let lastAuthorizationRedirect = new URL("https://accounts.example/unused");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      now: () => now,
      oauth: {
        google: {
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
          authorizationEndpoint: "https://accounts.example/o/oauth2/v2/auth",
          tokenEndpoint: "https://oauth.example/token",
          jwksEndpoint: "https://oauth.example/certs",
          stateSecret: "test-state-secret",
          fetchImpl: fetchImpl as unknown as typeof fetch,
        },
      },
    });
    servers.push(server);
    const port = await listen(server);

    const providersResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/oauth/providers`);
    const providers = await providersResponse.json();
    const startResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/oauth/google/start?returnTo=/`,
      { redirect: "manual" }
    );
    const redirectLocation = startResponse.headers.get("location") ?? "";
    lastAuthorizationRedirect = new URL(redirectLocation);
    const stateCookie = startResponse.headers.get("set-cookie") ?? "";
    const stateCookieValue = /castles_google_oauth_state=([^;]+)/.exec(stateCookie)?.[1] ?? "";
    const callbackUrl = `http://127.0.0.1:${port}/api/online/account/oauth/google/callback?code=google-code&state=${encodeURIComponent(lastAuthorizationRedirect.searchParams.get("state") ?? "")}`;
    const callbackResponse = await fetch(callbackUrl, {
      headers: { cookie: `castles_google_oauth_state=${stateCookieValue}` },
    });
    const html = await callbackResponse.text();

    expect(providersResponse.status).toBe(200);
    expect(providers.providers).toEqual([
      {
        provider: "google",
        enabled: true,
        startUrl: "/api/online/account/oauth/google/start",
      },
    ]);
    expect(startResponse.status).toBe(302);
    expect(lastAuthorizationRedirect.origin).toBe("https://accounts.example");
    expect(lastAuthorizationRedirect.searchParams.get("client_id")).toBe("google-client-id");
    expect(lastAuthorizationRedirect.searchParams.get("response_type")).toBe("code");
    expect(lastAuthorizationRedirect.searchParams.get("scope")).toBe("openid email profile");
    expect(lastAuthorizationRedirect.searchParams.get("redirect_uri")).toBe(
      "https://castles.example/api/online/account/oauth/google/callback"
    );
    expect(lastAuthorizationRedirect.searchParams.get("state")).toEqual(expect.any(String));
    expect(lastAuthorizationRedirect.searchParams.get("nonce")).toEqual(expect.any(String));
    expect(stateCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("SameSite=Lax");
    expect(stateCookie).toContain("Secure");
    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.headers.get("cache-control")).toContain("no-store");
    expect(tokenRequestBody).toContain("grant_type=authorization_code");
    expect(tokenRequestBody).toContain("client_id=google-client-id");
    expect(tokenRequestBody).toContain("client_secret=google-client-secret");
    expect(tokenRequestBody).toContain("code=google-code");
    expect(html).toContain("localStorage.setItem");
    expect(html).toContain("castles_online_account_session_v1");
    expect(html).toContain("Liam Google");
    expect(html).toContain("location.replace(\"/\")");
    expect(html).not.toContain("google-client-secret");
    expect(callbackResponse.url).not.toContain("account_session_");
    expect(callbackResponse.url).not.toContain("token");
  });

  it("rejects Google OAuth callbacks when the ID token signature is invalid", async () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    let lastAuthorizationRedirect = new URL("https://accounts.example/unused");
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === "https://oauth.example/certs") {
        return new Response(JSON.stringify(fakeGoogleJwks()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const validToken = fakeGoogleIdToken({
        iss: "https://accounts.google.com",
        aud: "google-client-id",
        exp: Math.floor(now / 1000) + 300,
        sub: "google-subject-123",
        nonce: new URLSearchParams(lastAuthorizationRedirect.search).get("nonce"),
        email: "liam@example.com",
        email_verified: true,
        name: "Liam Google",
      });
      return new Response(JSON.stringify({
        id_token: `${validToken.split(".").slice(0, 2).join(".")}.bad-signature`,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      now: () => now,
      oauth: {
        google: {
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
          authorizationEndpoint: "https://accounts.example/o/oauth2/v2/auth",
          tokenEndpoint: "https://oauth.example/token",
          jwksEndpoint: "https://oauth.example/certs",
          stateSecret: "test-state-secret",
          fetchImpl: fetchImpl as unknown as typeof fetch,
        },
      },
    });
    servers.push(server);
    const port = await listen(server);

    const startResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/oauth/google/start`,
      { redirect: "manual" }
    );
    lastAuthorizationRedirect = new URL(startResponse.headers.get("location") ?? "");
    const stateCookie = startResponse.headers.get("set-cookie") ?? "";
    const stateCookieValue = /castles_google_oauth_state=([^;]+)/.exec(stateCookie)?.[1] ?? "";
    const callbackResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/oauth/google/callback?code=google-code&state=${encodeURIComponent(lastAuthorizationRedirect.searchParams.get("state") ?? "")}`,
      { headers: { cookie: `castles_google_oauth_state=${stateCookieValue}` } }
    );
    const body = await callbackResponse.text();

    expect(callbackResponse.status).toBe(503);
    expect(body).not.toContain("localStorage.setItem");
    expect(body).not.toContain("castles_online_account_session_v1");
  });

  it("rejects Google OAuth callbacks without the matching state cookie", async () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      now: () => now,
      oauth: {
        google: {
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
          authorizationEndpoint: "https://accounts.example/o/oauth2/v2/auth",
          tokenEndpoint: "https://oauth.example/token",
          stateSecret: "test-state-secret",
          fetchImpl: vi.fn() as unknown as typeof fetch,
        },
      },
    });
    servers.push(server);
    const port = await listen(server);

    const startResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/oauth/google/start`,
      { redirect: "manual" }
    );
    const state = new URL(startResponse.headers.get("location") ?? "").searchParams.get("state") ?? "";
    const callbackResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/oauth/google/callback?code=google-code&state=${encodeURIComponent(state)}`
    );

    expect(callbackResponse.status).toBe(401);
  });

  it("serves a public rating leaderboard without account ids or rating engine internals", async () => {
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const ada = await createAccountViaApi(port, "Ada");
    const ben = await createAccountViaApi(port, "Ben");
    const cleo = await createAccountViaApi(port, "Cleo");
    queryable.ratingRows.set(ada.account.accountId, {
      ...createDefaultOnlineRating("2026-06-03T12:03:00.000Z"),
      rating: 1490,
      deviation: 90,
      games: 4,
    });
    queryable.ratingRows.set(ben.account.accountId, {
      ...createDefaultOnlineRating("2026-06-03T12:04:00.000Z"),
      rating: 1620,
      deviation: 140,
      games: 3,
    });
    queryable.ratingRows.set(cleo.account.accountId, {
      ...createDefaultOnlineRating("2026-06-03T12:05:00.000Z"),
      rating: 1620,
      deviation: 80,
      games: 8,
    });
    queryable.ratingRows.set("account_deleted", {
      ...createDefaultOnlineRating("2026-06-03T12:06:00.000Z"),
      rating: 1900,
      deviation: 80,
      games: 2,
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/online/ratings/leaderboard?limit=2`);
    const body = await response.json();
    const tokenQueryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/ratings/leaderboard?token=secret`
    );
    const badLimitResponse = await fetch(`http://127.0.0.1:${port}/api/online/ratings/leaderboard?limit=51`);
    const duplicateLimitResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/ratings/leaderboard?limit=2&limit=3`
    );
    const duplicateScopeResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/ratings/leaderboard?scope=global&scope=following`
    );
    const badScopeResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/ratings/leaderboard?scope=friends`
    );
    const unknownParamResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/ratings/leaderboard?sort=rating`
    );

    expect(response.status).toBe(200);
    expect(tokenQueryResponse.status).toBe(400);
    expect(badLimitResponse.status).toBe(400);
    expect(duplicateLimitResponse.status).toBe(400);
    expect(duplicateScopeResponse.status).toBe(400);
    expect(badScopeResponse.status).toBe(400);
    expect(unknownParamResponse.status).toBe(400);
    expect(body).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      schemaVersion: 1,
      scope: "global",
      entries: [
        {
          schemaVersion: 1,
          displayName: "Cleo",
          rating: {
            schemaVersion: 1,
            rating: 1620,
            display: "1620",
            provisional: false,
            games: 8,
            updatedAt: "2026-06-03T12:05:00.000Z",
          },
        },
        {
          schemaVersion: 1,
          displayName: "Ben",
          rating: {
            schemaVersion: 1,
            rating: 1620,
            display: "1620?",
            provisional: true,
            games: 3,
            updatedAt: "2026-06-03T12:04:00.000Z",
          },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("account_");
    expect(JSON.stringify(body)).not.toContain("glicko2-beta-v1");
    expect(JSON.stringify(body)).not.toContain("deviation");
    expect(JSON.stringify(body)).not.toContain("volatility");
  });

  it("serves a following-scoped rating leaderboard for the authenticated account", async () => {
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const ada = await createAccountViaApi(port, "Ada");
    const ben = await createAccountViaApi(port, "Ben");
    const cleo = await createAccountViaApi(port, "Cleo");
    queryable.follows.add(`${liam.account.accountId}|${ada.account.accountId}`);
    queryable.follows.add(`${liam.account.accountId}|${ben.account.accountId}`);
    queryable.blocks.add(`${ben.account.accountId}|${liam.account.accountId}`);
    queryable.ratingRows.set(liam.account.accountId, {
      ...createDefaultOnlineRating("2026-06-03T12:03:00.000Z"),
      rating: 1550,
      deviation: 90,
      games: 10,
    });
    queryable.ratingRows.set(ada.account.accountId, {
      ...createDefaultOnlineRating("2026-06-03T12:04:00.000Z"),
      rating: 1620,
      deviation: 80,
      games: 5,
    });
    queryable.ratingRows.set(ben.account.accountId, {
      ...createDefaultOnlineRating("2026-06-03T12:05:00.000Z"),
      rating: 1800,
      deviation: 80,
      games: 20,
    });
    queryable.ratingRows.set(cleo.account.accountId, {
      ...createDefaultOnlineRating("2026-06-03T12:06:00.000Z"),
      rating: 1900,
      deviation: 80,
      games: 30,
    });

    const unauthenticatedResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/ratings/leaderboard?scope=following`
    );
    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/ratings/leaderboard?scope=following&limit=10`,
      { headers: bearer(liam.session.token) }
    );
    const body = await response.json();

    expect(unauthenticatedResponse.status).toBe(401);
    expect(response.status).toBe(200);
    expect(body).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      schemaVersion: 1,
      scope: "following",
      entries: [
        {
          schemaVersion: 1,
          displayName: "Ada",
          rating: {
            schemaVersion: 1,
            rating: 1620,
            display: "1620",
            provisional: false,
            games: 5,
            updatedAt: "2026-06-03T12:04:00.000Z",
          },
        },
        {
          schemaVersion: 1,
          displayName: "Liam",
          rating: {
            schemaVersion: 1,
            rating: 1550,
            display: "1550",
            provisional: false,
            games: 10,
            updatedAt: "2026-06-03T12:03:00.000Z",
          },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("account_");
    expect(JSON.stringify(body)).not.toContain("glicko2-beta-v1");
    expect(JSON.stringify(body)).not.toContain("deviation");
    expect(JSON.stringify(body)).not.toContain("volatility");
    expect(JSON.stringify(body)).not.toContain("Ben");
    expect(JSON.stringify(body)).not.toContain("Cleo");
  });

  it("accepts sanitized account reports and preserves moderation-only fields", async () => {
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");

    const unauthenticatedResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Samir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "abuse", details: "Hostile challenge message." }),
    });
    const invalidReasonResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Samir`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "griefing", details: "" }),
    });
    const secretDetailsResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Samir`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "abuse", details: "They pasted token=secret" }),
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/online/account/reports/samir`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "abuse", details: "  Hostile   challenge message.  " }),
    });
    const body = await response.json();
    const selfResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Liam`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "other", details: "" }),
    });

    queryable.blocks.add(`${samir.account.accountId}|${liam.account.accountId}`);
    const blockedByTargetResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Samir`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "cheating", details: "" }),
    });

    expect(unauthenticatedResponse.status).toBe(401);
    expect(invalidReasonResponse.status).toBe(400);
    expect(secretDetailsResponse.status).toBe(400);
    expect(response.status).toBe(201);
    expect(body).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      report: {
        schemaVersion: 1,
        targetDisplayName: "Samir",
        reason: "abuse",
        createdAt: "2026-06-01T12:00:00.000Z",
      },
    });
    expect(JSON.stringify(body)).not.toContain("account_");
    expect(JSON.stringify(body)).not.toContain("Hostile");
    expect(JSON.stringify(body)).not.toContain(liam.session.token);
    expect(queryable.reports).toEqual([
      expect.objectContaining({
        reporter_account_id: liam.account.accountId,
        reporter_display_name: "Liam",
        target_account_id: samir.account.accountId,
        target_display_name: "Samir",
        reason: "abuse",
        details: "Hostile challenge message.",
        status: "open",
      }),
    ]);
    expect(selfResponse.status).toBe(400);
    expect(blockedByTargetResponse.status).toBe(404);
    expect(queryable.reports).toHaveLength(1);
  });

  it("keeps the admin report queue hidden unless an admin bearer token is configured", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports`, {
      headers: bearer("admin-token-with-enough-length"),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toContain("Authorization");
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "No online admin resource was found.",
      },
    });
  });

  it("protects the admin report queue and returns sanitized open reports", async () => {
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const adminToken = "admin-token-with-enough-length";
    let now = Date.parse("2026-06-01T12:00:00.000Z");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      adminBearerToken: adminToken,
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    const ben = await createAccountViaApi(port, "Ben");

    now = Date.parse("2026-06-01T12:03:00.000Z");
    const firstReportResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Samir`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "abuse", details: "Hostile challenge message." }),
    });
    now = Date.parse("2026-06-01T12:04:00.000Z");
    const secondReportResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Ben`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "spam", details: "Open seek invite spam." }),
    });

    const missingAuthResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports`);
    const wrongAuthResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports`, {
      headers: bearer("wrong-token-with-enough-length"),
    });
    const badStatusResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?status=closed`, {
      headers: bearer(adminToken),
    });
    const lowLimitResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?limit=0`, {
      headers: bearer(adminToken),
    });
    const highLimitResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?limit=101`, {
      headers: bearer(adminToken),
    });
    const badReasonResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?reason=grudge`, {
      headers: bearer(adminToken),
    });
    const duplicateReasonResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports?reason=spam&reason=abuse`,
      {
        headers: bearer(adminToken),
      }
    );
    const badTargetResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?target=x`, {
      headers: bearer(adminToken),
    });
    const duplicateReporterResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports?reporter=Liam&reporter=Samir`,
      {
        headers: bearer(adminToken),
      }
    );
    const queueResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?limit=1`, {
      headers: bearer(adminToken),
    });
    const queue = await queueResponse.json();
    const spamQueueResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?reason=spam`, {
      headers: bearer(adminToken),
    });
    const spamQueue = await spamQueueResponse.json();

    expect(firstReportResponse.status).toBe(201);
    expect(secondReportResponse.status).toBe(201);
    expect(missingAuthResponse.status).toBe(404);
    expect(wrongAuthResponse.status).toBe(404);
    expect(badStatusResponse.status).toBe(400);
    expect(lowLimitResponse.status).toBe(400);
    expect(highLimitResponse.status).toBe(400);
    expect(badReasonResponse.status).toBe(400);
    expect(duplicateReasonResponse.status).toBe(400);
    expect(badTargetResponse.status).toBe(400);
    expect(duplicateReporterResponse.status).toBe(400);
    expect(queueResponse.status).toBe(200);
    expect(spamQueueResponse.status).toBe(200);
    expect(queueResponse.headers.get("cache-control")).toBe("no-store");
    expect(queueResponse.headers.get("vary")).toContain("Authorization");
    expect(queue).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      schemaVersion: 2,
      nextCursor: expect.any(String),
      reports: [
        {
          schemaVersion: 2,
          reportId: expect.any(String),
          reporterDisplayName: "Liam",
          targetDisplayName: "Ben",
          reason: "spam",
          details: "Open seek invite spam.",
          status: "open",
          moderatorNote: "",
          createdAt: "2026-06-01T12:04:00.000Z",
          updatedAt: "2026-06-01T12:04:00.000Z",
          reviewedAt: null,
        },
      ],
    });
    expect(JSON.stringify(queue)).not.toContain(liam.account.accountId);
    expect(JSON.stringify(queue)).not.toContain(samir.account.accountId);
    expect(JSON.stringify(queue)).not.toContain(ben.account.accountId);
    expect(JSON.stringify(queue)).not.toContain(liam.session.token);
    expect(JSON.stringify(queue)).not.toContain("account_");
    expect(spamQueue.reports).toHaveLength(1);
    expect(spamQueue.reports[0]).toMatchObject({
      targetDisplayName: "Ben",
      reason: "spam",
    });
    expect(JSON.stringify(spamQueue)).not.toContain("Samir");

    now = Date.parse("2026-06-01T12:05:00.000Z");
    const thirdReportResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Ben`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(samir.session.token) },
      body: JSON.stringify({ reason: "cheating", details: "Suspicious timeout pattern." }),
    });
    const targetQueueResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?target=ben`, {
      headers: bearer(adminToken),
    });
    const targetFirstPageResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?target=ben&limit=1`, {
      headers: bearer(adminToken),
    });
    const reporterQueueResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?reporter=samir`, {
      headers: bearer(adminToken),
    });
    const badCursorResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?cursor=not-a-cursor`, {
      headers: bearer(adminToken),
    });
    const badDecodedCursorResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports?cursor=${encodeURIComponent(
        base64UrlJson({ createdAt: "2026-06-01", reportId: "report_noncanonical" })
      )}`,
      {
        headers: bearer(adminToken),
      }
    );
    const targetQueue = await targetQueueResponse.json();
    const targetFirstPage = await targetFirstPageResponse.json();
    const targetSecondPageResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports?target=ben&cursor=${encodeURIComponent(
        targetFirstPage.nextCursor
      )}`,
      {
        headers: bearer(adminToken),
      }
    );
    const targetSecondPage = await targetSecondPageResponse.json();
    const reporterQueue = await reporterQueueResponse.json();

    expect(thirdReportResponse.status).toBe(201);
    expect(targetQueueResponse.status).toBe(200);
    expect(targetFirstPageResponse.status).toBe(200);
    expect(targetSecondPageResponse.status).toBe(200);
    expect(reporterQueueResponse.status).toBe(200);
    expect(badCursorResponse.status).toBe(400);
    expect(badDecodedCursorResponse.status).toBe(400);
    expect(targetQueue.reports.map((report: any) => report.reporterDisplayName)).toEqual(["Samir", "Liam"]);
    expect(targetQueue.reports.every((report: any) => report.targetDisplayName === "Ben")).toBe(true);
    expect(targetFirstPage.reports).toEqual([targetQueue.reports[0]]);
    expect(targetFirstPage.nextCursor).toEqual(expect.any(String));
    expect(targetSecondPage.reports).toEqual([targetQueue.reports[1]]);
    expect(targetSecondPage.nextCursor).toBeUndefined();
    expect(reporterQueue.reports).toHaveLength(1);
    expect(reporterQueue.reports[0]).toMatchObject({
      reporterDisplayName: "Samir",
      targetDisplayName: "Ben",
      reason: "cheating",
    });
  });

  it("updates admin report status with an audit entry and sanitized lifecycle fields", async () => {
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const adminToken = "admin-token-with-enough-length";
    let now = Date.parse("2026-06-01T12:00:00.000Z");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      adminBearerToken: adminToken,
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    now = Date.parse("2026-06-01T12:03:00.000Z");
    await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Samir`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "abuse", details: "Hostile challenge message." }),
    });
    const reportId = queryable.reports[0].report_id;

    const missingAuthResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    const badStatusResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(adminToken) },
      body: JSON.stringify({ status: "closed" }),
    });
    const unsupportedFieldResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(adminToken) },
      body: JSON.stringify({ status: "resolved", accountId: liam.account.accountId }),
    });
    const secretNoteResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(adminToken) },
      body: JSON.stringify({ status: "resolved", note: "Contains token=secret" }),
    });

    now = Date.parse("2026-06-01T12:05:00.000Z");
    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(adminToken) },
      body: JSON.stringify({ status: "resolved", note: "  Reviewed   challenge evidence. " }),
    });
    const update = await updateResponse.json();
    const unchangedResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(adminToken) },
      body: JSON.stringify({ status: "resolved" }),
    });
    const openQueueResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?status=open`, {
      headers: bearer(adminToken),
    });
    const resolvedQueueResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?status=resolved`, {
      headers: bearer(adminToken),
    });
    const openQueue = await openQueueResponse.json();
    const resolvedQueue = await resolvedQueueResponse.json();

    expect(missingAuthResponse.status).toBe(404);
    expect(badStatusResponse.status).toBe(400);
    expect(unsupportedFieldResponse.status).toBe(400);
    expect(secretNoteResponse.status).toBe(400);
    expect(updateResponse.status).toBe(200);
    expect(unchangedResponse.status).toBe(409);
    expect(update).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      schemaVersion: 2,
      report: {
        schemaVersion: 2,
        reportId,
        reporterDisplayName: "Liam",
        targetDisplayName: "Samir",
        reason: "abuse",
        details: "Hostile challenge message.",
        status: "resolved",
        moderatorNote: "Reviewed challenge evidence.",
        createdAt: "2026-06-01T12:03:00.000Z",
        updatedAt: "2026-06-01T12:05:00.000Z",
        reviewedAt: "2026-06-01T12:05:00.000Z",
      },
      audit: {
        schemaVersion: 2,
        auditId: expect.any(String),
        reportId,
        action: "status_changed",
        actor: "admin",
        previousStatus: "open",
        nextStatus: "resolved",
        note: "Reviewed challenge evidence.",
        createdAt: "2026-06-01T12:05:00.000Z",
      },
    });
    expect(openQueue.reports).toEqual([]);
    expect(resolvedQueue.reports).toEqual([update.report]);
    expect(queryable.reportAudits).toEqual([
      expect.objectContaining({
        report_id: reportId,
        action: "status_changed",
        actor: "admin",
        previous_status: "open",
        next_status: "resolved",
        note: "Reviewed challenge evidence.",
      }),
    ]);
    expect(JSON.stringify(update)).not.toContain(liam.account.accountId);
    expect(JSON.stringify(update)).not.toContain(samir.account.accountId);
    expect(JSON.stringify(update)).not.toContain(liam.session.token);
    expect(JSON.stringify(update)).not.toContain("account_");
  });

  it("rejects token-bearing admin report status query strings even with admin bearer auth", async () => {
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const adminToken = "admin-token-with-enough-length";
    let now = Date.parse("2026-06-01T12:00:00.000Z");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      adminBearerToken: adminToken,
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    now = Date.parse("2026-06-01T12:03:00.000Z");
    await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Samir`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "abuse", details: "Hostile challenge message." }),
    });
    const reportId = queryable.reports[0].report_id;

    now = Date.parse("2026-06-01T12:05:00.000Z");
    const queryOnlyResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports/${reportId}?token=${adminToken}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "resolved", note: "Reviewed challenge evidence." }),
      }
    );
    const rejectedResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports/${reportId}?token=leaked-admin-token`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...bearer(adminToken) },
        body: JSON.stringify({ status: "resolved", note: "Reviewed challenge evidence." }),
      }
    );
    const rejected = await rejectedResponse.json();
    const queueResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports?status=open`, {
      headers: bearer(adminToken),
    });
    const queue = await queueResponse.json();

    expect(queryOnlyResponse.status).toBe(404);
    expect(rejectedResponse.status).toBe(400);
    expect(rejected.error).toMatchObject({
      code: "bad_request",
      message: "Moderation report action query is invalid.",
    });
    expect(queueResponse.status).toBe(200);
    expect(queue.reports).toEqual([
      expect.objectContaining({
        reportId,
        status: "open",
        moderatorNote: "",
        reviewedAt: null,
      }),
    ]);
    expect(queryable.reports[0]).toMatchObject({
      report_id: reportId,
      status: "open",
      moderator_note: "",
      reviewed_at: null,
    });
    expect(queryable.reportAudits).toEqual([]);
  });

  it("lists admin report audit history with sanitized bounded entries", async () => {
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const adminToken = "admin-token-with-enough-length";
    let now = Date.parse("2026-06-01T12:00:00.000Z");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      adminBearerToken: adminToken,
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    now = Date.parse("2026-06-01T12:03:00.000Z");
    await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Samir`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({ reason: "cheating", details: "Suspicious repeated engine-like moves." }),
    });
    const reportId = queryable.reports[0].report_id;

    const missingAuthResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports/${reportId}/audits`
    );
    const invalidQueryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports/${reportId}/audits?token=secret`,
      { headers: bearer(adminToken) }
    );
    const badLimitResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports/${reportId}/audits?limit=0`,
      { headers: bearer(adminToken) }
    );
    const missingReportResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports/report_missing000000/audits`,
      { headers: bearer(adminToken) }
    );
    const emptyHistoryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports/${reportId}/audits`,
      { headers: bearer(adminToken) }
    );
    const emptyHistory = await emptyHistoryResponse.json();

    now = Date.parse("2026-06-01T12:05:00.000Z");
    const resolvedResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(adminToken) },
      body: JSON.stringify({ status: "resolved", note: "Reviewed challenge evidence." }),
    });
    now = Date.parse("2026-06-01T12:06:00.000Z");
    const reopenedResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(adminToken) },
      body: JSON.stringify({ status: "open", note: "Reopened for appeal." }),
    });
    const historyResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports/${reportId}/audits`,
      { headers: bearer(adminToken) }
    );
    const limitedHistoryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/admin/reports/${reportId}/audits?limit=1`,
      { headers: bearer(adminToken) }
    );
    const history = await historyResponse.json();
    const limitedHistory = await limitedHistoryResponse.json();

    expect(missingAuthResponse.status).toBe(404);
    expect(missingAuthResponse.headers.get("cache-control")).toBe("no-store");
    expect(missingAuthResponse.headers.get("vary")).toContain("Authorization");
    expect(invalidQueryResponse.status).toBe(400);
    expect(badLimitResponse.status).toBe(400);
    expect(missingReportResponse.status).toBe(404);
    expect(emptyHistoryResponse.status).toBe(200);
    expect(emptyHistory).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      schemaVersion: 2,
      reportId,
      audits: [],
    });
    expect(resolvedResponse.status).toBe(200);
    expect(reopenedResponse.status).toBe(200);
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.headers.get("cache-control")).toBe("no-store");
    expect(historyResponse.headers.get("vary")).toContain("Authorization");
    expect(history).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      schemaVersion: 2,
      reportId,
      audits: [
        {
          schemaVersion: 2,
          auditId: expect.any(String),
          reportId,
          action: "status_changed",
          actor: "admin",
          previousStatus: "resolved",
          nextStatus: "open",
          note: "Reopened for appeal.",
          createdAt: "2026-06-01T12:06:00.000Z",
        },
        {
          schemaVersion: 2,
          auditId: expect.any(String),
          reportId,
          action: "status_changed",
          actor: "admin",
          previousStatus: "open",
          nextStatus: "resolved",
          note: "Reviewed challenge evidence.",
          createdAt: "2026-06-01T12:05:00.000Z",
        },
      ],
    });
    expect(limitedHistoryResponse.status).toBe(200);
    expect(limitedHistory.audits).toEqual([history.audits[0]]);
    expect(JSON.stringify(history)).not.toContain(liam.account.accountId);
    expect(JSON.stringify(history)).not.toContain(samir.account.accountId);
    expect(JSON.stringify(history)).not.toContain(liam.session.token);
    expect(JSON.stringify(history)).not.toContain("account_");
  });

  it("keeps wrong admin bearer attempts hidden while consuming the admin rate limit", async () => {
    const adminToken = "admin-token-with-enough-length";
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      adminBearerToken: adminToken,
    });
    servers.push(server);
    const port = await listen(server);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports`, {
        headers: bearer("wrong-token-with-enough-length"),
      });
      expect(response.status).toBe(404);
    }

    const validResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports`, {
      headers: bearer(adminToken),
    });

    expect(validResponse.status).toBe(429);
  });

  it("supports exact profile lookup, follows, privacy, and blocks without exposing account ids", async () => {
    const logs: unknown[] = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      onLog: (event) => logs.push(event),
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    const dani = await createAccountViaApi(port, "Dani");

    const unauthProfileResponse = await fetch(`http://127.0.0.1:${port}/api/online/profiles/Samir`);
    const profileResponse = await fetch(`http://127.0.0.1:${port}/api/online/profiles/samir`, {
      headers: bearer(liam.session.token),
    });
    const profile = await profileResponse.json();
    const followResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/samir`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });
    const followed = await followResponse.json();
    const repeatFollowResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });
    const unfollowResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "DELETE",
      headers: bearer(liam.session.token),
    });
    const unfollowed = await unfollowResponse.json();
    const repeatUnfollowResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "DELETE",
      headers: bearer(liam.session.token),
    });
    const refollowResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });
    const followingResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows`, {
      headers: bearer(liam.session.token),
    });
    const following = await followingResponse.json();
    const selfFollowResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });

    const privacyResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/privacy`, {
      headers: bearer(samir.session.token),
    });
    const privacy = await privacyResponse.json();
    const updatePrivacyResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/privacy`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(samir.session.token) },
      body: JSON.stringify({ followPolicy: "nobody", presencePolicy: "nobody" }),
    });
    const updatedPrivacy = await updatePrivacyResponse.json();
    const invalidPrivacyResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/privacy`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(samir.session.token) },
      body: JSON.stringify({ followerCount: true }),
    });
    const repeatFollowAfterPrivacyResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });
    const repeatFollowAfterPrivacy = await repeatFollowAfterPrivacyResponse.json();
    const refusedFollowResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "PUT",
      headers: bearer(dani.session.token),
    });
    const refusedFollow = await refusedFollowResponse.json();

    const blockResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });
    const blocked = await blockResponse.json();
    const repeatBlockResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });
    const hiddenProfileResponse = await fetch(`http://127.0.0.1:${port}/api/online/profiles/Samir`, {
      headers: bearer(liam.session.token),
    });
    const blockedFollowResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });
    const hiddenUnfollowResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "DELETE",
      headers: bearer(liam.session.token),
    });
    const followingAfterBlockResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows`, {
      headers: bearer(liam.session.token),
    });
    const followingAfterBlock = await followingAfterBlockResponse.json();
    const reciprocalBlockResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Samir`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });
    const unblockResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Liam`, {
      method: "DELETE",
      headers: bearer(samir.session.token),
    });
    const liamUnblockResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Samir`, {
      method: "DELETE",
      headers: bearer(liam.session.token),
    });
    const unblocked = await liamUnblockResponse.json();
    const repeatUnblockResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Samir`, {
      method: "DELETE",
      headers: bearer(liam.session.token),
    });

    expect(unauthProfileResponse.status).toBe(401);
    expect(profileResponse.status).toBe(200);
    expect(profile).toEqual({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      profile: {
        schemaVersion: 1,
        displayName: "Samir",
        presence: { visibility: "hidden", status: null },
        relationship: { self: false, following: false, followedBy: false, blocked: false },
      },
    });
    expect(JSON.stringify(profile)).not.toContain(samir.account.accountId);

    expect(followResponse.status).toBe(200);
    expect(followed.profile).toMatchObject({
      displayName: "Samir",
      relationship: { self: false, following: true, followedBy: false, blocked: false },
    });
    expect(repeatFollowResponse.status).toBe(200);
    expect(unfollowResponse.status).toBe(200);
    expect(unfollowed.profile).toMatchObject({
      displayName: "Samir",
      relationship: { self: false, following: false, followedBy: false, blocked: false },
    });
    expect(repeatUnfollowResponse.status).toBe(200);
    expect(refollowResponse.status).toBe(200);
    expect(followingResponse.status).toBe(200);
    expect(following.following).toEqual([
      expect.objectContaining({
        displayName: "Samir",
        relationship: { self: false, following: true, followedBy: false, blocked: false },
      }),
    ]);
    expect(JSON.stringify(following)).not.toContain(samir.account.accountId);
    expect(selfFollowResponse.status).toBe(400);

    expect(privacyResponse.status).toBe(200);
    expect(privacy.privacy).toMatchObject({
      followPolicy: "everyone",
      presencePolicy: "followed",
      challengePolicy: "followed",
      updatedAt: null,
    });
    expect(updatePrivacyResponse.status).toBe(200);
    expect(updatedPrivacy.privacy).toMatchObject({
      followPolicy: "nobody",
      presencePolicy: "nobody",
      challengePolicy: "followed",
      updatedAt: "2026-06-01T12:00:00.000Z",
    });
    expect(invalidPrivacyResponse.status).toBe(400);
    expect(repeatFollowAfterPrivacyResponse.status).toBe(200);
    expect(repeatFollowAfterPrivacy.profile).toMatchObject({
      displayName: "Samir",
      relationship: { self: false, following: true, followedBy: false, blocked: false },
    });
    expect(refusedFollowResponse.status).toBe(409);
    expect(refusedFollow.error).toMatchObject({ code: "not_allowed" });

    expect(blockResponse.status).toBe(200);
    expect(blocked.profile).toMatchObject({
      displayName: "Liam",
      relationship: { self: false, following: false, followedBy: false, blocked: true },
    });
    expect(repeatBlockResponse.status).toBe(200);
    expect(hiddenProfileResponse.status).toBe(404);
    expect(blockedFollowResponse.status).toBe(404);
    expect(hiddenUnfollowResponse.status).toBe(404);
    expect(followingAfterBlockResponse.status).toBe(200);
    expect(followingAfterBlock.following).toEqual([]);
    expect(reciprocalBlockResponse.status).toBe(404);
    expect(unblockResponse.status).toBe(404);
    expect(liamUnblockResponse.status).toBe(200);
    expect(unblocked.profile).toMatchObject({
      displayName: "Samir",
      relationship: { self: false, following: false, followedBy: false, blocked: false },
    });
    expect(repeatUnblockResponse.status).toBe(200);
    expect(JSON.stringify(logs)).not.toContain(liam.session.token);
    expect(JSON.stringify(logs)).not.toContain(samir.session.token);
  });

  it("rejects token-bearing social and privacy query strings even with bearer auth", async () => {
    const adminToken = "admin-token-with-enough-length";
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      adminBearerToken: adminToken,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");

    const expectBadQuery = async (response: Response) => {
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error).toMatchObject({
        code: "bad_request",
        message: "Account social action query is invalid.",
      });
    };

    const queryOnlyProfileResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/profiles/Samir?token=${liam.session.token}`
    );

    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/profiles/Samir?token=leaked-account-token`, {
        headers: bearer(liam.session.token),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account/follows?token=leaked-account-token`, {
        headers: bearer(liam.session.token),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir?token=leaked-account-token`, {
        method: "PUT",
        headers: bearer(liam.session.token),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir?token=leaked-account-token`, {
        method: "DELETE",
        headers: bearer(liam.session.token),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Samir?token=leaked-account-token`, {
        method: "PUT",
        headers: bearer(liam.session.token),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Samir?token=leaked-account-token`, {
        method: "DELETE",
        headers: bearer(liam.session.token),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account/reports/Samir?token=leaked-account-token`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({ reason: "abuse", details: "Hostile challenge message." }),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account/privacy?token=leaked-account-token`, {
        headers: bearer(samir.session.token),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account/privacy?token=leaked-account-token`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...bearer(samir.session.token) },
        body: JSON.stringify({ followPolicy: "nobody", presencePolicy: "nobody" }),
      })
    );

    const profileResponse = await fetch(`http://127.0.0.1:${port}/api/online/profiles/Samir`, {
      headers: bearer(liam.session.token),
    });
    const profile = await profileResponse.json();
    const followingResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows`, {
      headers: bearer(liam.session.token),
    });
    const following = await followingResponse.json();
    const privacyResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/privacy`, {
      headers: bearer(samir.session.token),
    });
    const privacy = await privacyResponse.json();
    const reportsResponse = await fetch(`http://127.0.0.1:${port}/api/online/admin/reports`, {
      headers: bearer(adminToken),
    });
    const reports = await reportsResponse.json();

    expect(queryOnlyProfileResponse.status).toBe(401);
    expect(profileResponse.status).toBe(200);
    expect(profile.profile).toMatchObject({
      displayName: "Samir",
      relationship: { self: false, following: false, followedBy: false, blocked: false },
    });
    expect(followingResponse.status).toBe(200);
    expect(following.following).toEqual([]);
    expect(privacyResponse.status).toBe(200);
    expect(privacy.privacy).toMatchObject({
      followPolicy: "everyone",
      presencePolicy: "followed",
      challengePolicy: "followed",
      updatedAt: null,
    });
    expect(reportsResponse.status).toBe(200);
    expect(reports.reports).toEqual([]);
  });

  it("reports when followed accounts follow the viewer back", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });
    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });

    const profileResponse = await fetch(`http://127.0.0.1:${port}/api/online/profiles/Samir`, {
      headers: bearer(liam.session.token),
    });
    const profile = await profileResponse.json();
    const followingResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows`, {
      headers: bearer(liam.session.token),
    });
    const following = await followingResponse.json();

    expect(profileResponse.status).toBe(200);
    expect(profile.profile).toMatchObject({
      displayName: "Samir",
      relationship: { self: false, following: true, followedBy: true, blocked: false },
    });
    expect(followingResponse.status).toBe(200);
    expect(following.following).toEqual([
      expect.objectContaining({
        displayName: "Samir",
        relationship: { self: false, following: true, followedBy: true, blocked: false },
      }),
    ]);
  });

  it("rejects social routes with invalid account bearers before accepting social input", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const requests: Array<{ path: string; init?: RequestInit }> = [
      { path: "/api/online/profiles/Samir" },
      { path: "/api/online/account/follows" },
      { path: "/api/online/account/follows/Samir", init: { method: "PUT" } },
      { path: "/api/online/account/follows/Samir", init: { method: "DELETE" } },
      { path: "/api/online/account/blocks/Samir", init: { method: "PUT" } },
      { path: "/api/online/account/blocks/Samir", init: { method: "DELETE" } },
      { path: "/api/online/account/privacy" },
      {
        path: "/api/online/account/privacy",
        init: {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ unsupported: true }),
        },
      },
    ];

    for (const request of requests) {
      const response = await fetch(`http://127.0.0.1:${port}${request.path}`, {
        ...request.init,
        headers: { ...(request.init?.headers ?? {}), ...bearer("bad-account-token") },
      });
      const body = await response.json();
      expect(response.status).toBe(401);
      expect(body.error).toMatchObject({ code: "unauthorized" });
    }
  });

  it("revokes the current account session and rejects it afterwards", async () => {
    const logs: unknown[] = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      onLog: (event) => logs.push(event),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    const revokeResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/session`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });
    const revoked = await revokeResponse.json();
    const meResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/me`, {
      headers: bearer(account.session.token),
    });
    const secondRevokeResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/session`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });

    expect(revokeResponse.status).toBe(200);
    expect(revoked).toEqual({ protocolVersion: ONLINE_PROTOCOL_VERSION, revoked: true });
    expect(meResponse.status).toBe(401);
    expect(secondRevokeResponse.status).toBe(401);
    expect(JSON.stringify(logs)).not.toContain(account.session.token);
    expect(logs).toContainEqual(
      expect.objectContaining({ event: "online.account.session.revoke", status: "accepted" })
    );
  });

  it("does not return success when account session revocation races after authentication", async () => {
    const accountStore = new MemoryOnlineAccountStore();
    vi.spyOn(accountStore, "revokeSessionToken").mockResolvedValue(false);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    const revokeResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/session`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });
    const body = await revokeResponse.json();

    expect(revokeResponse.status).toBe(503);
    expect(body.error).toMatchObject({ code: "persistence_failed" });
  });

  it("revokes account sessions through the PostgreSQL account store route", async () => {
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();

    expect(queryable.sessionsByTokenHash.size).toBe(1);

    const revokeResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/session`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });
    const revoked = await revokeResponse.json();
    const meResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/me`, {
      headers: bearer(account.session.token),
    });

    expect(accountResponse.status).toBe(201);
    expect(revokeResponse.status).toBe(200);
    expect(revoked).toEqual({ protocolVersion: ONLINE_PROTOCOL_VERSION, revoked: true });
    expect(queryable.sessionsByTokenHash.size).toBe(0);
    expect(queryable.accounts.size).toBe(1);
    expect(meResponse.status).toBe(401);
  });

  it("lists account sessions and revokes every account session through PostgreSQL", async () => {
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:10:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    queryable.sessionsByTokenHash.set(hashOnlineToken("other-account-token"), {
      session_id: "account_session_other_browser",
      account_id: account.account.accountId,
      token_hash: hashOnlineToken("other-account-token"),
      created_at: "2026-06-01T12:01:00.000Z",
      last_used_at: "2026-06-01T12:02:00.000Z",
    });

    const sessionsResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/sessions`, {
      headers: bearer(account.session.token),
    });
    const sessions = await sessionsResponse.json();

    expect(sessionsResponse.status).toBe(200);
    expect(sessions).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      sessions: expect.arrayContaining([
        expect.objectContaining({
          sessionId: account.session.sessionId,
          current: true,
          createdAt: "2026-06-01T12:10:00.000Z",
          lastUsedAt: "2026-06-01T12:10:00.000Z",
        }),
        expect.objectContaining({
          sessionId: "account_session_other_browser",
          current: false,
        }),
      ]),
    });
    expect(sessions.sessions).toHaveLength(2);
    expect(JSON.stringify(sessions)).not.toContain(account.session.token);
    expect(JSON.stringify(sessions)).not.toContain("other-account-token");

    const revokeAllResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/sessions`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });
    const revoked = await revokeAllResponse.json();
    const meResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/me`, {
      headers: bearer(account.session.token),
    });

    expect(revokeAllResponse.status).toBe(200);
    expect(revoked).toEqual({ protocolVersion: ONLINE_PROTOCOL_VERSION, revokedSessions: 2 });
    expect(queryable.sessionsByTokenHash.size).toBe(0);
    expect(queryable.accounts.size).toBe(1);
    expect(meResponse.status).toBe(401);
  });

  it("deletes an online account through the PostgreSQL account store route", async () => {
    const logs: unknown[] = [];
    const queryable = new FakePostgresAccountQueryable();
    const accountStore = createPostgresAccountStore(queryable);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:10:00.000Z"),
      onLog: (event) => logs.push(event),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    queryable.sessionsByTokenHash.set(hashOnlineToken("other-account-token"), {
      session_id: "account_session_other_browser",
      account_id: account.account.accountId,
      token_hash: hashOnlineToken("other-account-token"),
      created_at: "2026-06-01T12:01:00.000Z",
      last_used_at: "2026-06-01T12:02:00.000Z",
    });

    const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/online/account`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });
    const deleted = await deleteResponse.json();
    const meResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/me`, {
      headers: bearer(account.session.token),
    });
    const accountCountAfterDelete = queryable.accounts.size;
    const sessionCountAfterDelete = queryable.sessionsByTokenHash.size;
    const recreateResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "liam", password: "account-password" }),
    });
    const recreateBody = await recreateResponse.json();

    expect(accountResponse.status).toBe(201);
    expect(deleteResponse.status).toBe(200);
    expect(deleted).toEqual({ protocolVersion: ONLINE_PROTOCOL_VERSION, deleted: true });
    expect(accountCountAfterDelete).toBe(0);
    expect(sessionCountAfterDelete).toBe(0);
    expect(meResponse.status).toBe(401);
    expect(recreateResponse.status).toBe(409);
    expect(recreateBody.error).toMatchObject({ message: "That display name is already taken." });
    expect(JSON.stringify(logs)).not.toContain(account.session.token);
    expect(logs).toContainEqual(expect.objectContaining({ event: "online.account.delete", status: "accepted" }));
  });

  it("rejects account management without a valid account bearer", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    for (const request of [
      { path: "/api/online/account/sessions", init: {} },
      { path: "/api/online/account/sessions", init: { headers: bearer("bad-account-token") } },
      { path: "/api/online/account/sessions", init: { method: "DELETE" } },
      { path: "/api/online/account/sessions", init: { method: "DELETE", headers: bearer("bad-account-token") } },
      { path: "/api/online/account", init: { method: "DELETE" } },
      { path: "/api/online/account", init: { method: "DELETE", headers: bearer("bad-account-token") } },
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${request.path}`, request.init);
      const body = await response.json();
      expect(response.status).toBe(401);
      expect(body.error).toMatchObject({ code: "unauthorized" });
    }
  });

  it("rejects token-bearing account session query strings even with bearer auth", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const readAccount = await createAccountViaApi(port, "ReadGuard");
    const revokeCurrentAccount = await createAccountViaApi(port, "RevokeCurrentGuard");
    const revokeAllAccount = await createAccountViaApi(port, "RevokeAllGuard");
    const deleteAccount = await createAccountViaApi(port, "DeleteGuard");

    const expectBadQuery = async (response: Response) => {
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error).toMatchObject({
        code: "bad_request",
        message: "Account session action query is invalid.",
      });
    };
    const expectSessionStillActive = async (token: string) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/account/me`, {
        headers: bearer(token),
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.account).toEqual(expect.any(Object));
    };

    const queryOnlyResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/me?token=${readAccount.session.token}`
    );
    expect(queryOnlyResponse.status).toBe(401);

    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account/me?token=leaked-account-token`, {
        headers: bearer(readAccount.session.token),
      })
    );
    await expectBadQuery(
      await fetch(
        `http://127.0.0.1:${port}/api/online/account/sessions?token=leaked-account-token`,
        { headers: bearer(readAccount.session.token) }
      )
    );
    await expectSessionStillActive(readAccount.session.token);

    await expectBadQuery(
      await fetch(
        `http://127.0.0.1:${port}/api/online/account/session?token=leaked-account-token`,
        { method: "DELETE", headers: bearer(revokeCurrentAccount.session.token) }
      )
    );
    await expectSessionStillActive(revokeCurrentAccount.session.token);

    await expectBadQuery(
      await fetch(
        `http://127.0.0.1:${port}/api/online/account/sessions?token=leaked-account-token`,
        { method: "DELETE", headers: bearer(revokeAllAccount.session.token) }
      )
    );
    await expectSessionStillActive(revokeAllAccount.session.token);

    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/account?token=leaked-account-token`, {
        method: "DELETE",
        headers: bearer(deleteAccount.session.token),
      })
    );
    await expectSessionStillActive(deleteAccount.session.token);
  });

  it("does not return success when account session revoke-all races after authentication", async () => {
    const accountStore = new MemoryOnlineAccountStore();
    vi.spyOn(accountStore, "revokeSessionsForAccount").mockResolvedValue(0);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    const revokeAllResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/sessions`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });
    const body = await revokeAllResponse.json();

    expect(revokeAllResponse.status).toBe(503);
    expect(body.error).toMatchObject({ code: "persistence_failed" });
    expect(accountStore.revokeSessionsForAccount).toHaveBeenCalledWith(account.account.accountId);
  });

  it("does not return success when account deletion races after authentication", async () => {
    const accountStore = new MemoryOnlineAccountStore();
    vi.spyOn(accountStore, "deleteAccount").mockResolvedValue(false);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/online/account`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });
    const body = await deleteResponse.json();

    expect(deleteResponse.status).toBe(503);
    expect(body.error).toMatchObject({ code: "persistence_failed" });
    expect(accountStore.deleteAccount).toHaveBeenCalledWith(account.account.accountId);
  });

  it("fails closed when account session list, revoke-all, or account deletion persistence fails", async () => {
    const accountStore = new MemoryOnlineAccountStore();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      accountStore,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    vi.spyOn(accountStore, "listSessionsForAccount").mockRejectedValueOnce(new Error("list unavailable"));
    vi.spyOn(accountStore, "revokeSessionsForAccount").mockRejectedValueOnce(new Error("delete unavailable"));
    vi.spyOn(accountStore, "deleteAccount").mockRejectedValueOnce(new Error("delete account unavailable"));

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/sessions`, {
      headers: bearer(account.session.token),
    });
    const listBody = await listResponse.json();
    const revokeAllResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/sessions`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });
    const revokeAllBody = await revokeAllResponse.json();
    const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/online/account`, {
      method: "DELETE",
      headers: bearer(account.session.token),
    });
    const deleteBody = await deleteResponse.json();

    expect(listResponse.status).toBe(503);
    expect(listBody.error).toMatchObject({ code: "persistence_failed" });
    expect(revokeAllResponse.status).toBe(503);
    expect(revokeAllBody.error).toMatchObject({ code: "persistence_failed" });
    expect(deleteResponse.status).toBe(503);
    expect(deleteBody.error).toMatchObject({ code: "persistence_failed" });
    expect(consoleError).toHaveBeenCalled();
  });

  it("keeps direct-created games anonymous without account auth and ignores client identity fields", async () => {
    const events: OnlineGameEvent[] = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      onGameCreated: (event) => {
        events.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "b",
        whiteIdentity: { kind: "registered", id: "spoof_white", displayName: "Spoof White" },
        blackIdentity: { kind: "registered", id: "spoof_black", displayName: "Spoof Black" },
      }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toContain("spoof");
    expect(events[0]).toMatchObject({
      type: "game_created",
      gameId: created.gameId,
      whiteIdentity: { kind: "anonymous", id: `anon_${created.gameId}_w` },
      blackIdentity: { kind: "anonymous", id: `anon_${created.gameId}_b` },
    });
  });

  it("uses server-resolved account identity for direct-created game creator seats", async () => {
    const events: OnlineGameEvent[] = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      onGameCreated: (event) => {
        events.push(event);
      },
      loadGameSummaries: () => projectOnlineGameSummaries(events),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    const defaultSeatResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(account.session.token) },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const defaultSeatGame = await defaultSeatResponse.json();
    const blackSeatResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(account.session.token) },
      body: JSON.stringify({ setup: createSetup(), creatorSeat: "b" }),
    });
    const blackSeatGame = await blackSeatResponse.json();

    expect(defaultSeatResponse.status).toBe(201);
    expect(blackSeatResponse.status).toBe(201);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "game_created",
      gameId: defaultSeatGame.gameId,
      whiteIdentity: account.account.identity,
      blackIdentity: { kind: "anonymous", id: `anon_${defaultSeatGame.gameId}_b` },
    });
    expect(events[1]).toMatchObject({
      type: "game_created",
      gameId: blackSeatGame.gameId,
      blackIdentity: account.account.identity,
      whiteIdentity: { kind: "anonymous", id: `anon_${blackSeatGame.gameId}_w` },
    });
    expect(JSON.stringify(events)).not.toContain(account.session.token);

    const historyResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/games?state=all`, {
      headers: bearer(account.session.token),
    });
    const history = await historyResponse.json();

    expect(historyResponse.status).toBe(200);
    expect(history.games).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gameId: defaultSeatGame.gameId,
          participants: expect.arrayContaining([
            { seat: "w", role: "white", identity: account.account.identity },
          ]),
        }),
        expect.objectContaining({
          gameId: blackSeatGame.gameId,
          participants: expect.arrayContaining([
            { seat: "b", role: "black", identity: account.account.identity },
          ]),
        }),
      ])
    );
  });

  it("fails closed for malformed or invalid account bearer on direct-created games", async () => {
    const events: OnlineGameEvent[] = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      onGameCreated: (event) => {
        events.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);

    for (const authorization of ["Bearer", "Bearer ", "Bearer bad-token"]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization },
        body: JSON.stringify({ setup: createSetup() }),
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toMatchObject({ code: "unauthorized" });
    }
    expect(events).toHaveLength(0);
  });

  it("lists account game history from the authenticated account identity", async () => {
    const listPersonalGameSummaries = vi.fn((options: OnlinePersonalGameDirectoryListOptions): OnlineGameDirectoryResponse => {
      const summary = summaryForGame("game_private_history_samir", "private");
      return {
        schemaVersion: ONLINE_GAME_DIRECTORY_SCHEMA_VERSION,
        games: [
          {
            ...summary,
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-05-31T12:00:00.000Z",
            hasTimeControl: false,
            ratingMode: "rated",
            result: { winner: "b", reason: "timeout" },
            livePreview: withoutPreviewClock(summary.livePreview),
            participants: [
              { seat: "w" as const, role: "white" as const, identity: options.identity },
              {
                seat: "b" as const,
                role: "black" as const,
                identity: { kind: "registered" as const, id: "account_samir_opponent", displayName: "Samir" },
              },
            ],
          },
        ],
      };
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      listPersonalGameSummaries,
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Samir", password: "account-password" }),
    });
    const account = await accountResponse.json();
    const historyResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games?state=all&limit=5&clock=casual&rating=rated&result=timeout&q=Samir`,
      {
        headers: bearer(account.session.token),
      }
    );
    const history = await historyResponse.json();

    expect(historyResponse.status).toBe(200);
    expect(listPersonalGameSummaries).toHaveBeenCalledWith({
      identity: account.account.identity,
      state: "all",
      limit: 5,
      cursor: undefined,
      clock: "casual",
      rating: "rated",
      result: "timeout",
      query: "samir",
    });
    expect(history.games).toHaveLength(1);
    expect(history.games[0]).toMatchObject({
      gameId: "game_private_history_samir",
      visibility: "private",
    });
    expect(history.games[0].participants).toContainEqual(
      expect.objectContaining({ identity: account.account.identity })
    );

    const missingAuthResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/games`);
    expect(missingAuthResponse.status).toBe(401);
  });

  it("lists account head-to-head history for a registered opponent before pagination", async () => {
    let liamIdentity: OnlineGameSummary["participants"][number]["identity"] | null = null;
    let samirIdentity: OnlineGameSummary["participants"][number]["identity"] | null = null;
    let benIdentity: OnlineGameSummary["participants"][number]["identity"] | null = null;
    const completeGame = (
      gameId: string,
      participants: OnlineGameSummary["participants"],
      updatedAt: string
    ): OnlineGameSummary => ({
      ...summaryForGame(gameId, "private"),
      updatedAt,
      endedAt: updatedAt,
      status: "complete",
      archiveState: "archived",
      result: { winner: "w", reason: "resignation" },
      participants,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      loadGameSummaries: () => {
        if (!liamIdentity || !samirIdentity || !benIdentity) return [];
        return [
          completeGame(
            "game_liam_ben_newer",
            [
              { seat: "w", role: "white", identity: liamIdentity },
              { seat: "b", role: "black", identity: benIdentity },
            ],
            "2026-06-01T12:05:00.000Z"
          ),
          completeGame(
            "game_liam_samir_middle",
            [
              { seat: "w", role: "white", identity: liamIdentity },
              { seat: "b", role: "black", identity: samirIdentity },
            ],
            "2026-06-01T12:04:00.000Z"
          ),
          completeGame(
            "game_samir_liam_older",
            [
              { seat: "w", role: "white", identity: samirIdentity },
              { seat: "b", role: "black", identity: liamIdentity },
            ],
            "2026-06-01T12:03:00.000Z"
          ),
        ];
      },
    });
    servers.push(server);
    const port = await listen(server);
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    const ben = await createAccountViaApi(port, "Ben");
    liamIdentity = liam.account.identity;
    samirIdentity = samir.account.identity;
    benIdentity = ben.account.identity;

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/head-to-head/Samir?limit=1`,
      { headers: bearer(liam.session.token) }
    );
    const page = await response.json();

    expect(response.status).toBe(200);
    expect(page.games.map((summary: OnlineGameSummary) => summary.gameId)).toEqual([
      "game_liam_samir_middle",
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));

    const secondResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/head-to-head/Samir?cursor=${encodeURIComponent(page.nextCursor)}`,
      { headers: bearer(liam.session.token) }
    );
    const secondPage = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondPage.games.map((summary: OnlineGameSummary) => summary.gameId)).toEqual([
      "game_samir_liam_older",
    ]);

    const missingAuthResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/head-to-head/Samir`
    );
    expect(missingAuthResponse.status).toBe(401);
  });

  it("serves account-authorized snapshots for private participant games only", async () => {
    let liamIdentity: OnlineGameSummary["participants"][number]["identity"] | null = null;
    let samirIdentity: OnlineGameSummary["participants"][number]["identity"] | null = null;
    let accountSnapshotGameId: string | null = null;
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      loadGameSummary: (gameId) => {
        if (gameId !== accountSnapshotGameId || !liamIdentity || !samirIdentity) return null;
        return {
          ...summaryForGame(gameId, "private"),
          participants: [
            { seat: "w", role: "white", identity: liamIdentity },
            { seat: "b", role: "black", identity: samirIdentity },
          ],
        };
      },
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    const dani = await createAccountViaApi(port, "Dani");
    liamIdentity = liam.account.identity;
    samirIdentity = samir.account.identity;

    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({
        setup,
        challengerSeat: "w",
        visibility: "private",
        challengedDisplayName: "Samir",
      }),
    });
    const created = await createResponse.json();
    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${created.challengeId}/accept`,
      { method: "POST", headers: bearer(fragmentChallengeToken(created.challenged.url)) }
    );
    const accepted = await acceptResponse.json();
    accountSnapshotGameId = accepted.gameInvite.gameId;

    const participantResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/${accepted.gameInvite.gameId}/snapshot`,
      { headers: bearer(liam.session.token) }
    );
    const participantText = await participantResponse.text();
    const participantBody = participantResponse.ok ? JSON.parse(participantText) : participantText;
    const unrelatedResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/${accepted.gameInvite.gameId}/snapshot`,
      { headers: bearer(dani.session.token) }
    );
    const spectatorResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${accepted.gameInvite.gameId}/spectator`
    );

    expect(createResponse.status).toBe(201);
    expect(acceptResponse.status).toBe(200);
    expect(participantResponse.status).toBe(200);
    expect(participantBody).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "account",
      snapshot: {
        gameId: accepted.gameInvite.gameId,
        setup: { board: { config: { nSquares: setup.board.config.nSquares } } },
      },
    });
    expect(JSON.stringify(participantBody)).not.toContain(accepted.gameInvite.token);
    expect(unrelatedResponse.status).toBe(404);
    expect(spectatorResponse.status).toBe(404);
  });

  it("rejects token-bearing account game snapshot and rejoin query strings", async () => {
    const gameId = "game_account_query_secret";
    const service = OnlineGameService.fromRecords(
      [
        {
          gameId,
          whiteCredential: hashOnlineToken("old-w-token"),
          blackCredential: hashOnlineToken("old-b-token"),
          setup: createClockedSetup(),
          acceptedActions: [],
        },
      ],
      {
        tokenFactory: (seat) => `fresh-${seat}-token`,
        credentialFactory: hashOnlineToken,
        verifyToken: verifyOnlineToken,
      }
    );
    let registeredIdentity: OnlineGameSummary["participants"][number]["identity"] | null = null;
    const loadGameSummary = vi.fn((targetGameId: string): OnlineGameSummary | null => {
      if (targetGameId !== gameId || !registeredIdentity) return null;
      return {
        ...summaryForGame(gameId, "private"),
        participants: [
          { seat: "w", role: "white", identity: registeredIdentity },
          { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_black" } },
        ],
      };
    });
    const appendGameSeatCredential = vi.fn();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      service,
      loadGameSummary,
      appendGameSeatCredential,
    });
    servers.push(server);
    const port = await listen(server);
    const account = await createAccountViaApi(port, "Liam");
    registeredIdentity = account.account.identity;

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/${gameId}/snapshot?token=leaked-player-token`,
      { headers: bearer(account.session.token) }
    );
    const rejoinResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/${gameId}/rejoin?token=leaked-player-token`,
      { method: "POST", headers: bearer(account.session.token) }
    );
    const snapshotBody = await snapshotResponse.json();
    const rejoinBody = await rejoinResponse.json();

    expect(snapshotResponse.status).toBe(400);
    expect(snapshotBody.error).toMatchObject({
      code: "bad_request",
      message: "Account game action query is invalid.",
    });
    expect(rejoinResponse.status).toBe(400);
    expect(rejoinBody.error).toMatchObject({
      code: "bad_request",
      message: "Account game action query is invalid.",
    });
    expect(loadGameSummary).not.toHaveBeenCalled();
    expect(appendGameSeatCredential).not.toHaveBeenCalled();
  });

  it("mints a fresh player token when a registered participant rejoins an active account game", async () => {
    const gameId = "game_account_rejoin_route";
    const record = {
      gameId,
      whiteCredential: hashOnlineToken("old-w-token"),
      blackCredential: hashOnlineToken("old-b-token"),
      setup: createClockedSetup(),
      acceptedActions: [],
    };
    const service = OnlineGameService.fromRecords([record], {
      tokenFactory: (seat) => `fresh-${seat}-token`,
      credentialFactory: hashOnlineToken,
      verifyToken: verifyOnlineToken,
    });
    let registeredIdentity: OnlineGameSummary["participants"][number]["identity"] | null = null;
    const appendGameSeatCredential = vi.fn((targetGameId: string, seat: "w" | "b", credential: string) => {
      const updated = service.addSeatCredential(targetGameId, seat, credential);
      if (!updated) throw new Error("missing room");
      return updated;
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      service,
      appendGameSeatCredential,
      loadGameSummary: (targetGameId) => {
        if (targetGameId !== gameId || !registeredIdentity) return null;
        return {
          ...summaryForGame(gameId, "private"),
          participants: [
            { seat: "w", role: "white", identity: registeredIdentity },
            { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_black" } },
          ],
        };
      },
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    registeredIdentity = account.account.identity;

    const rejoinResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/${gameId}/rejoin`,
      {
        method: "POST",
        headers: bearer(account.session.token),
      }
    );
    const rejoined = await rejoinResponse.json();

    expect(rejoinResponse.status).toBe(200);
    expect(rejoined).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      gameInvite: {
        gameId,
        seat: "w",
        token: "fresh-w-token",
        url: "https://castles.example/play?onlineGame=game_account_rejoin_route&seat=w",
      },
    });
    expect(rejoined.gameInvite.url).not.toContain("token=");
    expect(appendGameSeatCredential).toHaveBeenCalledWith(
      gameId,
      "w",
      hashOnlineToken("fresh-w-token")
    );
    expect(service.getRoomForToken(gameId, "old-w-token")).not.toBeNull();
    expect(service.getRoomForToken(gameId, "fresh-w-token")).not.toBeNull();

    const joinResponse = await fetch(`http://127.0.0.1:${port}/api/online/games/${gameId}`, {
      headers: bearer("fresh-w-token"),
    });
    const joined = await joinResponse.json();

    expect(joinResponse.status).toBe(200);
    expect(joined).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      color: "w",
      snapshot: { gameId },
    });
  });

  it("closes player sockets whose account-rejoin alias is pruned", async () => {
    const gameId = "game_account_rejoin_pruned_socket";
    const record = {
      gameId,
      whiteCredential: hashOnlineToken("primary-w-token"),
      blackCredential: hashOnlineToken("primary-b-token"),
      additionalWhiteCredentials: Array.from(
        { length: ONLINE_MAX_ADDITIONAL_SEAT_CREDENTIALS },
        (_value, index) => hashOnlineToken(`old-w-token-${index}`)
      ),
      setup: createClockedSetup(),
      acceptedActions: [],
    };
    const service = OnlineGameService.fromRecords([record], {
      tokenFactory: (seat) => `fresh-${seat}-token`,
      credentialFactory: hashOnlineToken,
      verifyToken: verifyOnlineToken,
    });
    let registeredIdentity: OnlineGameSummary["participants"][number]["identity"] | null = null;
    const appendGameSeatCredential = vi.fn((targetGameId: string, seat: "w" | "b", credential: string) => {
      const updated = service.addSeatCredential(targetGameId, seat, credential);
      if (!updated) throw new Error("missing room");
      return updated;
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      service,
      appendGameSeatCredential,
      loadGameSummary: (targetGameId) => {
        if (targetGameId !== gameId || !registeredIdentity) return null;
        return {
          ...summaryForGame(gameId, "private"),
          participants: [
            { seat: "w", role: "white", identity: registeredIdentity },
            { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_black" } },
          ],
        };
      },
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const staleSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    try {
      await waitForSocketOpen(staleSocket);
      staleSocket.send(
        JSON.stringify(
          versionedMessage({
            type: "join",
            gameId,
            token: "old-w-token-0",
          })
        )
      );
      await expect(nextSocketMessage(staleSocket, "stale alias join")).resolves.toMatchObject({
        type: "joined",
        color: "w",
      });

      const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
      });
      const account = await accountResponse.json();
      registeredIdentity = account.account.identity;

      const staleError = nextSocketMessage(staleSocket, "stale alias prune error");
      const staleClose = waitForSocketClose(staleSocket);
      const rejoinResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/account/games/${gameId}/rejoin`,
        {
          method: "POST",
          headers: bearer(account.session.token),
        }
      );
      const rejoined = await rejoinResponse.json();

      expect(rejoinResponse.status).toBe(200);
      expect(rejoined.gameInvite.token).toBe("fresh-w-token");
      await expect(staleError).resolves.toMatchObject({
        type: "error",
        error: { code: "unauthorized" },
      });
      await staleClose;
      expect(service.getRoomForToken(gameId, "old-w-token-0")).toBeNull();
      expect(service.getRoomForToken(gameId, "old-w-token-1")).not.toBeNull();
      expect(service.getRoomForToken(gameId, "fresh-w-token")).not.toBeNull();
    } finally {
      staleSocket.close();
    }
  });

  it("rejects stale player socket actions before persistence when its alias is pruned", async () => {
    const gameId = "game_stale_pruned_socket_action";
    const service = OnlineGameService.fromRecords(
      [
        {
          gameId,
          whiteCredential: hashOnlineToken("primary-w-token"),
          blackCredential: hashOnlineToken("primary-b-token"),
          additionalWhiteCredentials: Array.from(
            { length: ONLINE_MAX_ADDITIONAL_SEAT_CREDENTIALS },
            (_value, index) => hashOnlineToken(`old-w-token-${index}`)
          ),
          setup: createClockedSetup(),
          acceptedActions: [],
        },
      ],
      {
        credentialFactory: hashOnlineToken,
        verifyToken: verifyOnlineToken,
      }
    );
    const applyGameAction = vi.fn(async () => {
      throw new Error("stale socket action reached persistence");
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      service,
      applyGameAction,
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const staleSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(staleSocket);
      staleSocket.send(
        JSON.stringify(
          versionedMessage({
            type: "join",
            gameId,
            token: "old-w-token-0",
          })
        )
      );
      await expect(nextSocketMessage(staleSocket, "stale action join")).resolves.toMatchObject({
        type: "joined",
        color: "w",
      });

      service.addSeatCredential(gameId, "w", hashOnlineToken("fresh-w-token"));
      expect(service.getRoomForToken(gameId, "old-w-token-0")).toBeNull();

      staleSocket.send(
        JSON.stringify(
          versionedMessage({
            type: "action",
            clientActionId: "client-action-stale-pruned-token",
            action: { type: "PASS", baseVersion: 0 },
          })
        )
      );

      await expect(nextSocketMessage(staleSocket, "stale pruned action rejection")).resolves.toMatchObject({
        type: "error",
        error: { code: "unauthorized" },
      });
      expect(applyGameAction).not.toHaveBeenCalled();
    } finally {
      staleSocket.close();
    }
  });

  it("does not rejoin an account game for a registered nonparticipant", async () => {
    const gameId = "game_account_rejoin_nonparticipant";
    const service = OnlineGameService.fromRecords(
      [
        {
          gameId,
          whiteCredential: hashOnlineToken("old-w-token"),
          blackCredential: hashOnlineToken("old-b-token"),
          setup: createClockedSetup(),
          acceptedActions: [],
        },
      ],
      {
        tokenFactory: (seat) => `fresh-${seat}-token`,
        credentialFactory: hashOnlineToken,
        verifyToken: verifyOnlineToken,
      }
    );
    const appendGameSeatCredential = vi.fn();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      service,
      appendGameSeatCredential,
      loadGameSummary: (targetGameId) => {
        if (targetGameId !== gameId) return null;
        return {
          ...summaryForGame(gameId, "private"),
          participants: [
            { seat: "w", role: "white", identity: { kind: "registered", id: "other_account", displayName: "Other" } },
            { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_black" } },
          ],
        };
      },
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    const rejoinResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/${gameId}/rejoin`,
      {
        method: "POST",
        headers: bearer(account.session.token),
      }
    );
    const body = await rejoinResponse.json();

    expect(rejoinResponse.status).toBe(404);
    expect(body.error).toMatchObject({ code: "not_found" });
    expect(appendGameSeatCredential).not.toHaveBeenCalled();
    expect(service.getRoomForToken(gameId, "fresh-w-token")).toBeNull();
  });

  it("reports game_over when account rejoin persistence finds a terminal game race", async () => {
    const gameId = "game_account_rejoin_terminal_race";
    const service = OnlineGameService.fromRecords(
      [
        {
          gameId,
          whiteCredential: hashOnlineToken("old-w-token"),
          blackCredential: hashOnlineToken("old-b-token"),
          setup: createClockedSetup(),
          acceptedActions: [],
        },
      ],
      {
        tokenFactory: (seat) => `fresh-${seat}-token`,
        credentialFactory: hashOnlineToken,
        verifyToken: verifyOnlineToken,
      }
    );
    let registeredIdentity: OnlineGameSummary["participants"][number]["identity"] | null = null;
    const appendGameSeatCredential = vi.fn(() => {
      throw new OnlineGameSeatCredentialTerminalError(gameId);
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      service,
      appendGameSeatCredential,
      loadGameSummary: (targetGameId) => {
        if (targetGameId !== gameId || !registeredIdentity) return null;
        return {
          ...summaryForGame(gameId, "private"),
          participants: [
            { seat: "w", role: "white", identity: registeredIdentity },
            { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_black" } },
          ],
        };
      },
    });
    servers.push(server);
    const port = await listen(server);

    const accountResponse = await fetch(`http://127.0.0.1:${port}/api/online/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Liam", password: "account-password" }),
    });
    const account = await accountResponse.json();
    registeredIdentity = account.account.identity;
    const rejoinResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/games/${gameId}/rejoin`,
      {
        method: "POST",
        headers: bearer(account.session.token),
      }
    );
    const body = await rejoinResponse.json();

    expect(rejoinResponse.status).toBe(409);
    expect(body.error).toMatchObject({ code: "game_over" });
    expect(appendGameSeatCredential).toHaveBeenCalledWith(
      gameId,
      "w",
      hashOnlineToken("fresh-w-token")
    );
    expect(service.getRoomForToken(gameId, "fresh-w-token")).toBeNull();
  });

  it("creates and lists token-free public open seeks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "random",
        creatorSessionId: "session_creator",
      }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("cache-control")).toContain("no-store");
    expect(created).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      summary: {
        status: "open",
        creatorSeat: "random",
        creatorIdentity: { kind: "session", id: "session_creator" },
        setup: {
          ratingMode: "casual",
        },
      },
      creator: {
        token: expect.any(String),
      },
    });

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`);
    const list = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(JSON.stringify(list)).not.toContain(created.creator.token);
    expect(list.seeks).toHaveLength(1);
    expect(list.seeks[0]).toMatchObject({
      seekId: created.seekId,
      status: "open",
      setup: {
        ratingMode: "casual",
      },
    });
  });

  it("hides followed-only open seeks from anonymous and unrelated viewers before pagination", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    const dani = await createAccountViaApi(port, "Dani");
    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });

    const publicResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "random",
        creatorSessionId: "public_creator",
      }),
    });
    const publicSeek = await publicResponse.json();
    const followedResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "random",
        visibility: "followed",
      }),
    });
    const followedSeek = await followedResponse.json();

    expect(publicResponse.status).toBe(201);
    expect(followedResponse.status).toBe(201);
    expect(followedSeek.summary).toMatchObject({
      visibility: "followed",
      creatorIdentity: liam.account.identity,
    });

    const anonymousList = await fetch(`http://127.0.0.1:${port}/api/online/seeks?limit=1`);
    const anonymousBody = await anonymousList.json();
    const samirList = await fetch(`http://127.0.0.1:${port}/api/online/seeks?limit=2`, {
      headers: bearer(samir.session.token),
    });
    const samirBody = await samirList.json();
    const daniList = await fetch(`http://127.0.0.1:${port}/api/online/seeks?limit=2`, {
      headers: bearer(dani.session.token),
    });
    const daniBody = await daniList.json();

    expect(anonymousBody.seeks.map((seek: OpenSeekSummary) => seek.seekId)).toEqual([publicSeek.seekId]);
    expect(JSON.stringify(anonymousBody)).not.toContain(followedSeek.seekId);
    expect(samirBody.seeks.map((seek: OpenSeekSummary) => seek.seekId)).toContain(followedSeek.seekId);
    expect(daniBody.seeks.map((seek: OpenSeekSummary) => seek.seekId)).toEqual([publicSeek.seekId]);
    expect(JSON.stringify(daniBody)).not.toContain(followedSeek.seekId);
  });

  it("allows only followed accounts to accept followed-only open seeks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    const dani = await createAccountViaApi(port, "Dani");
    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Samir`, {
      method: "PUT",
      headers: bearer(liam.session.token),
    });

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "random",
        visibility: "followed",
      }),
    });
    const created = await createResponse.json();

    const unrelatedAccept = await fetch(`http://127.0.0.1:${port}/api/online/seeks/${created.seekId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(dani.session.token) },
      body: JSON.stringify({}),
    });
    const followedAccept = await fetch(`http://127.0.0.1:${port}/api/online/seeks/${created.seekId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(samir.session.token) },
      body: JSON.stringify({}),
    });
    const accepted = await followedAccept.json();

    expect(unrelatedAccept.status).toBe(404);
    expect(followedAccept.status).toBe(200);
    expect(accepted).toMatchObject({
      role: "acceptor",
      summary: {
        seekId: created.seekId,
        status: "accepted",
        visibility: "followed",
      },
    });
  });

  it("rejects followed-only open seeks from anonymous creators", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "random",
        creatorSessionId: "session_creator",
        visibility: "followed",
      }),
    });
    const body = await createResponse.json();

    expect(createResponse.status).toBe(400);
    expect(body.error.message).toContain("registered account");
  });

  it("filters public open seeks by side clock and victory points before pagination", async () => {
    const summaries = [
      openSeekSummary("seek_casual_newer", {
        creatorSeat: "b",
        setup: {
          ...createSetup(),
          timeControl: undefined,
          gameRules: { vpModeEnabled: false },
          ratingMode: "casual",
        },
        updatedAt: "2026-06-01T12:03:00.000Z",
      }),
      openSeekSummary("seek_timed_vp_a", {
        creatorSeat: "w",
        setup: {
          ...createClockedSetup(),
          gameRules: { vpModeEnabled: true },
          ratingMode: "rated",
        },
        updatedAt: "2026-06-01T12:02:00.000Z",
      }),
      openSeekSummary("seek_timed_vp_b", {
        creatorSeat: "w",
        setup: {
          ...createClockedSetup(),
          gameRules: { vpModeEnabled: true },
          ratingMode: "rated",
        },
        updatedAt: "2026-06-01T12:02:00.000Z",
      }),
    ];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      loadOpenSeekSummaries: () => summaries,
    });
    servers.push(server);
    const port = await listen(server);

    const filteredResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks?state=open&creatorSeat=w&clock=timed&vp=enabled&rating=rated&limit=1`
    );
    const filtered = await filteredResponse.json();

    expect(filteredResponse.status).toBe(200);
    expect(filtered.seeks.map((seek: OpenSeekSummary) => seek.seekId)).toEqual(["seek_timed_vp_a"]);
    expect(filtered.nextCursor).toEqual(expect.any(String));

    const secondFilteredResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks?state=open&creatorSeat=w&clock=timed&vp=enabled&rating=rated&limit=1&cursor=${encodeURIComponent(filtered.nextCursor)}`
    );
    const secondFiltered = await secondFilteredResponse.json();

    expect(secondFilteredResponse.status).toBe(200);
    expect(secondFiltered.seeks.map((seek: OpenSeekSummary) => seek.seekId)).toEqual(["seek_timed_vp_b"]);
    expect(secondFiltered.nextCursor).toBeUndefined();

    const casualResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks?clock=casual&vp=disabled`
    );
    await expect(casualResponse.json()).resolves.toMatchObject({
      seeks: [{ seekId: "seek_casual_newer" }],
    });

    const invalidClock = await fetch(`http://127.0.0.1:${port}/api/online/seeks?clock=bullet`);
    expect(invalidClock.status).toBe(400);
    const invalidSide = await fetch(`http://127.0.0.1:${port}/api/online/seeks?creatorSeat=white`);
    expect(invalidSide.status).toBe(400);
    const invalidVp = await fetch(`http://127.0.0.1:${port}/api/online/seeks?vp=yes`);
    expect(invalidVp.status).toBe(400);
    const invalidRating = await fetch(`http://127.0.0.1:${port}/api/online/seeks?rating=ranked`);
    expect(invalidRating.status).toBe(400);
    const duplicateFilter = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks?creatorSeat=w&creatorSeat=b`
    );
    expect(duplicateFilter.status).toBe(400);
    const duplicateClock = await fetch(`http://127.0.0.1:${port}/api/online/seeks?clock=timed&clock=casual`);
    expect(duplicateClock.status).toBe(400);
    const duplicateVp = await fetch(`http://127.0.0.1:${port}/api/online/seeks?vp=enabled&vp=disabled`);
    expect(duplicateVp.status).toBe(400);
    const duplicateRating = await fetch(`http://127.0.0.1:${port}/api/online/seeks?rating=casual&rating=rated`);
    expect(duplicateRating.status).toBe(400);
    const secretFilter = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks?creatorSeat=w&token=secret`
    );
    expect(secretFilter.status).toBe(400);
    for (const [param, value] of [
      ["creatorSeat", "Bearer abc123"],
      ["clock", "Bearer abc123"],
      ["vp", "Bearer abc123"],
      ["rating", "Bearer abc123"],
    ]) {
      const secretValueFilter = await fetch(
        `http://127.0.0.1:${port}/api/online/seeks?${param}=${encodeURIComponent(value)}`
      );
      const secretValueBody = await secretValueFilter.json();
      expect(secretValueFilter.status).toBe(400);
      expect(JSON.stringify(secretValueBody)).not.toContain("Bearer");
      expect(JSON.stringify(secretValueBody)).not.toContain("abc123");
    }
  });

  it("accepts an open seek and lets creator and acceptor join the created game", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "w",
        creatorSessionId: "session_creator",
      }),
    });
    const created = await createResponse.json();

    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${created.seekId}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptorSessionId: "session_acceptor" }),
      }
    );
    const accepted = await acceptResponse.json();

    expect(acceptResponse.status).toBe(200);
    expect(accepted).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "acceptor",
      summary: {
        seekId: created.seekId,
        status: "accepted",
        acceptedBy: { kind: "session", id: "session_acceptor" },
      },
      gameInvite: {
        seat: "b",
        token: expect.any(String),
      },
    });
    const gameId = accepted.gameInvite.gameId;

    const creatorSeekResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${created.seekId}`,
      { headers: bearer(created.creator.token) }
    );
    const creatorSeek = await creatorSeekResponse.json();

    expect(creatorSeekResponse.status).toBe(200);
    expect(creatorSeek).toMatchObject({
      role: "creator",
      summary: { status: "accepted", gameId },
      gameInvite: {
        gameId,
        seat: "w",
        token: created.creator.token,
      },
    });

    const creatorJoin = await fetch(`http://127.0.0.1:${port}/api/online/games/${gameId}`, {
      headers: bearer(created.creator.token),
    });
    const acceptorJoin = await fetch(`http://127.0.0.1:${port}/api/online/games/${gameId}`, {
      headers: bearer(accepted.gameInvite.token),
    });

    expect(creatorJoin.status).toBe(200);
    expect(acceptorJoin.status).toBe(200);
    await expect(creatorJoin.json()).resolves.toMatchObject({ color: "w" });
    await expect(acceptorJoin.json()).resolves.toMatchObject({ color: "b" });

  });

  it("lists directly accepted open-seek games as public live games", async () => {
    const gameSummaries: OnlineGameSummary[] = [];
    let createdSeekSummary: OpenSeekSummary | null = null;
    const acceptOpenSeekAndCreateGame = vi.fn(async (input: any) => {
      if (!createdSeekSummary) {
        throw new Error("open seek summary was not captured");
      }
      const seekEvent = createOpenSeekAcceptedEvent(
        {
          type: "seek_accepted",
          seekId: input.seekId,
          acceptedBy: input.acceptedBy,
          acceptedAt: input.acceptedAt,
          gameId: input.gameCreatedEvent.gameId,
          whiteIdentity: input.whiteIdentity,
          blackIdentity: input.blackIdentity,
        },
        { eventId: `${input.seekId}_accepted`, createdAt: input.acceptedAt }
      );
      const accepted: OpenSeekSummary = {
        ...createdSeekSummary,
        status: "accepted",
        updatedAt: seekEvent.createdAt,
        acceptedAt: seekEvent.acceptedAt,
        acceptedBy: seekEvent.acceptedBy,
        gameId: seekEvent.gameId,
        whiteIdentity: seekEvent.whiteIdentity,
        blackIdentity: seekEvent.blackIdentity,
        lastEventId: seekEvent.eventId,
      };
      const [gameSummary] = projectOnlineGameSummaries([input.gameCreatedEvent]);
      if (!gameSummary) {
        throw new Error("Accepted open seek game summary was not projected.");
      }
      gameSummaries.push(gameSummary);
      const gameCredentials: OnlineGameCredentials = {
        whiteCredential: "creator-credential",
        blackCredential: input.acceptorCredential,
      };
      return {
        seekEvent,
        seekSummary: accepted,
        gameSummary,
        gameCredentials,
        gameRecord: {
          gameId: input.gameCreatedEvent.gameId,
          setup: input.gameCreatedEvent.setup,
          whiteCredential: gameCredentials.whiteCredential,
          blackCredential: gameCredentials.blackCredential,
          clock: input.gameCreatedEvent.clock,
          acceptedActions: [],
        },
        gameSeats: { creator: "w" as const, acceptor: "b" as const },
      };
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      acceptOpenSeekAndCreateGame,
      loadGameSummaries: async () => gameSummaries,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "w",
        creatorSessionId: "session_creator",
      }),
    });
    const created = await createResponse.json();
    createdSeekSummary = created.summary;

    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${created.seekId}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptorSessionId: "session_acceptor" }),
      }
    );
    const accepted = await acceptResponse.json();
    const gameId = accepted.gameInvite.gameId;
    const directoryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=active`
    );
    const directory = await directoryResponse.json();

    expect(acceptResponse.status).toBe(200);
    expect(acceptOpenSeekAndCreateGame.mock.calls[0][0].gameCreatedEvent).toMatchObject({
      type: "game_created",
      initialVisibility: "public",
    });
    expect(directoryResponse.status).toBe(200);
    expect(directory.games.map((game: OnlineGameSummary) => game.gameId)).toContain(gameId);
  });

  it("quick matches by accepting a compatible open seek with a tokenless game URL", async () => {
    const setup = createSetup();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup,
        creatorSeat: "w",
        creatorSessionId: "session_creator",
      }),
    });
    const created = await createResponse.json();

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, sessionId: "session_acceptor" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(200);
    expect(quick).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      outcome: "matched",
      role: "acceptor",
      summary: {
        seekId: created.seekId,
        status: "accepted",
        acceptedBy: { kind: "session", id: "session_acceptor" },
      },
      gameInvite: {
        seat: "b",
        token: expect.any(String),
      },
    });
    expect(quick.gameInvite.url).toContain(`onlineGame=${quick.gameInvite.gameId}`);
    expect(quick.gameInvite.url).toContain("seat=b");
    expect(quick.gameInvite.url).not.toContain("token=");
  });

  it("quick match creates a normalized fallback seek when no compatible seek exists", async () => {
    const setup = createSetup();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, sessionId: "session_waiting" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(200);
    expect(quick).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      outcome: "waiting",
      role: "creator",
      seekId: expect.stringMatching(/^seek_/),
      summary: {
        status: "open",
        creatorSeat: "random",
        creatorIdentity: { kind: "session", id: "session_waiting" },
        setup: {
          timeControl: { initial: 20, increment: 20 },
        },
      },
      creator: { token: expect.any(String) },
    });
    expect(quick.seekId).toBe(quick.summary.seekId);
  });

  it("quick match rejects same-session active seeks before matching another candidate", async () => {
    const setup = createSetup();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, creatorSessionId: "session_same" }),
    });
    await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, creatorSessionId: "session_other" }),
    });

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, sessionId: "session_same" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(409);
    expect(quick.error).toMatchObject({
      code: "existing_open_seek",
    });
    expect(JSON.stringify(quick)).not.toContain("session_same");
  });

  it("quick match serializes same-session fallback creation", async () => {
    const setup = createSetup();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const requestQuickMatch = () =>
      fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setup, sessionId: "session_concurrent" }),
      });
    const responses = await Promise.all([requestQuickMatch(), requestQuickMatch()]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([200, 409]);
    expect(bodies.some((body) => body.outcome === "waiting")).toBe(true);
    expect(bodies.some((body) => body.error?.code === "existing_open_seek")).toBe(true);

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`);
    const list = await listResponse.json();
    expect(list.seeks.filter((seek: OpenSeekSummary) => seek.creatorIdentity.id === "session_concurrent"))
      .toHaveLength(1);
  });

  it("quick match falls back when the exact normalized setup signature differs", async () => {
    const listedSetup = createTaggedClockedSetup("Castles");
    const submittedSetup = createTaggedClockedSetup("Chess");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: listedSetup, creatorSessionId: "session_creator" }),
    });
    const created = await createResponse.json();

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: submittedSetup, sessionId: "session_waiting" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(200);
    expect(quick).toMatchObject({
      outcome: "waiting",
      role: "creator",
    });
    expect(quick.seekId).not.toBe(created.seekId);
  });

  it("quick match does not pair rated requests with casual open seeks", async () => {
    const listedSetup = { ...createTaggedClockedSetup(), ratingMode: "casual" as const };
    const submittedSetup = { ...createTaggedClockedSetup(), ratingMode: "rated" as const };
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: listedSetup, creatorSessionId: "session_creator" }),
    });
    const created = await createResponse.json();

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: submittedSetup, sessionId: "session_waiting" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(200);
    expect(quick).toMatchObject({
      outcome: "waiting",
      role: "creator",
      summary: {
        setup: {
          ratingMode: "rated",
        },
      },
    });
    expect(quick.seekId).not.toBe(created.seekId);
  });

  it("quick match rejects same-session accepted seeks before listing another fallback", async () => {
    const setup = createTaggedClockedSetup();
    const accepted = openSeekSummary("seek_accepted_same", {
      setup,
      creatorSeat: "w",
      creatorIdentity: { kind: "session", id: "session_other" },
      status: "accepted",
      updatedAt: "2026-06-01T12:01:00.000Z",
      acceptedAt: "2026-06-01T12:01:00.000Z",
      acceptedBy: { kind: "session", id: "session_same" },
      gameId: "game_same_active",
      whiteIdentity: { kind: "session", id: "session_other" },
      blackIdentity: { kind: "session", id: "session_same" },
      lastEventId: "seek_accepted_same_evt",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:02:00.000Z"),
      loadOpenSeekSummaries: async () => [accepted],
      listOpenSeekSummaries: async () => ({
        schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
        seeks: [],
      }),
    });
    servers.push(server);
    const port = await listen(server);

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, sessionId: "session_same" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(409);
    expect(quick.error).toEqual({
      code: "existing_open_seek",
      message: "This session already has an active open seek.",
    });
    expect(JSON.stringify(quick)).not.toContain("session_same");
  });

  it("quick match skips self-created seeks and accepts the next compatible seek", async () => {
    const setup = createTaggedClockedSetup();
    const selfSeek = openSeekSummary("seek_self", {
      setup,
      creatorSeat: "w",
      creatorIdentity: { kind: "session", id: "session_quick" },
    });
    const otherSeek = openSeekSummary("seek_other_match", {
      setup,
      creatorSeat: "w",
      creatorIdentity: { kind: "session", id: "session_other" },
    });
    const acceptOpenSeekAndCreateGame = vi.fn(async (input: any) => {
      const seekEvent = createOpenSeekAcceptedEvent(
        {
          type: "seek_accepted",
          seekId: input.seekId,
          acceptedBy: input.acceptedBy,
          acceptedAt: input.acceptedAt,
          gameId: input.gameCreatedEvent.gameId,
          whiteIdentity: input.whiteIdentity,
          blackIdentity: input.blackIdentity,
        },
        { eventId: "seek_other_match_accepted", createdAt: input.acceptedAt }
      );
      const accepted: OpenSeekSummary = {
        ...otherSeek,
        status: "accepted",
        updatedAt: seekEvent.createdAt,
        acceptedAt: seekEvent.acceptedAt,
        acceptedBy: seekEvent.acceptedBy,
        gameId: seekEvent.gameId,
        whiteIdentity: seekEvent.whiteIdentity,
        blackIdentity: seekEvent.blackIdentity,
        lastEventId: seekEvent.eventId,
      };
      const [gameSummary] = projectOnlineGameSummaries([input.gameCreatedEvent]);
      const gameCredentials: OnlineGameCredentials = {
        whiteCredential: "creator-credential",
        blackCredential: input.acceptorCredential,
      };
      return {
        seekEvent,
        seekSummary: accepted,
        gameSummary,
        gameCredentials,
        gameRecord: {
          gameId: input.gameCreatedEvent.gameId,
          setup: input.gameCreatedEvent.setup,
          whiteCredential: gameCredentials.whiteCredential,
          blackCredential: gameCredentials.blackCredential,
          clock: input.gameCreatedEvent.clock,
          acceptedActions: [],
        },
        gameSeats: { creator: "w" as const, acceptor: "b" as const },
      };
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      loadOpenSeekSummaries: async () => [],
      listOpenSeekSummaries: async () => ({
        schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
        seeks: [selfSeek, otherSeek],
      }),
      acceptOpenSeekAndCreateGame,
    });
    servers.push(server);
    const port = await listen(server);

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, sessionId: "session_quick" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(200);
    expect(quick).toMatchObject({
      outcome: "matched",
      summary: { seekId: "seek_other_match", status: "accepted" },
    });
    expect(acceptOpenSeekAndCreateGame).toHaveBeenCalledWith(
      expect.objectContaining({ seekId: "seek_other_match" })
    );
  });

  it("quick match retries after a terminal accept race and sanitizes request errors", async () => {
    const setup = createTaggedClockedSetup();
    const racedSeek = openSeekSummary("seek_raced", {
      setup,
      creatorSeat: "w",
      creatorIdentity: { kind: "session", id: "session_raced_creator" },
    });
    const healthySeek = openSeekSummary("seek_after_race", {
      setup,
      creatorSeat: "w",
      creatorIdentity: { kind: "session", id: "session_healthy_creator" },
    });
    const acceptOpenSeekAndCreateGame = vi.fn()
      .mockRejectedValueOnce(new Error("This open seek seek_raced is no longer open. token=secret"))
      .mockImplementation(async (input: any) => {
        const target = healthySeek;
        const seekEvent = createOpenSeekAcceptedEvent(
          {
            type: "seek_accepted",
            seekId: input.seekId,
            acceptedBy: input.acceptedBy,
            acceptedAt: input.acceptedAt,
            gameId: input.gameCreatedEvent.gameId,
            whiteIdentity: input.whiteIdentity,
            blackIdentity: input.blackIdentity,
          },
          { eventId: "seek_after_race_accepted", createdAt: input.acceptedAt }
        );
        const accepted: OpenSeekSummary = {
          ...target,
          status: "accepted",
          updatedAt: seekEvent.createdAt,
          acceptedAt: seekEvent.acceptedAt,
          acceptedBy: seekEvent.acceptedBy,
          gameId: seekEvent.gameId,
          whiteIdentity: seekEvent.whiteIdentity,
          blackIdentity: seekEvent.blackIdentity,
          lastEventId: seekEvent.eventId,
        };
        const [gameSummary] = projectOnlineGameSummaries([input.gameCreatedEvent]);
        const gameCredentials: OnlineGameCredentials = {
          whiteCredential: "creator-credential",
          blackCredential: input.acceptorCredential,
        };
        return {
          seekEvent,
          seekSummary: accepted,
          gameSummary,
          gameCredentials,
          gameRecord: {
            gameId: input.gameCreatedEvent.gameId,
            setup: input.gameCreatedEvent.setup,
            whiteCredential: gameCredentials.whiteCredential,
            blackCredential: gameCredentials.blackCredential,
            clock: input.gameCreatedEvent.clock,
            acceptedActions: [],
          },
          gameSeats: { creator: "w" as const, acceptor: "b" as const },
        };
      });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      loadOpenSeekSummaries: async () => [],
      listOpenSeekSummaries: async () => ({
        schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
        seeks: [racedSeek, healthySeek],
      }),
      acceptOpenSeekAndCreateGame,
    });
    servers.push(server);
    const port = await listen(server);

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, sessionId: "session_acceptor" }),
    });
    const quick = await quickResponse.json();
    const badResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, sessionId: "token=secret-session" }),
    });
    const bad = await badResponse.json();

    expect(quickResponse.status).toBe(200);
    expect(quick).toMatchObject({
      outcome: "matched",
      summary: { seekId: "seek_after_race" },
    });
    expect(acceptOpenSeekAndCreateGame).toHaveBeenCalledTimes(2);
    expect(badResponse.status).toBe(400);
    expect(JSON.stringify(bad)).not.toContain("token=secret-session");
  });

  it("quick match treats missing and explicit default time controls as compatible", async () => {
    const listedSetup = createSetup();
    const submittedSetup = {
      ...listedSetup,
      timeControl: { initial: 20, increment: 20 },
    };
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: listedSetup, creatorSessionId: "session_creator", creatorSeat: "w" }),
    });
    const created = await createResponse.json();
    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: submittedSetup, sessionId: "session_acceptor" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(200);
    expect(quick).toMatchObject({
      outcome: "matched",
      summary: { seekId: created.seekId, status: "accepted" },
    });
  });

  it("quick match uses injected store listing and accept boundaries", async () => {
    const setup = createClockedSetup();
    const listed = openSeekSummary("seek_store_quick", {
      creatorSeat: "w",
      creatorIdentity: { kind: "session", id: "session_creator" },
      setup,
    });
    const listOpenSeekSummaries = vi.fn(async () => ({
      schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION as typeof ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
      seeks: [listed],
    }));
    const acceptOpenSeekAndCreateGame = vi.fn(async (input: any) => {
      const seekEvent = createOpenSeekAcceptedEvent(
        {
          type: "seek_accepted",
          seekId: input.seekId,
          acceptedBy: input.acceptedBy,
          acceptedAt: input.acceptedAt,
          gameId: input.gameCreatedEvent.gameId,
          whiteIdentity: input.whiteIdentity,
          blackIdentity: input.blackIdentity,
        },
        { eventId: "seek_store_quick_accepted", createdAt: input.acceptedAt }
      );
      const accepted: OpenSeekSummary = {
        ...listed,
        status: "accepted",
        updatedAt: seekEvent.createdAt,
        acceptedAt: seekEvent.acceptedAt,
        acceptedBy: seekEvent.acceptedBy,
        gameId: seekEvent.gameId,
        whiteIdentity: seekEvent.whiteIdentity,
        blackIdentity: seekEvent.blackIdentity,
        lastEventId: seekEvent.eventId,
      };
      const [gameSummary] = projectOnlineGameSummaries([input.gameCreatedEvent]);
      const gameCredentials: OnlineGameCredentials = {
        whiteCredential: "creator-credential",
        blackCredential: input.acceptorCredential,
      };
      return {
        seekEvent,
        seekSummary: accepted,
        gameSummary,
        gameCredentials,
        gameRecord: {
          gameId: input.gameCreatedEvent.gameId,
          setup: input.gameCreatedEvent.setup,
          whiteCredential: gameCredentials.whiteCredential,
          blackCredential: gameCredentials.blackCredential,
          clock: input.gameCreatedEvent.clock,
          acceptedActions: [],
        },
        gameSeats: { creator: "w" as const, acceptor: "b" as const },
      };
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      loadOpenSeekSummaries: async () => [listed],
      listOpenSeekSummaries,
      acceptOpenSeekAndCreateGame,
    });
    servers.push(server);
    const port = await listen(server);

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup, sessionId: "session_acceptor" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(200);
    expect(quick).toMatchObject({
      outcome: "matched",
      summary: { seekId: "seek_store_quick", status: "accepted" },
      gameInvite: { seat: "b" },
    });
    expect(listOpenSeekSummaries).toHaveBeenCalledWith({
      state: "open",
      limit: ONLINE_SEEK_DIRECTORY_MAX_LIMIT,
    });
    expect(acceptOpenSeekAndCreateGame).toHaveBeenCalledOnce();
    expect(acceptOpenSeekAndCreateGame.mock.calls[0][0].gameCreatedEvent).toMatchObject({
      type: "game_created",
      initialVisibility: "public",
    });
  });

  it("quick match scans later open-seek pages before creating a fallback", async () => {
    const compatibleSetup = createClockedSetup();
    const incompatibleSetup = createTaggedClockedSetup("Chess");
    const firstPage = Array.from({ length: ONLINE_SEEK_DIRECTORY_MAX_LIMIT }, (_value, index) =>
      openSeekSummary(`seek_page_incompatible_${index.toString().padStart(3, "0")}`, {
        creatorIdentity: { kind: "session", id: `creator_page_${index}` },
        setup: incompatibleSetup,
        updatedAt: `2026-06-01T12:00:${String(index % 60).padStart(2, "0")}.000Z`,
      })
    );
    const compatible = openSeekSummary("seek_page_compatible", {
      creatorSeat: "w",
      creatorIdentity: { kind: "session", id: "creator_page_compatible" },
      setup: compatibleSetup,
      createdAt: "2026-06-01T11:57:00.000Z",
      updatedAt: "2026-06-01T11:58:00.000Z",
    });
    const nextCursor = encodeOpenSeekDirectoryCursor({
      updatedAt: firstPage[firstPage.length - 1].updatedAt,
      seekId: firstPage[firstPage.length - 1].seekId,
    });
    const listOpenSeekSummaries = vi.fn(async (options: any) => {
      if (!options.cursor) {
        return {
          schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION as typeof ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
          seeks: firstPage,
          nextCursor,
        };
      }
      expect(options.cursor).toBe(nextCursor);
      return {
        schemaVersion: ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION as typeof ONLINE_SEEK_DIRECTORY_SCHEMA_VERSION,
        seeks: [compatible],
      };
    });
    const acceptOpenSeekAndCreateGame = vi.fn(async (input: any) => {
      const seekEvent = createOpenSeekAcceptedEvent(
        {
          type: "seek_accepted",
          seekId: input.seekId,
          acceptedBy: input.acceptedBy,
          acceptedAt: input.acceptedAt,
          gameId: input.gameCreatedEvent.gameId,
          whiteIdentity: input.whiteIdentity,
          blackIdentity: input.blackIdentity,
        },
        { eventId: "seek_page_compatible_accepted", createdAt: input.acceptedAt }
      );
      const accepted: OpenSeekSummary = {
        ...compatible,
        status: "accepted",
        updatedAt: seekEvent.createdAt,
        acceptedAt: seekEvent.acceptedAt,
        acceptedBy: seekEvent.acceptedBy,
        gameId: seekEvent.gameId,
        whiteIdentity: seekEvent.whiteIdentity,
        blackIdentity: seekEvent.blackIdentity,
        lastEventId: seekEvent.eventId,
      };
      const [gameSummary] = projectOnlineGameSummaries([input.gameCreatedEvent]);
      const gameCredentials: OnlineGameCredentials = {
        whiteCredential: "creator-credential",
        blackCredential: input.acceptorCredential,
      };
      return {
        seekEvent,
        seekSummary: accepted,
        gameSummary,
        gameCredentials,
        gameRecord: {
          gameId: input.gameCreatedEvent.gameId,
          setup: input.gameCreatedEvent.setup,
          whiteCredential: gameCredentials.whiteCredential,
          blackCredential: gameCredentials.blackCredential,
          clock: input.gameCreatedEvent.clock,
          acceptedActions: [],
        },
        gameSeats: { creator: "w" as const, acceptor: "b" as const },
      };
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:02:00.000Z"),
      loadOpenSeekSummaries: async () => [...firstPage, compatible],
      listOpenSeekSummaries,
      acceptOpenSeekAndCreateGame,
    });
    servers.push(server);
    const port = await listen(server);

    const quickResponse = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: compatibleSetup, sessionId: "session_acceptor" }),
    });
    const quick = await quickResponse.json();

    expect(quickResponse.status).toBe(200);
    expect(quick).toMatchObject({
      outcome: "matched",
      summary: { seekId: "seek_page_compatible", status: "accepted" },
    });
    expect(listOpenSeekSummaries).toHaveBeenCalledTimes(2);
    expect(listOpenSeekSummaries).toHaveBeenNthCalledWith(1, {
      state: "open",
      limit: ONLINE_SEEK_DIRECTORY_MAX_LIMIT,
    });
    expect(listOpenSeekSummaries).toHaveBeenNthCalledWith(2, {
      state: "open",
      limit: ONLINE_SEEK_DIRECTORY_MAX_LIMIT,
      cursor: nextCursor,
    });
    expect(acceptOpenSeekAndCreateGame).toHaveBeenCalledOnce();
  });

  it("rate limits quick match separately from public directory reads", async () => {
    const setup = createSetup();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const headers = {
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.99, 203.0.113.77",
    };

    for (let index = 0; index < 20; index += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
        method: "POST",
        headers,
        body: JSON.stringify({ setup, sessionId: `session_rate_${index}` }),
      });
      expect(response.status).not.toBe(429);
    }
    const limited = await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick`, {
      method: "POST",
      headers: { ...headers, "x-forwarded-for": "203.0.113.77" },
      body: JSON.stringify({ setup, sessionId: "session_rate_limited" }),
    });
    const publicList = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      headers: { "x-forwarded-for": "203.0.113.77" },
    });

    expect(limited.status).toBe(429);
    expect(publicList.status).toBe(200);
  });

  it("cancels creator-owned open seeks and keeps them off the public lobby", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "b",
        creatorSessionId: "session_creator",
      }),
    });
    const created = await createResponse.json();

    const cancelResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${created.seekId}/cancel`,
      { method: "POST", headers: bearer(created.creator.token) }
    );

    expect(cancelResponse.status).toBe(200);
    await expect(cancelResponse.json()).resolves.toMatchObject({
      role: "creator",
      summary: { status: "cancelled" },
    });

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`);
    await expect(listResponse.json()).resolves.toMatchObject({ seeks: [] });
  });

  it("rejects token-bearing open seek owner query strings even with bearer auth", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "b",
        creatorSessionId: "session_creator",
      }),
    });
    const created = await createResponse.json();
    expect(createResponse.status).toBe(201);

    const queryOnlyResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${created.seekId}?token=${created.creator.token}`
    );
    expect(queryOnlyResponse.status).toBe(404);

    const refreshResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${created.seekId}?token=leaked-seek-token`,
      { headers: bearer(created.creator.token) }
    );
    const refreshBody = await refreshResponse.json();
    const cancelResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${created.seekId}/cancel?token=leaked-seek-token`,
      { method: "POST", headers: bearer(created.creator.token) }
    );
    const cancelBody = await cancelResponse.json();

    expect(refreshResponse.status).toBe(400);
    expect(refreshBody.error).toMatchObject({
      code: "bad_request",
      message: "Open seek action query is invalid.",
    });
    expect(cancelResponse.status).toBe(400);
    expect(cancelBody.error).toMatchObject({
      code: "bad_request",
      message: "Open seek action query is invalid.",
    });

    const cleanRefreshResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${created.seekId}`,
      { headers: bearer(created.creator.token) }
    );
    const cleanRefresh = await cleanRefreshResponse.json();
    expect(cleanRefreshResponse.status).toBe(200);
    expect(cleanRefresh.summary.status).toBe("open");
  });

  it("rejects query strings on optional-account action routes", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");

    const followResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });
    expect(followResponse.status).toBe(200);

    const cleanSeekResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({
        setup,
        creatorSeat: "w",
        visibility: "public",
      }),
    });
    const cleanSeek = await cleanSeekResponse.json();
    expect(cleanSeekResponse.status).toBe(201);

    const expectBadQuery = async (response: Response) => {
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error).toMatchObject({
        code: "bad_request",
        message: "Online optional account action query is invalid.",
      });
    };

    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/games?token=${liam.session.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setup, creatorSeat: "w" }),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/games?token=leaked-account-token`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({ setup, creatorSeat: "w" }),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/seeks?token=leaked-account-token`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({
          setup,
          creatorSeat: "b",
          visibility: "public",
        }),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/seeks/${cleanSeek.seekId}/accept?token=leaked-account-token`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(samir.session.token) },
        body: JSON.stringify({}),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/matchmaking/quick?token=leaked-account-token`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({ setup }),
      })
    );
    await expectBadQuery(
      await fetch(`http://127.0.0.1:${port}/api/online/challenges?token=leaked-account-token`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({
          setup,
          challengerSeat: "w",
          visibility: "unlisted",
          challengedDisplayName: "Samir",
        }),
      })
    );

    const cleanSeekRefreshResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${cleanSeek.seekId}`,
      { headers: bearer(cleanSeek.creator.token) }
    );
    const cleanSeekRefresh = await cleanSeekRefreshResponse.json();
    const publicGamesResponse = await fetch(`http://127.0.0.1:${port}/api/online/games?state=active`);
    const publicGames = await publicGamesResponse.json();
    const seeksResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`);
    const seeks = await seeksResponse.json();
    const challengeDirectoryResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/challenges?state=all`, {
      headers: bearer(samir.session.token),
    });
    const challengeDirectory = await challengeDirectoryResponse.json();

    expect(cleanSeekRefreshResponse.status).toBe(200);
    expect(cleanSeekRefresh.summary.status).toBe("open");
    expect(publicGamesResponse.status).toBe(200);
    expect(publicGames.games).toEqual([]);
    expect(seeksResponse.status).toBe(200);
    expect(seeks.seeks).toEqual([
      expect.objectContaining({
        seekId: cleanSeek.seekId,
        status: "open",
      }),
    ]);
    expect(challengeDirectoryResponse.status).toBe(200);
    expect(challengeDirectory.challenges).toEqual([]);
  });

  it("rejects sensitive public seek directory queries and creator self-accept", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);

    const secretQuery = await fetch(`http://127.0.0.1:${port}/api/online/seeks?token=secret`);
    expect(secretQuery.status).toBe(400);
    const terminalHistoryQuery = await fetch(`http://127.0.0.1:${port}/api/online/seeks?state=all`);
    expect(terminalHistoryQuery.status).toBe(400);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSessionId: "session_same",
      }),
    });
    const created = await createResponse.json();
    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${created.seekId}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptorSessionId: "session_same" }),
      }
    );

    expect(acceptResponse.status).toBe(409);
    await expect(acceptResponse.json()).resolves.toMatchObject({
      error: { code: "game_over" },
    });
  });

  it("keeps expired open seeks and seek invite tokens out of public lobby responses", async () => {
    let now = Date.parse("2026-06-01T12:00:00.000Z");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "w",
        creatorSessionId: "session_creator",
        expiresInMs: 5 * 60 * 1000,
      }),
    });
    const created = await createResponse.json();

    now = Date.parse("2026-06-01T12:06:00.000Z");
    const expiredListResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`);
    await expect(expiredListResponse.json()).resolves.toMatchObject({ seeks: [] });

    now = Date.parse("2026-06-01T12:00:00.000Z");
    const activeCreateResponse = await fetch(`http://127.0.0.1:${port}/api/online/seeks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup: createSetup(),
        creatorSeat: "w",
        creatorSessionId: "session_creator_fresh",
      }),
    });
    const active = await activeCreateResponse.json();
    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${active.seekId}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptorSessionId: "session_acceptor" }),
      }
    );
    const accepted = await acceptResponse.json();
    expect(accepted.gameInvite.url).not.toContain("token=");

    const creatorSeekResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/seeks/${active.seekId}`,
      { headers: bearer(active.creator.token) }
    );
    const creatorSeek = await creatorSeekResponse.json();
    expect(creatorSeek.gameInvite.url).not.toContain("token=");
    expect(created.summary.status).toBe("open");
  });

  it("creates private challenge links with fragment tokens and bearer-only API auth", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();

    const response = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup,
        challengerSeat: "w",
        visibility: "unlisted",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.summary).toMatchObject({
      status: "pending",
      challengerSeat: "w",
      setup: {
        ...setup,
        timeControl: { initial: 20, increment: 20 },
        ratingMode: "casual",
      },
    });
    expect(body.challenger.url).toContain("onlineChallenge=");
    expect(body.challenged.url).toContain("onlineChallenge=");
    expect(new URL(body.challenger.url).searchParams.get("challengeRole")).toBe("challenger");
    expect(new URL(body.challenged.url).searchParams.get("challengeRole")).toBe("challenged");
    expect(new URL(body.challenger.url).searchParams.has("token")).toBe(false);
    expect(new URL(body.challenger.url).hash).toContain("challengeToken=");

    const challengedToken = fragmentChallengeToken(body.challenged.url);
    const queryTokenResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${body.challengeId}?token=${challengedToken}`
    );
    expect(queryTokenResponse.status).toBe(404);

    const viewResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${body.challengeId}`,
      { headers: bearer(challengedToken) }
    );
    const viewBody = await viewResponse.json();

    expect(viewResponse.status).toBe(200);
    expect(viewBody).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "challenged",
      summary: {
        challengeId: body.challengeId,
        status: "pending",
      },
    });
    expect(viewBody.gameInvite).toBeUndefined();
  });

  it("rejects token-bearing direct challenge query strings even with bearer auth", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();

    const createChallenge = async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          setup,
          challengerSeat: "w",
          visibility: "unlisted",
        }),
      });
      const body = await response.json();
      expect(response.status).toBe(201);
      return {
        challengeId: body.challengeId as string,
        challengerToken: fragmentChallengeToken(body.challenger.url),
        challengedToken: fragmentChallengeToken(body.challenged.url),
      };
    };

    const viewChallenge = await createChallenge();
    const acceptChallenge = await createChallenge();
    const declineChallenge = await createChallenge();
    const cancelChallenge = await createChallenge();

    const attempts = [
      {
        method: "GET",
        challengeId: viewChallenge.challengeId,
        path: `/api/online/challenges/${viewChallenge.challengeId}?token=leaked-challenge-token`,
        token: viewChallenge.challengedToken,
      },
      {
        method: "POST",
        challengeId: acceptChallenge.challengeId,
        path: `/api/online/challenges/${acceptChallenge.challengeId}/accept?token=leaked-challenge-token`,
        token: acceptChallenge.challengedToken,
      },
      {
        method: "POST",
        challengeId: declineChallenge.challengeId,
        path: `/api/online/challenges/${declineChallenge.challengeId}/decline?token=leaked-challenge-token`,
        token: declineChallenge.challengedToken,
      },
      {
        method: "POST",
        challengeId: cancelChallenge.challengeId,
        path: `/api/online/challenges/${cancelChallenge.challengeId}/cancel?token=leaked-challenge-token`,
        token: cancelChallenge.challengerToken,
      },
    ];

    for (const attempt of attempts) {
      const response = await fetch(`http://127.0.0.1:${port}${attempt.path}`, {
        method: attempt.method,
        headers: bearer(attempt.token),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatchObject({
        code: "bad_request",
        message: "Challenge action query is invalid.",
      });

      const stillPendingResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/challenges/${attempt.challengeId}`,
        { headers: bearer(attempt.token) }
      );
      const stillPending = await stillPendingResponse.json();
      expect(stillPendingResponse.status).toBe(200);
      expect(stillPending.summary.status).toBe("pending");
    }
  });

  it("creates targeted account challenge links when target challenge privacy allows it", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");

    const notFollowedResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({
        setup,
        challengerSeat: "w",
        visibility: "unlisted",
        challengedDisplayName: "samir",
      }),
    });
    expect(notFollowedResponse.status).toBe(409);

    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({
        setup,
        challengerSeat: "w",
        visibility: "unlisted",
        challengedDisplayName: "samir",
      }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(created.summary.challengerIdentity).toEqual(liam.account.identity);
    expect(created.summary.challengedIdentity).toEqual(samir.account.identity);
    expect(new URL(created.challenged.url).hash).toContain("challengeToken=");
    expect(new URL(created.challenged.url).searchParams.has("token")).toBe(false);

    const challengedToken = fragmentChallengeToken(created.challenged.url);
    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${created.challengeId}/accept`,
      { method: "POST", headers: bearer(challengedToken) }
    );
    const accepted = await acceptResponse.json();

    expect(acceptResponse.status).toBe(200);
    expect(accepted.summary).toMatchObject({
      status: "accepted",
      acceptedBy: samir.account.identity,
      blackIdentity: samir.account.identity,
    });
  });

  it("rate limits repeat targeted account challenges while one is pending", async () => {
    let now = Date.parse("2026-06-01T12:00:00.000Z");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    const dani = await createAccountViaApi(port, "Dani");

    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });
    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(dani.session.token),
    });

    const createTargetedChallenge = async (challengedDisplayName: string) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({
          setup,
          challengerSeat: "w",
          visibility: "unlisted",
          challengedDisplayName,
        }),
      });
      return {
        response,
        body: await response.json(),
      };
    };

    const first = await createTargetedChallenge("Samir");
    const repeat = await createTargetedChallenge("Samir");
    now += 61_000;
    const stillPending = await createTargetedChallenge("Samir");
    const otherTarget = await createTargetedChallenge("Dani");

    expect(first.response.status).toBe(201);
    expect(repeat.response.status).toBe(429);
    expect(repeat.body).toMatchObject({
      error: { code: "rate_limited" },
    });
    expect(repeat.body.error.message).toContain("already has a pending challenge");
    expect(stillPending.response.status).toBe(429);
    expect(otherTarget.response.status).toBe(201);
  });

  it("serializes concurrent targeted account challenge pair checks", async () => {
    const challengeEvents: OnlineChallengeEvent[] = [];
    let appendCount = 0;
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      loadChallengeSummaries: () => projectOnlineChallengeSummaries(challengeEvents),
      appendChallengeCreated: async (event) => {
        appendCount += 1;
        if (appendCount === 1) {
          await delay(25);
        }
        challengeEvents.push(event);
        const summary = projectOnlineChallengeSummaries(challengeEvents).find(
          (candidate) => candidate.challengeId === event.challengeId
        );
        if (!summary) throw new Error("Missing projected challenge summary.");
        return summary;
      },
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");

    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });

    const createTargetedChallenge = async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({
          setup,
          challengerSeat: "w",
          visibility: "unlisted",
          challengedDisplayName: "Samir",
        }),
      });
      return {
        response,
        body: await response.json(),
      };
    };

    const results = await Promise.all([
      createTargetedChallenge(),
      createTargetedChallenge(),
    ]);
    const statuses = results.map((result) => result.response.status).sort();

    expect(statuses).toEqual([201, 429]);
    expect(appendCount).toBe(1);
    expect(challengeEvents).toHaveLength(1);
    expect(results.find((result) => result.response.status === 429)?.body).toMatchObject({
      error: { code: "rate_limited" },
    });
  });

  it.each(["declined", "cancelled", "expired"] as const)(
    "rate limits repeat targeted account challenges shortly after one is %s",
    async (terminalStatus) => {
      let now = Date.parse("2026-06-01T12:00:00.000Z");
      const { server } = createOnlineHttpServer({
        publicBaseUrl: "https://castles.example/play",
        now: () => now,
      });
      servers.push(server);
      const port = await listen(server);
      const setup = createSetup();
      const liam = await createAccountViaApi(port, "Liam");
      const samir = await createAccountViaApi(port, "Samir");

      await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
        method: "PUT",
        headers: bearer(samir.session.token),
      });

      const createTargetedChallenge = async () => {
        const response = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
          method: "POST",
          headers: { "content-type": "application/json", ...bearer(liam.session.token) },
          body: JSON.stringify({
            setup,
            challengerSeat: "w",
            visibility: "unlisted",
            challengedDisplayName: "Samir",
            expiresInMs: terminalStatus === "expired" ? 300_000 : undefined,
          }),
        });
        return {
          response,
          body: await response.json(),
        };
      };

      const created = await createTargetedChallenge();
      expect(created.response.status).toBe(201);

      if (terminalStatus === "declined") {
        const declineResponse = await fetch(
          `http://127.0.0.1:${port}/api/online/account/challenges/${created.body.challengeId}/decline`,
          { method: "POST", headers: bearer(samir.session.token) }
        );
        expect(declineResponse.status).toBe(200);
      } else if (terminalStatus === "cancelled") {
        const cancelResponse = await fetch(
          `http://127.0.0.1:${port}/api/online/account/challenges/${created.body.challengeId}/cancel`,
          { method: "POST", headers: bearer(liam.session.token) }
        );
        expect(cancelResponse.status).toBe(200);
      } else {
        now += 301_000;
      }

      const tooSoon = await createTargetedChallenge();
      now += 61_000;
      const afterCooldown = await createTargetedChallenge();

      expect(tooSoon.response.status).toBe(429);
      expect(tooSoon.body).toMatchObject({
        error: { code: "rate_limited" },
      });
      expect(tooSoon.body.error.message).toContain("Please wait before challenging that account again");
      expect(afterCooldown.response.status).toBe(201);
    }
  );

  it("lists account challenge directories by authenticated account identity", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    const dani = await createAccountViaApi(port, "Dani");

    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({
        setup,
        challengerSeat: "random",
        visibility: "unlisted",
        challengedDisplayName: "Samir",
      }),
    });
    const created = await createResponse.json();

    const loadChallenges = async (token: string, state = "pending") => {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/online/account/challenges?state=${state}`,
        { headers: bearer(token) }
      );
      return { response, body: await response.json() };
    };

    const challengerDirectory = await loadChallenges(liam.session.token);
    const challengedDirectory = await loadChallenges(samir.session.token);
    const unrelatedDirectory = await loadChallenges(dani.session.token);
    const allDirectory = await loadChallenges(samir.session.token, "all");
    const invalidQueryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges?token=secret`,
      { headers: bearer(liam.session.token) }
    );
    const unauthenticatedResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges`
    );

    expect(createResponse.status).toBe(201);
    expect(challengerDirectory.response.status).toBe(200);
    expect(challengerDirectory.body).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      challenges: [
        {
          role: "challenger",
          summary: {
            challengeId: created.challengeId,
            status: "pending",
            challengedIdentity: samir.account.identity,
          },
        },
      ],
    });
    expect(challengedDirectory.response.status).toBe(200);
    expect(challengedDirectory.body).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      challenges: [
        {
          role: "challenged",
          summary: {
            challengeId: created.challengeId,
            status: "pending",
            challengerIdentity: liam.account.identity,
          },
        },
      ],
    });
    expect(allDirectory.response.status).toBe(200);
    expect(allDirectory.body.challenges).toHaveLength(1);
    expect(unrelatedDirectory.response.status).toBe(200);
    expect(unrelatedDirectory.body.challenges).toEqual([]);
    expect(JSON.stringify(challengedDirectory.body)).not.toContain("challengeToken");
    expect(JSON.stringify(challengedDirectory.body)).not.toContain(fragmentChallengeToken(created.challenged.url));
    expect(invalidQueryResponse.status).toBe(400);
    expect(unauthenticatedResponse.status).toBe(401);
  });

  it("rejects token-bearing account challenge action query strings even with bearer auth", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");
    const dani = await createAccountViaApi(port, "Dani");
    const priya = await createAccountViaApi(port, "Priya");

    for (const account of [samir, dani, priya]) {
      const followResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
        method: "PUT",
        headers: bearer(account.session.token),
      });
      expect(followResponse.status).toBe(200);
    }

    const createChallenge = async (challengedDisplayName: string) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({
          setup,
          challengerSeat: "w",
          visibility: "unlisted",
          challengedDisplayName,
        }),
      });
      const body = await response.json();
      expect(response.status).toBe(201);
      return body;
    };
    const expectBadQuery = async (response: Response) => {
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error).toMatchObject({
        code: "bad_request",
        message: "Account challenge action query is invalid.",
      });
    };
    const expectPendingChallenge = async (token: string, challengeId: string, role: string) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/account/challenges?state=all`, {
        headers: bearer(token),
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.challenges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role,
            summary: expect.objectContaining({
              challengeId,
              status: "pending",
            }),
          }),
        ])
      );
    };

    const acceptChallenge = await createChallenge("Samir");
    const declineChallenge = await createChallenge("Dani");
    const cancelChallenge = await createChallenge("Priya");
    const queryOnlyAcceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges/${acceptChallenge.challengeId}/accept?token=${samir.session.token}`,
      { method: "POST" }
    );

    await expectBadQuery(
      await fetch(
        `http://127.0.0.1:${port}/api/online/account/challenges/${acceptChallenge.challengeId}/accept?token=leaked-account-token`,
        { method: "POST", headers: bearer(samir.session.token) }
      )
    );
    await expectBadQuery(
      await fetch(
        `http://127.0.0.1:${port}/api/online/account/challenges/${declineChallenge.challengeId}/decline?token=leaked-account-token`,
        { method: "POST", headers: bearer(dani.session.token) }
      )
    );
    await expectBadQuery(
      await fetch(
        `http://127.0.0.1:${port}/api/online/account/challenges/${cancelChallenge.challengeId}/cancel?token=leaked-account-token`,
        { method: "POST", headers: bearer(liam.session.token) }
      )
    );

    expect(queryOnlyAcceptResponse.status).toBe(401);
    await expectPendingChallenge(samir.session.token, acceptChallenge.challengeId, "challenged");
    await expectPendingChallenge(dani.session.token, declineChallenge.challengeId, "challenged");
    await expectPendingChallenge(liam.session.token, cancelChallenge.challengeId, "challenger");
  });

  it("hides account challenges from both participants after either side blocks the other", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");

    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({
        setup,
        challengerSeat: "w",
        visibility: "unlisted",
        challengedDisplayName: "Samir",
      }),
    });
    const created = await createResponse.json();

    const beforeBlockResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/challenges`, {
      headers: bearer(samir.session.token),
    });
    const beforeBlock = await beforeBlockResponse.json();
    const blockResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });

    const challengedDirectoryResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/challenges`, {
      headers: bearer(samir.session.token),
    });
    const challengedDirectory = await challengedDirectoryResponse.json();
    const challengerDirectoryResponse = await fetch(`http://127.0.0.1:${port}/api/online/account/challenges`, {
      headers: bearer(liam.session.token),
    });
    const challengerDirectory = await challengerDirectoryResponse.json();
    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges/${created.challengeId}/accept`,
      { method: "POST", headers: bearer(samir.session.token) }
    );
    const declineResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges/${created.challengeId}/decline`,
      { method: "POST", headers: bearer(samir.session.token) }
    );
    const cancelResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges/${created.challengeId}/cancel`,
      { method: "POST", headers: bearer(liam.session.token) }
    );

    expect(createResponse.status).toBe(201);
    expect(beforeBlockResponse.status).toBe(200);
    expect(beforeBlock.challenges).toHaveLength(1);
    expect(blockResponse.status).toBe(200);
    expect(challengedDirectoryResponse.status).toBe(200);
    expect(challengedDirectory.challenges).toEqual([]);
    expect(challengerDirectoryResponse.status).toBe(200);
    expect(challengerDirectory.challenges).toEqual([]);
    expect(acceptResponse.status).toBe(404);
    expect(declineResponse.status).toBe(404);
    expect(cancelResponse.status).toBe(404);
  });

  it.each([
    ["challenged blocks challenger", "Samir", "Liam", "challenged", "declined", "declinedBy"],
    ["challenger blocks challenged", "Liam", "Samir", "challenger", "cancelled", "cancelledBy"],
  ] as const)(
    "auto-terminates pending account challenges when the %s",
    async (_label, blockerName, blockedName, viewRole, expectedStatus, actorField) => {
      const { server } = createOnlineHttpServer({
        publicBaseUrl: "https://castles.example/play",
        now: () => Date.parse("2026-06-01T12:00:00.000Z"),
      });
      servers.push(server);
      const port = await listen(server);
      const setup = createSetup();
      const liam = await createAccountViaApi(port, "Liam");
      const samir = await createAccountViaApi(port, "Samir");
      const blocker = blockerName === "Liam" ? liam : samir;
      const blocked = blockedName === "Liam" ? liam : samir;

      await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
        method: "PUT",
        headers: bearer(samir.session.token),
      });

      const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({
          setup,
          challengerSeat: "w",
          visibility: "unlisted",
          challengedDisplayName: "Samir",
        }),
      });
      const created = await createResponse.json();
      const viewToken = fragmentChallengeToken(
        viewRole === "challenger" ? created.challenger.url : created.challenged.url
      );

      const blockResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/account/blocks/${blocked.account.displayName}`,
        { method: "PUT", headers: bearer(blocker.session.token) }
      );
      const viewResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/challenges/${created.challengeId}`,
        { headers: bearer(viewToken) }
      );
      const viewed = await viewResponse.json();

      expect(createResponse.status).toBe(201);
      expect(blockResponse.status).toBe(200);
      expect(viewResponse.status).toBe(200);
      expect(viewed.summary.status).toBe(expectedStatus);
      expect(viewed.summary[actorField]).toEqual(blocker.account.identity);
    }
  );

  it("lets accounts accept, decline, and cancel their own challenges without challenge tokens", async () => {
    let now = Date.parse("2026-06-01T12:00:00.000Z");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");

    await fetch(`http://127.0.0.1:${port}/api/online/account/follows/Liam`, {
      method: "PUT",
      headers: bearer(samir.session.token),
    });

    const createChallenge = async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer(liam.session.token) },
        body: JSON.stringify({
          setup,
          challengerSeat: "w",
          visibility: "unlisted",
          challengedDisplayName: "Samir",
        }),
      });
      const body = await response.json();
      expect(response.status).toBe(201);
      return body;
    };

    const acceptedChallenge = await createChallenge();
    const wrongSideAcceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges/${acceptedChallenge.challengeId}/accept`,
      { method: "POST", headers: bearer(liam.session.token) }
    );
    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges/${acceptedChallenge.challengeId}/accept`,
      { method: "POST", headers: bearer(samir.session.token) }
    );
    const accepted = await acceptResponse.json();
    const joinResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${accepted.gameInvite.gameId}`,
      { headers: bearer(accepted.gameInvite.token) }
    );
    const join = await joinResponse.json();

    const declinedChallenge = await createChallenge();
    const declineResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges/${declinedChallenge.challengeId}/decline`,
      { method: "POST", headers: bearer(samir.session.token) }
    );
    const declined = await declineResponse.json();

    now += 61_000;
    const cancelledChallenge = await createChallenge();
    const wrongSideCancelResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges/${cancelledChallenge.challengeId}/cancel`,
      { method: "POST", headers: bearer(samir.session.token) }
    );
    const cancelResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/account/challenges/${cancelledChallenge.challengeId}/cancel`,
      { method: "POST", headers: bearer(liam.session.token) }
    );
    const cancelled = await cancelResponse.json();

    expect(wrongSideAcceptResponse.status).toBe(404);
    expect(acceptResponse.status).toBe(200);
    expect(accepted).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "challenged",
      summary: {
        challengeId: acceptedChallenge.challengeId,
        status: "accepted",
        acceptedBy: samir.account.identity,
      },
      gameInvite: {
        seat: "b",
      },
    });
    expect(accepted.gameInvite.token).toBeTruthy();
    expect(accepted.gameInvite.url).not.toContain("token=");
    expect(accepted.gameInvite.token).not.toBe(fragmentChallengeToken(acceptedChallenge.challenged.url));
    expect(joinResponse.status).toBe(200);
    expect(join.color).toBe("b");

    expect(declineResponse.status).toBe(200);
    expect(declined).toMatchObject({
      role: "challenged",
      summary: {
        challengeId: declinedChallenge.challengeId,
        status: "declined",
        declinedBy: samir.account.identity,
      },
    });

    expect(wrongSideCancelResponse.status).toBe(404);
    expect(cancelResponse.status).toBe(200);
    expect(cancelled).toMatchObject({
      role: "challenger",
      summary: {
        challengeId: cancelledChallenge.challengeId,
        status: "cancelled",
        cancelledBy: liam.account.identity,
      },
    });
  });

  it("allows targeted account challenges from anyone when target challenge privacy is everyone", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const samir = await createAccountViaApi(port, "Samir");

    await fetch(`http://127.0.0.1:${port}/api/online/account/privacy`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(samir.session.token) },
      body: JSON.stringify({ challengePolicy: "everyone" }),
    });

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(liam.session.token) },
      body: JSON.stringify({
        setup,
        challengerSeat: "w",
        visibility: "unlisted",
        challengedDisplayName: "Samir",
      }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(created.summary.challengerIdentity).toEqual(liam.account.identity);
    expect(created.summary.challengedIdentity).toEqual(samir.account.identity);
  });

  it("rejects targeted account challenges that are unauthorized, hidden, self, or blocked", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    const liam = await createAccountViaApi(port, "Liam");
    const dani = await createAccountViaApi(port, "Dani");
    const ben = await createAccountViaApi(port, "Ben");

    const requestTarget = (displayName: string, token?: string) =>
      fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? bearer(token) : {}),
        },
        body: JSON.stringify({
          setup,
          challengerSeat: "w",
          visibility: "unlisted",
          challengedDisplayName: displayName,
        }),
      });

    const unauthenticated = await requestTarget("Dani");
    const unknown = await requestTarget("Missing", liam.session.token);
    const self = await requestTarget("Liam", liam.session.token);
    await fetch(`http://127.0.0.1:${port}/api/online/account/privacy`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...bearer(dani.session.token) },
      body: JSON.stringify({ challengePolicy: "nobody" }),
    });
    const noChallenges = await requestTarget("Dani", liam.session.token);
    await fetch(`http://127.0.0.1:${port}/api/online/account/blocks/Liam`, {
      method: "PUT",
      headers: bearer(ben.session.token),
    });
    const blocked = await requestTarget("Ben", liam.session.token);

    expect(unauthenticated.status).toBe(401);
    expect(unknown.status).toBe(404);
    expect(self.status).toBe(400);
    expect(noChallenges.status).toBe(409);
    expect(blocked.status).toBe(404);
  });

  it("accepts a private challenge and lets both sides immediately join the created game", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:00:00.000Z"),
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setup,
        challengerSeat: "w",
        visibility: "private",
      }),
    });
    const created = await createResponse.json();
    const challengerToken = fragmentChallengeToken(created.challenger.url);
    const challengedToken = fragmentChallengeToken(created.challenged.url);

    const acceptResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${created.challengeId}/accept`,
      { method: "POST", headers: bearer(challengedToken) }
    );
    const accepted = await acceptResponse.json();

    expect(acceptResponse.status).toBe(200);
    expect(accepted).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "challenged",
      summary: {
        challengeId: created.challengeId,
        status: "accepted",
      },
      gameInvite: {
        seat: "b",
        token: challengedToken,
      },
    });
    const gameId = accepted.gameInvite.gameId;

    const challengerViewResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${created.challengeId}`,
      { headers: bearer(challengerToken) }
    );
    const challengerView = await challengerViewResponse.json();

    expect(challengerViewResponse.status).toBe(200);
    expect(challengerView).toMatchObject({
      role: "challenger",
      summary: { status: "accepted", gameId },
      gameInvite: {
        gameId,
        seat: "w",
        token: challengerToken,
      },
    });

    const whiteJoinResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${gameId}`,
      { headers: bearer(challengerToken) }
    );
    const blackJoinResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${gameId}`,
      { headers: bearer(challengedToken) }
    );
    const whiteJoin = await whiteJoinResponse.json();
    const blackJoin = await blackJoinResponse.json();

    expect(whiteJoinResponse.status).toBe(200);
    expect(blackJoinResponse.status).toBe(200);
    expect(whiteJoin.color).toBe("w");
    expect(blackJoin.color).toBe("b");
  });

  it.each(["private", "unlisted"] as const)(
    "keeps accepted %s challenge games out of the public game directory",
    async (visibility: OnlineChallengeVisibility) => {
      const gameSummaries: OnlineGameSummary[] = [];
      let pendingChallenge: OnlineChallengeSummary | null = null;
      const acceptChallengeAndCreateGame = vi.fn(async (input: any) => {
        if (!pendingChallenge) {
          throw new Error("challenge summary was not captured");
        }
        const challengeEvent = createChallengeAcceptedEvent(
          {
            type: "challenge_accepted",
            challengeId: input.challengeId,
            acceptedBy: input.acceptedBy.identity,
            acceptedAt: input.acceptedAt,
            gameId: input.gameCreatedEvent.gameId,
            whiteIdentity: input.whiteIdentity,
            blackIdentity: input.blackIdentity,
          },
          { eventId: `${input.challengeId}_accepted`, createdAt: input.acceptedAt }
        );
        const challengeSummary: OnlineChallengeSummary = {
          ...pendingChallenge,
          status: "accepted",
          updatedAt: challengeEvent.createdAt,
          acceptedAt: challengeEvent.acceptedAt,
          acceptedBy: challengeEvent.acceptedBy,
          gameId: challengeEvent.gameId,
          whiteIdentity: challengeEvent.whiteIdentity,
          blackIdentity: challengeEvent.blackIdentity,
          lastEventId: challengeEvent.eventId,
        };
        const [gameSummary] = projectOnlineGameSummaries([input.gameCreatedEvent]);
        if (!gameSummary) {
          throw new Error("Accepted challenge game summary was not projected.");
        }
        gameSummaries.push(gameSummary);
        const gameCredentials: OnlineGameCredentials = {
          whiteCredential: "challenger-credential",
          blackCredential: "challenged-credential",
        };
        return {
          challengeEvent,
          challengeSummary,
          gameSummary,
          gameCredentials,
          gameRecord: {
            gameId: input.gameCreatedEvent.gameId,
            setup: input.gameCreatedEvent.setup,
            whiteCredential: gameCredentials.whiteCredential,
            blackCredential: gameCredentials.blackCredential,
            clock: input.gameCreatedEvent.clock,
            acceptedActions: [],
          },
          gameSeats: { challenger: "w" as const, challenged: "b" as const },
        };
      });
      const { server } = createOnlineHttpServer({
        publicBaseUrl: "https://castles.example/play",
        now: () => Date.parse("2026-06-01T12:00:00.000Z"),
        acceptChallengeAndCreateGame,
        loadGameSummaries: async () => gameSummaries,
      });
      servers.push(server);
      const port = await listen(server);
      const setup = createSetup();

      const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/challenges`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          setup,
          challengerSeat: "w",
          visibility,
        }),
      });
      const created = await createResponse.json();
      pendingChallenge = created.summary;
      const challengedToken = fragmentChallengeToken(created.challenged.url);

      const acceptResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/challenges/${created.challengeId}/accept`,
        { method: "POST", headers: bearer(challengedToken) }
      );
      const accepted = await acceptResponse.json();
      const directoryResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/games?state=active`
      );
      const directory = await directoryResponse.json();

      expect(acceptResponse.status).toBe(200);
      expect(acceptChallengeAndCreateGame.mock.calls[0][0].gameCreatedEvent).toMatchObject({
        type: "game_created",
        initialVisibility: visibility,
      });
      expect(accepted.gameInvite.gameId).toBeTruthy();
      expect(directoryResponse.status).toBe(200);
      expect(directory.games.map((game: OnlineGameSummary) => game.gameId)).not.toContain(
        accepted.gameInvite.gameId
      );
    }
  );

  it.each(["decline", "cancel"] as const)(
    "rate limits challenge %s actions before auth",
    async (action) => {
      const { server } = createOnlineHttpServer({
        publicBaseUrl: "https://castles.example/play",
      });
      servers.push(server);
      const port = await listen(server);

      let response: Response | undefined;
      for (let index = 0; index < 121; index += 1) {
        response = await fetch(
          `http://127.0.0.1:${port}/api/online/challenges/challenge_rate_${action}/${action}`,
          { method: "POST" }
        );
      }

      expect(response?.status).toBe(429);
      await expect(response?.json()).resolves.toMatchObject({
        error: { code: "rate_limited" },
      });
    }
  );

  it.each([
    ["decline", "challenged"],
    ["cancel", "challenger"],
  ] as const)("expires stale challenges before %s actions", async (action, role) => {
    const challengeId = `challenge_expired_${action}`;
    let summary = pendingChallengeSummary(challengeId);
    const appendedTypes: string[] = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:06:00.000Z"),
      loadChallengeSummaries: () => [summary],
      resolveChallengeCredential: (_challengeId, token) =>
        token === `${role}-token` ? challengeCredentialFor(summary, role) : null,
      appendChallengeEvent: (event) => {
        appendedTypes.push(event.type);
        if (event.type !== "challenge_expired") {
          throw new Error(`Unexpected ${event.type} event`);
        }
        summary = {
          ...summary,
          status: "expired",
          updatedAt: event.createdAt,
          expiredAt: event.expiredAt,
          expiredBy: "system",
          lastEventId: event.eventId,
        };
        return summary;
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${challengeId}/${action}`,
      { method: "POST", headers: bearer(`${role}-token`) }
    );

    expect(response.status).toBe(409);
    expect(appendedTypes).toEqual(["challenge_expired"]);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "game_over" },
    });
  });

  it("returns persistence failure when declining a pending challenge cannot be saved", async () => {
    const challengeId = "challenge_decline_persistence";
    const summary = pendingChallengeSummary(challengeId, {
      expiresAt: "2026-06-01T12:10:00.000Z",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:01:00.000Z"),
      loadChallengeSummaries: () => [summary],
      resolveChallengeCredential: (_challengeId, token) =>
        token === "challenged-token" ? challengeCredentialFor(summary, "challenged") : null,
      appendChallengeEvent: () => {
        throw new Error("database is unavailable");
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${challengeId}/decline`,
      { method: "POST", headers: bearer("challenged-token") }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "persistence_failed" },
    });
  });

  it("returns the current summary when concurrent lazy expiry has already won", async () => {
    const challengeId = "challenge_expiry_race";
    let summary = pendingChallengeSummary(challengeId);
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example/play",
      now: () => Date.parse("2026-06-01T12:06:00.000Z"),
      loadChallengeSummaries: () => [summary],
      resolveChallengeCredential: (_challengeId, token) =>
        token === "challenged-token" ? challengeCredentialFor(summary, "challenged") : null,
      appendChallengeEvent: (event) => {
        if (event.type !== "challenge_expired") {
          throw new Error(`Unexpected ${event.type} event`);
        }
        summary = {
          ...summary,
          status: "expired",
          updatedAt: event.createdAt,
          expiredAt: event.expiredAt,
          expiredBy: "system",
          lastEventId: event.eventId,
        };
        throw new Error("Online challenge was already terminal.");
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/challenges/${challengeId}`,
      { headers: bearer("challenged-token") }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "challenged",
      summary: {
        challengeId,
        status: "expired",
      },
    });
  });

  it("marks online HTTP responses as private no-store responses", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_headers",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    expect(createResponse.headers.get("cache-control")).toContain("no-store");
    expect(createResponse.headers.get("vary")).toContain("Authorization");

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const snapshotBody = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.headers.get("cache-control")).toContain("no-store");
    expect(snapshotResponse.headers.get("vary")).toContain("Authorization");
    expect(snapshotBody).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      snapshot: { gameId: "game_headers" },
    });
  });

  it("does not accept snapshot tokens in the URL query string", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_query_token",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}?token=${created.white.token}`
    );

    expect(snapshotResponse.status).toBe(404);
    expect(snapshotResponse.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects token-bearing direct game query strings even with bearer auth", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_player_query_guard",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const appended: Array<Extract<OnlineGameEvent, { type: "visibility_changed" }>> = [];
    let summary = summaryForGame("game_player_query_guard", "unlisted");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      appendGameVisibilityChanged: (event) => {
        appended.push(event);
        summary = {
          ...summary,
          visibility: event.visibility,
          updatedAt: event.createdAt,
          lastEventId: event.eventId,
        };
        return summary;
      },
    });
    servers.push(server);
    const port = await listen(server);
    const created = service.createGame(createClockedSetup(), {
      publicBaseUrl: "https://castles.example",
    });

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}?token=leaked-player-token`,
      { headers: bearer(created.white.token) }
    );
    const snapshotBody = await snapshotResponse.json();
    const visibilityResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/visibility?token=leaked-player-token`,
      {
        method: "PATCH",
        headers: {
          ...bearer(created.white.token),
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "public" }),
      }
    );
    const visibilityBody = await visibilityResponse.json();

    expect(snapshotResponse.status).toBe(400);
    expect(snapshotBody.error).toMatchObject({
      code: "bad_request",
      message: "Game action query is invalid.",
    });
    expect(visibilityResponse.status).toBe(400);
    expect(visibilityBody.error).toMatchObject({
      code: "bad_request",
      message: "Game action query is invalid.",
    });
    expect(appended).toHaveLength(0);

    const cleanSnapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: bearer(created.white.token) }
    );
    const cleanSnapshot = await cleanSnapshotResponse.json();
    expect(cleanSnapshotResponse.status).toBe(200);
    expect(cleanSnapshot.snapshot.gameId).toBe("game_player_query_guard");
  });

  it("serves read-only spectator snapshots without player tokens", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_spectator_rest",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    const spectatorResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/spectator`
    );
    const spectatorBody = await spectatorResponse.json();

    expect(spectatorResponse.status).toBe(200);
    expect(spectatorResponse.headers.get("cache-control")).toContain("no-store");
    expect(spectatorBody).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "spectator",
      snapshot: {
        gameId: "game_spectator_rest",
        version: 0,
      },
    });
  });

  it("rejects malformed spectator game ids before queueing a lookup", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);

    const spectatorResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${"g".repeat(129)}/spectator`
    );
    const spectatorBody = await spectatorResponse.json();

    expect(spectatorResponse.status).toBe(400);
    expect(spectatorBody.error).toMatchObject({
      code: "bad_request",
    });
  });

  it("rate limits public spectator snapshot reads", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_spectator_limited",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const spectatorUrl = `http://127.0.0.1:${port}/api/online/games/${created.gameId}/spectator`;

    for (let i = 0; i < 120; i += 1) {
      const response = await fetch(spectatorUrl, {
        headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.10" },
      });
      expect(response.status).toBe(200);
    }
    const limitedResponse = await fetch(spectatorUrl, {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const otherClientResponse = await fetch(spectatorUrl, {
      headers: { "x-forwarded-for": "203.0.113.11" },
    });
    const spoofedOnlyResponse = await fetch(spectatorUrl, {
      headers: { "x-forwarded-for": "198.51.100.99" },
    });

    expect(limitedResponse.status).toBe(429);
    expect(otherClientResponse.status).toBe(200);
    expect(spoofedOnlyResponse.status).toBe(200);
  });

  it("reports deployment and store readiness metadata in health checks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      health: {
        buildId: "test-build",
        commit: "abc123",
        storeBackend: "postgres",
        storePath: "postgres",
        checkStoreReady: async () => true,
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      build: {
        buildId: "test-build",
        commit: "abc123",
      },
      online: {
        eventSchemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
        store: {
          ok: true,
          backend: "postgres",
          path: "postgres",
        },
      },
    });
    expect(body.online.rulesetVersion).toEqual(expect.any(String));
  });

  it("sanitizes store readiness errors in public health checks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      health: {
        storeBackend: "postgres",
        storePath: "postgres",
        checkStoreReady: async () => {
          throw new Error("postgresql://castles:secret@db.example/castles refused");
        },
      },
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.online.store).toMatchObject({
      ok: false,
      backend: "postgres",
      path: "postgres",
      error: "Store readiness check failed.",
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("db.example");
  });

  it("times out slow store readiness checks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      health: {
        storeBackend: "postgres",
        storePath: "postgres",
        readinessTimeoutMs: 5,
        checkStoreReady: () => new Promise<boolean>(() => undefined),
      },
    });
    servers.push(server);
    const port = await listen(server);

    const startedAt = Date.now();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(response.status).toBe(503);
    expect(body.online.store).toMatchObject({
      ok: false,
      backend: "postgres",
      path: "postgres",
      error: "Store readiness check timed out.",
    });
  });

  it("creates games through the HTTP API", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);

    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.gameId).toMatch(/^game_/);
    expect(body.white.url).toContain("seat=w");
    expect(body.black.url).toContain("seat=b");
  });

  it("lists only public token-free online game summaries through the directory contract", async () => {
    const summaries: OnlineGameSummary[] = [
      {
        ...summaryForGame("game_public_summary_http", "public"),
        updatedAt: "2026-05-31T12:00:01.000Z",
        endedAt: "2026-05-31T12:00:01.000Z",
        version: 1,
        status: "complete",
        archiveState: "archived",
        result: { winner: "w", reason: "resignation" },
        lastEventId: "evt-summary",
      },
      { ...summaryForGame("game_unlisted_summary_http", "unlisted"), lastEventId: "evt-unlisted" },
      { ...summaryForGame("game_private_summary_http", "private"), lastEventId: "evt-private" },
    ];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => summaries,
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/api/online/games`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({ schemaVersion: 1, games: [summaries[0]] });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("game_unlisted_summary_http");
    expect(JSON.stringify(body)).not.toContain("game_private_summary_http");
  });

  it("supports public directory state filters limits and cursors", async () => {
    const publicActiveNew = {
      ...summaryForGame("game_public_active_new", "public"),
      updatedAt: "2026-05-31T12:03:00.000Z",
    };
    const publicActiveOld = {
      ...summaryForGame("game_public_active_old", "public"),
      updatedAt: "2026-05-31T12:02:00.000Z",
    };
    const publicArchive = {
      ...summaryForGame("game_public_archive", "public"),
      updatedAt: "2026-05-31T12:01:00.000Z",
      endedAt: "2026-05-31T12:01:00.000Z",
      status: "complete" as const,
      archiveState: "archived" as const,
      result: { winner: "w" as const, reason: "resignation" as const },
    };
    const summaries: OnlineGameSummary[] = [
      publicActiveOld,
      publicArchive,
      summaryForGame("game_unlisted_hidden", "unlisted"),
      publicActiveNew,
    ];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => summaries,
    });
    servers.push(server);
    const port = await listen(server);

    const firstPageResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=active&limit=1`
    );
    const firstPage = await firstPageResponse.json();

    expect(firstPageResponse.status).toBe(200);
    expect(firstPage.games.map((game: OnlineGameSummary) => game.gameId)).toEqual([
      "game_public_active_new",
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=active&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`
    );
    const secondPage = await secondPageResponse.json();

    expect(secondPage.games.map((game: OnlineGameSummary) => game.gameId)).toEqual([
      "game_public_active_old",
    ]);
    expect(secondPage.nextCursor).toBeUndefined();

    const archiveResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=archived`
    );
    const archiveBody = await archiveResponse.json();

    expect(archiveBody.games.map((game: OnlineGameSummary) => game.gameId)).toEqual([
      "game_public_archive",
    ]);

    const allResponse = await fetch(`http://127.0.0.1:${port}/api/online/games?state=all`);
    const allBody = await allResponse.json();

    expect(allBody.games.map((game: OnlineGameSummary) => game.gameId)).toEqual([
      "game_public_active_new",
      "game_public_active_old",
      "game_public_archive",
    ]);
  });

  it("applies public directory clock and result filters before pagination", async () => {
    const timedTimeout = {
      ...summaryForGame("game_timed_timeout_newer", "public"),
      updatedAt: "2026-05-31T12:04:00.000Z",
      endedAt: "2026-05-31T12:04:00.000Z",
      status: "complete" as const,
      archiveState: "archived" as const,
      ratingMode: "rated" as const,
      result: { winner: "w" as const, reason: "timeout" as const },
    };
    const baseCasualTimeout = summaryForGame("game_casual_timeout_middle", "public");
    const casualTimeout = {
      ...baseCasualTimeout,
      updatedAt: "2026-05-31T12:03:00.000Z",
      endedAt: "2026-05-31T12:03:00.000Z",
      status: "complete" as const,
      archiveState: "archived" as const,
      hasTimeControl: false,
      ratingMode: "casual" as const,
      livePreview: withoutPreviewClock(baseCasualTimeout.livePreview),
      result: { winner: "b" as const, reason: "timeout" as const },
    };
    const baseCasualResignation = summaryForGame("game_casual_resignation_old", "public");
    const casualResignation = {
      ...baseCasualResignation,
      updatedAt: "2026-05-31T12:02:00.000Z",
      endedAt: "2026-05-31T12:02:00.000Z",
      status: "complete" as const,
      archiveState: "archived" as const,
      hasTimeControl: false,
      ratingMode: "casual" as const,
      livePreview: withoutPreviewClock(baseCasualResignation.livePreview),
      result: { winner: "w" as const, reason: "resignation" as const },
    };
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => [timedTimeout, casualResignation, casualTimeout],
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=archived&clock=casual&rating=casual&result=timeout&limit=1`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.games.map((game: OnlineGameSummary) => game.gameId)).toEqual([
      "game_casual_timeout_middle",
    ]);
    expect(body.nextCursor).toBeUndefined();
  });

  it("applies public directory text search before pagination", async () => {
    const newerNonmatch = {
      ...summaryForGame("game_newer_nonmatch", "public"),
      updatedAt: "2026-05-31T12:04:00.000Z",
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "ada_raw_id_w", displayName: "Caro" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "dani_b", displayName: "Dani" } },
      ],
    } satisfies OnlineGameSummary;
    const olderMatch = {
      ...summaryForGame("game_older_match", "public"),
      updatedAt: "2026-05-31T12:03:00.000Z",
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "visible_match_w", displayName: "Ada" } },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_match_b" } },
      ],
    } satisfies OnlineGameSummary;
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => [newerNonmatch, olderMatch],
    });
    servers.push(server);
    const port = await listen(server);

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=active&q=ada&limit=1`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.games.map((game: OnlineGameSummary) => game.gameId)).toEqual(["game_older_match"]);
    expect(JSON.stringify(body)).not.toContain("ada_raw_id_w");
  });

  it("rejects invalid public directory query parameters and secret-looking queries", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => [summaryForGame("game_public_directory_http", "public")],
    });
    servers.push(server);
    const port = await listen(server);

    for (const query of [
      "state=waiting",
      "limit=0",
      "limit=101",
      "cursor=not-valid-cursor",
      "clock=",
      "clock=bullet",
      "rating=",
      "rating=ranked",
      "result=",
      "result=draw",
      "clock=timed&clock=casual",
      "rating=casual&rating=rated",
      "result=white&result=timeout",
      "q=",
      "q=Ada%0ABen",
      `q=${"a".repeat(81)}`,
      "q=ada&q=ben",
      "token=secret",
      "sid=secret",
      "secret=value",
      "bearer=value",
      "api_key=value",
      "authorization=Bearer%20secret",
      "q=Bearer%20abc123",
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/games?${query}`);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(JSON.stringify(body)).not.toContain("secret");
    }
  });

  it("rate limits public directory reads", async () => {
    const publicSummary = summaryForGame("game_public_directory_limited_http", "public");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => [publicSummary],
      loadGameSummary: async (gameId: string) => gameId === publicSummary.gameId ? publicSummary : null,
    });
    servers.push(server);
    const port = await listen(server);
    const clientHeader = { "x-forwarded-for": "198.51.100.99, 203.0.113.60" };

    for (let i = 0; i < 240; i += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
        headers: clientHeader,
      });
      expect(response.status).toBe(200);
    }

    const limitedListResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      headers: { "x-forwarded-for": "203.0.113.60" },
    });
    const limitedDetailResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${publicSummary.gameId}/summary`,
      { headers: { "x-forwarded-for": "203.0.113.60" } }
    );
    const otherClientResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      headers: { "x-forwarded-for": "203.0.113.61" },
    });

    expect(limitedListResponse.status).toBe(429);
    expect(limitedDetailResponse.status).toBe(429);
    expect(otherClientResponse.status).toBe(200);
  });

  it("loads single public summaries without exposing hidden games", async () => {
    const publicSummary = summaryForGame("game_public_detail_http", "public");
    const privateSummary = summaryForGame("game_private_detail_http", "private");
    const loadGameSummary = vi.fn(async (gameId: string) => {
      if (gameId === publicSummary.gameId) return publicSummary;
      if (gameId === privateSummary.gameId) return privateSummary;
      return null;
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      now: () => 23_456,
      loadGameSummary,
    });
    servers.push(server);
    const port = await listen(server);

    const publicResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${publicSummary.gameId}/summary`
    );
    const publicBody = await publicResponse.json();

    expect(publicResponse.status).toBe(200);
    expect(publicBody).toEqual({
      schemaVersion: 1,
      summary: {
        ...publicSummary,
        livePreview: {
          ...publicSummary.livePreview,
          clock: {
            ...publicSummary.livePreview.clock!,
            serverNow: 23_456,
          },
        },
      },
    });

    const privateResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${privateSummary.gameId}/summary`
    );
    const privateBody = await privateResponse.json();

    expect(privateResponse.status).toBe(404);
    expect(JSON.stringify(privateBody)).not.toContain(privateSummary.gameId);
    expect(loadGameSummary).toHaveBeenCalledWith(publicSummary.gameId);

    const secretQueryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${publicSummary.gameId}/summary?api_key=value`
    );
    const secretQueryBody = await secretQueryResponse.json();

    expect(secretQueryResponse.status).toBe(400);
    expect(JSON.stringify(secretQueryBody)).not.toContain("value");
  });

  it("decorates public game summaries with current connected spectator counts", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_watched_presence_http",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const created = service.createGame(createClockedSetup(), {
      publicBaseUrl: "https://castles.example",
    });
    const publicSummary = summaryForGame(created.gameId, "public");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      now: () => 12_345,
      loadGameSummaries: async () => [
        {
          ...publicSummary,
          livePreview: {
            ...publicSummary.livePreview,
            clock: {
              ...publicSummary.livePreview.clock!,
              serverNow: 99,
            },
            spectatorCount: 99,
          },
        },
      ],
      loadGameSummary: async (gameId: string) =>
        gameId === publicSummary.gameId
          ? {
              ...publicSummary,
              livePreview: {
                ...publicSummary.livePreview,
                clock: {
                  ...publicSummary.livePreview.clock!,
                  serverNow: 99,
                },
                spectatorCount: 99,
              },
            }
          : null,
    });
    servers.push(server);
    const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(socket);
      const spectating = nextSocketMessage(socket, "spectator presence join");
      socket.send(
        JSON.stringify(versionedMessage({ type: "spectate", gameId: created.gameId }))
      );
      await expect(spectating).resolves.toMatchObject({ type: "spectating" });

      const directoryResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`);
      const directoryBody = await directoryResponse.json();
      const summaryResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/games/${created.gameId}/summary`
      );
      const summaryBody = await summaryResponse.json();

      expect(directoryResponse.status).toBe(200);
      expect(summaryResponse.status).toBe(200);
      expect(directoryBody.games[0].livePreview.spectatorCount).toBe(1);
      expect(summaryBody.summary.livePreview.spectatorCount).toBe(1);
      expect(directoryBody.games[0].livePreview.clock.serverNow).toBe(12_345);
      expect(summaryBody.summary.livePreview.clock.serverNow).toBe(12_345);
    } finally {
      socket.close();
    }
  });

  it("strips stale response-only live fields before validating loaded summaries", async () => {
    const archived = {
      ...summaryForGame("game_stale_spectator_count_http", "public"),
      updatedAt: "2026-05-31T12:03:00.000Z",
      endedAt: "2026-05-31T12:03:00.000Z",
      status: "complete" as const,
      archiveState: "archived" as const,
      result: { winner: "w" as const, reason: "resignation" as const },
      livePreview: {
        ...summaryForGame("game_stale_spectator_count_http", "public").livePreview,
        clock: {
          ...summaryForGame("game_stale_spectator_count_http", "public").livePreview.clock!,
          serverNow: 99,
        },
        spectatorCount: 9,
      },
    };
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      loadGameSummaries: async () => [archived],
      loadGameSummary: async (gameId: string) =>
        gameId === archived.gameId ? archived : null,
    });
    servers.push(server);
    const port = await listen(server);

    const directoryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games?state=archived`
    );
    const directoryBody = await directoryResponse.json();
    const summaryResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${archived.gameId}/summary`
    );
    const summaryBody = await summaryResponse.json();

    expect(directoryResponse.status).toBe(200);
    expect(summaryResponse.status).toBe(200);
    expect(directoryBody.games[0].livePreview.spectatorCount).toBeUndefined();
    expect(summaryBody.summary.livePreview.spectatorCount).toBeUndefined();
    expect(directoryBody.games[0].livePreview.clock.serverNow).toBeUndefined();
    expect(summaryBody.summary.livePreview.clock.serverNow).toBeUndefined();
  });

  it("lets an authenticated player publish an unlisted game without exposing bearer tokens", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_publish_http",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const appended: Array<Extract<OnlineGameEvent, { type: "visibility_changed" }>> = [];
    const logs: unknown[] = [];
    let summary = summaryForGame("game_publish_http", "unlisted");
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onLog: (event) => logs.push(event),
      appendGameVisibilityChanged: (event) => {
        appended.push(event);
        summary = {
          ...summary,
          visibility: event.visibility,
          updatedAt: event.createdAt,
          lastEventId: event.eventId,
        };
        return summary;
      },
    });
    servers.push(server);
    const port = await listen(server);
    const created = service.createGame(createClockedSetup(), {
      publicBaseUrl: "https://castles.example",
    });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/visibility`,
      {
        method: "PATCH",
        headers: {
          ...bearer(created.white.token),
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "public" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      summary: {
        gameId: "game_publish_http",
        visibility: "public",
        version: 0,
      },
    });
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: "visibility_changed",
      gameId: "game_publish_http",
      visibility: "public",
    });
    expect(JSON.stringify(body)).not.toContain(created.white.token);
    expect(JSON.stringify(body)).not.toContain(created.black.token);
    expect(JSON.stringify(logs)).not.toContain(created.white.token);
    expect(JSON.stringify(logs)).not.toContain(created.black.token);
  });

  it("rejects private visibility changes until active spectator reauthorization exists", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_private_visibility_http",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const appendGameVisibilityChanged = vi.fn();
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      appendGameVisibilityChanged,
    });
    servers.push(server);
    const port = await listen(server);
    const created = service.createGame(createClockedSetup(), {
      publicBaseUrl: "https://castles.example",
    });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/visibility`,
      {
        method: "PATCH",
        headers: {
          ...bearer(created.white.token),
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "private" }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
    expect(appendGameVisibilityChanged).not.toHaveBeenCalled();
  });

  it("requires player bearer credentials and persistence for visibility changes", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_visibility_auth_http",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);
    const created = service.createGame(createClockedSetup(), {
      publicBaseUrl: "https://castles.example",
    });

    const badTokenResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/visibility`,
      {
        method: "PATCH",
        headers: {
          ...bearer("spectator-or-wrong-token"),
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "public" }),
      }
    );
    const missingPersistenceResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}/visibility`,
      {
        method: "PATCH",
        headers: {
          ...bearer(created.white.token),
          "content-type": "application/json",
        },
        body: JSON.stringify({ visibility: "public" }),
      }
    );

    expect(badTokenResponse.status).toBe(404);
    expect(missingPersistenceResponse.status).toBe(503);
  });

  it("allows HTTP spectator snapshots for unlisted summaries when summaries are configured", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_unlisted_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [summaryForGame("game_unlisted_spectator_http", "unlisted")],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_unlisted_spectator_http/spectator`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      role: "spectator",
      snapshot: { gameId: "game_unlisted_spectator_http", version: 0 },
    });
  });

  it("denies HTTP spectator snapshots for private summaries", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_private_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [summaryForGame("game_private_spectator_http", "private")],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_private_spectator_http/spectator`
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "No online game was found for that id.",
      },
    });
  });

  it("fails closed when configured summaries are missing for HTTP spectator snapshots", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_missing_summary_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_missing_summary_spectator_http/spectator`
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "No online game was found for that id.",
      },
    });
  });

  it("fails closed when configured summaries are invalid for HTTP spectator snapshots", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_invalid_summary_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [
        {
          ...summaryForGame("game_invalid_summary_spectator_http", "unlisted"),
          schemaVersion: 99,
        } as unknown as OnlineGameSummary,
      ],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_invalid_summary_spectator_http/spectator`
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "No online game was found for that id.",
      },
    });
  });

  it("logs summary load failures separately while failing closed for spectator snapshots", async () => {
    const logs: unknown[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_summary_load_failed_spectator_http",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => {
        throw new Error("summary database unavailable");
      },
      onLog: (event) => {
        logs.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/online/games/game_summary_load_failed_spectator_http/spectator`
    );

    expect(response.status).toBe(404);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "online.http.spectate",
          gameId: "game_summary_load_failed_spectator_http",
          role: "spectator",
          status: "rejected",
          reason: "summary_load_failed",
        }),
      ])
    );
  });

  it("allows WebSocket spectator joins for unlisted summaries when summaries are configured", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_unlisted_spectator_ws",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [summaryForGame("game_unlisted_spectator_ws", "unlisted")],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(socket);
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "spectate",
            gameId: "game_unlisted_spectator_ws",
          })
        )
      );
      await expect(nextSocketMessage(socket, "unlisted spectator join")).resolves.toMatchObject({
        type: "spectating",
        snapshot: { gameId: "game_unlisted_spectator_ws", version: 0 },
      });
    } finally {
      socket.close();
    }
  });

  it("denies WebSocket spectator joins for private summaries", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_private_spectator_ws",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [summaryForGame("game_private_spectator_ws", "private")],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(socket);
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "spectate",
            gameId: "game_private_spectator_ws",
          })
        )
      );
      await expect(nextSocketMessage(socket, "private spectator denial")).resolves.toMatchObject({
        type: "error",
        error: { code: "not_found" },
      });
    } finally {
      socket.close();
    }
  });

  it("fails closed when configured summaries are missing for WebSocket spectator joins", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_missing_summary_spectator_ws",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(socket);
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "spectate",
            gameId: "game_missing_summary_spectator_ws",
          })
        )
      );
      await expect(nextSocketMessage(socket, "missing summary spectator denial")).resolves.toMatchObject({
        type: "error",
        error: { code: "not_found" },
      });
    } finally {
      socket.close();
    }
  });

  it("fails closed when configured summaries are invalid for WebSocket spectator joins", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_invalid_summary_spectator_ws",
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      loadGameSummaries: () => [
        {
          ...summaryForGame("game_invalid_summary_spectator_ws", "unlisted"),
          schemaVersion: 99,
        } as unknown as OnlineGameSummary,
      ],
    });
    servers.push(server);
    const port = await listen(server);
    service.createGame(createClockedSetup(), { publicBaseUrl: "https://castles.example" });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await waitForSocketOpen(socket);
      socket.send(
        JSON.stringify(
          versionedMessage({
            type: "spectate",
            gameId: "game_invalid_summary_spectator_ws",
          })
        )
      );
      await expect(nextSocketMessage(socket, "invalid summary spectator denial")).resolves.toMatchObject({
        type: "error",
        error: { code: "not_found" },
      });
    } finally {
      socket.close();
    }
  });

  it("logs structured create and join events without leaking player tokens", async () => {
    const logs: unknown[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_log_redaction",
      tokenFactory: (seat) => `${seat}-secret-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onLog: (event) => {
        logs.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket, "logged join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });
    } finally {
      socket.close();
    }

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "online.game.create",
          gameId: "game_log_redaction",
          status: "accepted",
        }),
        expect.objectContaining({
          event: "online.socket.join",
          gameId: "game_log_redaction",
          role: "player",
          status: "accepted",
        }),
      ])
    );
    expect(JSON.stringify(logs)).not.toContain("secret-token");
  });

  it("logs rejected action attempts with gameId role action and status fields", async () => {
    const logs: unknown[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_log_action_rejected",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onLog: (event) => {
        logs.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket, "logged action join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-log-reject",
          action: { type: "PASS", baseVersion: 99 },
        }))
      );
      await expect(nextSocketMessage(socket, "logged action rejection")).resolves.toMatchObject({
        type: "rejected",
        clientActionId: "client-action-log-reject",
        error: { code: "stale_action" },
      });
    } finally {
      socket.close();
    }

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "online.action",
          gameId: "game_log_action_rejected",
          role: "player",
          action: "PASS",
          status: "rejected",
          reason: "stale_action",
        }),
      ])
    );
  });

  it("keeps logging hook failures from changing create-game behavior", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_log_hook_failure",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onLog: () => {
        throw new Error("log sink unavailable");
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });

    expect(createResponse.status).toBe(201);
    expect(consoleError).toHaveBeenCalledWith(
      "Online server log hook failed",
      expect.any(Error)
    );
  });

  it("does not include malformed HTTP join ids in structured logs", async () => {
    const logs: unknown[] = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      onLog: (event) => {
        logs.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);
    const malformedGameId = "g".repeat(129);

    const response = await fetch(`http://127.0.0.1:${port}/api/online/games/${malformedGameId}`, {
      headers: { authorization: "Bearer bad-token" },
    });

    expect(response.status).toBe(400);
    expect(logs).toEqual([
      expect.objectContaining({
        event: "online.http.join",
        role: "player",
        status: "rejected",
        reason: "bad_request",
      }),
    ]);
    expect(JSON.stringify(logs)).not.toContain(malformedGameId);
    expect(JSON.stringify(logs)).not.toContain("bad-token");
  });

  it("adds the default online clock when a create request omits time control", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);

    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const snapshotBody = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotBody.snapshot.setup.timeControl).toEqual({ initial: 20, increment: 20 });
    expect(snapshotBody.snapshot.setup.ratingMode).toBe("casual");
    expect(snapshotBody.snapshot.clock).toMatchObject({
      timeControl: { initialMs: 1_200_000, incrementMs: 20_000 },
      activeColor: "w",
    });
    expect(snapshotBody.snapshot.clock.remainingMs.w).toBeGreaterThan(1_199_000);
    expect(snapshotBody.snapshot.clock.remainingMs.b).toBe(1_200_000);
  });

  it("preserves rated setup mode when creating a direct online game", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: { ...createSetup(), ratingMode: "rated" } }),
    });
    const created = await createResponse.json();
    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const snapshotBody = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotBody.snapshot.setup.ratingMode).toBe("rated");
  });

  it("rejects structurally invalid setup data with a 400", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);
    const setup = createSetup();
    setup.pieces[0] = {
      ...setup.pieces[0],
      hex: { q: 1, r: 1, s: 1 },
    };

    const response = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("waits for event persistence before returning a created game", async () => {
    let releasePersistence!: () => void;
    const persisted = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      onGameEvent: () => persisted,
    });
    servers.push(server);
    const port = await listen(server);

    const responsePromise = fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });

    await expect(
      Promise.race([responsePromise.then(() => "responded"), delay(25).then(() => "pending")])
    ).resolves.toBe("pending");

    releasePersistence();

    const response = await responsePromise;
    expect(response.status).toBe(201);
  });

  it("supports websocket heartbeats for reconnect health checks", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    const pong = new Promise<unknown>((resolve, reject) => {
      socket.on("open", () => {
        socket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 123 })));
      });
      socket.on("message", (data) => resolve(JSON.parse(data.toString("utf8"))));
      socket.on("error", reject);
    });

    await expect(pong).resolves.toMatchObject({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: "pong",
      clientTime: 123,
    });

    socket.close();
  });

  it("rejects websocket messages without the supported protocol version", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);
    const unversionedSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const wrongVersionSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      await Promise.all([
        waitForSocketOpen(unversionedSocket),
        waitForSocketOpen(wrongVersionSocket),
      ]);

      unversionedSocket.send(JSON.stringify({ type: "ping", clientTime: 1 }));
      wrongVersionSocket.send(
        JSON.stringify({
          protocolVersion: ONLINE_PROTOCOL_VERSION + 1,
          type: "ping",
          clientTime: 2,
        })
      );

      await expect(
        nextSocketMessage(unversionedSocket, "unversioned websocket rejection")
      ).resolves.toMatchObject({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "error",
        error: { code: "bad_request" },
      });
      await expect(
        nextSocketMessage(wrongVersionSocket, "wrong-version websocket rejection")
      ).resolves.toMatchObject({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "error",
        error: { code: "bad_request" },
      });
    } finally {
      unversionedSocket.close();
      wrongVersionSocket.close();
    }
  });

  it("allows websocket spectators to watch broadcasts but not submit actions", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_spectator_ws",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const spectatorSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let whiteSocket: WebSocket | undefined;

    try {
      spectatorSocket.on("open", () => {
        spectatorSocket.send(
          JSON.stringify(versionedMessage({ type: "spectate", gameId: created.gameId }))
        );
      });
      await expect(nextSocketMessage(spectatorSocket, "spectator join")).resolves.toMatchObject({
        type: "spectating",
        snapshot: { version: 0 },
      });

      spectatorSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-spectator",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(spectatorSocket, "spectator action rejection")).resolves.toMatchObject({
        type: "error",
        error: { code: "not_joined" },
      });

      const playerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      whiteSocket = playerSocket;
      playerSocket.on("open", () => {
        playerSocket.send(
          JSON.stringify(
            versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
          )
        );
      });
      await expect(nextSocketMessage(playerSocket, "white join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      const spectatorSnapshot = nextSocketMessage(spectatorSocket, "spectator broadcast");
      playerSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-spectator-broadcast",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );

      await expect(nextSocketMessage(playerSocket, "white action broadcast")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });
      await expect(spectatorSnapshot).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });
    } finally {
      spectatorSocket.close();
      whiteSocket?.close();
    }
  });

  it("broadcasts an out-of-turn resignation result to both players", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_resign_broadcast",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const blackSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    try {
      whiteSocket.on("open", () => {
        whiteSocket.send(
          JSON.stringify(
            versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
          )
        );
      });
      blackSocket.on("open", () => {
        blackSocket.send(
          JSON.stringify(
            versionedMessage({ type: "join", gameId: created.gameId, token: created.black.token })
          )
        );
      });

      await expect(nextSocketMessage(whiteSocket, "white join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });
      await expect(nextSocketMessage(blackSocket, "black join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      const whiteBroadcast = nextSocketMessage(whiteSocket, "white resignation broadcast");
      const blackBroadcast = nextSocketMessage(blackSocket, "black resignation broadcast");

      blackSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-resign-broadcast",
          action: { type: "RESIGN", baseVersion: 0 },
        }))
      );

      await expect(whiteBroadcast).resolves.toMatchObject({
        type: "snapshot",
        snapshot: {
          version: 1,
          result: { winner: "w", reason: "resignation" },
        },
      });
      await expect(blackBroadcast).resolves.toMatchObject({
        type: "snapshot",
        snapshot: {
          version: 1,
          result: { winner: "w", reason: "resignation" },
        },
      });

      const snapshotResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
        { headers: { authorization: `Bearer ${created.white.token}` } }
      );
      await expect(snapshotResponse.json()).resolves.toMatchObject({
        snapshot: {
          version: 1,
          result: { winner: "w", reason: "resignation" },
        },
      });
    } finally {
      whiteSocket.close();
      blackSocket.close();
    }
  });

  it("rate limits websocket messages by forwarded client address behind the proxy", async () => {
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
    });
    servers.push(server);
    const port = await listen(server);
    const limitedSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.20" },
    });
    const sameRealClientSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-forwarded-for": "203.0.113.20" },
    });
    const otherClientSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-forwarded-for": "203.0.113.21" },
    });
    const spoofedOnlySocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { "x-forwarded-for": "198.51.100.99" },
    });

    try {
      await Promise.all([
        waitForSocketOpen(limitedSocket),
        waitForSocketOpen(sameRealClientSocket),
        waitForSocketOpen(otherClientSocket),
        waitForSocketOpen(spoofedOnlySocket),
      ]);

      for (let i = 0; i < 120; i += 1) {
        limitedSocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: i })));
        await expect(nextSocketMessage(limitedSocket, `limited ping ${i}`)).resolves.toMatchObject({
          type: "pong",
          clientTime: i,
        });
      }

      limitedSocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 120 })));
      await expect(nextSocketMessage(limitedSocket, "limited websocket rate limit")).resolves.toMatchObject({
        type: "error",
        error: { code: "rate_limited" },
      });

      sameRealClientSocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 1 })));
      await expect(nextSocketMessage(sameRealClientSocket, "same real client rate limit")).resolves.toMatchObject({
        type: "error",
        error: { code: "rate_limited" },
      });

      otherClientSocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 1 })));
      await expect(nextSocketMessage(otherClientSocket, "other client ping")).resolves.toMatchObject({
        type: "pong",
        clientTime: 1,
      });

      spoofedOnlySocket.send(JSON.stringify(versionedMessage({ type: "ping", clientTime: 1 })));
      await expect(nextSocketMessage(spoofedOnlySocket, "spoofed-only client ping")).resolves.toMatchObject({
        type: "pong",
        clientTime: 1,
      });
    } finally {
      limitedSocket.close();
      sameRealClientSocket.close();
      otherClientSocket.close();
      spoofedOnlySocket.close();
    }
  });

  it("rolls back an accepted websocket action when persistence fails", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_rollback",
      tokenFactory: (seat) => `${seat}-token`,
    });
    let persistCount = 0;
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: () => {
        persistCount += 1;
        if (persistCount > 1) {
          throw new Error("disk unavailable");
        }
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-persistence-failure",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );

      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "error",
        error: { code: "persistence_failed" },
        snapshot: { version: 0 },
      });

      const snapshotResponse = await fetch(
        `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
        { headers: { authorization: `Bearer ${created.white.token}` } }
      );
      const body = await snapshotResponse.json();
      expect(body.snapshot.version).toBe(0);
    } finally {
      socket.close();
    }
  });

  it("persists created games and accepted websocket actions as append-only events", async () => {
    const events: OnlineGameEvent[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_events",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        events.push(event);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "game_created",
      gameId: "game_events",
    });
    expect(JSON.stringify(events[0])).not.toContain("w-token");
    expect(JSON.stringify(events[0])).not.toContain("b-token");

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-events",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );

      await expect(nextSocketMessage(socket)).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });
      expect(events).toHaveLength(2);
      expect(events[1]).toMatchObject({
        schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
        eventId: expect.any(String),
        createdAt: expect.any(String),
        rulesetVersion: "castles-beta-v1",
        type: "action_accepted",
        gameId: "game_events",
        playerColor: "w",
        clientActionId: "client-action-events",
        version: 1,
        action: { type: "PASS", baseVersion: 0 },
      });
    } finally {
      socket.close();
    }
  });

  it("persists game creation as a token-free event with separate credential hashes", async () => {
    const events: OnlineGameEvent[] = [];
    const credentials: Array<{ whiteCredential: string; blackCredential: string }> = [];
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      onGameCreated: (event, eventCredentials) => {
        events.push(event);
        credentials.push(eventCredentials);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "game_created",
      gameId: created.gameId,
    });
    expect(JSON.stringify(events[0])).not.toContain(created.white.token);
    expect(JSON.stringify(events[0])).not.toContain(created.black.token);
    expect(credentials).toHaveLength(1);
    expect(credentials[0].whiteCredential).not.toContain(created.white.token);
    expect(credentials[0].blackCredential).not.toContain(created.black.token);
    expect(verifyOnlineToken(created.white.token, credentials[0].whiteCredential)).toBe(true);
    expect(verifyOnlineToken(created.black.token, credentials[0].blackCredential)).toBe(true);
  });

  it("rejects created-game persistence when an injected service supplies non-hash credentials", async () => {
    const onGameCreated = vi.fn();
    const service = new OnlineGameService({
      idFactory: () => "game_raw_credentials",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameCreated,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const body = await createResponse.json();

    expect(createResponse.status).toBe(503);
    expect(body.error).toMatchObject({ code: "persistence_failed" });
    expect(onGameCreated).not.toHaveBeenCalled();
    expect(service.getRoom("game_raw_credentials")).toBeNull();
  });

  it("uses the canonical store action result when local room state is stale", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_canonical_action",
      tokenFactory: (seat) => `${seat}-token`,
    });
    let applyCalls = 0;
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      applyGameAction: async (input) => {
        applyCalls += 1;
        expect(input).toMatchObject({
          gameId: "game_canonical_action",
          token: "w-token",
          clientActionId: "client-action-canonical",
          action: { type: "RESIGN", baseVersion: 1 },
        });
        const localRecord = service.getRoom(input.gameId)?.toRecord();
        if (!localRecord) {
          throw new Error("Expected local room record.");
        }
        const canonicalRoom = OnlineGameRoom.create(localRecord);
        canonicalRoom.submitAction(input.token, { type: "PASS", baseVersion: 0 }, "client-action-canonical-prior");
        const actionResult = canonicalRoom.submitAction(
          input.token,
          input.action,
          input.clientActionId
        );
        if (!actionResult.ok) {
          throw new Error(actionResult.error.message);
        }
        const accepted = canonicalRoom.toRecord().acceptedActions.at(-1)!;
        return {
          ok: true,
          event: createOnlineActionAcceptedEvent({
            type: "action_accepted",
            gameId: input.gameId,
            playerColor: accepted.playerColor,
            clientActionId: accepted.clientActionId,
            version: actionResult.snapshot.version,
            playedAt: accepted.playedAt,
            action: accepted.action,
            clock: accepted.clock,
          }),
          playerColor: accepted.playerColor,
          room: canonicalRoom.toRecord(),
          snapshot: actionResult.snapshot,
        };
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.on("open", () => {
      socket.send(
        JSON.stringify(versionedMessage({
          type: "join",
          gameId: created.gameId,
          token: created.white.token,
        }))
      );
    });

    try {
      await expect(nextSocketMessage(socket, "canonical action join")).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      socket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-canonical",
          action: { type: "RESIGN", baseVersion: 1 },
        }))
      );

      await expect(nextSocketMessage(socket, "canonical action result")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: {
          version: 2,
          result: { winner: "b", reason: "resignation" },
        },
      });
      expect(applyCalls).toBe(1);
      expect(service.getRoom(created.gameId)?.getSnapshot()).toMatchObject({ version: 2 });
    } finally {
      socket.close();
    }
  });

  it("serializes action handling so later messages wait for prior persistence", async () => {
    let releaseFirstAction!: () => void;
    let firstActionReleased = false;
    const firstActionPersisted = new Promise<void>((resolve) => {
      releaseFirstAction = () => {
        if (firstActionReleased) return;
        firstActionReleased = true;
        resolve();
      };
    });
    const persistedActionVersions: number[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_serialized",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type !== "action_accepted") return;
        persistedActionVersions.push(event.version);
        if (event.version === 1) {
          return firstActionPersisted;
        }
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      const whiteMessages: any[] = [];
      whiteSocket.on("message", (data) => {
        whiteMessages.push(JSON.parse(data.toString("utf8")));
      });

      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-serialized-1",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-serialized-2",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );

      await delay(25);
      expect(persistedActionVersions).toEqual([1]);
      expect(whiteMessages).toEqual([]);

      releaseFirstAction();

      await waitForCondition(
        () => whiteMessages.length >= 2,
        "the queued second action to be handled after persistence",
        () =>
          `persisted=${JSON.stringify(persistedActionVersions)} whiteMessages=${JSON.stringify(
            whiteMessages.map((message) => ({
              type: message.type,
              error: message.error,
              version: message.snapshot?.version,
            }))
          )}`
      );
      expect(whiteMessages[0]).toMatchObject({ type: "snapshot", snapshot: { version: 1 } });
      expect(whiteMessages[1]).toMatchObject({
        type: "rejected",
        clientActionId: "client-action-serialized-2",
        error: { code: "stale_action" },
        snapshot: { version: 1 },
      });
      expect(persistedActionVersions).toEqual([1]);
    } finally {
      releaseFirstAction();
      whiteSocket.close();
    }
  });

  it("treats queued duplicate action ids as harmless retries in the in-memory path", async () => {
    const persistedClientActionIds: string[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_duplicate_retry",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type !== "action_accepted") return;
        persistedClientActionIds.push(event.clientActionId);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      const whiteMessages: any[] = [];
      whiteSocket.on("message", (data) => {
        whiteMessages.push(JSON.parse(data.toString("utf8")));
      });

      const message = {
        type: "action",
        clientActionId: "client-action-duplicate",
        action: { type: "PASS", baseVersion: 0 },
      };
      whiteSocket.send(JSON.stringify(versionedMessage(message)));
      whiteSocket.send(JSON.stringify(versionedMessage(message)));

      await waitForCondition(
        () => whiteMessages.length >= 2,
        "both duplicate action messages to receive canonical snapshots"
      );
      expect(whiteMessages[0]).toMatchObject({ type: "snapshot", snapshot: { version: 1 } });
      expect(whiteMessages[1]).toMatchObject({ type: "snapshot", snapshot: { version: 1 } });
      expect(persistedClientActionIds).toEqual(["client-action-duplicate"]);
    } finally {
      whiteSocket.close();
    }
  });

  it("rejects same-id different-action retries in the in-memory websocket path", async () => {
    const persistedClientActionIds: string[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_duplicate_conflict",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type !== "action_accepted") return;
        persistedClientActionIds.push(event.clientActionId);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "first duplicate-conflict action")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });

      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict",
          action: { type: "RESIGN", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "same-id changed action rejection")).resolves.toMatchObject({
        type: "rejected",
        clientActionId: "client-action-conflict",
        error: { code: "duplicate_action" },
        snapshot: { version: 1 },
      });
      expect(persistedClientActionIds).toEqual(["client-action-conflict"]);
    } finally {
      whiteSocket.close();
    }
  });

  it("adjudicates timeout before returning an exact duplicate action retry", async () => {
    let now = 0;
    const persistedEvents: string[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_duplicate_timeout",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      now: () => now,
      onGameEvent: (event) => {
        persistedEvents.push(event.type);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      now = 1_000;
      const duplicateMessage = {
        type: "action",
        clientActionId: "client-action-duplicate-timeout",
        action: { type: "PASS", baseVersion: 0 },
      };
      whiteSocket.send(JSON.stringify(versionedMessage(duplicateMessage)));
      await expect(nextSocketMessage(whiteSocket, "first action before timeout")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });

      now = 120_000;
      whiteSocket.send(JSON.stringify(versionedMessage(duplicateMessage)));
      await expect(nextSocketMessage(whiteSocket, "duplicate retry timeout snapshot")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: {
          version: 2,
          result: { reason: "timeout" },
        },
      });
      expect(persistedEvents).toEqual([
        "game_created",
        "action_accepted",
        "timeout_adjudicated",
      ]);
    } finally {
      whiteSocket.close();
    }
  });

  it("adjudicates timeout before rejecting a conflicting duplicate action id", async () => {
    let now = 0;
    const persistedEvents: string[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_duplicate_conflict_timeout",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      now: () => now,
      onGameEvent: (event) => {
        persistedEvents.push(event.type);
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      now = 1_000;
      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict-timeout",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "first conflict-timeout action")).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { version: 1 },
      });

      now = 120_000;
      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict-timeout",
          action: { type: "RESIGN", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "conflicting duplicate timeout rejection")).resolves.toMatchObject({
        type: "rejected",
        clientActionId: "client-action-conflict-timeout",
        error: { code: "game_over" },
        snapshot: {
          version: 2,
          result: { reason: "timeout" },
        },
      });
      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-conflict-timeout",
          action: { type: "RESIGN", baseVersion: 0 },
        }))
      );
      await expect(nextSocketMessage(whiteSocket, "repeated conflict after timeout")).resolves.toMatchObject({
        type: "rejected",
        clientActionId: "client-action-conflict-timeout",
        error: { code: "game_over" },
        snapshot: {
          version: 2,
          result: { reason: "timeout" },
        },
      });
      expect(persistedEvents).toEqual([
        "game_created",
        "action_accepted",
        "timeout_adjudicated",
      ]);
    } finally {
      whiteSocket.close();
    }
  });

  it("waits for pending action persistence before serving joins and snapshots", async () => {
    let releaseAction!: () => void;
    let actionReleased = false;
    const actionPersisted = new Promise<void>((resolve) => {
      releaseAction = () => {
        if (actionReleased) return;
        actionReleased = true;
        resolve();
      };
    });
    const persistedActionVersions: number[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_pending_reads",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type !== "action_accepted") return;
        persistedActionVersions.push(event.version);
        return actionPersisted;
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createSetup() }),
    });
    const created = await createResponse.json();
    const whiteSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const whiteJoined = nextSocketMessage(whiteSocket);

    whiteSocket.on("open", () => {
      whiteSocket.send(
        JSON.stringify(
          versionedMessage({ type: "join", gameId: created.gameId, token: created.white.token })
        )
      );
    });

    let blackSocket: WebSocket | undefined;
    try {
      await expect(whiteJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 0 },
      });

      whiteSocket.send(
        JSON.stringify(versionedMessage({
          type: "action",
          clientActionId: "client-action-pending-read",
          action: { type: "PASS", baseVersion: 0 },
        }))
      );
      await waitForCondition(
        () => persistedActionVersions.length === 1,
        "the first action to reach persistence"
      );

      const readPromise = fetch(`http://127.0.0.1:${port}/api/online/games/${created.gameId}`, {
        headers: { authorization: `Bearer ${created.white.token}` },
      }).then(async (response) => response.json());

      const pendingBlackSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      blackSocket = pendingBlackSocket;
      const blackJoined = nextSocketMessage(pendingBlackSocket);
      pendingBlackSocket.on("open", () => {
        pendingBlackSocket.send(
          JSON.stringify(
            versionedMessage({ type: "join", gameId: created.gameId, token: created.black.token })
          )
        );
      });

      await expect(
        Promise.race([readPromise.then(() => "responded"), delay(25).then(() => "pending")])
      ).resolves.toBe("pending");
      await expect(
        Promise.race([blackJoined.then(() => "joined"), delay(25).then(() => "pending")])
      ).resolves.toBe("pending");

      releaseAction();

      await expect(readPromise).resolves.toMatchObject({
        snapshot: { version: 1 },
      });
      await expect(blackJoined).resolves.toMatchObject({
        type: "joined",
        snapshot: { version: 1 },
      });
    } finally {
      releaseAction();
      whiteSocket.close();
      blackSocket?.close();
    }
  });

  it("persists timeout adjudication before serving an expired snapshot", async () => {
    let now = 0;
    const events: OnlineGameEvent[] = [];
    const service = new OnlineGameService({
      idFactory: () => "game_timeout_http",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        events.push(event);
      },
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    now = 61_000;
    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const body = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(200);
    expect(body.snapshot).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
      clock: {
        remainingMs: { w: 0, b: 60_000 },
        activeColor: null,
      },
    });
    expect(events.map((event) => event.type)).toEqual([
      "game_created",
      "timeout_adjudicated",
    ]);
  });

  it("uses the canonical store timeout result before serving player snapshots", async () => {
    let now = 0;
    const service = new OnlineGameService({
      idFactory: () => "game_canonical_timeout",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    let timeoutCalls = 0;
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      now: () => now,
      adjudicateGameTimeout: async (input) => {
        timeoutCalls += 1;
        expect(input).toMatchObject({ gameId: "game_canonical_timeout" });
        const localRecord = service.getRoom(input.gameId)?.toRecord();
        if (!localRecord) {
          throw new Error("Expected local room record.");
        }
        const canonicalRoom = OnlineGameRoom.create({
          ...localRecord,
          now: () => 61_000,
        });
        const timeout = canonicalRoom.adjudicateTimeout();
        if (!timeout) {
          throw new Error("Expected canonical timeout.");
        }
        return {
          ok: true,
          event: {
            schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
            eventId: "evt-canonical-timeout",
            createdAt: "2026-05-31T12:00:01.000Z",
            rulesetVersion: "castles-beta-v1",
            type: "timeout_adjudicated",
            gameId: input.gameId,
            playerColor: timeout.playerColor,
            version: timeout.version,
            adjudicatedAt: timeout.adjudicatedAt,
            result: timeout.result,
            clock: timeout.clock,
          },
          room: canonicalRoom.toRecord(),
          snapshot: canonicalRoom.getSnapshot(),
        };
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const body = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(200);
    expect(timeoutCalls).toBe(1);
    expect(body.snapshot).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
    expect(service.getRoom(created.gameId)?.getSnapshot()).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
  });

  it("does not return a stale local snapshot when canonical timeout lookup rejects", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_canonical_timeout_missing",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      adjudicateGameTimeout: async () => ({
        ok: false,
        error: {
          code: "not_found",
          message: "Canonical game was not found.",
        },
      }),
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const body = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "Canonical game was not found.",
      },
    });
  });

  it("rejects player snapshots when the canonical room no longer authenticates the token", async () => {
    const service = new OnlineGameService({
      idFactory: () => "game_canonical_token_mismatch",
      tokenFactory: (seat) => `${seat}-token`,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      adjudicateGameTimeout: async (input) => {
        const localRecord = service.getRoom(input.gameId)?.toRecord();
        if (!localRecord) {
          throw new Error("Expected local room record.");
        }
        return {
          ok: true,
          room: {
            ...localRecord,
            whiteCredential: "canonical-white-token",
          },
          snapshot: OnlineGameRoom.create({
            ...localRecord,
            whiteCredential: "canonical-white-token",
          }).getSnapshot(),
        };
      },
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );
    const body = await snapshotResponse.json();

    expect(snapshotResponse.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "not_found",
        message: "No online game was found for that id and token.",
      },
    });
  });

  it("rolls back timeout adjudication when timeout persistence fails", async () => {
    let now = 0;
    const service = new OnlineGameService({
      idFactory: () => "game_timeout_rollback",
      tokenFactory: (seat) => `${seat}-token`,
      now: () => now,
    });
    const { server } = createOnlineHttpServer({
      publicBaseUrl: "https://castles.example",
      service,
      onGameEvent: (event) => {
        if (event.type === "timeout_adjudicated") {
          throw new Error("disk unavailable");
        }
      },
      now: () => now,
    });
    servers.push(server);
    const port = await listen(server);

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/online/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setup: createClockedSetup() }),
    });
    const created = await createResponse.json();

    now = 61_000;
    const snapshotResponse = await fetch(
      `http://127.0.0.1:${port}/api/online/games/${created.gameId}`,
      { headers: { authorization: `Bearer ${created.white.token}` } }
    );

    expect(snapshotResponse.status).toBe(503);
    expect(service.getRoom(created.gameId)?.getSnapshot()).toMatchObject({
      version: 0,
      result: undefined,
      clock: {
        remainingMs: { w: 60_000, b: 60_000 },
        activeColor: "w",
      },
    });
  });
});
