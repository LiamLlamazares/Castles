import { formatOnlineServerLogEvent } from "../onlineServerLogging";

describe("online server logging", () => {
  it("formats online log events as structured JSON", () => {
    const line = formatOnlineServerLogEvent({
      event: "online.action",
      status: "accepted",
      gameId: "game_log_format",
      role: "player",
      action: "PASS",
    });

    expect(JSON.parse(line)).toEqual({
      source: "castles-online",
      event: "online.action",
      status: "accepted",
      gameId: "game_log_format",
      role: "player",
      action: "PASS",
    });
  });

  it("only emits whitelisted fields from log events", () => {
    const line = formatOnlineServerLogEvent({
      event: "online.socket.join",
      status: "accepted",
      gameId: "game_log_redaction",
      role: "player",
      token: "secret-token",
      authorization: "Bearer secret-token",
    } as never);

    expect(line).not.toContain("secret-token");
    expect(JSON.parse(line)).toEqual({
      source: "castles-online",
      event: "online.socket.join",
      status: "accepted",
      gameId: "game_log_redaction",
      role: "player",
    });
  });
});
