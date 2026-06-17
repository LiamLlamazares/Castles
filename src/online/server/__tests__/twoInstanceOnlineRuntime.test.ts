import { describe, expect, it } from "vitest";
import { createTwoInstanceRuntimeHarness } from "./twoInstanceRuntimeHarness";

describe("two-instance online runtime characterization", () => {
  it("fans out player actions from one server to a spectator on another server after runtime polling", async () => {
    const harness = await createTwoInstanceRuntimeHarness({
      gameId: "game_two_instance_action",
    });
    try {
      const game = await harness.createGameOnNodeA();
      const spectator = await harness.spectateOnNodeB(game.gameId);
      const player = await harness.joinWhiteOnNodeA(game);
      const publicGame = await harness.fetchPublicGameOnNodeA(game.gameId);

      expect(publicGame.livePreview?.spectatorCount).toBe(1);

      const broadcast = harness.nextSpectatorMessage(
        spectator,
        "cross-node action broadcast"
      );
      await harness.sendWhiteAction(player, game, {
        type: "PASS",
        baseVersion: 0,
      });
      await harness.pollNodeBRuntimeEvents();

      await expect(broadcast).resolves.toMatchObject({
        type: "snapshot",
        snapshot: { gameId: game.gameId, version: 1 },
      });
    } finally {
      await harness.close();
    }
  });

  it("shares live spectator counts across server instances and removes them on close", async () => {
    const harness = await createTwoInstanceRuntimeHarness({
      gameId: "game_two_instance_presence",
    });
    try {
      const game = await harness.createGameOnNodeA();
      const spectator = await harness.spectateOnNodeB(game.gameId);

      await expect(harness.fetchPublicGameOnNodeA(game.gameId)).resolves.toMatchObject({
        livePreview: { spectatorCount: 1 },
      });

      await harness.closeSocket(spectator);

      const afterClose = await harness.fetchPublicGameOnNodeA(game.gameId);
      expect(afterClose.livePreview?.spectatorCount).toBeUndefined();
    } finally {
      await harness.close();
    }
  });

  it("serializes same-session Quick Match fallback creation across server instances", async () => {
    const harness = await createTwoInstanceRuntimeHarness({
      gameId: "game_two_instance_quick_match",
    });
    try {
      const gateKey = "quick_match_session:session:session_race";
      harness.expectSharedGateContention(gateKey, 2);

      const [nodeA, nodeB] = await Promise.all([
        harness.quickMatchOnNodeA("session_race"),
        harness.quickMatchOnNodeB("session_race"),
      ]);

      expect([nodeA.status, nodeB.status].sort()).toEqual([200, 409]);
      const waiting = [nodeA, nodeB].find((result) => result.status === 200);
      const rejected = [nodeA, nodeB].find((result) => result.status === 409);
      expect(waiting?.body).toMatchObject({
        outcome: "waiting",
        summary: { status: "open" },
      });
      expect(rejected?.body).toMatchObject({
        error: { code: "existing_open_seek" },
      });
      expect(await harness.countOpenSeeks()).toBe(1);
      expect(harness.sharedGateCallCount(gateKey)).toBe(2);
    } finally {
      await harness.close();
    }
  });

  it("lets only one cross-node open seek accept race create a game", async () => {
    const harness = await createTwoInstanceRuntimeHarness({
      gameId: "game_two_instance_open_seek_accept",
    });
    try {
      const created = await harness.createOpenSeekOnNodeA("session_creator");
      const gateKey = `open_seek_lifecycle:open_seek_lifecycle:${created.seekId}`;
      harness.expectSharedGateContention(gateKey, 2);

      const [nodeA, nodeB] = await Promise.all([
        harness.acceptOpenSeekOnNodeA(created.seekId, "session_acceptor_a"),
        harness.acceptOpenSeekOnNodeB(created.seekId, "session_acceptor_b"),
      ]);

      expect([nodeA.status, nodeB.status].sort()).toEqual([200, 409]);
      const accepted = [nodeA, nodeB].find((result) => result.status === 200);
      const rejected = [nodeA, nodeB].find((result) => result.status === 409);
      expect(accepted?.body).toMatchObject({
        role: "acceptor",
        summary: { seekId: created.seekId, status: "accepted" },
      });
      expect(rejected?.body).toMatchObject({
        error: { code: "game_over" },
      });
      expect(await harness.countGames()).toBe(1);
      expect(harness.sharedGateCallCount(gateKey)).toBe(2);
    } finally {
      await harness.close();
    }
  });

  it("keeps targeted account challenge pair races from creating duplicate pending challenges", async () => {
    const harness = await createTwoInstanceRuntimeHarness({
      gameId: "game_two_instance_account_challenge",
    });
    try {
      const { challenger, challenged, challengePairGateKey } = await harness.createChallengeAccounts();
      harness.expectSharedGateContention(challengePairGateKey, 2);

      const [nodeA, nodeB] = await Promise.all([
        harness.createTargetedChallengeOnNodeA(challenger.session.token, challenged.account.displayName),
        harness.createTargetedChallengeOnNodeB(challenger.session.token, challenged.account.displayName),
      ]);

      expect([nodeA.status, nodeB.status].sort()).toEqual([201, 429]);
      const created = [nodeA, nodeB].find((result) => result.status === 201);
      const rejected = [nodeA, nodeB].find((result) => result.status === 429);
      expect(created?.body).toMatchObject({
        summary: { status: "pending" },
      });
      expect(rejected?.body).toMatchObject({
        error: { code: "rate_limited" },
      });
      expect(await harness.countChallenges()).toBe(1);
      expect(harness.sharedGateCallCount(challengePairGateKey)).toBe(2);
    } finally {
      await harness.close();
    }
  });
});
