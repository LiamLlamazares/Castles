import { describe, expect, it } from "vitest";
import { getStartingBoard, getStartingPieces } from "../../../ConstantImports";
import { SanctuaryGenerator } from "../../../Classes/Systems/SanctuaryGenerator";
import { PieceType, SanctuaryType } from "../../../Constants";
import { serializeOnlineGameSetup } from "../../serialization";
import { PostgresOnlineGameStore } from "../PostgresOnlineGameStore";
import { ONLINE_MAX_ADDITIONAL_SEAT_CREDENTIALS, OnlineGameRoom } from "../../OnlineGameRoom";
import { ONLINE_EVENT_SCHEMA_VERSION, ONLINE_RULESET_VERSION, type OnlineGameEvent } from "../../events";
import {
  ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
  onlineGameSummaryDirectorySearchText,
  type OnlineGameSummary,
} from "../../readModel";
import { hashOnlineToken } from "../onlineTokenCredentials";
import {
  ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
  createChallengeAcceptedEvent,
  createChallengeCancelledEvent,
  createChallengeCreatedEvent,
  type OnlineChallengeEvent,
} from "../../challenges";
import {
  createOpenSeekCreatedEvent,
  createOpenSeekCancelledEvent,
  type OpenSeekEvent,
} from "../../seeks";

class FakePostgresClient {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  eventRows: Array<{ payload: OnlineGameEvent }> = [];
  challengeEventRows: Array<{ payload: OnlineChallengeEvent }> = [];
  seekEventRows: Array<{ payload: OpenSeekEvent }> = [];
  credentialRows: Array<{ gameId: string; seat: "w" | "b"; tokenHash: string }> = [];
  additionalCredentialRows: Array<{ gameId: string; seat: "w" | "b"; tokenHash: string }> = [];
  challengeCredentialRows: Array<{
    challengeId: string;
    role: "challenger" | "challenged";
    tokenHash: string;
    identity: unknown;
  }> = [];
  seekCredentialRows: Array<{ seekId: string; tokenHash: string; identity: unknown }> = [];
  summaryRows: Array<{ payload: unknown }> = [];
  challengeSummaryRows: Array<{ payload: unknown }> = [];
  seekSummaryRows: Array<{ payload: unknown }> = [];
  failNextCreateTable = false;
  failNextSummaryInsert = false;
  failNextChallengeCredentialInsert = false;
  failNextChallengeSummaryInsert = false;
  failNextSeekSummaryInsert = false;
  failRollback = false;
  private transactionSnapshot: {
    eventRows: Array<{ payload: OnlineGameEvent }>;
    challengeEventRows: Array<{ payload: OnlineChallengeEvent }>;
    credentialRows: Array<{ gameId: string; seat: "w" | "b"; tokenHash: string }>;
    additionalCredentialRows: Array<{ gameId: string; seat: "w" | "b"; tokenHash: string }>;
    challengeCredentialRows: Array<{
      challengeId: string;
      role: "challenger" | "challenged";
      tokenHash: string;
      identity: unknown;
    }>;
    seekEventRows: Array<{ payload: OpenSeekEvent }>;
    seekCredentialRows: Array<{ seekId: string; tokenHash: string; identity: unknown }>;
    summaryRows: Array<{ payload: unknown }>;
    challengeSummaryRows: Array<{ payload: unknown }>;
    seekSummaryRows: Array<{ payload: unknown }>;
  } | null = null;

