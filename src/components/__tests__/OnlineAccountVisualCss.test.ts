import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));

describe("Online account visual CSS", () => {
  const oldCreamMintPalette = [
    "#f7f1d6",
    "#d9d0b8",
    "#9ed0c2",
    "#70d6a1",
    "#91d6c5",
    "#fff7cf",
    "#fff8df",
    "#9bd3ff",
    "#f3f0e8",
    "#c9c1b5",
    "#f4ecd9",
    "#eee0c3",
    "#d9c49a",
    "rgba(255, 252, 243",
    "rgba(112, 214, 161",
    "rgba(246, 241, 209",
    "rgba(145, 214, 197",
  ];

  it("uses a compact neutral account dialog palette", () => {
    const css = readFileSync(resolve(testDir, "../../css/OnlineAccountControls.css"), "utf8");

    expect(css).toMatch(/\.online-account-dialog\s*\{[^}]*width:\s*min\(390px,\s*calc\(100vw - 32px\)\);/s);
    expect(css).toMatch(/\.online-account-dialog\s*\{[^}]*font-family:\s*"Inter", system-ui/s);
    expect(css).toMatch(/\.online-account-dialog\s*\{[^}]*background:\s*#262421;/s);
    expect(css).toMatch(/\.online-account-dialog\s*\{[^}]*color:\s*#bababa;/s);
    expect(css).toMatch(/\.online-account-dialog-form\s*\{[^}]*max-width:\s*340px;/s);
    expect(css).toMatch(/\.online-account-dialog-actions\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;/s);
    expect(css).toMatch(/\.online-account-dialog-form input\s*\{[^}]*background:\s*#3c3934;[^}]*color:\s*#d4d4d4;/s);
    expect(css).toMatch(/\.online-account-dialog-button\.primary\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s);
    expect(css).not.toContain("#f7f1d6");
    expect(css).not.toContain("#d9d0b8");
    expect(css).not.toContain("#9ed0c2");
    expect(css).not.toContain("#70d6a1");
  });

  it("keeps profile pages on the same neutral account surface palette", () => {
    const css = readFileSync(resolve(testDir, "../../css/OnlineProfileDashboard.css"), "utf8");

    expect(css).toMatch(/\.online-profile-page\s*\{[^}]*background:\s*#161512;/s);
    expect(css).toMatch(/\.online-profile-page\s*\{[^}]*color:\s*#bababa;/s);
    expect(css).toMatch(/\.online-profile-hero\s*\{[^}]*background:\s*#262421;/s);
    expect(css).toMatch(/\.online-profile-panel\s*\{[^}]*background:\s*#262421;/s);
    expect(css).toMatch(/\.online-profile-display-name\s*\{[^}]*color:\s*#d4d4d4;/s);
    expect(css).toMatch(/\.online-profile-button:focus-visible\s*\{[^}]*outline:\s*2px solid rgba\(191,\s*129,\s*29,\s*0\.68\);/s);
    expect(css).not.toContain("#f7f1d6");
    expect(css).not.toContain("#d9d0b8");
    expect(css).not.toContain("#9ed0c2");
    expect(css).not.toContain("#70d6a1");
  });

  it("gives shared online account pages explicit light-theme surfaces", () => {
    const expectations = [
      ["../../css/AppShellNav.css", /\[data-theme="light"\] \.app-shell-back-button,[\s\S]*\[data-theme="light"\] \.app-shell-destination\s*\{[^}]*background:\s*#ffffff;[^}]*color:\s*#1f1f1f;/s],
      ["../../css/OnlineGameBrowser.css", /\[data-theme="light"\] \.online-browser-page\s*\{[^}]*background:\s*#f0f0f0;[^}]*color:\s*#1f1f1f;/s],
      ["../../css/GameLibrary.css", /\[data-theme="light"\] \.game-library-page\s*\{[^}]*background:\s*#f0f0f0;[^}]*color:\s*#1f1f1f;/s],
      ["../../css/OnlineProfileDashboard.css", /\[data-theme="light"\] \.online-profile-page\s*\{[^}]*background:\s*#f0f0f0;[^}]*color:\s*#1f1f1f;/s],
      ["../../css/OnlineAccountControls.css", /\[data-theme="light"\] \.online-account-dialog\s*\{[^}]*background:\s*#ffffff;[^}]*color:\s*#1f1f1f;/s],
    ] as const;

    for (const [file, pattern] of expectations) {
      const css = readFileSync(resolve(testDir, file), "utf8");
      expect(css, file).toMatch(pattern);
    }
  });

  it("keeps active online tabs readable in light mode", () => {
    const css = readFileSync(resolve(testDir, "../../css/OnlineGameBrowser.css"), "utf8");

    expect(css).toMatch(/\[data-theme="light"\] \.online-browser-page \.online-browser-tabs button\.active\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s);
  });

  it("uses app typography for online tabs and buttons", () => {
    const css = readFileSync(resolve(testDir, "../../css/OnlineGameBrowser.css"), "utf8");

    expect(css).toMatch(/\.online-browser-tabs button,\s*\.online-browser-button\s*\{[^}]*font:\s*inherit;/s);
  });

  it("keeps shared dark app pages out of the old cream and mint palette", () => {
    const files = [
      "../../css/AppShellNav.css",
      "../../css/OnlineGameBrowser.css",
      "../../css/GameLibrary.css",
      "../../css/OnlineProfileDashboard.css",
      "../../css/OnlineAccountControls.css",
      "../../css/Board.css",
      "../../css/QuickStartModal.css",
      "../../css/RulesModal.css",
      "../../css/RulesManualPage.css",
    ];

    for (const file of files) {
      const css = readFileSync(resolve(testDir, file), "utf8");
      for (const color of oldCreamMintPalette) {
        expect(css, `${file} should not use ${color}`).not.toContain(color);
      }
    }
  });

  it("keeps first-run quickstart chrome on neutral lichess-like colors", () => {
    const css = readFileSync(resolve(testDir, "../../css/QuickStartModal.css"), "utf8");

    expect(css).toMatch(/\.quickstart-modal\s*\{[^}]*background:\s*#262421;/s);
    expect(css).toMatch(/\.quickstart-header\s*\{[^}]*background:\s*#1f1e1b;[^}]*border-bottom:\s*1px solid #3d3a34;/s);
    expect(css).toMatch(/\.quickstart-goal\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.055\);[^}]*border:\s*1px solid #4b4740;/s);
    expect(css).toMatch(/\.quickstart-learn-btn\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s);
    expect(css).toMatch(/\.quickstart-play-btn\s*\{[^}]*background:\s*#3c3934;[^}]*color:\s*#d4d4d4;/s);
    expect(css).not.toContain("rgba(255, 215, 0");
    expect(css).not.toContain("rgba(255, 165, 0");
    expect(css).not.toContain("#667eea");
    expect(css).not.toContain("#764ba2");
  });

  it("keeps rules/help modal chrome out of the old fantasy gold treatment", () => {
    const css = readFileSync(resolve(testDir, "../../css/RulesModal.css"), "utf8");

    expect(css).toMatch(/\.rules-modal\s*\{[^}]*background:\s*#262421;[^}]*color:\s*#bababa;/s);
    expect(css).toMatch(/\.rules-header\s*\{[^}]*background:\s*#1f1e1b;[^}]*border-radius:\s*8px 8px 0 0;/s);
    expect(css).toMatch(/\.rules-header h1\s*\{[^}]*color:\s*#d4d4d4;[^}]*font-family:\s*"Inter", system-ui/s);
    expect(css).toMatch(/\.rules-box\s*\{[^}]*border-left:\s*4px solid #bf811d;/s);
    expect(css).not.toContain("#ffd700");
    expect(css).not.toContain("rgba(255, 215, 0");
    expect(css).not.toContain("font-family: 'Georgia'");
    expect(css).not.toContain("border-radius: 16px");
  });

  it("keeps the full rules manual on the neutral app palette", () => {
    const css = readFileSync(resolve(testDir, "../../css/RulesManualPage.css"), "utf8");

    expect(css).toMatch(/--rules-bg:\s*linear-gradient\(135deg,\s*#161512 0%,\s*#1f1e1b 100%\);/);
    expect(css).toMatch(/--rules-text:\s*#d4d4d4;/);
    expect(css).toMatch(/--rules-muted:\s*#bababa;/);
    expect(css).toMatch(/\[data-theme="light"\] \.rules-manual-page\s*\{[^}]*--rules-bg:\s*#f0f0f0;[^}]*--rules-card:\s*#ffffff;[^}]*--rules-text:\s*#1f1f1f;/s);
    expect(css).toContain("font-family: 'Inter', system-ui");
    expect(css).not.toContain("font-family: Georgia");
    expect(css).not.toContain("#f4ecd9");
    expect(css).not.toContain("#eee0c3");
    expect(css).not.toContain("#d9c49a");
  });

  it("uses the neutral dark palette for first-run and shared modal dialogs", () => {
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).toMatch(/\.confirm-dialog\s*\{[^}]*background:\s*#262421;[^}]*color:\s*#bababa;/s);
    expect(css).toMatch(/\.confirm-dialog p\s*\{[^}]*color:\s*#bababa;/s);
    expect(css).toMatch(/\.first-run-intro-kicker\s*\{[^}]*color:\s*#8f8f8f;/s);
    expect(css).toMatch(/\.confirm-dialog-button\.neutral\s*\{[^}]*background:\s*#3c3934;[^}]*color:\s*#d4d4d4;/s);
    expect(css).toMatch(/\.confirm-dialog-button\.primary\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s);
  });

  it("keeps green CTAs on accessible dark text", () => {
    const expectations = [
      ["../../css/AppShellNav.css", /\.app-shell-destination\.active,[\s\S]*\.app-shell-destination\[aria-current="page"\]\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s],
      ["../../css/GameLibrary.css", /\.library-button\.success\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s],
      ["../../css/OnlineGameBrowser.css", /\.online-browser-account-topbar-button\.primary,[\s\S]*\.online-browser-account-topbar-oauth\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s],
      ["../../css/OnlineAccountControls.css", /\.online-account-dialog-button\.primary\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s],
      ["../../css/Board.css", /\.confirm-dialog-button\.primary\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s],
      ["../../css/QuickStartModal.css", /\.quickstart-learn-btn\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s],
    ] as const;

    for (const [file, pattern] of expectations) {
      const css = readFileSync(resolve(testDir, file), "utf8");
      expect(css, file).toMatch(pattern);
    }
  });

  it("keeps online board previews neutral instead of parchment colored", () => {
    const css = readFileSync(resolve(testDir, "../../css/OnlineGameBrowser.css"), "utf8");

    expect(css).toMatch(/\.online-game-board-preview-cells circle\s*\{[^}]*fill:\s*rgba\(212,\s*212,\s*212,\s*0\.14\);/s);
    expect(css).toMatch(/\.online-game-board-preview-pieces \.piece-w circle\s*\{[^}]*fill:\s*#d4d4d4;/s);
    expect(css).not.toContain("rgba(247, 241, 214");
    expect(css).not.toContain("#f1ead2");
  });
});
