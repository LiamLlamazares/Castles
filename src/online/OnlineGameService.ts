import { randomBytes } from "node:crypto";
import {
  OnlineGameRoom,
  OnlineGameRoomRecord,
} from "./OnlineGameRoom";
import { OnlineGameSetupDTO } from "./types";

export interface OnlineInvite {
  token: string;
  url: string;
}

export interface CreatedOnlineGame {
  gameId: string;
  white: OnlineInvite;
  black: OnlineInvite;
}

export interface CreateOnlineGameOptions {
  publicBaseUrl: string;
}

export interface OnlineGameServiceOptions {
  idFactory?: () => string;
  tokenFactory?: (seat: "w" | "b") => string;
  now?: () => number;
}

function defaultIdFactory(): string {
  return `game_${randomBytes(9).toString("base64url")}`;
}

function defaultTokenFactory(): string {
  return randomBytes(18).toString("base64url");
}

function buildInviteUrl(
  publicBaseUrl: string,
  gameId: string,
  seat: "w" | "b",
  token: string
): string {
  const url = new URL(publicBaseUrl);
  url.searchParams.set("onlineGame", gameId);
  url.searchParams.set("seat", seat);
  url.searchParams.set("token", token);
  return url.toString();
}

export class OnlineGameService {
  private readonly rooms = new Map<string, OnlineGameRoom>();
  private readonly idFactory: () => string;
  private readonly tokenFactory: (seat: "w" | "b") => string;
  private readonly now: () => number;

  constructor(options: OnlineGameServiceOptions = {}) {
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.tokenFactory = options.tokenFactory ?? defaultTokenFactory;
    this.now = options.now ?? Date.now;
  }

  static fromRecords(records: OnlineGameRoomRecord[]): OnlineGameService {
    const service = new OnlineGameService();
    for (const record of records) {
      service.rooms.set(record.gameId, OnlineGameRoom.create(record));
    }
    return service;
  }

  createGame(
    setup: OnlineGameSetupDTO,
    options: CreateOnlineGameOptions
  ): CreatedOnlineGame {
    let gameId = this.idFactory();
    while (this.rooms.has(gameId)) {
      gameId = this.idFactory();
    }

    const whiteToken = this.tokenFactory("w");
    const blackToken = this.tokenFactory("b");
    const room = OnlineGameRoom.create({
      setup,
      gameId,
      whiteToken,
      blackToken,
      now: this.now,
    });

    this.rooms.set(gameId, room);

    return {
      gameId,
      white: {
        token: whiteToken,
        url: buildInviteUrl(options.publicBaseUrl, gameId, "w", whiteToken),
      },
      black: {
        token: blackToken,
        url: buildInviteUrl(options.publicBaseUrl, gameId, "b", blackToken),
      },
    };
  }

  getRoom(gameId: string): OnlineGameRoom | null {
    return this.rooms.get(gameId) ?? null;
  }

  deleteGame(gameId: string): void {
    this.rooms.delete(gameId);
  }

  replaceRoom(record: OnlineGameRoomRecord): void {
    this.rooms.set(record.gameId, OnlineGameRoom.create({ ...record, now: this.now }));
  }

  getRoomForToken(gameId: string, token: string): OnlineGameRoom | null {
    const room = this.getRoom(gameId);
    if (!room || !room.authenticate(token)) return null;
    return room;
  }
}