  async query(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    if (/^\s*begin\s*$/i.test(text)) {
      this.transactionSnapshot = {
        eventRows: this.eventRows.map((row) => ({ payload: row.payload })),
        challengeEventRows: this.challengeEventRows.map((row) => ({ payload: row.payload })),
        seekEventRows: this.seekEventRows.map((row) => ({ payload: row.payload })),
        credentialRows: this.credentialRows.map((row) => ({ ...row })),
        additionalCredentialRows: this.additionalCredentialRows.map((row) => ({ ...row })),
        challengeCredentialRows: this.challengeCredentialRows.map((row) => ({ ...row })),
        seekCredentialRows: this.seekCredentialRows.map((row) => ({ ...row })),
        summaryRows: this.summaryRows.map((row) => ({ payload: row.payload })),
        challengeSummaryRows: this.challengeSummaryRows.map((row) => ({ payload: row.payload })),
        seekSummaryRows: this.seekSummaryRows.map((row) => ({ payload: row.payload })),
      };
      return { rows: [] };
    }
    if (/^\s*commit\s*$/i.test(text)) {
      this.transactionSnapshot = null;
      return { rows: [] };
    }
    if (/^\s*rollback\s*$/i.test(text)) {
      if (this.failRollback) {
        throw new Error("rollback unavailable");
      }
      if (this.transactionSnapshot) {
        this.eventRows = this.transactionSnapshot.eventRows.map((row) => ({ payload: row.payload }));
        this.challengeEventRows = this.transactionSnapshot.challengeEventRows.map((row) => ({ payload: row.payload }));
        this.seekEventRows = this.transactionSnapshot.seekEventRows.map((row) => ({ payload: row.payload }));
        this.credentialRows = this.transactionSnapshot.credentialRows.map((row) => ({ ...row }));
        this.additionalCredentialRows = this.transactionSnapshot.additionalCredentialRows.map((row) => ({ ...row }));
        this.challengeCredentialRows = this.transactionSnapshot.challengeCredentialRows.map((row) => ({ ...row }));
        this.seekCredentialRows = this.transactionSnapshot.seekCredentialRows.map((row) => ({ ...row }));
        this.summaryRows = this.transactionSnapshot.summaryRows.map((row) => ({ payload: row.payload }));
        this.challengeSummaryRows = this.transactionSnapshot.challengeSummaryRows.map((row) => ({ payload: row.payload }));
        this.seekSummaryRows = this.transactionSnapshot.seekSummaryRows.map((row) => ({ payload: row.payload }));
        this.transactionSnapshot = null;
      }
      return { rows: [] };
    }
    if (/pg_advisory_xact_lock/i.test(text)) {
      return { rows: [] };
    }
    if (this.failNextCreateTable && /create table if not exists online_game_events/i.test(text)) {
      this.failNextCreateTable = false;
      throw new Error("temporary schema failure");
    }
    if (/insert into online_game_events/i.test(text) && values?.[5]) {
      this.eventRows.push({ payload: values[5] as OnlineGameEvent });
    }
    if (/insert into online_challenge_events/i.test(text) && values?.[4]) {
      const event = values[4] as OnlineChallengeEvent;
      if (this.challengeEventRows.some((row) => row.payload.eventId === event.eventId)) {
        throw new Error("duplicate challenge event id");
      }
      if (
        event.type === "challenge_created" &&
        this.challengeEventRows.some(
          (row) => row.payload.type === "challenge_created" && row.payload.challengeId === event.challengeId
        )
      ) {
        throw new Error("duplicate challenge creation");
      }
      this.challengeEventRows.push({ payload: event });
    }
    if (/insert into online_seek_events/i.test(text) && values?.[4]) {
      const event = values[4] as OpenSeekEvent;
      if (this.seekEventRows.some((row) => row.payload.eventId === event.eventId)) {
        throw new Error("duplicate seek event id");
      }
      if (
        event.type === "seek_created" &&
        this.seekEventRows.some(
          (row) => row.payload.type === "seek_created" && row.payload.seekId === event.seekId
        )
      ) {
        throw new Error("duplicate seek creation");
      }
      this.seekEventRows.push({ payload: event });
    }
    if (/insert into online_game_credentials/i.test(text) && values) {
      const gameId = values[0] as string;
      const rows = [
        { gameId, seat: values[1] as "w" | "b", tokenHash: values[2] as string },
        { gameId, seat: values[3] as "w" | "b", tokenHash: values[4] as string },
      ];
      for (const credential of rows) {
        this.credentialRows = this.credentialRows.filter(
          (row) => !(row.gameId === credential.gameId && row.seat === credential.seat)
        );
        this.credentialRows.push(credential);
      }
    }
    if (/insert into online_game_additional_credentials/i.test(text) && values) {
      const credential = {
        gameId: values[0] as string,
        seat: values[1] as "w" | "b",
        tokenHash: values[2] as string,
      };
      if (
        !this.additionalCredentialRows.some(
          (row) =>
            row.gameId === credential.gameId &&
            row.seat === credential.seat &&
            row.tokenHash === credential.tokenHash
        )
      ) {
        this.additionalCredentialRows.push(credential);
      }
    }
    if (/delete from online_game_additional_credentials/i.test(text) && values) {
      if (values.length === 1) {
        const [maxRows] = values as [number];
        const grouped = new Map<string, Array<{ gameId: string; seat: "w" | "b"; tokenHash: string }>>();
        for (const row of this.additionalCredentialRows) {
          const key = `${row.gameId}:${row.seat}`;
          grouped.set(key, [...(grouped.get(key) ?? []), row]);
        }
        const keep = new Set<string>();
        for (const rows of grouped.values()) {
          for (const row of rows.slice(-maxRows)) {
            keep.add(`${row.gameId}:${row.seat}:${row.tokenHash}`);
          }
        }
        this.additionalCredentialRows = this.additionalCredentialRows.filter((row) =>
          keep.has(`${row.gameId}:${row.seat}:${row.tokenHash}`)
        );
        return { rows: [] };
      }
      const [gameId, seat, maxRows] = values as [string, "w" | "b", number];
      const matching = this.additionalCredentialRows.filter(
        (row) => row.gameId === gameId && row.seat === seat
      );
      const keep = new Set(matching.slice(-maxRows).map((row) => row.tokenHash));
      this.additionalCredentialRows = this.additionalCredentialRows.filter(
        (row) => row.gameId !== gameId || row.seat !== seat || keep.has(row.tokenHash)
      );
      return { rows: [] };
    }
    if (/insert into online_challenge_credentials/i.test(text) && values) {
      if (this.failNextChallengeCredentialInsert) {
        this.failNextChallengeCredentialInsert = false;
        throw new Error("challenge credential insert unavailable");
      }
      const challengeId = values[0] as string;
      const rows = [
        {
          challengeId,
          role: values[1] as "challenger" | "challenged",
          tokenHash: values[2] as string,
          identity: values[3],
        },
        {
          challengeId,
          role: values[4] as "challenger" | "challenged",
          tokenHash: values[5] as string,
          identity: values[6],
        },
      ];
      for (const credential of rows) {
        if (
          this.challengeCredentialRows.some(
            (row) => row.challengeId === credential.challengeId && row.role === credential.role
          )
        ) {
          throw new Error("duplicate challenge credential");
        }
        this.challengeCredentialRows.push(credential);
      }
    }
    if (/insert into online_seek_credentials/i.test(text) && values) {
      const credential = {
        seekId: values[0] as string,
        tokenHash: values[1] as string,
        identity: values[2],
      };
      if (this.seekCredentialRows.some((row) => row.seekId === credential.seekId)) {
        throw new Error("duplicate seek credential");
      }
      this.seekCredentialRows.push(credential);
    }
    if (/delete\s+from\s+online_game_summaries/i.test(text)) {
      if (/where\s+game_id/i.test(text)) {
        this.summaryRows = this.summaryRows.filter((row) => {
          const payload = row.payload as { gameId?: string };
          return payload.gameId !== values?.[0];
        });
      } else {
        this.summaryRows = [];
      }
      return { rows: [] };
    }
    if (/delete\s+from\s+online_challenge_summaries/i.test(text)) {
      if (/where\s+challenge_id/i.test(text)) {
        this.challengeSummaryRows = this.challengeSummaryRows.filter((row) => {
          const payload = row.payload as { challengeId?: string };
          return payload.challengeId !== values?.[0];
        });
      } else {
        this.challengeSummaryRows = [];
      }
      return { rows: [] };
    }
    if (/delete\s+from\s+online_seek_summaries/i.test(text)) {
      if (/where\s+seek_id/i.test(text)) {
        this.seekSummaryRows = this.seekSummaryRows.filter((row) => {
          const payload = row.payload as { seekId?: string };
          return payload.seekId !== values?.[0];
        });
      } else {
        this.seekSummaryRows = [];
      }
      return { rows: [] };
    }
    if (/insert into online_game_summaries/i.test(text) && values?.[6]) {
      if (this.failNextSummaryInsert) {
        this.failNextSummaryInsert = false;
        throw new Error("summary insert unavailable");
      }
      const gameId = values[0];
      this.summaryRows = this.summaryRows.filter((row) => {
        const payload = row.payload as { gameId?: string };
        return payload.gameId !== gameId;
      });
      this.summaryRows.push({ payload: values[6] });
    }
    if (/insert into online_challenge_summaries/i.test(text) && values?.[5]) {
      if (this.failNextChallengeSummaryInsert) {
        this.failNextChallengeSummaryInsert = false;
        throw new Error("challenge summary insert unavailable");
      }
      const challengeId = values[0];
      this.challengeSummaryRows = this.challengeSummaryRows.filter((row) => {
        const payload = row.payload as { challengeId?: string };
        return payload.challengeId !== challengeId;
      });
      this.challengeSummaryRows.push({ payload: values[5] });
    }
    if (/insert into online_seek_summaries/i.test(text) && values?.[4]) {
      if (this.failNextSeekSummaryInsert) {
        this.failNextSeekSummaryInsert = false;
        throw new Error("seek summary insert unavailable");
      }
      const seekId = values[0];
      this.seekSummaryRows = this.seekSummaryRows.filter((row) => {
        const payload = row.payload as { seekId?: string };
        return payload.seekId !== seekId;
      });
      this.seekSummaryRows.push({ payload: values[4] });
    }
    if (/select\s+payload\s+from\s+online_game_summaries/i.test(text)) {
      let rows = [...this.summaryRows];
      if (/where\s+game_id\s*=\s*\$1/i.test(text)) {
        rows = rows.filter((row) => (row.payload as { gameId?: string }).gameId === values?.[0]);
        return { rows };
      }
      if (/payload\s*@>\s*\$1::jsonb/i.test(text)) {
        const identityFilter = values?.[0] as
          | { participants?: Array<{ identity?: { kind?: string; id?: string } }> }
          | undefined;
        const identityKind = identityFilter?.participants?.[0]?.identity?.kind;
        const identityId = identityFilter?.participants?.[0]?.identity?.id;
        rows = rows.filter((row) => {
          const payload = row.payload as {
            participants?: Array<{ identity?: { kind?: string; id?: string } }>;
          };
          return payload.participants?.some(
            (participant) =>
              participant.identity?.kind === identityKind &&
              participant.identity?.id === identityId
          );
        });
        if (/status\s*=\s*'active'/i.test(text)) {
          rows = rows.filter((row) => (row.payload as { status?: string }).status === "active");
        }
        if (/archive_state\s*=\s*'archived'/i.test(text)) {
          rows = rows.filter((row) => (row.payload as { archiveState?: string }).archiveState === "archived");
        }
        if (/updated_at\s*</i.test(text)) {
          const cursorUpdatedAt = values?.[1] as string;
          const cursorGameId = values?.[2] as string;
          rows = rows.filter((row) => {
            const payload = row.payload as { updatedAt?: string; gameId?: string };
            return (
              typeof payload.updatedAt === "string" &&
              typeof payload.gameId === "string" &&
              (payload.updatedAt < cursorUpdatedAt ||
                (payload.updatedAt === cursorUpdatedAt && payload.gameId > cursorGameId))
            );
          });
        }
        rows.sort((a, b) => {
          const left = a.payload as { updatedAt?: string; gameId?: string };
          const right = b.payload as { updatedAt?: string; gameId?: string };
          if (left.updatedAt !== right.updatedAt) {
            return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
          }
          return (left.gameId ?? "").localeCompare(right.gameId ?? "");
        });
        const limit = values?.[values.length - 1] as number | undefined;
        return { rows: typeof limit === "number" ? rows.slice(0, limit) : rows };
      }
      if (/where\s+visibility\s*=/i.test(text)) {
        const visibility = values?.[0];
        rows = rows.filter((row) => (row.payload as { visibility?: string }).visibility === visibility);
        if (/status\s*=\s*'active'/i.test(text)) {
          rows = rows.filter((row) => (row.payload as { status?: string }).status === "active");
        }
        if (/archive_state\s*=\s*'archived'/i.test(text)) {
          rows = rows.filter((row) => (row.payload as { archiveState?: string }).archiveState === "archived");
        }
        if (/payload\s*@>\s*\$\d+::jsonb/i.test(text)) {
          const clockFilter = values?.find((value) => {
            const candidate = value as { hasTimeControl?: boolean } | undefined;
            return typeof candidate?.hasTimeControl === "boolean";
          }) as { hasTimeControl?: boolean } | undefined;
          if (clockFilter) {
            rows = rows.filter(
              (row) =>
                (row.payload as { hasTimeControl?: boolean }).hasTimeControl ===
                clockFilter.hasTimeControl
            );
          }
          const resultFilter = values?.find((value) => {
            const candidate = value as { result?: { winner?: string; reason?: string } } | undefined;
            return !!candidate?.result && (candidate.result.winner !== undefined || candidate.result.reason !== undefined);
          }) as { result?: { winner?: string; reason?: string } } | undefined;
          rows = rows.filter((row) => {
            const payload = row.payload as { result?: { winner?: string; reason?: string } };
            if (resultFilter?.result?.winner) {
              return payload.result?.winner === resultFilter.result.winner;
            }
            if (resultFilter?.result?.reason) {
              return payload.result?.reason === resultFilter.result.reason;
            }
            return true;
          });
        }
        if (/lower\(game_id\)\s+like/i.test(text)) {
          const rawPattern = values?.find((value) => typeof value === "string" && value.startsWith("%"));
          const query = typeof rawPattern === "string" ? rawPattern.slice(1, -1).toLowerCase() : "";
          rows = rows.filter((row) =>
            onlineGameSummaryDirectorySearchText(row.payload as OnlineGameSummary).includes(query)
          );
        }
        if (/updated_at\s*</i.test(text)) {
          const cursorIndex =
            values?.findIndex(
              (value) =>
                typeof value === "string" &&
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
            ) ?? -1;
          const cursorUpdatedAt = values?.[cursorIndex] as string;
          const cursorGameId = values?.[cursorIndex + 1] as string;
          rows = rows.filter((row) => {
            const payload = row.payload as { updatedAt?: string; gameId?: string };
            return (
              typeof payload.updatedAt === "string" &&
              typeof payload.gameId === "string" &&
              (payload.updatedAt < cursorUpdatedAt ||
                (payload.updatedAt === cursorUpdatedAt && payload.gameId > cursorGameId))
            );
          });
        }
        rows.sort((a, b) => {
          const left = a.payload as { updatedAt?: string; gameId?: string };
          const right = b.payload as { updatedAt?: string; gameId?: string };
          if (left.updatedAt !== right.updatedAt) {
            return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
          }
          return (left.gameId ?? "").localeCompare(right.gameId ?? "");
        });
        const limit = values?.[values.length - 1] as number | undefined;
        return { rows: typeof limit === "number" ? rows.slice(0, limit) : rows };
      }
      return { rows };
    }
    if (/select\s+payload\s+from\s+online_challenge_summaries/i.test(text)) {
      return { rows: this.challengeSummaryRows };
    }
    if (/select\s+payload\s+from\s+online_seek_summaries/i.test(text)) {
      let rows = [...this.seekSummaryRows];
      if (/where\s+status\s*=\s*'open'/i.test(text)) {
        rows = rows.filter((row) => (row.payload as { status?: string }).status === "open");
      }
      if (/expires_at\s*>\s*(now\(\)|current_timestamp)/i.test(text)) {
        rows = rows.filter((row) => {
          const payload = row.payload as { expiresAt?: string };
          return typeof payload.expiresAt === "string" && Date.parse(payload.expiresAt) > Date.now();
        });
      }
      if (/payload\s*->>\s*'creatorSeat'/i.test(text)) {
        const creatorSeat = values?.find((value) => value === "w" || value === "b" || value === "random");
        rows = rows.filter((row) => (row.payload as { creatorSeat?: string }).creatorSeat === creatorSeat);
      }
      if (/payload\s*->\s*'setup'\s*\\?\s*'timeControl'/i.test(text)) {
        rows = rows.filter((row) => {
          const payload = row.payload as { setup?: { timeControl?: unknown } };
          const hasTimeControl = payload.setup?.timeControl !== undefined;
          return /not\s+\\?/i.test(text) ? !hasTimeControl : hasTimeControl;
        });
      }
      if (/vpModeEnabled/i.test(text)) {
        rows = rows.filter((row) => {
          const payload = row.payload as { setup?: { gameRules?: { vpModeEnabled?: boolean } } };
          const enabled = payload.setup?.gameRules?.vpModeEnabled === true;
          return /is\s+not\s+true/i.test(text) ? !enabled : enabled;
        });
      }
      if (/updated_at\s*</i.test(text)) {
        const cursorIndex =
          values?.findIndex(
            (value) =>
              typeof value === "string" &&
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
          ) ?? -1;
        const cursorUpdatedAt = values?.[cursorIndex] as string;
        const cursorSeekId = values?.[cursorIndex + 1] as string;
        rows = rows.filter((row) => {
          const payload = row.payload as { updatedAt?: string; seekId?: string };
          return (
            typeof payload.updatedAt === "string" &&
            typeof payload.seekId === "string" &&
            (payload.updatedAt < cursorUpdatedAt ||
              (payload.updatedAt === cursorUpdatedAt && payload.seekId > cursorSeekId))
          );
        });
      }
      rows.sort((a, b) => {
        const left = a.payload as { updatedAt?: string; seekId?: string };
        const right = b.payload as { updatedAt?: string; seekId?: string };
        if (left.updatedAt !== right.updatedAt) {
          return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
        }
        return (left.seekId ?? "").localeCompare(right.seekId ?? "");
      });
      const limit = values?.[values.length - 1] as number | undefined;
      return { rows: typeof limit === "number" ? rows.slice(0, limit) : rows };
    }
    if (/select\s+payload\s+from\s+online_challenge_events\s+where\s+challenge_id/i.test(text)) {
      return {
        rows: this.challengeEventRows.filter((row) => row.payload.challengeId === values?.[0]),
      };
    }
    if (/select\s+payload\s+from\s+online_challenge_events/i.test(text)) {
      return { rows: this.challengeEventRows };
    }
    if (/select\s+payload\s+from\s+online_seek_events\s+where\s+seek_id/i.test(text)) {
      return {
        rows: this.seekEventRows.filter((row) => row.payload.seekId === values?.[0]),
      };
    }
    if (/select\s+payload\s+from\s+online_seek_events/i.test(text)) {
      return { rows: this.seekEventRows };
    }
    if (/select\s+role,\s*token_hash,\s*identity\s+from\s+online_challenge_credentials\s+where\s+challenge_id/i.test(text)) {
      return {
        rows: this.challengeCredentialRows
          .filter((row) => row.challengeId === values?.[0])
          .map((row) => ({
            role: row.role,
            token_hash: row.tokenHash,
            identity: row.identity,
          })),
      };
    }
    if (/select\s+token_hash,\s*identity\s+from\s+online_seek_credentials\s+where\s+seek_id/i.test(text)) {
      return {
        rows: this.seekCredentialRows
          .filter((row) => row.seekId === values?.[0])
          .map((row) => ({ token_hash: row.tokenHash, identity: row.identity })),
      };
    }
    if (/select\s+payload\s+from\s+online_game_events\s+where\s+game_id/i.test(text)) {
      return {
        rows: this.eventRows.filter((row) => row.payload.gameId === values?.[0]),
      };
    }
    if (/select\s+payload\s+from\s+online_game_events/i.test(text)) {
      return { rows: this.eventRows };
    }
    if (/select\s+game_id,\s*seat,\s*token_hash\s+from\s+online_game_credentials\s+where\s+game_id/i.test(text)) {
      return {
        rows: this.credentialRows
          .filter((row) => row.gameId === values?.[0])
          .map((row) => ({ game_id: row.gameId, seat: row.seat, token_hash: row.tokenHash })),
      };
    }
    if (/select\s+game_id,\s*seat,\s*token_hash\s+from\s+online_game_additional_credentials\s+where\s+game_id/i.test(text)) {
      return {
        rows: this.additionalCredentialRows
          .filter((row) => row.gameId === values?.[0])
          .map((row) => ({ game_id: row.gameId, seat: row.seat, token_hash: row.tokenHash })),
      };
    }
    if (/select\s+game_id,\s*seat,\s*token_hash\s+from\s+online_game_credentials/i.test(text)) {
      return {
        rows: this.credentialRows.map((row) => ({
          game_id: row.gameId,
          seat: row.seat,
          token_hash: row.tokenHash,
        })),
      };
    }
    if (/select\s+game_id,\s*seat,\s*token_hash\s+from\s+online_game_additional_credentials/i.test(text)) {
      return {
        rows: this.additionalCredentialRows.map((row) => ({
          game_id: row.gameId,
          seat: row.seat,
          token_hash: row.tokenHash,
        })),
      };
    }
    return { rows: [] };
  }
}

function createGameCreatedEvent(
  gameId = "game_pg"
): Extract<OnlineGameEvent, { type: "game_created" }> {
  const board = getStartingBoard(6);
  const pieces = getStartingPieces(6);
  const sanctuaries = SanctuaryGenerator.generateRandomSanctuaries(board, [
    SanctuaryType.WolfCovenant,
    SanctuaryType.SacredSpring,
  ]);

  return {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId: `evt-${gameId}-create`,
    createdAt: "2026-05-31T12:00:00.000Z",
    rulesetVersion: ONLINE_RULESET_VERSION,
    type: "game_created",
    gameId,
    setup: serializeOnlineGameSetup({
      board,
      pieces,
      sanctuaries,
      sanctuarySettings: { unlockTurn: 0, cooldown: 10 },
      gameRules: { vpModeEnabled: false },
      initialPoolTypes: [SanctuaryType.WolfCovenant, SanctuaryType.SacredSpring],
      pieceTheme: "Castles",
    }),
  };
}

function createClockedGameCreatedEvent(
  gameId = "game_pg_clocked"
): Extract<OnlineGameEvent, { type: "game_created" }> {
  const created = createGameCreatedEvent(gameId);
  return {
    ...created,
    setup: {
      ...created.setup,
      timeControl: { initial: 1, increment: 0 },
    },
    clock: {
      remainingMs: { w: 60_000, b: 60_000 },
      activeColor: "w",
      runningSince: 0,
    },
  };
}

function createVisibilityChangedEvent(
  gameId = "game_pg",
  visibility: "public" | "unlisted" = "public"
) {
  return {
    schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
    eventId: `evt-${gameId}-visibility-${visibility}`,
    createdAt: "2026-05-31T12:00:01.000Z",
    rulesetVersion: ONLINE_RULESET_VERSION,
    type: "visibility_changed",
    gameId,
    visibility,
  } as any;
}

