import { describe, expect, it } from "vitest";
import {
  buildOnlineWebSocketUrl,
  parseOnlineJoinParams,
} from "../client";

describe("online client helpers", () => {
  it("parses private online invite URLs", () => {
    expect(
      parseOnlineJoinParams(
        "https://castles.example/?onlineGame=game_123&seat=w&token=secret"
      )
    ).toEqual({
      gameId: "game_123",
      seat: "w",
      token: "secret",
    });
  });

  it("builds secure websocket URLs from https origins", () => {
    expect(buildOnlineWebSocketUrl("https://castles.example/path")).toBe(
      "wss://castles.example/ws"
    );
  });

  it("builds local websocket URLs from http origins", () => {
    expect(buildOnlineWebSocketUrl("http://127.0.0.1:3000")).toBe(
      "ws://127.0.0.1:3000/ws"
    );
  });
});
