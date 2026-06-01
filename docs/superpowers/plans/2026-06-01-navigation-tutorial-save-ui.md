# Navigation Tutorial Save UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Castles shell easier to navigate and less overlap-prone before lobby/matchmaking, with Lichess-style density adapted to this game.

**Architecture:** Keep the game board primary. Replace ad hoc view-stack mutation with explicit navigation helpers in `App.tsx`, make the drawer hierarchy match top destinations, make Learn/Tutorial feel like a first-class workspace, and surface save/autosave/tutorial progress without adding accounts or lobby concepts.

**Tech Stack:** React, TypeScript, Vitest/Testing Library, Playwright screenshots, existing CSS.

---

## Files

- Modify: `src/App.tsx` for explicit navigation helpers and in-app save-name dialog.
- Modify: `src/components/HamburgerMenu.tsx` and `src/css/Board.css` for drawer hierarchy, progress/save hints, and responsive overlap fixes.
- Modify: `src/components/Tutorial.tsx` and `src/css/Board.css` for Learn workspace layout.
- Modify: `src/components/ControlPanel.tsx` and tests for clearer autosave/named-save wording.
- Modify tests: `src/__tests__/App.test.tsx`, `src/components/__tests__/HamburgerMenu.test.tsx`, `src/components/__tests__/Tutorial.test.tsx`, `src/components/__tests__/ControlPanel.test.tsx`.
- Modify docs: `docs/online-multiplayer-plan.md`, `docs/ui/online-ui-benchmark-checklist.md`.

## Task 1: Navigation State

- [x] Add failing App tests showing that game-entry paths clear stale back history:
  - setup -> learn -> library -> load game -> learn -> back returns to game, not stale setup/library;
  - watch -> replay/spectate -> Play clears stack;
  - direct Play from nested pages preserves the current game and clears stack.
- [x] Replace `previousView`/direct stack mutation with small helpers:
  - `pushView(nextView)`;
  - `enterGame()`;
  - `replaceWithSetup(backTarget)`;
  - `returnToPreviousView()`.
- [x] Update all game-entry paths (`handleStartGame`, online create/join/spectate/replay, restart, load saved game, editor play) to clear stale stacks.
- [x] Verify `npm test -- src/__tests__/App.test.tsx`.

## Task 2: Drawer Hierarchy And Primary Destinations

- [x] Add failing HamburgerMenu tests for destination order: Play, Learn, Watch, Library before Board and Tools.
- [x] Add failing tests for drawer save/progress helper copy:
  - Save Game lives in Library section;
  - Tutorial lives in Learn section before Watch/Library utilities;
  - Board/Tools remain secondary.
- [x] Reorder drawer sections and add short helper copy where it reduces ambiguity.
- [x] Keep drawer modal focus/inert behavior unchanged.
- [x] Verify `npm test -- src/components/__tests__/HamburgerMenu.test.tsx`.

## Task 3: Learn/Tutorial Workspace

- [x] Add failing Tutorial tests for:
  - lesson progress summary near the title;
  - lesson controls grouped as a compact control strip;
  - quick navigation still accessible;
  - board stage labelled as the lesson board.
- [x] Rework Tutorial markup/CSS so mobile uses a board-first lower panel with lesson controls compact enough for 360 x 640.
- [x] Verify `npm test -- src/components/__tests__/Tutorial.test.tsx src/components/__tests__/TutorialLayoutCss.test.tsx`.

## Task 4: Save And Progress Clarity

- [x] Add failing App/Game tests for in-app save dialog:
  - save opens a named-save dialog instead of native prompt;
  - cancel does not save;
  - success shows the saved name and Library path;
  - failure stays in-app.
- [x] Implement a small reusable save dialog in `App.tsx` without adding new persistence backends.
- [x] Add ControlPanel copy/ARIA tests for named save vs Library and no general navigation in the side panel.
- [x] Verify `npm test -- src/__tests__/App.test.tsx src/components/__tests__/ControlPanel.test.tsx`.

## Task 5: Review, Full Verification, Browser QA, Commit

- [x] Run UI/UX/accessibility reviewer focused on Phase 6G changes.
- [x] Run focused tests:
  - `npm test -- src/__tests__/App.test.tsx src/components/__tests__/HamburgerMenu.test.tsx src/components/__tests__/Tutorial.test.tsx src/components/__tests__/TutorialLayoutCss.test.tsx src/components/__tests__/ControlPanel.test.tsx`
- [x] Run full verification:
  - `npm test`
  - `npm run build`
  - `npm run server:build`
  - `git diff --check`
- [x] Run local browser smoke:
  - `npm run online:smoke:browser -- http://127.0.0.1:<port>`
- [x] Run focused Playwright screenshot audit at 1440 x 900, 820 x 700, 430 x 932, 390 x 844, and 360 x 640:
  - game fresh/active;
  - drawer open;
  - setup;
  - tutorial first lesson and piece lesson;
  - library empty and selected save;
  - Watch/Archive;
  - save dialog/toast;
  - online access-denied/pending if practical.
- [x] Update docs, commit, and push.

## Reviewer Guidance

- Accept: shell hierarchy, clearer drawer/sidebar, safer return paths, tutorial placement, save/progress clarity, overlap fixes.
- Reject/defer: lobby, matchmaking, accounts, ratings, chat, tournaments, large theme redesign, or unrelated game-rule changes.
- Critical risk: navigation must never accidentally reset an online or local game without explicit action.