function createSummary(
  gameId: string,
  overrides: Partial<OnlineGameSummary> = {}
): OnlineGameSummary {
  const hasTimeControl = overrides.hasTimeControl ?? true;
  return {
    schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
    gameId,
    rulesetVersion: ONLINE_RULESET_VERSION,
    createdAt: "2026-05-31T12:00:00.000Z",
    updatedAt: "2026-05-31T12:00:00.000Z",
    version: 0,
    status: "active",
    visibility: "public",
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
      ...(hasTimeControl
        ? {
            clock: {
              timeControl: { initialMs: 60_000, incrementMs: 0 },
              remainingMs: { w: 60_000, b: 60_000 },
              activeColor: "w" as const,
              runningSince: 0,
            },
          }
        : {}),
    },
    lastEventId: `evt-${gameId}`,
    ...overrides,
  };
}

function createGameCredentials() {
  return {
    whiteCredential: hashOnlineToken("w-token"),
    blackCredential: hashOnlineToken("b-token"),
  };
}

function createChallengeCredentials() {
  return {
    challengerCredential: hashOnlineToken("challenger-token"),
    challengedCredential: hashOnlineToken("challenged-token"),
    challengerIdentity: challengeChallenger,
    challengedIdentity: challengeChallenged,
  };
}

function createCredentialRows(gameId: string) {
  const credentials = createGameCredentials();
  return [
    { gameId, seat: "w" as const, tokenHash: credentials.whiteCredential },
    { gameId, seat: "b" as const, tokenHash: credentials.blackCredential },
  ];
}

function seedCreatedGame(
  client: FakePostgresClient,
  event: Extract<OnlineGameEvent, { type: "game_created" }>
) {
  client.eventRows = [{ payload: event }];
  client.credentialRows = createCredentialRows(event.gameId);
}

const challengeChallenger = { kind: "session", id: "session_challenger" } as const;
const challengeChallenged = { kind: "session", id: "session_challenged" } as const;

function createChallengeCreated(
  challengeId = "challenge_pg",
  overrides: Partial<Extract<OnlineChallengeEvent, { type: "challenge_created" }>> = {}
): Extract<OnlineChallengeEvent, { type: "challenge_created" }> {
  const setup = createGameCreatedEvent(`game_terms_${challengeId}`).setup;
  return createChallengeCreatedEvent(
    {
      type: "challenge_created",
      challengeId,
      challengerIdentity: challengeChallenger,
      challengedIdentity: challengeChallenged,
      challengerSeat: overrides.challengerSeat ?? "w",
      visibility: overrides.visibility ?? "unlisted",
      setup: overrides.setup ?? setup,
      expiresAt: overrides.expiresAt ?? "2026-06-01T12:10:00.000Z",
    },
    {
      eventId: `challenge-evt-${challengeId}-create`,
      createdAt: overrides.createdAt ?? "2026-06-01T12:00:00.000Z",
    }
  );
}

function createChallengeAccepted(
  challengeId = "challenge_pg"
): Extract<OnlineChallengeEvent, { type: "challenge_accepted" }> {
  return createChallengeAcceptedEvent(
    {
      type: "challenge_accepted",
      challengeId,
      acceptedBy: challengeChallenged,
      acceptedAt: "2026-06-01T12:05:00.000Z",
      gameId: `game_${challengeId}`,
      whiteIdentity: challengeChallenger,
      blackIdentity: challengeChallenged,
    },
    {
      eventId: `challenge-evt-${challengeId}-accepted`,
      createdAt: "2026-06-01T12:05:00.000Z",
    }
  );
}

function createChallengeCancelled(
  challengeId = "challenge_pg"
): Extract<OnlineChallengeEvent, { type: "challenge_cancelled" }> {
  return createChallengeCancelledEvent(
    {
      type: "challenge_cancelled",
      challengeId,
      cancelledBy: challengeChallenger,
      cancelledAt: "2026-06-01T12:06:00.000Z",
    },
    {
      eventId: `challenge-evt-${challengeId}-cancelled`,
      createdAt: "2026-06-01T12:06:00.000Z",
    }
  );
}

function createChallengeAcceptInput(
  challenge: Extract<OnlineChallengeEvent, { type: "challenge_created" }>,
  overrides: {
    gameId?: string;
    acceptedAt?: string;
    acceptedByRole?: "challenger" | "challenged";
    whiteIdentity?: typeof challengeChallenger | typeof challengeChallenged;
    blackIdentity?: typeof challengeChallenger | typeof challengeChallenged;
    setup?: Extract<OnlineGameEvent, { type: "game_created" }>["setup"];
    initialVisibility?: Extract<OnlineGameEvent, { type: "game_created" }>["initialVisibility"];
  } = {}
) {
  const gameId = overrides.gameId ?? `game_${challenge.challengeId}_accepted`;
  const acceptedAt = overrides.acceptedAt ?? "2026-06-01T12:05:00.000Z";
  const challengerIsWhite =
    challenge.challengerSeat === "w" ||
    (challenge.challengerSeat === "random" && overrides.whiteIdentity !== challengeChallenged);
  const whiteIdentity =
    overrides.whiteIdentity ?? (challengerIsWhite ? challengeChallenger : challengeChallenged);
  const blackIdentity =
    overrides.blackIdentity ?? (challengerIsWhite ? challengeChallenged : challengeChallenger);
  const gameCreatedEvent: Extract<OnlineGameEvent, { type: "game_created" }> = {
    ...createGameCreatedEvent(gameId),
    eventId: `evt-${gameId}-create`,
    createdAt: acceptedAt,
    gameId,
    setup: overrides.setup ?? challenge.setup,
    initialVisibility: overrides.initialVisibility ?? challenge.visibility,
  };
  return {
    challengeId: challenge.challengeId,
    acceptedBy: {
      challengeId: challenge.challengeId,
      role: overrides.acceptedByRole ?? "challenged",
      identity: (overrides.acceptedByRole === "challenger" ? challengeChallenger : challengeChallenged) as any,
    },
    acceptedAt,
    gameCreatedEvent,
    whiteIdentity,
    blackIdentity,
  };
}

const seekCreator = { kind: "session", id: "seek_creator" } as const;
const seekAcceptor = { kind: "session", id: "seek_acceptor" } as const;

function createOpenSeekCreated(
  seekId = "seek_pg",
  overrides: Partial<Extract<OpenSeekEvent, { type: "seek_created" }>> = {}
): Extract<OpenSeekEvent, { type: "seek_created" }> {
  const setup = createGameCreatedEvent(`game_terms_${seekId}`).setup;
  return createOpenSeekCreatedEvent(
    {
      type: "seek_created",
      seekId,
      creatorIdentity: overrides.creatorIdentity ?? seekCreator,
      creatorSeat: overrides.creatorSeat ?? "w",
      setup: overrides.setup ?? setup,
      expiresAt: overrides.expiresAt ?? "2026-06-01T12:10:00.000Z",
    },
    {
      eventId: `seek-evt-${seekId}-create`,
      createdAt: overrides.createdAt ?? "2026-06-01T12:00:00.000Z",
    }
  );
}

function createOpenSeekCancelled(
  seekId = "seek_pg"
): Extract<OpenSeekEvent, { type: "seek_cancelled" }> {
  return createOpenSeekCancelledEvent(
    {
      type: "seek_cancelled",
      seekId,
      cancelledBy: seekCreator,
      cancelledAt: "2026-06-01T12:04:00.000Z",
    },
    {
      eventId: `seek-evt-${seekId}-cancelled`,
      createdAt: "2026-06-01T12:04:00.000Z",
    }
  );
}

function createOpenSeekCredentials() {
  return {
    creatorCredential: hashOnlineToken("seek-creator-token"),
    creatorIdentity: seekCreator,
  };
}

function createOpenSeekAcceptInput(
  seek: Extract<OpenSeekEvent, { type: "seek_created" }>,
  overrides: {
    gameId?: string;
    acceptorCredential?: string;
    initialVisibility?: Extract<OnlineGameEvent, { type: "game_created" }>["initialVisibility"];
  } = {}
) {
  const gameId = overrides.gameId ?? `game_${seek.seekId}_accepted`;
  const acceptedAt = "2026-06-01T12:05:00.000Z";
  const gameCreatedEvent: Extract<OnlineGameEvent, { type: "game_created" }> = {
    ...createGameCreatedEvent(gameId),
    eventId: `evt-${gameId}-create`,
    createdAt: acceptedAt,
    gameId,
    setup: seek.setup,
    initialVisibility: overrides.initialVisibility ?? "public",
  };
  return {
    seekId: seek.seekId,
    acceptedBy: seekAcceptor,
    acceptedAt,
    gameCreatedEvent,
    whiteIdentity: seek.creatorSeat === "b" ? seekAcceptor : seekCreator,
    blackIdentity: seek.creatorSeat === "b" ? seekCreator : seekAcceptor,
    acceptorCredential: overrides.acceptorCredential ?? hashOnlineToken("seek-acceptor-token"),
  };
}

