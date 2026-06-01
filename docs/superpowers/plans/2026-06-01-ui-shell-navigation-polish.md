# UI Shell Navigation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the playable game shell easier to navigate and safer on mobile by promoting tutorial/library/save paths, simplifying the sidebar, and eliminating top/bottom control overlap.

**Architecture:** Keep the board as the primary surface and improve the existing `Game`, `ControlPanel`, `HamburgerMenu`, `Tutorial`, `GameSetup`, and CSS shells instead of introducing a router. Navigation remains app-state based, but side-panel actions become grouped and accessible, tutorial progress becomes visible and controllable, and browser checks cover desktop/mobile overlap.

**Tech Stack:** React 18, TypeScript, Vite, Vitest/Testing Library, Playwright smoke scripts, existing localStorage save/tutorial persistence.

---

## Files

- Modify: `src/components/ControlPanel.tsx` for grouped game actions, short visible online link labels, tutorial entry, and mobile move-history disclosure.
- Modify: `src/components/HistoryTable.tsx` so move-history entries are keyboard-accessible buttons.
- Modify: `src/components/Game.tsx` to pass tutorial navigation into the side panel and expose shell state classes for overlay CSS.
- Modify: `src/components/HamburgerMenu.tsx` only if drawer labels/ARIA need tightening after side-panel changes.
- Modify: `src/components/Tutorial.tsx` for visible persisted progress, reset progress, and stable topbar classes.
- Modify: `src/components/GameSetup.tsx` for clearer setup navigation labels/layout if tests show crowding.
- Modify: `src/css/Board.css` for sidebar group layout, mobile bottom panel, tutorial/setup topbars, online badge/toast positioning, and text wrapping.
- Modify: `scripts/deploy/check-online-browser-smoke.mjs` so browser smoke can find buttons by visible text, `aria-label`, or title.
- Test: `src/components/__tests__/ControlPanel.test.tsx`
- Test: `src/components/__tests__/HistoryTable.test.tsx`
- Test: `src/components/__tests__/Tutorial.test.tsx`
- Test: `src/components/__tests__/GameSetup.test.tsx`
- Test: `src/__tests__/App.test.tsx`

## Task 1: Side Panel Navigation And Grouped Actions

- [x] **Step 1: Write failing ControlPanel tests**

Add tests that assert:

```tsx
render(
  <ControlPanel
    {...baseProps}
    onShare={vi.fn()}
    onSaveGame={vi.fn()}
    onOpenLibrary={vi.fn()}
    onTutorial={vi.fn()}
  />
);

expect(screen.getByRole("group", { name: "Turn controls" })).toContainElement(screen.getByRole("button", { name: "Pass" }));
expect(screen.getByRole("group", { name: "Save and review" })).toContainElement(screen.getByRole("button", { name: "Save" }));
expect(screen.getByRole("group", { name: "Navigation" })).toContainElement(screen.getByRole("button", { name: "Tutorial" }));
expect(screen.getByRole("button", { name: "New Game" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Move history" })).toBeInTheDocument();
```

Add an online-label test:

```tsx
render(
  <ControlPanel
    {...baseProps}
    onCopyOpponentInvite={vi.fn()}
    onCopySpectator={vi.fn()}
  />
);

expect(screen.getByRole("button", { name: "Copy Opponent Invite" })).toHaveTextContent("Invite");
expect(screen.getByRole("button", { name: "Copy Spectator Link" })).toHaveTextContent("Spectate");
```

- [x] **Step 2: Verify tests fail**

Run:

```bash
npm test -- src/components/__tests__/ControlPanel.test.tsx
```

Expected: fails because the new groups, tutorial button, move-history disclosure, and short online labels do not exist.

- [x] **Step 3: Implement ControlPanel grouping**

Add optional `onTutorial?: () => void`. Replace the flat `.game-controls` grid with sections named `Turn controls`, `Save and review`, `Online links`, and `Navigation`. Keep pass/resign disabled logic unchanged. Use visible `Invite`/`Spectate` for long online controls with `aria-label` preserving the full action names. Add a mobile-only `details.mobile-move-history` summary labelled `Move history`.

- [x] **Step 4: Verify ControlPanel passes**

Run:

```bash
npm test -- src/components/__tests__/ControlPanel.test.tsx
```

Expected: PASS.

Reviewer follow-up: history entries were converted from clickable spans to buttons, with a focused test proving keyboard-accessible move navigation.

## Task 2: Shell Wiring And Overlay Positioning

- [x] **Step 1: Write failing app/game shell tests**

Update app mocks/tests so opening tutorial from the game-side panel still returns to the game, and so `Game` passes `onTutorial` into `ControlPanel`.

