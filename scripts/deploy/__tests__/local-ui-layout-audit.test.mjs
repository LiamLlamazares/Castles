import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  LONG_ONLINE_STATUS_AUDIT_MESSAGE,
  SCENARIOS,
  TUTORIAL_PROGRESS_KEY,
  installTutorialAuditDefaults,
} from "../check-local-ui-layout-audit.mjs";

function scenarioSteps(name) {
  const scenario = SCENARIOS.find((candidate) => candidate.name === name);
  expect(scenario).toBeTruthy();
  expect(scenario.prepare).toEqual(expect.any(Function));
  return scenario.steps;
}

describe("local UI layout audit script", () => {
  it("uses a bounded graceful shutdown timeout without extending forced-kill waits", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/deploy/check-local-ui-layout-audit.mjs"),
      "utf8"
    );

    expect(script).toContain("const shutdownTimeoutMs = 40_000");
    expect(script).toContain("const forcedKillTimeoutMs = 7_000");
    expect(script).toContain("sleep(shutdownTimeoutMs)");
    expect(script).toContain("sleep(forcedKillTimeoutMs)");
  });

  it("drives first-run tutorial and setup actions through the real scenario definitions", () => {
    expect(scenarioSteps("first-run-start-tutorial")).toEqual([
      { action: "clickButton", text: "Start Tutorial" },
      { action: "waitForText", text: "Castles tutorial" },
      { action: "waitForText", text: "Progress saved" },
      { action: "waitForButton", text: "Start Tutorial" },
    ]);

    expect(scenarioSteps("first-run-set-up-game")).toEqual([
      { action: "clickButton", text: "Set Up Game" },
      { action: "waitForButton", text: "Play Local" },
      { action: "waitForText", text: "Invite Friend" },
    ]);
  });

  it("captures the tutorial next-lesson and overview-return progress path", () => {
    expect(scenarioSteps("tutorial-progress-return")).toEqual([
      { action: "ensureSetupPage" },
      { action: "clickButton", text: "Tutorial" },
      { action: "waitForText", text: "Castles tutorial" },
      { action: "waitForText", text: "Progress saved" },
      { action: "clickButton", text: "Start Tutorial" },
      { action: "waitForText", text: "Lesson 1 of" },
      { action: "clickButton", text: "Next lesson" },
      { action: "waitForText", text: "Lesson 2 of" },
      { action: "waitForText", text: "Progress saved" },
      { action: "clickButton", text: "Tutorial overview" },
      { action: "waitForText", text: "Castles tutorial" },
      { action: "waitForText", text: "1 / 36 lessons completed" },
      { action: "waitForButton", text: "Continue Tutorial" },
    ]);
  });

  it("explicitly isolates tutorial progress from real local browser state", async () => {
    localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify({ lastLessonId: "m5_09_walkthrough" }));
    localStorage.setItem("castles_first_run_intro_seen", "true");

    const context = {
      addInitScript: vi.fn(async (callback, payload) => {
        callback(payload);
      }),
    };

    await installTutorialAuditDefaults(context, { showFirstRunIntro: true });

    expect(context.addInitScript).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TUTORIAL_PROGRESS_KEY)).toBeNull();
    expect(localStorage.getItem("castles_first_run_intro_seen")).toBeNull();
    expect(localStorage.getItem("hasSeenQuickStart")).toBeNull();
    expect(localStorage.getItem("hasSeenTooltipHint")).toBe("true");
  });

  it("captures a long trusted online status message and its recovery action", () => {
    const scenario = SCENARIOS.find((candidate) => candidate.name === "online-connection-long-status");

    expect(scenario).toBeTruthy();
    expect(scenario.steps).toEqual([
      { action: "openMissingOnlineInvite", gameId: expect.stringMatching(/^game_ui_audit_long_status_/), seat: "w", token: expect.stringMatching(/^ui_audit_long_status_token_/) },
      { action: "waitForRegion", text: "Online game connection" },
      { action: "setOnlineStateStatus", text: LONG_ONLINE_STATUS_AUDIT_MESSAGE },
      { action: "waitForText", text: LONG_ONLINE_STATUS_AUDIT_MESSAGE },
      { action: "waitForButton", text: "Configure New Game" },
    ]);
    expect(scenario.requiredTexts()).toEqual([
      "Online Game",
      LONG_ONLINE_STATUS_AUDIT_MESSAGE,
      "Configure New Game",
    ]);
  });
});