describe("PostgresOnlineGameStore", () => {
  it("closes its database connection when a closer is provided", async () => {
    const client = new FakePostgresClient();
    const close = vi.fn().mockResolvedValue(undefined);
    const store = new PostgresOnlineGameStore({ queryable: client, close });

    await store.close();

    expect(close).toHaveBeenCalledOnce();
  });

  it("creates the online event schema during readiness checks", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.checkReady()).resolves.toBe(true);

    expect(client.queries.some((query) => /create table if not exists online_game_events/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_game_summaries/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_challenge_events/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_challenge_summaries/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_challenge_credentials/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_challenge_locks/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_seek_events/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_seek_summaries/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_seek_credentials/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create table if not exists online_seek_locks/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /create unique index if not exists/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /online_game_summaries_payload_identity_idx/i.test(query.text))).toBe(true);
    expect(client.queries.some((query) => /online_challenge_events_one_create_per_challenge/i.test(query.text))).toBe(true);
    expect(
      client.queries.some(
        (query) =>
          /online_game_events_one_client_action_per_player/i.test(query.text) &&
          /game_id/i.test(query.text) &&
          /playerColor/i.test(query.text) &&
          /clientActionId/i.test(query.text)
      )
    ).toBe(true);
    expect(client.queries.at(-1)?.text).toMatch(/select 1/i);
  });

  it("retries schema creation after a transient readiness failure", async () => {
    const client = new FakePostgresClient();
    client.failNextCreateTable = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.checkReady()).rejects.toThrow(/temporary schema failure/);
    await expect(store.checkReady()).resolves.toBe(true);

    expect(
      client.queries.filter((query) => /create table if not exists online_game_events/i.test(query.text))
    ).toHaveLength(2);
  });

  it("validates and inserts accepted events with replay metadata", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const event = createGameCreatedEvent();

    await store.appendGameCreated(event, createGameCredentials());

    const insert = client.queries.find((query) => /insert into online_game_events/i.test(query.text));
    expect(insert?.values).toEqual([
      event.eventId,
      event.gameId,
      "game_created",
      null,
      event.createdAt,
      event,
    ]);
  });

  it("stores creation events without raw bearer tokens and saves seat credential hashes separately", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const event = createGameCreatedEvent("game_credentials");
    const credentials = {
      whiteCredential: hashOnlineToken("white-token"),
      blackCredential: hashOnlineToken("black-token"),
    };

    await store.appendGameCreated(event, credentials);

    expect(JSON.stringify(client.eventRows)).not.toContain("white-token");
    expect(JSON.stringify(client.eventRows)).not.toContain("black-token");
    expect(client.credentialRows).toEqual([
      { gameId: "game_credentials", seat: "w", tokenHash: credentials.whiteCredential },
      { gameId: "game_credentials", seat: "b", tokenHash: credentials.blackCredential },
    ]);
  });

  it("adds account rejoin seat credential aliases without replacing existing credentials", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const event = createGameCreatedEvent("game_rejoin_credentials");
    const credentials = createGameCredentials();

    await store.appendGameCreated(event, credentials);
    const record = await store.appendGameSeatCredential(
      event.gameId,
      "w",
      hashOnlineToken("fresh-white-token")
    );

    expect(client.credentialRows).toEqual([
      { gameId: event.gameId, seat: "w", tokenHash: credentials.whiteCredential },
      { gameId: event.gameId, seat: "b", tokenHash: credentials.blackCredential },
    ]);
    expect(client.additionalCredentialRows).toEqual([
      { gameId: event.gameId, seat: "w", tokenHash: hashOnlineToken("fresh-white-token") },
    ]);
    expect(record.additionalWhiteCredentials).toEqual([hashOnlineToken("fresh-white-token")]);

    const restored = OnlineGameRoom.create({
      ...record,
      verifyToken: (token, credential) => hashOnlineToken(token) === credential,
    });
    expect(restored.authenticate("w-token")).toBe("w");
    expect(restored.authenticate("fresh-white-token")).toBe("w");
    expect(restored.authenticate("b-token")).toBe("b");
  });

  it("prunes old account rejoin seat credential aliases per seat", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const event = createGameCreatedEvent("game_rejoin_prune");
    const credentials = createGameCredentials();

    await store.appendGameCreated(event, credentials);

    let record;
    for (let index = 0; index < ONLINE_MAX_ADDITIONAL_SEAT_CREDENTIALS + 2; index += 1) {
      record = await store.appendGameSeatCredential(
        event.gameId,
        "w",
        hashOnlineToken(`fresh-white-token-${index}`)
      );
    }
    await store.appendGameSeatCredential(event.gameId, "b", hashOnlineToken("fresh-black-token"));

    expect(client.credentialRows).toEqual([
      { gameId: event.gameId, seat: "w", tokenHash: credentials.whiteCredential },
      { gameId: event.gameId, seat: "b", tokenHash: credentials.blackCredential },
    ]);
    expect(
      client.additionalCredentialRows
        .filter((row) => row.gameId === event.gameId && row.seat === "w")
        .map((row) => row.tokenHash)
    ).toEqual([
      hashOnlineToken("fresh-white-token-2"),
      hashOnlineToken("fresh-white-token-3"),
      hashOnlineToken("fresh-white-token-4"),
      hashOnlineToken("fresh-white-token-5"),
      hashOnlineToken("fresh-white-token-6"),
    ]);
    expect(
      client.additionalCredentialRows
        .filter((row) => row.gameId === event.gameId && row.seat === "b")
        .map((row) => row.tokenHash)
    ).toEqual([hashOnlineToken("fresh-black-token")]);
    expect(record?.additionalWhiteCredentials).toEqual([
      hashOnlineToken("fresh-white-token-2"),
      hashOnlineToken("fresh-white-token-3"),
      hashOnlineToken("fresh-white-token-4"),
      hashOnlineToken("fresh-white-token-5"),
      hashOnlineToken("fresh-white-token-6"),
    ]);

    const restored = OnlineGameRoom.create({
      ...record!,
      verifyToken: (token, credential) => hashOnlineToken(token) === credential,
    });
    expect(restored.authenticate("w-token")).toBe("w");
    expect(restored.authenticate("fresh-white-token-1")).toBeNull();
    expect(restored.authenticate("fresh-white-token-6")).toBe("w");
    expect(restored.authenticate("b-token")).toBe("b");
  });

  it("prunes legacy over-limit account rejoin aliases during store load", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const event = createGameCreatedEvent("game_rejoin_legacy_prune");
    const credentials = createGameCredentials();
    client.eventRows.push({ payload: event });
    client.credentialRows.push(
      { gameId: event.gameId, seat: "w", tokenHash: credentials.whiteCredential },
      { gameId: event.gameId, seat: "b", tokenHash: credentials.blackCredential }
    );
    for (let index = 0; index < ONLINE_MAX_ADDITIONAL_SEAT_CREDENTIALS + 2; index += 1) {
      client.additionalCredentialRows.push({
        gameId: event.gameId,
        seat: "w",
        tokenHash: hashOnlineToken(`legacy-white-token-${index}`),
      });
    }

    const [record] = await store.load();

    expect(
      client.additionalCredentialRows
        .filter((row) => row.gameId === event.gameId && row.seat === "w")
        .map((row) => row.tokenHash)
    ).toEqual([
      hashOnlineToken("legacy-white-token-2"),
      hashOnlineToken("legacy-white-token-3"),
      hashOnlineToken("legacy-white-token-4"),
      hashOnlineToken("legacy-white-token-5"),
      hashOnlineToken("legacy-white-token-6"),
    ]);
    expect(record.additionalWhiteCredentials).toEqual([
      hashOnlineToken("legacy-white-token-2"),
      hashOnlineToken("legacy-white-token-3"),
      hashOnlineToken("legacy-white-token-4"),
      hashOnlineToken("legacy-white-token-5"),
      hashOnlineToken("legacy-white-token-6"),
    ]);
  });

  it("rejects raw credential strings before inserting created games", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendGameCreated(createGameCreatedEvent("game_raw_credentials"), {
        whiteCredential: "w-token",
        blackCredential: "b-token",
      })
    ).rejects.toThrow(/credential hash/);

    expect(client.credentialRows).toHaveLength(0);
    expect(client.eventRows).toHaveLength(0);
  });

  it("rejects fake prefixed credential hashes before inserting created games", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendGameCreated(createGameCreatedEvent("game_fake_hash"), {
        whiteCredential: "sha256:white-token-hash",
        blackCredential: "sha256:black-token-hash",
      })
    ).rejects.toThrow(/credential hash/);

    expect(client.credentialRows).toHaveLength(0);
    expect(client.eventRows).toHaveLength(0);
  });

  it("refreshes the materialized summary after appending each event", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createGameCreatedEvent("game_append_summary");

    await store.appendGameCreated(created, createGameCredentials());
    await store.appendEvent({
      schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
      eventId: "evt-append-resign",
      createdAt: "2026-05-31T12:00:01.000Z",
      rulesetVersion: ONLINE_RULESET_VERSION,
      type: "action_accepted",
      gameId: "game_append_summary",
      playerColor: "b",
      clientActionId: "client-action-append-resign",
      version: 1,
      playedAt: 2_000,
      action: { type: "RESIGN", baseVersion: 0 },
    });

    const summaryUpserts = client.queries.filter((query) =>
      /insert into online_game_summaries/i.test(query.text)
    );
    expect(summaryUpserts).toHaveLength(2);
    expect(summaryUpserts[0].values?.slice(0, 5)).toEqual([
      "game_append_summary",
      "active",
      "unlisted",
      "active",
      0,
    ]);
    expect(summaryUpserts[1].values?.slice(0, 5)).toEqual([
      "game_append_summary",
      "complete",
      "unlisted",
      "archived",
      1,
    ]);
  });

  it("appends visibility changes inside the game transaction and returns the refreshed summary", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createGameCreatedEvent("game_visibility_summary");

    await store.appendGameCreated(created, createGameCredentials());
    client.queries.length = 0;

    const summary = await store.appendGameVisibilityChanged(
      createVisibilityChangedEvent("game_visibility_summary", "public")
    );

    expect(summary).toMatchObject({
      gameId: "game_visibility_summary",
      visibility: "public",
      version: 0,
      lastEventId: "evt-game_visibility_summary-visibility-public",
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "visibility_changed",
    ]);
    expect(client.summaryRows).toEqual([{ payload: summary }]);

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const lockIndex = queryTexts.findIndex(
      (text) => /from\s+online_game_locks/i.test(text) && /for update/i.test(text)
    );
    const summaryLockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const eventInsertIndex = queryTexts.findIndex((text) => /insert into online_game_events/i.test(text));
    const summaryInsertIndex = queryTexts.findIndex((text) => /insert into online_game_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(summaryLockIndex).toBeGreaterThan(lockIndex);
    expect(eventInsertIndex).toBeGreaterThan(summaryLockIndex);
    expect(summaryInsertIndex).toBeGreaterThan(eventInsertIndex);
    expect(commitIndex).toBeGreaterThan(summaryInsertIndex);
  });

  it("requires the dedicated visibility method for visibility events", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createGameCreatedEvent("game_visibility_dedicated");

    await store.appendGameCreated(created, createGameCredentials());
    client.queries.length = 0;

    await expect(
      store.appendEvent(createVisibilityChangedEvent("game_visibility_dedicated", "public"))
    ).rejects.toThrow(/appendGameVisibilityChanged/);

    expect(client.eventRows.map((row) => row.payload.type)).toEqual(["game_created"]);
    expect(client.queries.some((query) => /^\s*begin\s*$/i.test(query.text))).toBe(false);
  });

  it("persists open seek creation with token-free events and hashed creator credentials", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const seek = createOpenSeekCreated("seek_credentials");
    const credentials = createOpenSeekCredentials();

    const summary = await store.appendOpenSeekCreated(seek, credentials);

    expect(summary).toMatchObject({
      seekId: "seek_credentials",
      status: "open",
      creatorIdentity: seekCreator,
    });
    expect(JSON.stringify(client.seekEventRows)).not.toContain("seek-creator-token");
    expect(client.seekCredentialRows).toEqual([
      {
        seekId: "seek_credentials",
        tokenHash: credentials.creatorCredential,
        identity: seekCreator,
      },
    ]);
    expect(client.seekSummaryRows).toEqual([{ payload: summary }]);
  });

  it("lists only open seek summaries with bounded pagination", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const open = createOpenSeekCreated("seek_open", { expiresAt: "2999-01-01T12:10:00.000Z" });
    const cancelled = createOpenSeekCreated("seek_cancelled", { expiresAt: "2999-01-01T12:10:00.000Z" });
    await store.appendOpenSeekCreated(open, createOpenSeekCredentials());
    await store.appendOpenSeekCreated(cancelled, createOpenSeekCredentials());
    await store.appendOpenSeekEvent(createOpenSeekCancelled("seek_cancelled"));

    const directory = await store.listOpenSeekSummaries({ state: "open", limit: 10 });

    expect(directory.seeks.map((summary) => summary.seekId)).toEqual(["seek_open"]);
    expect(JSON.stringify(directory)).not.toContain("seek-creator-token");
  });

  it("filters expired open seek summaries before paginating", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const expiredFirst = createOpenSeekCreated("seek_expired_first", {
      createdAt: "2025-01-01T12:00:00.000Z",
      expiresAt: "2025-01-01T12:05:00.000Z",
    });
    const liveBehindExpired = createOpenSeekCreated("seek_live_behind_expired", {
      createdAt: "2024-01-01T12:00:00.000Z",
      expiresAt: "2999-01-01T12:05:00.000Z",
    });
    await store.appendOpenSeekCreated(expiredFirst, createOpenSeekCredentials());
    await store.appendOpenSeekCreated(liveBehindExpired, createOpenSeekCredentials());

    const directory = await store.listOpenSeekSummaries({ state: "open", limit: 1 });

    expect(directory.seeks.map((summary) => summary.seekId)).toEqual(["seek_live_behind_expired"]);
    expect(
      client.queries.some(
        (query) =>
          /from\s+online_seek_summaries/i.test(query.text) &&
          /expires_at\s*>\s*(now\(\)|current_timestamp)/i.test(query.text)
      )
    ).toBe(true);
  });

  it("applies open seek directory filters before cursor and limit", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const unmatchingNewer = createOpenSeekCreated("seek_newer_unmatched", {
      creatorSeat: "b",
      createdAt: "2026-06-01T12:03:00.000Z",
      expiresAt: "2999-01-01T12:10:00.000Z",
    });
    const firstMatch = createOpenSeekCreated("seek_match_a", {
      creatorSeat: "w",
      createdAt: "2026-06-01T12:02:00.000Z",
      expiresAt: "2999-01-01T12:10:00.000Z",
      setup: { ...createGameCreatedEvent("game_match_a").setup, timeControl: undefined },
    });
    const secondMatch = createOpenSeekCreated("seek_match_b", {
      creatorSeat: "w",
      createdAt: "2026-06-01T12:02:00.000Z",
      expiresAt: "2999-01-01T12:10:00.000Z",
      setup: { ...createGameCreatedEvent("game_match_b").setup, timeControl: undefined },
    });
    await store.appendOpenSeekCreated(unmatchingNewer, createOpenSeekCredentials());
    await store.appendOpenSeekCreated(firstMatch, createOpenSeekCredentials());
    await store.appendOpenSeekCreated(secondMatch, createOpenSeekCredentials());
    client.queries.length = 0;

    const firstPage = await store.listOpenSeekSummaries({
      state: "open",
      limit: 1,
      creatorSeat: "w",
      clock: "casual",
      vp: "disabled",
    });
    const secondPage = await store.listOpenSeekSummaries({
      state: "open",
      limit: 1,
      creatorSeat: "w",
      clock: "casual",
      vp: "disabled",
      cursor: firstPage.nextCursor,
    });

    expect(firstPage.seeks.map((summary) => summary.seekId)).toEqual(["seek_match_a"]);
    expect(secondPage.seeks.map((summary) => summary.seekId)).toEqual(["seek_match_b"]);
    const filteredQuery = client.queries.find(
      (query) =>
        /from\s+online_seek_summaries/i.test(query.text) &&
        /payload\s*->>\s*'creatorSeat'/i.test(query.text)
    );
    expect(filteredQuery?.text).not.toMatch(/payload::text|like/i);
    expect(filteredQuery?.values).toEqual(expect.arrayContaining(["w"]));
  });

  it("accepts open seeks atomically into online games", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const seek = createOpenSeekCreated("seek_accept", { creatorSeat: "w" });
    await store.appendOpenSeekCreated(seek, createOpenSeekCredentials());
    client.queries.length = 0;

    const result = await store.acceptOpenSeekAndCreateGame(createOpenSeekAcceptInput(seek));

    expect(result).toMatchObject({
      seekSummary: { seekId: "seek_accept", status: "accepted" },
      gameSeats: { creator: "w", acceptor: "b" },
      gameRecord: { gameId: "game_seek_accept_accepted" },
    });
    expect(result.gameSummary.participants).toEqual([
      { seat: "w", role: "white", identity: seekCreator },
      { seat: "b", role: "black", identity: seekAcceptor },
    ]);
    expect(client.eventRows.map((row) => row.payload)).toEqual([
      {
        ...createOpenSeekAcceptInput(seek).gameCreatedEvent,
        whiteIdentity: seekCreator,
        blackIdentity: seekAcceptor,
      },
    ]);
    expect(client.eventRows.map((row) => row.payload.type)).toEqual(["game_created"]);
    expect(client.seekEventRows.map((row) => row.payload.type)).toEqual([
      "seek_created",
      "seek_accepted",
    ]);
    expect(client.credentialRows).toHaveLength(2);

    const queryTexts = client.queries.map((query) => query.text);
    const seekLockIndex = queryTexts.findIndex((text) => /from\s+online_seek_locks/i.test(text) && /for update/i.test(text));
    const gameLockIndex = queryTexts.findIndex((text) => /from\s+online_game_locks/i.test(text) && /for update/i.test(text));
    const gameInsertIndex = queryTexts.findIndex((text) => /insert into online_game_events/i.test(text));
    const seekInsertIndex = queryTexts.findIndex((text) => /insert into online_seek_events/i.test(text));

    expect(seekLockIndex).toBeGreaterThanOrEqual(0);
    expect(gameLockIndex).toBeGreaterThan(seekLockIndex);
    expect(gameInsertIndex).toBeGreaterThan(gameLockIndex);
    expect(seekInsertIndex).toBeGreaterThan(gameInsertIndex);
  });

  it("rebuilds accepted open-seek game summaries with durable participant identities", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const seek = createOpenSeekCreated("seek_rebuild_identity", { creatorSeat: "b" });
    await store.appendOpenSeekCreated(seek, createOpenSeekCredentials());
    const accepted = await store.acceptOpenSeekAndCreateGame(createOpenSeekAcceptInput(seek));
    client.summaryRows = [];

    const summaries = await store.rebuildSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0].gameId).toBe(accepted.gameSummary.gameId);
    expect(summaries[0].participants).toEqual([
      { seat: "w", role: "white", identity: seekAcceptor },
      { seat: "b", role: "black", identity: seekCreator },
    ]);
  });

  it("rejects accepted open seek game creation unless the game is public", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const seek = createOpenSeekCreated("seek_accept_hidden", { creatorSeat: "w" });
    await store.appendOpenSeekCreated(seek, createOpenSeekCredentials());
    client.queries.length = 0;

    await expect(
      store.acceptOpenSeekAndCreateGame(
        createOpenSeekAcceptInput(seek, { initialVisibility: "unlisted" })
      )
    ).rejects.toThrow(/public/);

    expect(client.eventRows).toHaveLength(0);
    expect(client.credentialRows).toHaveLength(0);
    expect(client.seekEventRows.map((row) => row.payload.type)).toEqual(["seek_created"]);
  });

  it("rolls back accepted open seeks when seek summary refresh fails", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const seek = createOpenSeekCreated("seek_accept_rollback");
    await store.appendOpenSeekCreated(seek, createOpenSeekCredentials());
    client.failNextSeekSummaryInsert = true;

    await expect(
      store.acceptOpenSeekAndCreateGame(createOpenSeekAcceptInput(seek))
    ).rejects.toThrow(/seek summary insert unavailable/);

    expect(client.eventRows).toHaveLength(0);
    expect(client.seekEventRows.map((row) => row.payload.type)).toEqual(["seek_created"]);
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

  it("applies accepted actions against the locked persisted game state", async () => {
    const client = new FakePostgresClient();
    const created = createGameCreatedEvent("game_apply_action");
    seedCreatedGame(client, created);
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.applyGameAction({
      gameId: "game_apply_action",
      token: "w-token",
      clientActionId: "client-action-apply",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 2_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.snapshot).toMatchObject({ gameId: "game_apply_action", version: 1 });
    expect(result.event).toMatchObject({
      type: "action_accepted",
      gameId: "game_apply_action",
      playerColor: "w",
      clientActionId: "client-action-apply",
      version: 1,
      playedAt: 2_000,
      action: { type: "PASS", baseVersion: 0 },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
    ]);

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const lockInsertIndex = queryTexts.findIndex((text) => /insert into online_game_locks/i.test(text));
    const rowLockIndex = queryTexts.findIndex((text) => /for update/i.test(text));
    const summaryLockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const selectGameEventsIndex = queryTexts.findIndex((text) =>
      /select\s+payload\s+from\s+online_game_events\s+where\s+game_id/i.test(text)
    );
    const eventInsertIndex = queryTexts.findIndex((text, index) =>
      index > selectGameEventsIndex && /insert into online_game_events/i.test(text)
    );
    const summaryInsertIndex = queryTexts.findIndex((text) => /insert into online_game_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockInsertIndex).toBeGreaterThan(beginIndex);
    expect(client.queries[lockInsertIndex].values).toEqual(["game_apply_action"]);
    expect(rowLockIndex).toBeGreaterThan(lockInsertIndex);
    expect(client.queries[rowLockIndex].values).toEqual(["game_apply_action"]);
    expect(summaryLockIndex).toBeGreaterThan(rowLockIndex);
    expect(selectGameEventsIndex).toBeGreaterThan(summaryLockIndex);
    expect(eventInsertIndex).toBeGreaterThan(selectGameEventsIndex);
    expect(summaryInsertIndex).toBeGreaterThan(eventInsertIndex);
    expect(commitIndex).toBeGreaterThan(summaryInsertIndex);
  });

  it("returns an existing accepted action for an exact client action id retry without appending", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_duplicate"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const first = await store.applyGameAction({
      gameId: "game_apply_duplicate",
      token: "w-token",
      clientActionId: "client-action-duplicate",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 2_000,
    });
    const retry = await store.applyGameAction({
      gameId: "game_apply_duplicate",
      token: "w-token",
      clientActionId: "client-action-duplicate",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 99_000,
    });

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (!first.ok || !retry.ok) throw new Error("expected duplicate retry to succeed");
    expect(retry.event).toEqual(first.event);
    expect(retry.snapshot.version).toBe(1);
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
    ]);
  });

  it("keeps exact accepted action retries idempotent while adjudicating expired clocks", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_apply_duplicate_before_timeout"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const first = await store.applyGameAction({
      gameId: "game_apply_duplicate_before_timeout",
      token: "w-token",
      clientActionId: "client-action-duplicate-before-timeout",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 1_000,
    });
    const retry = await store.applyGameAction({
      gameId: "game_apply_duplicate_before_timeout",
      token: "w-token",
      clientActionId: "client-action-duplicate-before-timeout",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 120_000,
    });

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (!first.ok || !retry.ok) throw new Error("expected duplicate retry to succeed");
    expect(retry.event).toEqual(first.event);
    expect(retry).toMatchObject({
      snapshot: {
        version: 2,
        result: { reason: "timeout" },
      },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
      "timeout_adjudicated",
    ]);
  });

  it("rejects reused client action ids with different payloads without appending", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_conflict"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    await store.applyGameAction({
      gameId: "game_apply_conflict",
      token: "w-token",
      clientActionId: "client-action-conflict",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 2_000,
    });
    const conflict = await store.applyGameAction({
      gameId: "game_apply_conflict",
      token: "w-token",
      clientActionId: "client-action-conflict",
      action: { type: "RESIGN", baseVersion: 0 },
      now: () => 3_000,
    });

    expect(conflict.ok).toBe(false);
    if (conflict.ok) throw new Error("expected idempotency conflict");
    expect(conflict.error.code).toBe("duplicate_action");
    expect(conflict.snapshot).toMatchObject({ version: 1 });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
    ]);
  });

  it("adjudicates timeout before rejecting a conflicting duplicate client action id", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_apply_conflict_timeout"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const first = await store.applyGameAction({
      gameId: "game_apply_conflict_timeout",
      token: "w-token",
      clientActionId: "client-action-conflict-timeout",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 1_000,
    });
    const conflict = await store.applyGameAction({
      gameId: "game_apply_conflict_timeout",
      token: "w-token",
      clientActionId: "client-action-conflict-timeout",
      action: { type: "RESIGN", baseVersion: 0 },
      now: () => 120_000,
    });
    const repeatedConflict = await store.applyGameAction({
      gameId: "game_apply_conflict_timeout",
      token: "w-token",
      clientActionId: "client-action-conflict-timeout",
      action: { type: "RESIGN", baseVersion: 0 },
      now: () => 130_000,
    });

    expect(first.ok).toBe(true);
    expect(conflict.ok).toBe(false);
    if (conflict.ok) throw new Error("expected timeout rejection");
    expect(conflict).toMatchObject({
      error: { code: "game_over" },
      event: {
        type: "timeout_adjudicated",
        gameId: "game_apply_conflict_timeout",
        version: 2,
      },
      snapshot: {
        version: 2,
        result: { reason: "timeout" },
      },
    });
    expect(repeatedConflict.ok).toBe(false);
    if (repeatedConflict.ok) throw new Error("expected repeated timeout rejection");
    expect(repeatedConflict).toMatchObject({
      error: { code: "game_over" },
      snapshot: {
        version: 2,
        result: { reason: "timeout" },
      },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "action_accepted",
      "timeout_adjudicated",
    ]);
  });

  it("returns rejected action snapshots from the locked persisted game without appending", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_reject"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.applyGameAction({
      gameId: "game_apply_reject",
      token: "w-token",
      clientActionId: "client-action-reject",
      action: { type: "PASS", baseVersion: 99 },
      now: () => 2_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected stale action rejection.");
    }
    expect(result.error).toMatchObject({ code: "stale_action" });
    expect(result.snapshot).toMatchObject({ gameId: "game_apply_reject", version: 0 });
    expect(client.eventRows).toHaveLength(1);
    expect(
      client.queries.filter((query) => /insert into online_game_events/i.test(query.text))
    ).toHaveLength(0);
  });

  it("does not expose snapshots from unauthorized store action attempts", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_unauthorized"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.applyGameAction({
      gameId: "game_apply_unauthorized",
      token: "wrong-token",
      clientActionId: "client-action-unauthorized",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 2_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected unauthorized action rejection");
    expect(result.error).toMatchObject({ code: "unauthorized" });
    expect(result.snapshot).toBeUndefined();
    expect(result.room).toBeUndefined();
    expect(client.eventRows).toHaveLength(1);
  });

  it("rolls back accepted actions when the locked summary refresh fails", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_apply_rollback"));
    client.failNextSummaryInsert = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.applyGameAction({
        gameId: "game_apply_rollback",
        token: "w-token",
        clientActionId: "client-action-rollback",
        action: { type: "PASS", baseVersion: 0 },
        now: () => 2_000,
      })
    ).rejects.toThrow(/summary insert unavailable/);

    expect(client.eventRows.map((row) => row.payload.type)).toEqual(["game_created"]);
    expect(client.summaryRows).toHaveLength(0);
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

  it("persists timeout adjudication in the locked action transaction before rejecting the action", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_apply_timeout"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.applyGameAction({
      gameId: "game_apply_timeout",
      token: "w-token",
      clientActionId: "client-action-timeout",
      action: { type: "PASS", baseVersion: 0 },
      now: () => 61_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected timeout rejection.");
    }
    expect(result.error).toMatchObject({ code: "game_over" });
    expect(result.event).toMatchObject({
      type: "timeout_adjudicated",
      gameId: "game_apply_timeout",
      playerColor: "w",
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
    expect(result.snapshot).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
      clock: {
        remainingMs: { w: 0, b: 60_000 },
        activeColor: null,
      },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "timeout_adjudicated",
    ]);
  });

  it("adjudicates timeouts against the locked persisted game state", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_timeout_lock"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.adjudicateGameTimeout({
      gameId: "game_timeout_lock",
      now: () => 61_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.event).toMatchObject({
      type: "timeout_adjudicated",
      gameId: "game_timeout_lock",
      playerColor: "w",
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
    expect(result.snapshot).toMatchObject({
      version: 1,
      result: { winner: "b", reason: "timeout" },
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual([
      "game_created",
      "timeout_adjudicated",
    ]);

    const queryTexts = client.queries.map((query) => query.text);
    const rowLockIndex = queryTexts.findIndex((text) => /for update/i.test(text));
    const summaryLockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const eventInsertIndex = queryTexts.findIndex((text, index) =>
      index > summaryLockIndex && /insert into online_game_events/i.test(text)
    );
    expect(rowLockIndex).toBeGreaterThanOrEqual(0);
    expect(summaryLockIndex).toBeGreaterThan(rowLockIndex);
    expect(eventInsertIndex).toBeGreaterThan(summaryLockIndex);
  });

  it("returns the locked persisted snapshot without appending when no timeout has occurred", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createClockedGameCreatedEvent("game_timeout_none"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    const result = await store.adjudicateGameTimeout({
      gameId: "game_timeout_none",
      now: () => 1_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.event).toBeUndefined();
    expect(result.snapshot).toMatchObject({
      version: 0,
      result: undefined,
    });
    expect(client.eventRows.map((row) => row.payload.type)).toEqual(["game_created"]);
  });

  it("wraps appended events and summary refreshes in a locked transaction", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await store.appendGameCreated(createGameCreatedEvent("game_transaction"), createGameCredentials());

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const lockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const eventInsertIndex = queryTexts.findIndex((text) => /insert into online_game_events/i.test(text));
    const summaryInsertIndex = queryTexts.findIndex((text) => /insert into online_game_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(eventInsertIndex).toBeGreaterThan(lockIndex);
    expect(summaryInsertIndex).toBeGreaterThan(eventInsertIndex);
    expect(commitIndex).toBeGreaterThan(summaryInsertIndex);
  });

  it("rolls back an appended event when summary refresh fails", async () => {
    const client = new FakePostgresClient();
    client.failNextSummaryInsert = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendGameCreated(createGameCreatedEvent("game_append_rollback"), createGameCredentials())
    ).rejects.toThrow(
      /summary insert unavailable/
    );

    expect(client.eventRows).toHaveLength(0);
    expect(client.summaryRows).toHaveLength(0);
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

  it("preserves the original transaction error when rollback also fails", async () => {
    const client = new FakePostgresClient();
    client.failNextSummaryInsert = true;
    client.failRollback = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    let caught: unknown;
    try {
      await store.appendGameCreated(
        createGameCreatedEvent("game_rollback_failure"),
        createGameCredentials()
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors.map((error) => String(error))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("summary insert unavailable"),
        expect.stringContaining("rollback unavailable"),
      ])
    );
  });

  it("rejects invalid events before insert", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.appendEvent({ type: "game_created" } as any)).rejects.toThrow(/schemaVersion/);

    expect(client.queries.some((query) => /insert into online_game_events/i.test(query.text))).toBe(false);
  });

  it("loads validated events in database insertion order for replay", async () => {
    const client = new FakePostgresClient();
    const created = createGameCreatedEvent("game_replay");
    const setup = created.setup;
    client.eventRows = [
      { payload: created },
      {
        payload: {
          schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
          eventId: "evt-action",
          createdAt: "2026-05-31T12:00:01.000Z",
          rulesetVersion: ONLINE_RULESET_VERSION,
          type: "action_accepted",
          gameId: "game_replay",
          playerColor: "w",
          clientActionId: "client-action-replay",
          version: 1,
          playedAt: 2_000,
          action: { type: "PASS", baseVersion: 0 },
        },
      },
    ];
    client.credentialRows = createCredentialRows("game_replay");
    const store = new PostgresOnlineGameStore({ queryable: client });

    const records = await store.load();

    expect(client.queries.some((query) => /order by id asc/i.test(query.text))).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      gameId: "game_replay",
      setup,
      acceptedActions: [{ playerColor: "w", version: 1 }],
    });
  });

  it("rebuilds token-free game summaries from persisted events", async () => {
    const client = new FakePostgresClient();
    client.eventRows = [
      { payload: createGameCreatedEvent("game_summary_pg") },
      {
        payload: {
          schemaVersion: ONLINE_EVENT_SCHEMA_VERSION,
          eventId: "evt-resign",
          createdAt: "2026-05-31T12:00:01.000Z",
          rulesetVersion: ONLINE_RULESET_VERSION,
          type: "action_accepted",
          gameId: "game_summary_pg",
          playerColor: "b",
          clientActionId: "client-action-summary-pg",
          version: 1,
          playedAt: 2_000,
          action: { type: "RESIGN", baseVersion: 0 },
        },
      },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const summaries = await store.rebuildSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      gameId: "game_summary_pg",
      version: 1,
      status: "complete",
      archiveState: "archived",
      result: { winner: "w", reason: "resignation" },
    });
    const upsert = client.queries.find((query) => /insert into online_game_summaries/i.test(query.text));
    expect(upsert?.values).toEqual([
      "game_summary_pg",
      "complete",
      "unlisted",
      "archived",
      1,
      "2026-05-31T12:00:01.000Z",
      summaries[0],
    ]);
    expect(JSON.stringify(summaries)).not.toContain("token");
  });

  it("rebuilds summaries from inside the locked transaction", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_locked_rebuild"));
    const store = new PostgresOnlineGameStore({ queryable: client });

    await store.rebuildSummaries();

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const lockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const selectIndex = queryTexts.findIndex((text) => /select\s+payload\s+from\s+online_game_events/i.test(text));
    const deleteIndex = queryTexts.findIndex((text) => /delete\s+from\s+online_game_summaries/i.test(text));
    const insertIndex = queryTexts.findIndex((text) => /insert into online_game_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(selectIndex).toBeGreaterThan(lockIndex);
    expect(deleteIndex).toBeGreaterThan(selectIndex);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
    expect(commitIndex).toBeGreaterThan(insertIndex);
  });

  it("destructively replaces stale materialized game summaries during rebuilds", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_rebuilt_schema_v2"));
    client.summaryRows = [
      {
        payload: {
          schemaVersion: 1,
          gameId: "stale_schema_v1_summary",
          updatedAt: "2026-05-30T12:00:00.000Z",
        },
      },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const summaries = await store.rebuildSummaries();

    expect(summaries).toHaveLength(1);
    expect(client.summaryRows).toHaveLength(1);
    expect(client.summaryRows[0].payload).toMatchObject({
      schemaVersion: ONLINE_GAME_SUMMARY_SCHEMA_VERSION,
      gameId: "game_rebuilt_schema_v2",
    });
    expect(JSON.stringify(client.summaryRows)).not.toContain("stale_schema_v1_summary");
  });

  it("rolls back summary rebuilds when an upsert fails", async () => {
    const client = new FakePostgresClient();
    seedCreatedGame(client, createGameCreatedEvent("game_rebuild_rollback"));
    client.summaryRows = [
      {
        payload: createSummary("game_existing_summary", {
          hasTimeControl: false,
          visibility: "unlisted",
          lastEventId: "evt-existing",
        }),
      },
    ];
    client.failNextSummaryInsert = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.rebuildSummaries()).rejects.toThrow(/summary insert unavailable/);

    expect(client.summaryRows).toHaveLength(1);
    expect((client.summaryRows[0].payload as { gameId: string }).gameId).toBe("game_existing_summary");
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

  it("loads existing game summaries without reading private event tokens", async () => {
    const client = new FakePostgresClient();
    client.summaryRows = [
      {
        payload: createSummary("game_summary_loaded", {
          hasTimeControl: false,
          visibility: "unlisted",
          lastEventId: "evt-create",
        }),
      },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const summaries = await store.loadSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0].gameId).toBe("game_summary_loaded");
    expect(client.queries.some((query) => /from\s+online_game_events/i.test(query.text))).toBe(false);
  });

  it("strips response-only spectator counts from loaded materialized summaries", async () => {
    const client = new FakePostgresClient();
    const archived = createSummary("game_stale_presence_pg", {
      updatedAt: "2026-05-31T12:01:00.000Z",
      endedAt: "2026-05-31T12:01:00.000Z",
      status: "complete",
      archiveState: "archived",
      result: { winner: "w", reason: "resignation" },
    });
    client.summaryRows = [
      {
        payload: {
          ...archived,
          livePreview: {
            ...archived.livePreview,
            spectatorCount: 4,
          },
        },
      },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const summaries = await store.loadSummaries();
    const single = await store.loadGameSummary("game_stale_presence_pg");

    expect(summaries[0].livePreview.spectatorCount).toBeUndefined();
    expect(single?.livePreview.spectatorCount).toBeUndefined();
  });

  it("lists public summaries by state with limit and cursor without replaying events", async () => {
    const client = new FakePostgresClient();
    const activeNew = createSummary("game_public_active_new", {
      updatedAt: "2026-05-31T12:03:00.000Z",
    });
    const activeNewWithStalePresence = {
      ...activeNew,
      livePreview: {
        ...activeNew.livePreview,
        spectatorCount: 5,
      },
    };
    const activeOld = createSummary("game_public_active_old", {
      updatedAt: "2026-05-31T12:02:00.000Z",
    });
    const archive = createSummary("game_public_archive", {
      updatedAt: "2026-05-31T12:01:00.000Z",
      endedAt: "2026-05-31T12:01:00.000Z",
      status: "complete",
      archiveState: "archived",
      result: { winner: "w", reason: "resignation" },
    });
    const archiveWithStalePresence = {
      ...archive,
      livePreview: {
        ...archive.livePreview,
        spectatorCount: 6,
      },
    };
    client.summaryRows = [
      { payload: activeOld },
      { payload: createSummary("game_unlisted_hidden", { visibility: "unlisted" }) },
      { payload: archiveWithStalePresence },
      { payload: activeNewWithStalePresence },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const firstPage = await store.listGameSummaries({
      visibility: "public",
      state: "active",
      limit: 1,
    });
    const secondPage = await store.listGameSummaries({
      visibility: "public",
      state: "active",
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    const archivePage = await store.listGameSummaries({
      visibility: "public",
      state: "archived",
      limit: 25,
    });

    expect(firstPage.games.map((summary) => summary.gameId)).toEqual(["game_public_active_new"]);
    expect(firstPage.games[0].livePreview.spectatorCount).toBeUndefined();
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(secondPage.games.map((summary) => summary.gameId)).toEqual(["game_public_active_old"]);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(archivePage.games.map((summary) => summary.gameId)).toEqual(["game_public_archive"]);
    expect(archivePage.games[0].livePreview.spectatorCount).toBeUndefined();
    expect(client.queries.some((query) => /from\s+online_game_events/i.test(query.text))).toBe(false);
  });

  it("filters public summary pages by clock and result in PostgreSQL", async () => {
    const client = new FakePostgresClient();
    const timedTimeout = createSummary("game_timed_timeout_newer", {
      updatedAt: "2026-05-31T12:04:00.000Z",
      endedAt: "2026-05-31T12:04:00.000Z",
      status: "complete",
      archiveState: "archived",
      hasTimeControl: true,
      result: { winner: "w", reason: "timeout" },
    });
    const casualTimeout = createSummary("game_casual_timeout_middle", {
      updatedAt: "2026-05-31T12:03:00.000Z",
      endedAt: "2026-05-31T12:03:00.000Z",
      status: "complete",
      archiveState: "archived",
      hasTimeControl: false,
      result: { winner: "b", reason: "timeout" },
    });
    const casualResignation = createSummary("game_casual_resignation_old", {
      updatedAt: "2026-05-31T12:02:00.000Z",
      endedAt: "2026-05-31T12:02:00.000Z",
      status: "complete",
      archiveState: "archived",
      hasTimeControl: false,
      result: { winner: "w", reason: "resignation" },
    });
    client.summaryRows = [
      { payload: timedTimeout },
      { payload: casualResignation },
      { payload: casualTimeout },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const page = await store.listGameSummaries({
      visibility: "public",
      state: "archived",
      limit: 1,
      clock: "casual",
      result: "timeout",
    });

    expect(page.games.map((summary) => summary.gameId)).toEqual(["game_casual_timeout_middle"]);
    expect(page.nextCursor).toBeUndefined();
    const query = client.queries.find((candidate) => /from\s+online_game_summaries/i.test(candidate.text));
    expect(query?.text).not.toMatch(/has_time_control/i);
    expect(query?.text).toMatch(/payload\s*@>\s*\$\d+::jsonb/i);
    expect(query?.values).toContainEqual({ hasTimeControl: false });
    expect(query?.values).toContainEqual({ result: { reason: "timeout" } });
  });

  it("filters public summary pages by visible search text in PostgreSQL before pagination", async () => {
    const client = new FakePostgresClient();
    const rawIdNonmatch = createSummary("game_newer_raw_id_nonmatch", {
      updatedAt: "2026-05-31T12:04:00.000Z",
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "ada_raw_id_w", displayName: "Caro" } },
        { seat: "b", role: "black", identity: { kind: "registered", id: "dani_b", displayName: "Dani" } },
      ],
    });
    const visibleMatch = createSummary("game_older_visible_match", {
      updatedAt: "2026-05-31T12:03:00.000Z",
      participants: [
        { seat: "w", role: "white", identity: { kind: "registered", id: "visible_w", displayName: "Ada" } },
        { seat: "b", role: "black", identity: { kind: "anonymous", id: "anon_b" } },
      ],
    });
    client.summaryRows = [
      { payload: rawIdNonmatch },
      { payload: visibleMatch },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const page = await store.listGameSummaries({
      visibility: "public",
      state: "active",
      limit: 1,
      query: "Ada",
    });

    expect(page.games.map((summary) => summary.gameId)).toEqual(["game_older_visible_match"]);
    expect(page.nextCursor).toBeUndefined();
    const query = client.queries.find((candidate) => /from\s+online_game_summaries/i.test(candidate.text));
    expect(query?.text).toMatch(/LOWER\(game_id\)\s+LIKE/i);
    expect(query?.text).toMatch(/identity'->>'displayName'/i);
    expect(query?.text).not.toMatch(/payload::text/i);
    expect(query?.values).toContain("%ada%");
  });

  it("filters public summary pages by displayed timeout result labels in PostgreSQL", async () => {
    const client = new FakePostgresClient();
    const timeoutSummary = createSummary("game_timeout_result", {
      status: "complete",
      archiveState: "archived",
      hasTimeControl: true,
      updatedAt: "2026-05-31T12:04:00.000Z",
      endedAt: "2026-05-31T12:04:00.000Z",
      result: { winner: "b", reason: "timeout" },
    });
    const resignationSummary = createSummary("game_resignation_result", {
      status: "complete",
      archiveState: "archived",
      hasTimeControl: true,
      updatedAt: "2026-05-31T12:03:00.000Z",
      endedAt: "2026-05-31T12:03:00.000Z",
      result: { winner: "w", reason: "resignation" },
    });
    client.summaryRows = [{ payload: timeoutSummary }, { payload: resignationSummary }];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const page = await store.listGameSummaries({
      visibility: "public",
      state: "archived",
      limit: 1,
      query: "Black Wins On Time",
    });

    expect(page.games.map((summary) => summary.gameId)).toEqual(["game_timeout_result"]);
    const query = client.queries.find((candidate) => /from\s+online_game_summaries/i.test(candidate.text));
    expect(query?.values).toContain("%black wins on time%");
  });

  it("lists personal game summaries by participant identity across private and public visibility", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const identity = { kind: "session", id: "session_me" } as const;
    const opponent = { kind: "session", id: "session_opponent" } as const;
    client.summaryRows = [
      {
        payload: createSummary("game_public_other", {
          visibility: "public",
          updatedAt: "2026-05-31T12:00:04.000Z",
        }),
      },
      {
        payload: createSummary("game_private_me", {
          visibility: "private",
          updatedAt: "2026-05-31T12:00:03.000Z",
          participants: [
            { seat: "w", role: "white", identity },
            { seat: "b", role: "black", identity: opponent },
          ],
        }),
      },
      {
        payload: (() => {
          const archived = createSummary("game_unlisted_me_archived", {
            visibility: "unlisted",
            status: "complete",
            archiveState: "archived",
            endedAt: "2026-05-31T12:00:02.000Z",
            updatedAt: "2026-05-31T12:00:02.000Z",
            result: { winner: "b", reason: "resignation" },
            participants: [
              { seat: "w", role: "white", identity: opponent },
              { seat: "b", role: "black", identity },
            ],
          });
          return {
            ...archived,
            livePreview: {
              ...archived.livePreview,
              spectatorCount: 7,
            },
          };
        })(),
      },
    ];

    const page = await store.listPersonalGameSummaries({
      identity,
      state: "all",
      limit: 10,
    });

    expect(page.games.map((summary) => summary.gameId)).toEqual([
      "game_private_me",
      "game_unlisted_me_archived",
    ]);
    expect(page.games.map((summary) => summary.visibility)).toEqual(["private", "unlisted"]);
    expect(page.games[0].participants[0].identity).toEqual(identity);
    expect(page.games[1].livePreview.spectatorCount).toBeUndefined();
    expect(
      client.queries.some(
        (query) =>
          /payload\s*@>\s*\$1::jsonb/i.test(query.text) &&
          JSON.stringify(query.values?.[0]) === JSON.stringify({
            participants: [{ identity: { kind: identity.kind, id: identity.id } }],
          })
      )
    ).toBe(true);
  });

  it("paginates personal game summaries after filtering by identity and lifecycle state", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const identity = { kind: "registered", id: "user_me", displayName: "Me" } as const;
    const other = { kind: "registered", id: "user_other", displayName: "Other" } as const;
    const participantSet = [
      { seat: "w" as const, role: "white" as const, identity },
      { seat: "b" as const, role: "black" as const, identity: other },
    ];
    client.summaryRows = [
      {
        payload: createSummary("game_newer_active_other", {
          updatedAt: "2026-05-31T12:00:04.000Z",
          participants: [
            { seat: "w", role: "white", identity: other },
            { seat: "b", role: "black", identity: { kind: "registered", id: "user_third" } },
          ],
        }),
      },
      {
        payload: createSummary("game_newer_archived_me", {
          status: "complete",
          archiveState: "archived",
          endedAt: "2026-05-31T12:00:03.000Z",
          updatedAt: "2026-05-31T12:00:03.000Z",
          result: { winner: "w", reason: "resignation" },
          participants: participantSet,
        }),
      },
      {
        payload: createSummary("game_older_archived_me", {
          status: "complete",
          archiveState: "archived",
          endedAt: "2026-05-31T12:00:02.000Z",
          updatedAt: "2026-05-31T12:00:02.000Z",
          result: { winner: "b", reason: "resignation" },
          participants: participantSet,
        }),
      },
      {
        payload: createSummary("game_active_me", {
          updatedAt: "2026-05-31T12:00:01.000Z",
          participants: participantSet,
        }),
      },
    ];

    const firstPage = await store.listPersonalGameSummaries({
      identity,
      state: "archived",
      limit: 1,
    });
    const secondPage = await store.listPersonalGameSummaries({
      identity,
      state: "archived",
      limit: 1,
      cursor: firstPage.nextCursor,
    });

    expect(firstPage.games.map((summary) => summary.gameId)).toEqual([
      "game_newer_archived_me",
    ]);
    expect(secondPage.games.map((summary) => summary.gameId)).toEqual([
      "game_older_archived_me",
    ]);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("loads a single materialized game summary without replaying events", async () => {
    const client = new FakePostgresClient();
    client.summaryRows = [
      { payload: createSummary("game_single_summary") },
      { payload: createSummary("game_other_summary") },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const summary = await store.loadGameSummary("game_single_summary");
    const missing = await store.loadGameSummary("game_missing_summary");

    expect(summary?.gameId).toBe("game_single_summary");
    expect(missing).toBeNull();
    expect(client.queries.some((query) => /from\s+online_game_events/i.test(query.text))).toBe(false);
  });

  it("persists challenge creation events and returns the pending summary from a locked transaction", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createChallengeCreated("challenge_append_pending");

    const summary = await store.appendChallengeCreated(created, createChallengeCredentials());

    expect(summary).toMatchObject({
      schemaVersion: ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
      challengeId: "challenge_append_pending",
      status: "pending",
      lastEventId: created.eventId,
    });
    expect(client.challengeEventRows.map((row) => row.payload)).toEqual([created]);
    expect(client.challengeSummaryRows.map((row) => row.payload)).toEqual([summary]);

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const lockInsertIndex = queryTexts.findIndex((text) => /insert into online_challenge_locks/i.test(text));
    const rowLockIndex = queryTexts.findIndex((text) => /from\s+online_challenge_locks/i.test(text) && /for update/i.test(text));
    const summaryLockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const eventInsertIndex = queryTexts.findIndex((text) => /insert into online_challenge_events/i.test(text));
    const credentialInsertIndex = queryTexts.findIndex((text) => /insert into online_challenge_credentials/i.test(text));
    const summaryInsertIndex = queryTexts.findIndex((text) => /insert into online_challenge_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockInsertIndex).toBeGreaterThan(beginIndex);
    expect(client.queries[lockInsertIndex].values).toEqual(["challenge_append_pending"]);
    expect(rowLockIndex).toBeGreaterThan(lockInsertIndex);
    expect(client.queries[rowLockIndex].values).toEqual(["challenge_append_pending"]);
    expect(summaryLockIndex).toBeGreaterThan(rowLockIndex);
    expect(eventInsertIndex).toBeGreaterThan(summaryLockIndex);
    expect(credentialInsertIndex).toBeGreaterThan(eventInsertIndex);
    expect(summaryInsertIndex).toBeGreaterThan(credentialInsertIndex);
    expect(commitIndex).toBeGreaterThan(summaryInsertIndex);
  });

  it("persists challenge creation events with private credential hashes", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createChallengeCreated("challenge_created_credentials");
    const credentials = createChallengeCredentials();

    const summary = await store.appendChallengeCreated(created, credentials);

    expect(summary).toMatchObject({
      challengeId: "challenge_created_credentials",
      status: "pending",
    });
    expect(client.challengeEventRows.map((row) => row.payload)).toEqual([created]);
    expect(client.challengeCredentialRows).toEqual([
      {
        challengeId: "challenge_created_credentials",
        role: "challenger",
        tokenHash: credentials.challengerCredential,
        identity: challengeChallenger,
      },
      {
        challengeId: "challenge_created_credentials",
        role: "challenged",
        tokenHash: credentials.challengedCredential,
        identity: challengeChallenged,
      },
    ]);
    expect(JSON.stringify(client.challengeEventRows)).not.toContain("challenger-token");
    expect(JSON.stringify(client.challengeSummaryRows)).not.toContain("challenger-token");
  });

  it("resolves challenge bearer tokens to authenticated roles and identities", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    await store.appendChallengeCreated(
      createChallengeCreated("challenge_resolve_credentials"),
      createChallengeCredentials()
    );

    await expect(
      store.resolveChallengeCredential("challenge_resolve_credentials", "challenger-token")
    ).resolves.toEqual({
      challengeId: "challenge_resolve_credentials",
      role: "challenger",
      identity: challengeChallenger,
    });
    await expect(
      store.resolveChallengeCredential("challenge_resolve_credentials", "challenged-token")
    ).resolves.toEqual({
      challengeId: "challenge_resolve_credentials",
      role: "challenged",
      identity: challengeChallenged,
    });
    await expect(
      store.resolveChallengeCredential("challenge_resolve_credentials", "wrong-token")
    ).resolves.toBeNull();
    await expect(
      store.resolveChallengeCredential("challenge_missing_credentials", "challenger-token")
    ).resolves.toBeNull();
  });

  it("rejects raw challenge credentials before inserting", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createChallengeCreated("challenge_raw_credentials");

    await expect(
      store.appendChallengeCreated(created, {
        ...createChallengeCredentials(),
        challengerCredential: "challenger-token",
      })
    ).rejects.toThrow(/credential hash/);

    expect(client.challengeEventRows).toHaveLength(0);
    expect(client.challengeCredentialRows).toHaveLength(0);
    expect(client.challengeSummaryRows).toHaveLength(0);
  });

  it("normalizes stored challenge credential identities", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createChallengeCreated("challenge_normalized_credentials");

    await store.appendChallengeCreated(created, {
      ...createChallengeCredentials(),
      challengerIdentity: {
        ...challengeChallenger,
        token: "secret",
        displayName: "ignored",
      } as any,
    });

    expect(client.challengeCredentialRows.find((row) => row.role === "challenger")?.identity).toEqual(
      challengeChallenger
    );
  });

  it("rejects duplicate challenge credential hashes for different roles", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createChallengeCreated("challenge_duplicate_credentials");
    const duplicateHash = hashOnlineToken("same-token");

    await expect(
      store.appendChallengeCreated(created, {
        ...createChallengeCredentials(),
        challengerCredential: duplicateHash,
        challengedCredential: duplicateHash,
      })
    ).rejects.toThrow(/distinct/);

    expect(client.challengeEventRows).toHaveLength(0);
    expect(client.challengeCredentialRows).toHaveLength(0);
  });

  it("rolls back challenge creation when credential insert fails", async () => {
    const client = new FakePostgresClient();
    client.failNextChallengeCredentialInsert = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendChallengeCreated(
        createChallengeCreated("challenge_credential_rollback"),
        createChallengeCredentials()
      )
    ).rejects.toThrow(/challenge credential insert unavailable/);

    expect(client.challengeEventRows).toHaveLength(0);
    expect(client.challengeCredentialRows).toHaveLength(0);
    expect(client.challengeSummaryRows).toHaveLength(0);
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

  it("atomically accepts a challenge and creates the game in one locked transaction", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const challenge = createChallengeCreated("challenge_atomic_accept");
    const challengeCredentials = createChallengeCredentials();
    await store.appendChallengeCreated(challenge, challengeCredentials);
    client.queries.length = 0;
    const input = createChallengeAcceptInput(challenge);
    const expectedGameCredentials = {
      whiteCredential: challengeCredentials.challengerCredential,
      blackCredential: challengeCredentials.challengedCredential,
    };
    const expectedGameRecord = {
      gameId: input.gameCreatedEvent.gameId,
      setup: input.gameCreatedEvent.setup,
      whiteCredential: expectedGameCredentials.whiteCredential,
      blackCredential: expectedGameCredentials.blackCredential,
      clock: input.gameCreatedEvent.clock,
      acceptedActions: [],
    };

    const result = await store.acceptChallengeAndCreateGame(input);

    expect(result.challengeEvent).toMatchObject({
      type: "challenge_accepted",
      challengeId: "challenge_atomic_accept",
      acceptedBy: challengeChallenged,
      gameId: input.gameCreatedEvent.gameId,
      whiteIdentity: challengeChallenger,
      blackIdentity: challengeChallenged,
    });
    expect(result.challengeSummary).toMatchObject({
      challengeId: "challenge_atomic_accept",
      status: "accepted",
      gameId: input.gameCreatedEvent.gameId,
    });
    expect(result.gameSummary).toMatchObject({
      gameId: input.gameCreatedEvent.gameId,
      status: "active",
    });
    expect(result.gameSummary.participants).toEqual([
      { seat: "w", role: "white", identity: challengeChallenger },
      { seat: "b", role: "black", identity: challengeChallenged },
    ]);
    expect(result.gameCredentials).toEqual(expectedGameCredentials);
    expect(result.gameRecord).toEqual(expectedGameRecord);
    expect(result.gameSeats).toEqual({ challenger: "w", challenged: "b" });
    expect(client.eventRows.map((row) => row.payload)).toEqual([
      {
        ...input.gameCreatedEvent,
        whiteIdentity: challengeChallenger,
        blackIdentity: challengeChallenged,
      },
    ]);
    expect(client.credentialRows).toEqual([
      {
        gameId: input.gameCreatedEvent.gameId,
        seat: "w",
        tokenHash: expectedGameCredentials.whiteCredential,
      },
      {
        gameId: input.gameCreatedEvent.gameId,
        seat: "b",
        tokenHash: expectedGameCredentials.blackCredential,
      },
    ]);
    expect(client.challengeEventRows.map((row) => row.payload.type)).toEqual([
      "challenge_created",
      "challenge_accepted",
    ]);

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const challengeLockIndex = queryTexts.findIndex((text) => /from\s+online_challenge_locks/i.test(text) && /for update/i.test(text));
    const gameLockIndex = queryTexts.findIndex((text) => /from\s+online_game_locks/i.test(text) && /for update/i.test(text));
    const gameSummaryLockIndex = client.queries.findIndex(
      (query) => /pg_advisory_xact_lock/i.test(query.text) && query.values?.[0] === 1_431_903_351
    );
    const challengeSummaryLockIndex = client.queries.findIndex(
      (query) => /pg_advisory_xact_lock/i.test(query.text) && query.values?.[0] === 1_431_903_352
    );
    const gameEventInsertIndex = queryTexts.findIndex((text) => /insert into online_game_events/i.test(text));
    const gameCredentialInsertIndex = queryTexts.findIndex((text) => /insert into online_game_credentials/i.test(text));
    const acceptedEventInsertIndex = queryTexts.findIndex((text) => /insert into online_challenge_events/i.test(text));
    const gameSummaryInsertIndex = queryTexts.findIndex((text) => /insert into online_game_summaries/i.test(text));
    const challengeSummaryInsertIndex = queryTexts.findIndex((text) => /insert into online_challenge_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(challengeLockIndex).toBeGreaterThan(beginIndex);
    expect(gameLockIndex).toBeGreaterThan(challengeLockIndex);
    expect(gameSummaryLockIndex).toBeGreaterThan(gameLockIndex);
    expect(challengeSummaryLockIndex).toBeGreaterThan(gameSummaryLockIndex);
    expect(gameEventInsertIndex).toBeGreaterThan(challengeSummaryLockIndex);
    expect(gameCredentialInsertIndex).toBeGreaterThan(gameEventInsertIndex);
    expect(acceptedEventInsertIndex).toBeGreaterThan(gameCredentialInsertIndex);
    expect(gameSummaryInsertIndex).toBeGreaterThan(acceptedEventInsertIndex);
    expect(challengeSummaryInsertIndex).toBeGreaterThan(gameSummaryInsertIndex);
    expect(commitIndex).toBeGreaterThan(challengeSummaryInsertIndex);
  });

  it("rebuilds accepted challenge game summaries with durable participant identities", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const challenge = createChallengeCreated("challenge_rebuild_identity", {
      challengerSeat: "random",
    });
    await store.appendChallengeCreated(challenge, createChallengeCredentials());
    const accepted = await store.acceptChallengeAndCreateGame(
      createChallengeAcceptInput(challenge, {
        whiteIdentity: challengeChallenged,
        blackIdentity: challengeChallenger,
      })
    );
    client.summaryRows = [];

    const summaries = await store.rebuildSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0].gameId).toBe(accepted.gameSummary.gameId);
    expect(summaries[0].participants).toEqual([
      { seat: "w", role: "white", identity: challengeChallenged },
      { seat: "b", role: "black", identity: challengeChallenger },
    ]);
  });

  it("rejects challenge acceptance from the challenger role", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const challenge = createChallengeCreated("challenge_challenger_cannot_accept");
    await store.appendChallengeCreated(challenge, createChallengeCredentials());

    await expect(
      store.acceptChallengeAndCreateGame(
        createChallengeAcceptInput(challenge, { acceptedByRole: "challenger" })
      )
    ).rejects.toThrow(/challenged role/);

    expect(client.eventRows).toHaveLength(0);
    expect(client.challengeEventRows.map((row) => row.payload.type)).toEqual(["challenge_created"]);
  });

  it("rejects accept attempts that change the challenge setup", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const challenge = createChallengeCreated("challenge_setup_mismatch");
    await store.appendChallengeCreated(challenge, createChallengeCredentials());

    await expect(
      store.acceptChallengeAndCreateGame(
        createChallengeAcceptInput(challenge, {
          setup: {
            ...challenge.setup,
            pieceTheme: "Chess",
          },
        })
      )
    ).rejects.toThrow(/setup/);

    expect(client.eventRows).toHaveLength(0);
    expect(client.credentialRows).toHaveLength(0);
    expect(client.challengeEventRows.map((row) => row.payload.type)).toEqual(["challenge_created"]);
  });

  it("rejects accepted challenge games whose initial visibility differs from the challenge", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const challenge = createChallengeCreated("challenge_visibility_mismatch", {
      visibility: "private",
    });
    await store.appendChallengeCreated(challenge, createChallengeCredentials());

    await expect(
      store.acceptChallengeAndCreateGame(
        createChallengeAcceptInput(challenge, { initialVisibility: "public" })
      )
    ).rejects.toThrow(/visibility/);

    expect(client.eventRows).toHaveLength(0);
    expect(client.credentialRows).toHaveLength(0);
    expect(client.challengeEventRows.map((row) => row.payload.type)).toEqual(["challenge_created"]);
  });

  it("rejects accept attempts whose game event timestamp differs from acceptedAt", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const challenge = createChallengeCreated("challenge_accept_timestamp_mismatch");
    await store.appendChallengeCreated(challenge, createChallengeCredentials());
    const input = createChallengeAcceptInput(challenge);

    await expect(
      store.acceptChallengeAndCreateGame({
        ...input,
        gameCreatedEvent: {
          ...input.gameCreatedEvent,
          createdAt: "2026-06-01T12:05:01.000Z",
        },
      })
    ).rejects.toThrow(/acceptedAt/);

    expect(client.eventRows).toHaveLength(0);
    expect(client.challengeEventRows.map((row) => row.payload.type)).toEqual(["challenge_created"]);
  });

  it("rolls back accepted challenge and game rows when challenge summary refresh fails", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const challenge = createChallengeCreated("challenge_accept_rollback");
    await store.appendChallengeCreated(challenge, createChallengeCredentials());
    const pendingSummary = client.challengeSummaryRows[0];
    client.failNextChallengeSummaryInsert = true;

    await expect(
      store.acceptChallengeAndCreateGame(createChallengeAcceptInput(challenge))
    ).rejects.toThrow(/challenge summary insert unavailable/);

    expect(client.eventRows).toHaveLength(0);
    expect(client.credentialRows).toHaveLength(0);
    expect(client.summaryRows).toHaveLength(0);
    expect(client.challengeEventRows.map((row) => row.payload.type)).toEqual(["challenge_created"]);
    expect(client.challengeSummaryRows).toEqual([pendingSummary]);
  });

  it("persists resolved random challenge seats during accept", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const challenge = createChallengeCreated("challenge_random_accept", { challengerSeat: "random" });
    await store.appendChallengeCreated(challenge, createChallengeCredentials());

    const result = await store.acceptChallengeAndCreateGame(
      createChallengeAcceptInput(challenge, {
        whiteIdentity: challengeChallenged,
        blackIdentity: challengeChallenger,
      })
    );

    expect(result.challengeSummary).toMatchObject({
      status: "accepted",
      whiteIdentity: challengeChallenged,
      blackIdentity: challengeChallenger,
    });
    expect(result.gameSeats).toEqual({ challenger: "b", challenged: "w" });
    expect(result.gameCredentials).toEqual({
      whiteCredential: createChallengeCredentials().challengedCredential,
      blackCredential: createChallengeCredentials().challengerCredential,
    });
  });

  it("allows only one accept to commit", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const challenge = createChallengeCreated("challenge_double_accept");
    await store.appendChallengeCreated(challenge, createChallengeCredentials());

    await expect(
      store.acceptChallengeAndCreateGame(createChallengeAcceptInput(challenge, { gameId: "game_first_accept" }))
    ).resolves.toMatchObject({
      challengeSummary: { status: "accepted", gameId: "game_first_accept" },
    });
    await expect(
      store.acceptChallengeAndCreateGame(createChallengeAcceptInput(challenge, { gameId: "game_second_accept" }))
    ).rejects.toThrow(/already terminal/);
    expect(client.challengeEventRows.filter((row) => row.payload.type === "challenge_accepted")).toHaveLength(1);
    expect(client.eventRows.filter((row) => row.payload.type === "game_created")).toHaveLength(1);
  });

  it("rejects accepted challenge events until atomic game creation is implemented", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    await store.appendChallengeCreated(
      createChallengeCreated("challenge_append_accepted"),
      createChallengeCredentials()
    );

    await expect(
      store.appendChallengeEvent(createChallengeAccepted("challenge_append_accepted") as any)
    ).rejects.toThrow(/acceptChallengeAndCreateGame/);

    expect(client.challengeEventRows.map((row) => row.payload.type)).toEqual([
      "challenge_created",
    ]);
    expect(client.challengeSummaryRows).toHaveLength(1);
    expect(client.challengeSummaryRows[0].payload).toMatchObject({ status: "pending" });
  });

  it("rejects low-level challenge creation without credentials", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendChallengeEvent(createChallengeCreated("challenge_low_level_created") as any)
    ).rejects.toThrow(/appendChallengeCreated/);

    expect(client.challengeEventRows).toHaveLength(0);
    expect(client.challengeCredentialRows).toHaveLength(0);
    expect(client.challengeSummaryRows).toHaveLength(0);
  });

  it("rejects invalid challenge events before inserting", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.appendChallengeEvent({ type: "challenge_created" } as any)).rejects.toThrow(/schemaVersion/);
    await expect(
      store.appendChallengeCreated({
        ...createChallengeCreated("challenge_secret_reject"),
        note: "access_token=secret",
      } as any, createChallengeCredentials())
    ).rejects.toThrow(/token|credential|session|auth|cookie|invite/i);

    expect(client.challengeEventRows).toHaveLength(0);
  });

  it("rolls back challenge events when summary refresh fails", async () => {
    const client = new FakePostgresClient();
    client.failNextChallengeSummaryInsert = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendChallengeCreated(
        createChallengeCreated("challenge_append_rollback"),
        createChallengeCredentials()
      )
    ).rejects.toThrow(/challenge summary insert unavailable/);

    expect(client.challengeEventRows).toHaveLength(0);
    expect(client.challengeSummaryRows).toHaveLength(0);
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

  it("rolls back lifecycle failures without changing challenge summaries", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(
      store.appendChallengeEvent(createChallengeCancelled("challenge_missing_create"))
    ).rejects.toThrow(/missing challenge/);
    expect(client.challengeEventRows).toHaveLength(0);
    expect(client.challengeSummaryRows).toHaveLength(0);
  });

  it("rolls back duplicate challenge event ids and duplicate creation events", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const created = createChallengeCreated("challenge_duplicates");
    const firstSummary = await store.appendChallengeCreated(created, createChallengeCredentials());

    await expect(
      store.appendChallengeEvent({
        ...createChallengeCancelled("challenge_duplicates"),
        eventId: created.eventId,
      })
    ).rejects.toThrow(/duplicate challenge event id/);
    await expect(
      store.appendChallengeCreated({
        ...createChallengeCreated("challenge_duplicates"),
        eventId: "challenge-evt-duplicate-create-new-id",
      }, createChallengeCredentials())
    ).rejects.toThrow(/duplicate challenge creation/);

    expect(client.challengeEventRows).toHaveLength(1);
    expect(client.challengeSummaryRows).toEqual([{ payload: firstSummary }]);
  });

  it("rolls back terminal-after-terminal challenge events", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    await store.appendChallengeCreated(
      createChallengeCreated("challenge_terminal_again"),
      createChallengeCredentials()
    );
    const cancelledSummary = await store.appendChallengeEvent(createChallengeCancelled("challenge_terminal_again"));

    await expect(
      store.appendChallengeEvent({
        ...createChallengeCancelled("challenge_terminal_again"),
        eventId: "challenge-evt-challenge_terminal_again-cancelled-again",
        createdAt: "2026-06-01T12:07:00.000Z",
        cancelledAt: "2026-06-01T12:07:00.000Z",
      })
    ).rejects.toThrow(/already terminal/);

    expect(client.challengeEventRows.map((row) => row.payload.type)).toEqual([
      "challenge_created",
      "challenge_cancelled",
    ]);
    expect(client.challengeSummaryRows).toEqual([{ payload: cancelledSummary }]);
  });

  it("loads existing challenge summaries without reading challenge events", async () => {
    const client = new FakePostgresClient();
    const store = new PostgresOnlineGameStore({ queryable: client });
    const summary = await store.appendChallengeCreated(
      createChallengeCreated("challenge_summary_loaded"),
      createChallengeCredentials()
    );
    client.queries.length = 0;

    const summaries = await store.loadChallengeSummaries();

    expect(summaries).toEqual([summary]);
    expect(client.queries.some((query) => /from\s+online_challenge_events/i.test(query.text))).toBe(false);
  });

  it("rebuilds challenge summaries from ordered challenge events inside a locked transaction", async () => {
    const client = new FakePostgresClient();
    client.challengeEventRows = [
      { payload: createChallengeCreated("challenge_rebuild") },
      { payload: createChallengeAccepted("challenge_rebuild") },
    ];
    const store = new PostgresOnlineGameStore({ queryable: client });

    const summaries = await store.rebuildChallengeSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      challengeId: "challenge_rebuild",
      status: "accepted",
    });
    expect(client.challengeSummaryRows).toEqual([{ payload: summaries[0] }]);

    const queryTexts = client.queries.map((query) => query.text);
    const beginIndex = queryTexts.findIndex((text) => /^\s*begin\s*$/i.test(text));
    const lockIndex = queryTexts.findIndex((text) => /pg_advisory_xact_lock/i.test(text));
    const selectIndex = queryTexts.findIndex((text) => /select\s+payload\s+from\s+online_challenge_events/i.test(text));
    const deleteIndex = queryTexts.findIndex((text) => /delete\s+from\s+online_challenge_summaries/i.test(text));
    const insertIndex = queryTexts.findIndex((text) => /insert into online_challenge_summaries/i.test(text));
    const commitIndex = queryTexts.findIndex((text) => /^\s*commit\s*$/i.test(text));

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(selectIndex).toBeGreaterThan(lockIndex);
    expect(deleteIndex).toBeGreaterThan(selectIndex);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
    expect(commitIndex).toBeGreaterThan(insertIndex);

    const gameLockValue = client.queries.find(
      (query) => /pg_advisory_xact_lock/i.test(query.text) && query.values?.[0] === 1_431_903_351
    );
    const challengeLockValue = client.queries.find(
      (query) => /pg_advisory_xact_lock/i.test(query.text) && query.values?.[0] === 1_431_903_352
    );
    expect(gameLockValue).toBeUndefined();
    expect(challengeLockValue).toBeDefined();
  });

  it("rolls back challenge summary rebuilds when an upsert fails", async () => {
    const client = new FakePostgresClient();
    const existing = {
      schemaVersion: ONLINE_CHALLENGE_SUMMARY_SCHEMA_VERSION,
      challengeId: "challenge_existing_summary",
      challengerIdentity: challengeChallenger,
      challengedIdentity: challengeChallenged,
      challengerSeat: "w",
      visibility: "unlisted",
      setup: createGameCreatedEvent("game_existing_challenge_terms").setup,
      createdAt: "2026-06-01T12:00:00.000Z",
      updatedAt: "2026-06-01T12:00:00.000Z",
      expiresAt: "2026-06-01T12:10:00.000Z",
      status: "pending",
      lastEventId: "challenge-evt-existing",
    };
    client.challengeSummaryRows = [{ payload: existing }];
    client.challengeEventRows = [{ payload: createChallengeCreated("challenge_rebuild_rollback") }];
    client.failNextChallengeSummaryInsert = true;
    const store = new PostgresOnlineGameStore({ queryable: client });

    await expect(store.rebuildChallengeSummaries()).rejects.toThrow(/challenge summary insert unavailable/);

    expect(client.challengeSummaryRows).toEqual([{ payload: existing }]);
    expect(client.queries.some((query) => /^\s*rollback\s*$/i.test(query.text))).toBe(true);
  });

});