- [x] **Step 2: Verify tests fail**

Run:

```bash
npm test -- src/__tests__/App.test.tsx src/components/__tests__/ControlPanel.test.tsx
```

Expected: fails until `Game` wires the new prop.

- [x] **Step 3: Implement shell state classes**

In `Game.tsx`, add shell classes for `has-online-session` and `navigation-open`, pass `onTutorial` into `ControlPanel`, and keep status toast suppression while drawer is open. In CSS, move `.online-session-badge` away from the hamburger and right panel using left/right constraints, and place `.game-status-toast` below the badge area.

- [x] **Step 4: Verify tests pass**

Run:

```bash
npm test -- src/__tests__/App.test.tsx src/components/__tests__/ControlPanel.test.tsx
```

Expected: PASS.

## Task 3: Tutorial Progress And Topbar Polish

- [x] **Step 1: Write failing Tutorial tests**

Add tests that assert visible progress has an accessible label and reset clears saved progress:

```tsx
expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("1 / 35");
fireEvent.click(screen.getByRole("button", { name: "Next" }));
fireEvent.click(screen.getByRole("button", { name: "Restart Tutorial" }));
expect(localStorage.getItem("castles_tutorial_lesson_index")).toBe("0");
expect(screen.getByRole("status", { name: "Tutorial progress" })).toHaveTextContent("1 / 35");
```

- [x] **Step 2: Verify tests fail**

Run:

```bash
npm test -- src/components/__tests__/Tutorial.test.tsx
```

Expected: fails because the labelled status and reset button are missing.

- [x] **Step 3: Implement Tutorial topbar**

Give the progress span `role="status"` and `aria-label="Tutorial progress"`. Add a `Restart Tutorial` button that sets lesson index to zero and persists it. Move repeated inline tutorial row styles into stable class names where practical.

- [x] **Step 4: Verify Tutorial tests pass**

Run:

```bash
npm test -- src/components/__tests__/Tutorial.test.tsx
```

Expected: PASS.

## Task 4: Responsive CSS And Smoke Checks

- [x] **Step 1: Update CSS layout**

Adjust `.game-panel`, `.game-controls`, `.control-section`, `.mobile-move-history`, `.setup-topbar`, `.tutorial-topbar`, `.online-session-badge`, `.game-status-toast`, and mobile media rules so buttons wrap cleanly, move history is reachable on mobile, and top overlays do not cover the hamburger/back controls.

- [x] **Step 2: Update browser smoke helper**

Change `__castlesSmokeFindButton` in `scripts/deploy/check-online-browser-smoke.mjs` to match a target against visible text, `aria-label`, and `title`.

- [x] **Step 3: Run focused and full verification**

Run:

```bash
npm test -- src/components/__tests__/ControlPanel.test.tsx src/components/__tests__/Tutorial.test.tsx src/components/__tests__/GameSetup.test.tsx src/__tests__/App.test.tsx
npm test
npm run build
npm run server:build
```

Expected: PASS.

- [x] **Step 4: Run Playwright viewport audit**

Use a local dev or built server and capture desktop and mobile screenshots for game, setup, tutorial, library, and online challenge/game states. At minimum check viewports `1366x768`, `390x844`, and `360x640`. Fail the work if any visible button text overflows its button, or if hamburger/back/tutorial/progress/online/status controls overlap.

- [x] **Step 5: Run online browser smoke**

Run against a local built server:

```bash
npm run online:smoke:browser -- http://127.0.0.1:<port>
```

Expected: PASS through create/join/spectate/reconnect/resign/challenge flows.

Reviewer follow-up: mobile navigation controls are hidden from the bottom panel at small widths and remain available through the drawer, preserving a board-first layout at 360 x 640. Final viewport audit recorded no clipped controls in desktop/mobile game, setup, tutorial, and online game states.

## Task 5: Review, Fix, Commit, Push

- [x] **Step 1: Run reviewer passes**

Run a spec reviewer focused on Phase 6A requirements and a code-quality reviewer focused on React/CSS/accessibility/mobile regressions. Critical and Important findings must be fixed before commit.

- [x] **Step 2: Rerun changed tests and smoke**

Rerun every command affected by fixes. Do not claim completion from stale output.

- [x] **Step 3: Update plan/docs**

Mark this plan checklist as complete and update `docs/online-multiplayer-plan.md` / `docs/ui/online-ui-benchmark-checklist.md` with Phase 6A completion notes and remaining next-phase items.

- [x] **Step 4: Commit and push**

Commit with a concise message such as:

```bash
git add src docs scripts
git commit -m "Polish online game shell navigation"
git push
```

Expected: branch `online-action-log` pushed to origin.
