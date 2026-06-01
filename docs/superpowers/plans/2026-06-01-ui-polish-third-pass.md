# UI Polish Third Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the next UI/navigation polish block by making online pending and challenge screens use the shared app shell, tightening drawer accessibility, and making short-screen tutorial navigation more compact.

**Architecture:** Keep the current app-state navigation model and shared `AppShellNav`. Move one-off online waiting/challenge markup into styled app-shell sections inside `App.tsx`, harden `HamburgerMenu` focus behavior without changing its action contract, and refine tutorial CSS class names rather than changing lesson data.

**Tech Stack:** React 18, TypeScript, Vite, Vitest/Testing Library, CSS media queries, Playwright/browser smoke against a local server.

---

## Files

- Modify: `src/App.tsx` for shared challenge/pending online page navigation and stable CSS classes.
- Modify: `src/components/HamburgerMenu.tsx` for drawer focus trap, Escape focus restoration, and dialog semantics.
- Modify: `src/components/Tutorial.tsx` to replace inline lesson quick-nav rows with stable classes.
- Modify: `src/css/Board.css` for app-shell online pages, drawer focus-safe layering, and compact short-screen tutorial layout.
- Modify: `src/css/AppShellNav.css` if mobile destination wrapping needs a tighter rule.
- Modify: `src/__tests__/App.test.tsx` for challenge/pending shared navigation behavior.
- Modify: `src/components/__tests__/HamburgerMenu.test.tsx` for focus trap/restore behavior.
- Modify: `src/components/__tests__/TutorialLayoutCss.test.ts` for short-screen tutorial CSS invariants.
- Modify: `docs/ui/online-ui-benchmark-checklist.md` with third-pass completion notes and remaining UI risks.

## Task 1: Shared Online Waiting And Challenge Shells

- [x] **Step 1: Write failing App tests**

Add tests in `src/__tests__/App.test.tsx` proving challenge screens and pre-snapshot online waiting/error screens expose shared navigation:

```tsx
expect(await screen.findByRole("navigation", { name: "Challenge navigation" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-current", "page");
expect(screen.getByRole("button", { name: "Learn" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Watch" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Back to play" })).toBeInTheDocument();
```

For a failed online invite before the first snapshot:

```tsx
expect(screen.getByRole("navigation", { name: "Online game navigation" })).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "Watch" }));
expect(screen.getByText("Online Browser Ready")).toBeInTheDocument();
```

- [x] **Step 2: Verify tests fail**

Run:

```bash
npm test -- src/__tests__/App.test.tsx
```

Expected: FAIL because challenge and pending online surfaces still use inline one-off layouts and no `AppShellNav`.

- [x] **Step 3: Implement shared online shell markup**

In `src/App.tsx`, import `AppShellNav` and build `appShellDestinations` arrays for challenge and pending online pages. Replace inline full-page `style={...}` wrappers with classes like `online-state-page`, `online-state-panel`, `online-state-actions`, and `online-state-input`. Keep existing actions and token-cleanup behavior unchanged.

- [x] **Step 4: Add CSS for online state pages**

In `src/css/Board.css`, add responsive styles for `online-state-page`, `online-state-panel`, `online-state-status`, `online-state-actions`, and `online-state-input` so long status text wraps at 360px and buttons stay inside their grid.

- [x] **Step 5: Verify App tests pass**

Run:

```bash
npm test -- src/__tests__/App.test.tsx
```

Expected: PASS.

## Task 2: Drawer Focus Trap And Restore

- [x] **Step 1: Write failing HamburgerMenu tests**

