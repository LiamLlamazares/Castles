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
});
