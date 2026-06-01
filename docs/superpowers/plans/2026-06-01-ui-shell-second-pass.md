# UI Shell Second Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the second Lichess-benchmarked UI/navigation pass: shared page navigation, contextual game side panel, guarded New Game, visible save feedback, tutorial mobile controls, drawer cleanup, and consistent Watch/Library headers.

**Architecture:** Add one shared `AppShellNav` component and reuse existing app-state navigation handlers. Keep game controls in `ControlPanel`, destructive navigation guarded in `Game`, and page-specific density in each page component/CSS.

**Tech Stack:** React 18, TypeScript, Vite, Vitest/Testing Library, Playwright browser smoke scripts, existing localStorage and online client APIs.

---

## Files

- Create: `src/components/AppShellNav.tsx`
- Create: `src/components/__tests__/AppShellNav.test.tsx`
- Create: `src/css/AppShellNav.css`
- Modify: `src/App.tsx`
- Modify: `src/components/Game.tsx`
- Modify: `src/components/ControlPanel.tsx`
- Modify: `src/components/HamburgerMenu.tsx`
- Modify: `src/components/GameSetup.tsx`
- Modify: `src/components/Tutorial.tsx`
- Modify: `src/components/GameLibrary.tsx`
- Modify: `src/components/OnlineGameBrowser.tsx`
- Modify: `src/css/Board.css`
- Modify: `src/css/GameLibrary.css`
- Modify: `src/css/OnlineGameBrowser.css`
- Test: `src/__tests__/App.test.tsx`
- Test: `src/components/__tests__/ControlPanel.test.tsx`
- Test: `src/components/__tests__/HamburgerMenu.test.tsx`
- Test: `src/components/__tests__/GameSetup.test.tsx`
- Test: `src/components/__tests__/Tutorial.test.tsx`
- Test: `src/components/__tests__/GameLibrary.test.tsx`
- Test: `src/components/__tests__/OnlineGameBrowser.test.tsx`
- Test: `src/components/__tests__/GameAbilityIntegration.test.tsx`

## Tasks

- [x] Write failing tests for `AppShellNav`, dynamic setup back labels, shared page navigation, side-panel contextual controls, tutorial top controls, drawer icon cleanup, save status, and custom New Game confirmation.
- [x] Implement `AppShellNav` and wire it into Setup, Tutorial, Library, and Watch.
- [x] Rebalance `ControlPanel` and `Game` so general navigation moves out of the game side panel, New Game uses a custom confirmation dialog, and save shows toast feedback.
- [x] Clean up drawer labels/icons, safe-area scrolling, and overlay CSS.
- [x] Collapse Library import behind an import section and tighten Watch/Library header density.
- [x] Run focused tests after each implementation slice.
- [x] Run reviewer passes, evaluate findings, and fix Critical/Important items.
- [x] Run full verification: focused tests, full test suite, build, server build, browser smoke, and Playwright UI screenshots.
- [x] Update roadmap/checklist docs, commit, push, and stop local servers.

## Review Notes

- UX/spec review found no remaining scope blockers after the shared navigation, contextual side panel, guarded New Game, save feedback, and mobile tutorial changes.
- Code review found two Important issues: drawer-started New Game focus restoration and short-height mobile tutorial clipping. Both were accepted, fixed with tests, and reverified.
- Final focused re-review found no Critical or Important issues. One Minor test-name wording issue was accepted and fixed.