Add tests in `src/components/__tests__/HamburgerMenu.test.tsx` proving:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Menu" }));
expect(screen.getByRole("dialog", { name: "Castles menu" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();
fireEvent.keyDown(document, { key: "Tab" });
expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Menu" }));
fireEvent.keyDown(document, { key: "Escape" });
expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
```

Also cover Shift+Tab wrapping from the first drawer control to the last drawer control.

- [x] **Step 2: Verify tests fail**

Run:

```bash
npm test -- src/components/__tests__/HamburgerMenu.test.tsx
```

Expected: FAIL because the drawer has no dialog role, no initial focus, and no Tab trap.

- [x] **Step 3: Implement focus management**

In `HamburgerMenu.tsx`, add refs for the drawer and close button. When opening, store the active element and focus the close button. On close, restore focus to the invoking button when possible. Add `role="dialog"`, `aria-modal="true"`, and `aria-label="Castles menu"` to the drawer. Add a keydown handler that traps Tab inside visible drawer controls and closes on Escape.

- [x] **Step 4: Verify HamburgerMenu tests pass**

Run:

```bash
npm test -- src/components/__tests__/HamburgerMenu.test.tsx
```

Expected: PASS.

## Task 3: Short-Screen Tutorial Compactness

- [x] **Step 1: Write failing CSS and Tutorial tests**

Update `src/components/__tests__/TutorialLayoutCss.test.ts` to assert a short-screen media query exists:

```ts
expect(css).toContain("@media (max-width: 760px) and (max-height: 720px)");
expect(css).toContain("grid-template-rows: minmax(0, 52dvh) minmax(0, 48dvh);");
expect(css).toContain(".tutorial-quick-nav");
expect(css).toContain(".tutorial-description");
```

If needed, update `Tutorial.test.tsx` to assert the quick-nav rows have accessible group labels.

- [x] **Step 2: Verify tests fail**

Run:

```bash
npm test -- src/components/__tests__/TutorialLayoutCss.test.ts src/components/__tests__/Tutorial.test.tsx
```

Expected: FAIL because inline tutorial quick-nav styles have no stable classes and the short-height media rule does not exist.

- [x] **Step 3: Replace inline tutorial layout styles with classes**

In `Tutorial.tsx`, add `className="tutorial-quick-nav"` and accessible labels to piece/terrain quick-nav groups. Add `tutorial-description`, `tutorial-callout`, and `tutorial-list-section` classes for lesson text blocks.

- [x] **Step 4: Implement compact short-screen CSS**

In `Board.css`, add compact mobile rules for screens below 720px high: reduce sidebar padding/gaps, use 52/48 viewport split, keep progress controls two columns, compact quick-nav buttons, and ensure `.tutorial-board-stage` remains visible.

- [x] **Step 5: Verify tutorial tests pass**

Run:

```bash
npm test -- src/components/__tests__/TutorialLayoutCss.test.ts src/components/__tests__/Tutorial.test.tsx
```

Expected: PASS.

## Task 4: Review, Browser Audit, Docs, Commit

- [x] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/__tests__/App.test.tsx src/components/__tests__/HamburgerMenu.test.tsx src/components/__tests__/TutorialLayoutCss.test.ts src/components/__tests__/Tutorial.test.tsx
```

Expected: PASS.

- [x] **Step 2: Run reviewer pass**

Dispatch a UI/accessibility reviewer focused on the files in this plan. Fix Critical and Important findings before continuing.

- [x] **Step 3: Run full verification**

Run:

```bash
npm test
npm run build
npm run server:build
```

Expected: PASS.

- [x] **Step 4: Run local browser smoke and screenshot audit**

Use a local built server on an unused port. Run:

```bash
npm run online:smoke:browser -- http://127.0.0.1:<port>
```

Then manually inspect screenshots for desktop `1440 x 900`, mobile `430 x 932`, and short mobile `360 x 640` on game, drawer-open game, setup, tutorial, Watch, challenge pending, and failed pending online states. Fail if any navigation/back/menu/status text overlaps or important button text clips.

- [x] **Step 5: Update docs, commit, push**

Update `docs/ui/online-ui-benchmark-checklist.md` with third-pass status. Then:

```bash
git add src docs
git commit -m "Polish online state navigation and drawer accessibility"
git push
```

Expected: branch `online-action-log` pushed to origin.

## Implementation Notes

- TDD red pass confirmed the App, drawer, and tutorial layout tests failed before implementation.
- A UI/accessibility reviewer found missing drawer modal behavior, online-state screens outside the shared shell, and short-screen tutorial crowding; those were fixed.
- Follow-up reviewers found edge cases around focus escaping through the drawer trigger, short mobile horizontal overflow risk, stale autosave/session credentials when leaving failed online states, and app-level install prompts sitting above the drawer; those were fixed before final verification.
- Playwright screenshot audit passed for desktop game, mobile drawer-open game, short mobile tutorial, short mobile Watch, online error, challenge error, and mobile challenge pending states. Artifacts are in `artifacts/ui-audit/phase6c-third-pass`.
- Final verification after reviewer fixes passed: full Vitest suite, frontend production build, server TypeScript build, browser online smoke, diff check, and focused Playwright screenshot audit for drawer/install-prompt layering, short tutorial, and failed online state overflow.
