import { describe, expect, it } from "vitest";
import { createServerConfigurationReport } from "../configReport";

describe("createServerConfigurationReport", () => {
  it("includes single-node deployment guardrails in check-config output", () => {
    const report = createServerConfigurationReport({
      config: {
        port: 3000,
        bindHost: "127.0.0.1",
        publicBaseUrl: "https://castles.example",
        staticDir: "/srv/castles/build",
        requireStaticDir: true,
        localShutdownEnabled: false,
        runtimeNodeId: "prod-node-a",
        deployment: {
          mode: "single-node",
          multiInstanceReady: false,
          websocketFanout: "process-local",
          spectatorPresence: "postgres-live-presence",
          accountPresence: "session-store",
          roomState: "process-local",
          queueGuards: "process-local",
          routing: "single-node",
        },
        buildId: "20260615-120000",
        commit: "0123456789abcdef0123456789abcdef01234567",
      },
      onlineStore: {
        backend: "postgres",
        path: "postgres",
        postgresPoolMaxPerStore: 5,
      },
      replayedRooms: 12,
    });

    expect(report).toMatchObject({
      ok: true,
      onlineDeployment: {
        mode: "single-node",
        multiInstanceReady: false,
        websocketFanout: "process-local",
        spectatorPresence: "postgres-live-presence",
        accountPresence: "session-store",
        roomState: "process-local",
        queueGuards: "process-local",
        routing: "single-node",
      },
      runtime: {
        nodeId: "prod-node-a",
      },
      onlineStore: {
        backend: "postgres",
        path: "postgres",
        postgresPoolMaxPerStore: 5,
        replayChecked: true,
        replayedRooms: 12,
      },
    });
  });
});
