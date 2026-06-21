import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

describe("Tutorial mobile layout CSS", () => {
  it("bounds lesson text height so the board remains visible on mobile", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).toContain("grid-template-rows: minmax(0, 50dvh) minmax(0, 50dvh);");
    expect(css).toContain("max-height: 50dvh;");
    expect(css).toContain("overflow-y: auto;");
    expect(css).not.toContain("grid-template-rows: minmax(0, 58dvh) minmax(250px, 42dvh);");
    expect(css).not.toContain("min-height: 250px;");
  });

  it("compresses tutorial chrome on short mobile screens", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).toContain("@media (max-width: 760px) and (max-height: 720px)");
    expect(css).toContain("grid-template-rows: minmax(0, 46dvh) minmax(0, 54dvh);");
    expect(css).toContain("max-height: 46dvh;");
    expect(css).toContain("height: 54dvh;");
    expect(css).toContain(".tutorial-lesson-header");
    expect(css).toContain(".tutorial-control-strip");
    expect(css).toContain(".tutorial-course-main");
    expect(css).toContain(".tutorial-objective-list");
    expect(css).toContain(".tutorial-quick-nav");
    expect(css).toContain(".tutorial-description");
    expect(css).toContain(".tutorial-callout");
    expect(css).toMatch(/@media \(max-width: 760px\) and \(max-height: 720px\)\s*\{[\s\S]*\.tutorial-sidebar \.app-shell-title-block\s*\{[^}]*display:\s*none;/s);
    expect(css).toMatch(/@media \(max-width: 760px\) and \(max-height: 720px\)\s*\{[\s\S]*\.tutorial-module-chip,[\s\S]*\.tutorial-progress-saved-chip\s*\{[^}]*font-size:\s*0\.66rem;/s);
    expect(css).toMatch(/@media \(max-width: 760px\) and \(max-height: 720px\)\s*\{[\s\S]*\.tutorial-reset-full\s*\{[^}]*display:\s*none;/s);
    expect(css).toMatch(/@media \(max-width: 760px\) and \(max-height: 720px\)\s*\{[\s\S]*\.tutorial-reset-short\s*\{[^}]*display:\s*inline;/s);
    expect(css).not.toMatch(/\.tutorial-sidebar \.app-shell-title-block p\s*\{\s*display:\s*none;\s*\}/);
  });

  it("switches the Tutorial overview to a single mobile scrollport", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).toContain(".tutorial-container-course");
    expect(css).toMatch(/\.tutorial-container\.tutorial-container-course\s*\{[^}]*grid-template-columns:\s*360px minmax\(0,\s*1fr\);[^}]*background:\s*var\(--tutorial-course-bg\);/s);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.tutorial-container-course\s*\{[^}]*display:\s*block;[^}]*height:\s*100dvh;[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.tutorial-course-section-map\s*\{[^}]*display:\s*none;/s);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.tutorial-container-course \.tutorial-course-progress-card \.tutorial-course-actions,[\s\S]*\.tutorial-course-hero \.tutorial-course-primary-action,[\s\S]*\.tutorial-course-kicker\s*\{[^}]*display:\s*none;/s);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.tutorial-course-main\s*\{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
    expect(css).toMatch(/\.tutorial-control-strip\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.tutorial-reset-full\s*\{[^}]*display:\s*none;/s);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.tutorial-reset-short\s*\{[^}]*display:\s*inline;/s);
  });

  it("keeps shared mobile shell spacing aligned inside online state pages", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).toMatch(/\.online-state-panel\s*\{[^}]*--app-shell-mobile-padding-x:\s*0px;[^}]*--app-shell-mobile-padding-y:\s*0px;/s);
    expect(css).toContain("@media (max-width: 760px) and (max-height: 720px)");
    expect(css).toContain("--app-shell-mobile-padding-x: 16px;");
  });

  it("keeps the modal drawer above app-level install prompts", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    const openContainerRule = css.match(/\.hamburger-container\.open\s*\{[^}]+}/)?.[0] ?? "";
    const drawerRule = css.match(/\.hamburger-menu\s*\{[^}]+}/)?.[0] ?? "";
    const menuItemsRule = css.match(/\.menu-items\s*\{[^}]+}/)?.[0] ?? "";
    const backdropRule = css.match(/\.menu-backdrop\s*\{[^}]+}/)?.[0] ?? "";
    const iconFrameRule = css.match(/\.menu-item-icon-frame\s*\{[^}]+}/)?.[0] ?? "";
    const iconRule = css.match(/\.menu-item-icon,\s*\.menu-item > img\s*\{[^}]+}/)?.[0] ?? "";

    expect(openContainerRule).toContain("z-index: 4000;");
    expect(drawerRule).toContain("z-index: 4002;");
    expect(menuItemsRule).toContain("flex: 1 1 auto;");
    expect(menuItemsRule).toContain("min-height: 0;");
    expect(menuItemsRule).toContain("overflow-y: auto;");
    expect(backdropRule).toContain("z-index: 4001;");
    expect(iconFrameRule).toContain("background: rgba(255, 255, 255, 0.08);");
    expect(iconFrameRule).toContain("border: 1px solid rgba(255, 255, 255, 0.1);");
    expect(iconRule).toContain("filter: brightness(0) saturate(100%) invert(94%)");
    expect(iconRule).toContain("opacity: 0.92;");
    expect(css).toMatch(/\.menu-item-icon,\s*\.menu-item > img\s*\{[^}]*object-fit:\s*contain;[^}]*object-position:\s*center;/s);
    expect(css).toMatch(/\[data-theme="light"\] \.menu-item-icon,\s*\[data-theme="light"\] \.menu-item > img\s*\{[^}]*filter:\s*brightness\(0\) saturate\(100%\) invert\(11%\)/s);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.menu-section-note\s*\{[^}]*display:\s*none;/s);
  });

  it("keeps the desktop tooltip discovery hint away from shell controls", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    const hintRule = css.match(/\.tooltip-hint-banner\s*\{[^}]+}/)?.[0] ?? "";

    expect(hintRule).toContain("top: 16px;");
    expect(hintRule).toContain("bottom: auto;");
    expect(hintRule).toContain("left: 76px;");
    expect(hintRule).toContain("right: auto;");
    expect(hintRule).toContain("max-width: 320px;");
  });

  it("sizes the board container to its parent stage rather than a full viewport", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(testDir, "../Board/BoardContainer.tsx"), "utf8");

    expect(source).toContain("height: '100%'");
    expect(source).not.toContain("height: '100vh'");
  });

  it("does not retain old hidden sidebar compatibility selectors", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(css).not.toMatch(/\.sidebar\s*\{/);
    expect(css).not.toContain(".sidebar-section");
    expect(css).not.toContain(".sidebar-divider");
    expect(css).not.toContain(".control-buttons");
    expect(css).not.toContain(".game-button");
  });

  it("keeps the shared app shell from overlapping mobile page controls", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, "../../css/AppShellNav.css"), "utf8");
    const accountCss = readFileSync(resolve(testDir, "../../css/OnlineAccountControls.css"), "utf8");

    const mobileBlock = css.match(/@media \(max-width: 760px\)\s*\{[\s\S]+}$/)?.[0] ?? "";
    expect(mobileBlock).not.toContain("position: sticky");
    expect(mobileBlock).not.toContain("calc(-1 * var(--app-shell-mobile-padding");
    expect(css).toContain(".app-shell-nav-primary");
    expect(css).toMatch(/\.app-shell-nav-primary\s*\{[^}]*overflow:\s*hidden;/s);
    expect(css).toContain("flex-wrap: nowrap;");
    expect(css).toContain("overflow-x: auto;");
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.app-shell-nav\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.app-shell-nav-actions\s*\{[^}]*flex:\s*1 0 100%;[^}]*width:\s*100%;/s);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.app-shell-nav-actions > \*\s*\{[^}]*width:\s*100%;/s);
    expect(css).toContain(".app-shell-destination-label");
    expect(css).toContain(".app-shell-back-label");
    expect(css).toMatch(/@media \(max-width: 520px\)\s*\{[\s\S]*\.app-shell-back-label\s*\{[^}]*display:\s*none;/s);
    expect(css).toContain(".setup-sidebar .app-shell-destination");
    expect(css).toContain("font-family: \"Inter\", system-ui");
    expect(accountCss).toMatch(/@media \(max-width: 520px\)\s*\{[\s\S]*\.online-browser-account-chip\s*\{[^}]*width:\s*36px;[^}]*max-width:\s*36px;/s);
    expect(accountCss).toMatch(/@media \(max-width: 520px\)\s*\{[\s\S]*\.online-browser-account-chip \.online-account-chip-name\s*\{[^}]*display:\s*none;/s);
  });

  it("uses modern app-page typography for Library and online browser pages", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const libraryCss = readFileSync(resolve(testDir, "../../css/GameLibrary.css"), "utf8");
    const onlineCss = readFileSync(resolve(testDir, "../../css/OnlineGameBrowser.css"), "utf8");
    const indexCss = readFileSync(resolve(testDir, "../../index.css"), "utf8");
    const installHintSource = readFileSync(resolve(testDir, "../InstallAppHint.tsx"), "utf8");

    expect(libraryCss).not.toContain("Georgia");
    expect(onlineCss).not.toContain("Georgia");
    expect(installHintSource).not.toContain("Georgia");
    expect(installHintSource).not.toContain("borderRadius: \"14px\"");
    expect(indexCss).toContain("font-family: \"Inter\", system-ui");
    expect(libraryCss).toContain("font-family: \"Inter\", system-ui");
    expect(onlineCss).toContain("font-family: \"Inter\", system-ui");
    expect(libraryCss).toMatch(/\.library-button\s*\{[^}]*font:\s*inherit;/s);
  });

  it("lets the online lobby filter toolbar wrap without fixed-column crowding", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const onlineCss = readFileSync(resolve(testDir, "../../css/OnlineGameBrowser.css"), "utf8");

    expect(onlineCss).toContain("grid-template-columns: minmax(180px, max-content) minmax(220px, 1fr) auto;");
    expect(onlineCss).toContain("grid-template-columns: repeat(auto-fit, minmax(min(145px, 100%), 1fr));");
    expect(onlineCss).toContain(".online-browser-filter-panel");
    expect(onlineCss).toContain(".online-browser-toolbar-actions");
    expect(onlineCss).toContain(".online-browser-filter-toggle");
    expect(onlineCss).toContain(".online-browser-filter-active-label");
    expect(onlineCss).toContain(".online-browser-control-title");
    expect(onlineCss).not.toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(onlineCss).toContain(".online-browser-visually-hidden");
    expect(onlineCss).toContain("clip: rect(0 0 0 0) !important;");
    expect(onlineCss).toContain(".online-browser-section-header-compact");
    expect(onlineCss).toContain(".online-browser-lobby-listings + .online-browser-live-section");
    expect(onlineCss).toMatch(/\.online-browser-quick-match-panel\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.035\);/s);
    expect(onlineCss).toMatch(/\.online-browser-select select:focus-visible,\s*\.online-seek-owner-panel:focus-visible,\s*\.online-browser-closed-listing:focus-visible\s*\{[^}]*outline:\s*3px solid #bf811d;/s);
  });

  it("gives Watch a featured live-game layout that collapses on mobile", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const onlineCss = readFileSync(resolve(testDir, "../../css/OnlineGameBrowser.css"), "utf8");

    expect(onlineCss).toContain(".online-browser-watch-grid");
    expect(onlineCss).toMatch(/\.online-browser-watch-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s*minmax\(280px,\s*0\.85fr\);/s);
    expect(onlineCss).toMatch(/\.online-browser-watch-grid\s*\{[^}]*align-items:\s*start;/s);
    expect(onlineCss).toMatch(/\.online-browser-featured-game\s*\{[^}]*align-self:\s*start;/s);
    expect(onlineCss).not.toMatch(/\.online-browser-featured-game \.online-game-row\s*\{[^}]*height:\s*100%;/s);
    expect(onlineCss).toMatch(/@media \(max-width: 900px\)\s*\{[\s\S]*\.online-browser-watch-grid\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  });

  it("keeps app pages in their own mobile scrollports", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const boardCss = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");
    const libraryCss = readFileSync(resolve(testDir, "../../css/GameLibrary.css"), "utf8");
    const onlineCss = readFileSync(resolve(testDir, "../../css/OnlineGameBrowser.css"), "utf8");

    expect(boardCss).toMatch(/\.online-state-page\s*\{[^}]*height:\s*100dvh;[^}]*overflow-y:\s*auto;/s);
    expect(libraryCss).toMatch(/\.game-library-page\s*\{[^}]*height:\s*100dvh;[^}]*overflow-y:\s*auto;/s);
    expect(onlineCss).toMatch(/\.online-browser-page\s*\{[^}]*height:\s*100dvh;[^}]*overflow-y:\s*auto;/s);
  });

  it("wraps long challenge links instead of clipping them on mobile", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const boardCss = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(boardCss).toMatch(/\.online-state-share-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(170px,\s*auto\);/s);
    expect(boardCss).toMatch(/\.online-state-link-preview\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s);
    expect(boardCss).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.online-state-share-row,\s*\.online-state-report-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  });

  it("keeps install prompts below dialogs and victory points full-width on mobile", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const boardCss = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");
    const libraryCss = readFileSync(resolve(testDir, "../../css/GameLibrary.css"), "utf8");
    const installHintSource = readFileSync(resolve(testDir, "../InstallAppHint.tsx"), "utf8");

    expect(installHintSource).toContain("zIndex: 2500");
    expect(boardCss).toMatch(/\.confirm-dialog-backdrop\s*\{[^}]*z-index:\s*3000;/s);
    expect(libraryCss).toMatch(/\.library-dialog-backdrop\s*\{[^}]*z-index:\s*3000;/s);
    expect(boardCss).toMatch(/\.vp-scoreboard\s*\{[^}]*grid-column:\s*1 \/ -1;/s);
  });

  it("keeps the game sidebar contained and exposes compact save status on mobile", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const boardCss = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(boardCss).toMatch(/\.game-panel\s*\{[^}]*background:\s*#1f1e1b;[^}]*border-left:\s*1px solid #3d3a34;/s);
    expect(boardCss).toMatch(/\.control-section-header\s*\{[^}]*justify-content:\s*space-between;[^}]*min-width:\s*0;/s);
    expect(boardCss).toMatch(/\.save-status-chip\s*\{[^}]*white-space:\s*nowrap;/s);
    expect(boardCss).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*\.save-status-chip\s*\{[^}]*font-size:\s*0\.62rem;/s);
  });

  it("keeps the main game chrome light when the light theme is active", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const boardCss = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(boardCss).toMatch(/\[data-theme="light"\]\s*\{[^}]*--backgroundColor:\s*#f0f0f0;/s);
    expect(boardCss).toMatch(/\[data-theme="light"\] \.game-panel\s*\{[^}]*background:\s*#f0f0f0;[^}]*border-left:\s*1px solid #d9d9d9;/s);
    expect(boardCss).toMatch(/\[data-theme="light"\] \.player-identity-badge\s*\{[^}]*background:\s*#ffffff;[^}]*color:\s*#1f1f1f;/s);
    expect(boardCss).toMatch(/\[data-theme="light"\] \.save-status-chip\s*\{[^}]*background:\s*#ffffff;[^}]*color:\s*#555555;/s);
    expect(boardCss).toMatch(/\[data-theme="light"\] \.control-button\.share,[\s\S]*\[data-theme="light"\] \.control-button\.analysis-return\s*\{[^}]*background:\s*#ffffff;[^}]*color:\s*#1f1f1f;/s);
    expect(boardCss).toMatch(/\[data-theme="light"\] \.history-table-container\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.72\) !important;/s);
    expect(boardCss).toMatch(/\[data-theme="light"\] \.mobile-move-history summary\s*\{[^}]*background:\s*#ffffff;[^}]*color:\s*#1f1f1f;/s);
  });

  it("keeps light tutorial chrome on the shared neutral app palette", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const boardCss = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");
    const lightThemeBlock = boardCss.match(/\[data-theme="light"\]\s*\{[^}]*\}/)?.[0] ?? "";

    expect(boardCss).toMatch(/\[data-theme="light"\]\s*\{[^}]*--accent-color:\s*#bf811d;/s);
    expect(boardCss).toMatch(/\[data-theme="light"\]\s*\{[^}]*--tutorial-button-active:\s*#629924;/s);
    expect(boardCss).toMatch(/\[data-theme="light"\]\s*\{[^}]*--tutorial-title-color:\s*#1f1f1f;/s);
    expect(boardCss).toMatch(/\[data-theme="light"\]\s*\{[^}]*--hint-banner-bg:\s*#262421;/s);
    expect(boardCss).toMatch(/\.tutorial-course-card\.current\s*\{[^}]*border-color:\s*rgba\(98,\s*153,\s*36,\s*0\.58\);[^}]*background:\s*rgba\(98,\s*153,\s*36,\s*0\.1\);/s);
    expect(boardCss).toMatch(/\.tutorial-course-card-status\.current\s*\{[^}]*background:\s*#629924;[^}]*color:\s*#102018;/s);
    expect(lightThemeBlock).not.toContain("#702cf0");
    expect(lightThemeBlock).not.toContain("#3498db");
    expect(lightThemeBlock).not.toContain("#2980b9");
  });

  it("uses app typography in the game shell instead of browser serif defaults", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const boardCss = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(boardCss).toMatch(/\.game-shell\s*\{[^}]*font-family:\s*"Inter", system-ui/s);
    expect(boardCss).toMatch(/\.tutorial-container\.tutorial-container-course\s*\{[^}]*font-family:\s*"Inter", system-ui/s);
  });

  it("keeps tutorial objectives readable when objective text is long", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const boardCss = readFileSync(resolve(testDir, "../../css/Board.css"), "utf8");

    expect(boardCss).toContain(".tutorial-objective-progress");
    expect(boardCss).toMatch(/\.tutorial-objective-item\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);[^}]*overflow-wrap:\s*anywhere;/s);
  });
});
