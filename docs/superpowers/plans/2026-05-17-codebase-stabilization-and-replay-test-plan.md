# Codebase Stabilization and Replay Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the Castles codebase before deeper refactoring by locking down state invariants, notation, PGN import/export, replay hydration, and move-tree branching behavior with focused regression tests.

**Architecture:** Treat `GameState`, `MoveTree`, `NotationService`, `PGNService`, command objects, and mutators as the core correctness boundary. Refactor only after tests prove that generated notation, imported PGN, replayed states, analysis navigation, and live gameplay actions all produce the same canonical state.

**Tech Stack:** React 18, Create React App, TypeScript 4.9, Jest, React Testing Library, in-memory game state, browser/localStorage/URL PGN persistence.

---

## Current Codebase Understanding

There is no conventional database layer in this repo. The "database" equivalent is the in-memory state graph:

| Area | Main files | Responsibility |
| --- | --- | --- |
| Runtime state | `src/Classes/Core/GameState.ts` | Defines `GameState` and `PositionSnapshot`. |
| History and variations | `src/Classes/Core/MoveTree.ts` | Stores moves as a tree with snapshots and selected mainline children. |
| Game facade | `src/Classes/Core/GameEngine.ts` | Delegates rule queries and mutations to systems/mutators. |
| State mutation | `src/Classes/Systems/Mutators/*.ts` and `src/Classes/Systems/StateMutator.ts` | Applies moves, attacks, turns, recruitment, abilities, promotion. |
| Action dispatch | `src/Classes/Commands/*.ts` and `src/hooks/useMoveExecution.ts` | Converts UI intent into command execution and state updates. |
| Notation | `src/Classes/Systems/NotationService.ts` | Converts hex coordinates/actions to compact move strings. |
| PGN export/import | `src/Classes/Services/PGNGenerator.ts`, `src/Classes/Services/PGNImporter.ts`, `src/Classes/Systems/PGNParser.ts` | Serializes setup and move tree, parses PGN, hydrates replay snapshots. |
| React state boundary | `src/contexts/GameProvider.tsx`, `src/contexts/GameContext.tsx` | Composes hooks and exposes state/actions. |
| Persistence | `src/hooks/usePGN.ts`, `src/hooks/usePersistence.ts`, `src/components/Game.tsx` | Saves, shares, imports, and reloads PGN. |

Important risk points found during familiarization:

| Risk | Why it matters | File |
| --- | --- | --- |
| Replay hydration logs errors and continues | Broken PGNs can partially load while appearing valid. | `src/Classes/Services/PGNImporter.ts` |
| Parser-created `MoveRecord`s use placeholder color/phase before hydration | UI/history metadata can differ before and after replay. | `src/Classes/Systems/PGNParser.ts` |
| Hydration records phase from `nextState` while live moves record phase from pre-action state | Imported history can disagree with live history. | `src/Classes/Services/PGNImporter.ts`, `src/Classes/Systems/Mutators/MutatorUtils.ts` |
| Pledge notation only stores piece type and spawn hex | It does not store sanctuary source or sacrifice details, so some future states may be lossy. | `src/Classes/Systems/NotationService.ts`, `src/Classes/Services/PGNImporter.ts` |
| `MoveTree.clone()` preserves snapshot object references | Safe if snapshots are never mutated, dangerous if UI/mutators mutate objects later. | `src/Classes/Core/MoveTree.ts` |
| `PieceMap` can silently overwrite duplicate piece positions | Duplicate occupancy can make `pieceMap.size !== pieces.length`; validator catches it but is not globally enforced. | `src/utils/PieceMap.ts`, `src/Classes/Systems/StateValidator.ts` |
| Existing `tsc_output.txt` records a type error | Baseline may already be red or stale; verify before refactor. | `tsc_output.txt` |
| Existing `test_output.txt` records worker leak warnings | There may be timers/effects that need deterministic teardown. | `test_output.txt`, likely UI/hook tests |

---

## File Structure for Planned Work

Create or modify these files only when executing the relevant task:

| Task | Files |
| --- | --- |
| Baseline health | Read-only: `package.json`, `tsconfig.json`, existing tests. |
| Test helpers | Modify: `src/hooks/test-utils/TestGameProviderUtils.tsx`; Create: `src/Classes/__tests__/helpers/gameStateAssertions.ts`. |
| State invariants | Modify: `src/Classes/Systems/StateValidator.ts`; Modify/Create tests in `src/Classes/Systems/__tests__/StateValidator.test.ts` and `src/Classes/Systems/__tests__/StateInvariantAfterActions.test.ts`. |
| Notation contracts | Modify: `src/Classes/Systems/NotationService.ts` only if gaps are found; Create: `src/Classes/__tests__/NotationRoundTrip.test.ts`. |
| PGN setup round-trip | Modify: `src/Classes/Services/PGNGenerator.ts`, `src/Classes/Services/PGNImporter.ts` only if tests fail; Create: `src/Classes/Services/__tests__/PGNSetupRoundTrip.test.ts`. |
| PGN variation parser | Modify: `src/Classes/Systems/PGNParser.ts`; Create: `src/Classes/Services/__tests__/PGNParserRavSemantics.test.ts`. |
| Replay hydration strictness | Modify: `src/Classes/Services/PGNImporter.ts`; Create: `src/Classes/Services/__tests__/PGNReplayHydration.test.ts`. |
| MoveTree snapshot safety | Modify: `src/Classes/Core/MoveTree.ts` only if object aliasing is proven harmful; Create: `src/Classes/Core/__tests__/MoveTreeSnapshot.test.ts`. |
| React analysis/persistence flow | Modify: `src/contexts/GameProvider.tsx`, `src/hooks/usePGN.ts`, `src/components/Game.tsx` only if tests fail; Create: `src/hooks/__tests__/AnalysisReplayIntegration.test.ts` and `src/hooks/__tests__/PersistenceRoundTrip.test.ts`. |
| Refactor boundary cleanup | Modify only after tests exist: command/mutator files in `src/Classes/Commands/` and `src/Classes/Systems/Mutators/`. |

---

## Task 1: Establish a Clean Baseline Before Refactoring

**Files:**

Read-only:

`package.json`

`tsconfig.json`

`tsc_output.txt`

`test_output.txt`

**Purpose:** Determine whether the repo is currently red, stale-red, or green before any cleanup. Do not mix baseline fixes with architecture refactors.

- [ ] **Step 1: Run TypeScript once**

Run:

```powershell
npx tsc --noEmit
```

Expected:

```text
Either zero TypeScript errors, or a short concrete list of current compile errors.
```

If the previous recorded error still appears, fix only the mismatched export/import in `src/Classes/Systems/__tests__/StateValidator.test.ts` or `src/Classes/Systems/StateValidator.ts`.

- [ ] **Step 2: Run the full Jest suite once in CI mode**

Run:

```powershell
npm test -- --watchAll=false
```

Expected:

```text
All current tests pass, or failures are recorded as baseline defects before refactoring starts.
```

- [ ] **Step 3: Run the most fragile existing suites individually**

Run:

```powershell
npm test -- --watchAll=false PGN
npm test -- --watchAll=false GameBranching
npm test -- --watchAll=false GameVariations
npm test -- --watchAll=false HistoryDuplication
npm test -- --watchAll=false InteractionPolicy
```

Expected:

```text
Each suite result is known independently. Worker leak warnings, if present, are logged as their own issue.
```

- [ ] **Step 4: Commit only if baseline fixes were required**

Run:

```powershell
git add src/Classes/Systems/__tests__/StateValidator.test.ts src/Classes/Systems/StateValidator.ts
git commit -m "test: restore baseline type safety"
```

Expected:

```text
Commit exists only if a baseline compile/test fix was made.
```

---

## Task 2: Add Shared State Assertion Helpers

**Files:**

Create:

`src/Classes/__tests__/helpers/gameStateAssertions.ts`

Modify:

`src/hooks/test-utils/TestGameProviderUtils.tsx`

**Purpose:** Keep future replay and integration tests concise and consistent. These helpers should compare canonical game facts, not object identity.

- [ ] **Step 1: Create canonical snapshot helper**

Add:

```ts
import { GameState, PositionSnapshot } from "../../Core/GameState";
import { Piece } from "../../Entities/Piece";
import { Castle } from "../../Entities/Castle";
import { Sanctuary } from "../../Entities/Sanctuary";

type SnapshotLike = Pick<
  GameState | PositionSnapshot,
  "pieces" | "castles" | "sanctuaries" | "turnCounter" | "sanctuaryPool" | "graveyard" | "phoenixRecords"
>;

const pieceKey = (p: Piece) =>
  `${p.color}:${p.type}:${p.hex.getKey()}:move=${p.canMove}:attack=${p.canAttack}:dmg=${p.damage}:ability=${p.abilityUsed}:souls=${p.souls}:revived=${p.isRevived}`;

const castleKey = (c: Castle) =>
  `${c.color}:${c.owner ?? "none"}:${c.hex.getKey()}`;

const sanctuaryKey = (s: Sanctuary) =>
  `${s.type}:${s.hex.getKey()}:${s.territorySide}:${s.cooldown}:${s.hasPledgedThisGame}`;

export function canonicalState(state: SnapshotLike) {
  return {
    pieces: state.pieces.map(pieceKey).sort(),
    castles: state.castles.map(castleKey).sort(),
    sanctuaries: state.sanctuaries.map(sanctuaryKey).sort(),
    turnCounter: state.turnCounter,
    sanctuaryPool: [...state.sanctuaryPool].sort(),
    graveyard: state.graveyard.map(pieceKey).sort(),
    phoenixRecords: [...state.phoenixRecords]
      .map(r => `${r.owner}:${r.respawnTurn}`)
      .sort(),
  };
}

export function expectCanonicalStateEqual(actual: SnapshotLike, expected: SnapshotLike) {
  expect(canonicalState(actual)).toEqual(canonicalState(expected));
}
```

- [ ] **Step 2: Add an optional custom-state hook renderer**

In `src/hooks/test-utils/TestGameProviderUtils.tsx`, add a renderer that accepts custom board, pieces, sanctuaries, move tree, and rules. The existing default renderer can stay.

```ts
import { Board } from "../../Classes/Core/Board";
import { Piece } from "../../Classes/Entities/Piece";
import { Sanctuary } from "../../Classes/Entities/Sanctuary";
import { MoveTree } from "../../Classes/Core/MoveTree";
import { SanctuaryType } from "../../Constants";

interface CustomTestGameProps extends TestGameProps {
  board?: Board;
  pieces?: Piece[];
  sanctuaries?: Sanctuary[];
  moveTree?: MoveTree;
  turnCounter?: number;
  poolTypes?: SanctuaryType[];
  sanctuarySettings?: { unlockTurn: number; cooldown: number };
}

export const renderCustomGameLogicHook = (props: CustomTestGameProps = {}) => {
  return renderHook(() => useGameLogicShim(), {
    wrapper: ({ children }) => (
      <GameProvider
        config={{
          board: props.board ?? startingBoard,
          pieces: props.pieces ?? allPieces,
          sanctuaries: props.sanctuaries,
          moveTree: props.moveTree,
          turnCounter: props.turnCounter,
          poolTypes: props.poolTypes,
        }}
        rules={{
          sanctuarySettings: props.sanctuarySettings,
        }}
        mode={{
          isAnalysisMode: props.isAnalysisMode,
          isTutorialMode: props.isTutorialMode,
        }}
      >
        {children}
      </GameProvider>
    ),
  });
};
```

- [ ] **Step 3: Run helper compile check**

Run:

```powershell
npx tsc --noEmit
```

Expected:

```text
No new TypeScript errors from the helper imports or JSX usage.
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add src/Classes/__tests__/helpers/gameStateAssertions.ts src/hooks/test-utils/TestGameProviderUtils.tsx
git commit -m "test: add canonical game state assertions"
```

---

## Task 3: Enforce Core State Invariants

**Files:**

Modify:

`src/Classes/Systems/StateValidator.ts`

`src/Classes/Systems/__tests__/StateValidator.test.ts`

Create:

`src/Classes/Systems/__tests__/StateInvariantAfterActions.test.ts`

**Purpose:** Make bad state impossible to miss. State bugs in this game will usually surface later as replay or notation bugs, so invariants should fail at the first illegal state.

- [ ] **Step 1: Expand `StateValidator` checks**

Add checks for:

| Invariant | Failure code |
| --- | --- |
| `pieceMap.size === pieces.length` | `PIECE_MAP_DESYNC` |
| Every `pieceMap` piece is the same object referenced in `pieces` | `PIECE_MAP_MISMATCH` |
| No duplicate hexes in `pieces` | `DUPLICATE_PIECE_POSITION` |
| Every piece is on `board.hexSet` | `PIECE_OFF_BOARD` |
| `turnCounter >= 0` and integer | `INVALID_TURN_COUNTER` |
| `sanctuaryPool` has no duplicate types | `DUPLICATE_SANCTUARY_POOL_TYPE` |
| No sanctuary type appears both in `sanctuaries` and `sanctuaryPool` | `SANCTUARY_TYPE_IN_POOL_AND_BOARD` |
| Phoenix records have non-negative integer `respawnTurn` | `INVALID_PHOENIX_RECORD` |

- [ ] **Step 2: Add direct validator tests**

Add test cases to `src/Classes/Systems/__tests__/StateValidator.test.ts` for every failure code above.

Example:

```ts
it("detects a sanctuary type both on the board and in the pool", () => {
  const sanctuary = new Sanctuary(
    new Hex(0, 1, -1),
    SanctuaryType.WolfCovenant,
    "w",
    null
  );
  const state = createMinimalState([]);
  state.sanctuaries = [sanctuary];
  state.sanctuaryPool = [SanctuaryType.WolfCovenant];

  const errors = StateValidator.validate(state, board);

  expect(errors.map(e => e.code)).toContain("SANCTUARY_TYPE_IN_POOL_AND_BOARD");
});
```

- [ ] **Step 3: Add post-action invariant tests**

Create `src/Classes/Systems/__tests__/StateInvariantAfterActions.test.ts` and test that these operations return valid state:

| Operation | Expected |
| --- | --- |
| `GameEngine.applyMove` | Valid state, piece map synced, one move node added. |
| `GameEngine.applyAttack` | Valid state, damage/capture reflected, graveyard updated if capture. |
| `GameEngine.applyCastleAttack` | Valid state, castle `owner` changes but `color` remains original. |
| `GameEngine.passTurn` | Valid state, turn counter advances according to rules. |
| `GameEngine.recruitPiece` | Valid state, new piece appears once and in piece map. |
| `GameEngine.activateAbility` | Valid state after Fireball, Teleport, and RaiseDead. |
| `GameEngine.pledge` | Valid state, sanctuary cooldown/pool/spawn state consistent. |
| `GameEngine.promotePiece` | Valid state, no duplicate piece remains at promotion hex. |

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
npm test -- --watchAll=false StateValidator StateInvariantAfterActions
```

Expected:

```text
Both suites pass. Any failed invariant becomes a bugfix before refactoring continues.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/Classes/Systems/StateValidator.ts src/Classes/Systems/__tests__/StateValidator.test.ts src/Classes/Systems/__tests__/StateInvariantAfterActions.test.ts
git commit -m "test: enforce game state invariants"
```

---

## Task 4: Lock Down Coordinate and Action Notation

**Files:**

Create:

`src/Classes/__tests__/NotationRoundTrip.test.ts`

Modify only if needed:

`src/Classes/Systems/NotationService.ts`

**Purpose:** Notation is the backbone of replay. Every notation token generated by live play must be parseable and deterministic.

- [ ] **Step 1: Test every board hex coordinate round-trip**

Add:

```ts
import { startingBoard } from "../../ConstantImports";
import { NotationService } from "../Systems/NotationService";

describe("NotationService coordinate round-trip", () => {
  it("round-trips every starting board hex", () => {
    for (const hex of startingBoard.hexes) {
      const coord = NotationService.toCoordinate(hex);
      const parsed = NotationService.fromCoordinate(coord);
      expect(parsed.equals(hex)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Test action notation formats**

Cover:

| Action | Example format |
| --- | --- |
| Move | `J10K10` |
| Attack | `J10xK10` |
| Castle capture | `J10xK10` |
| Recruitment | `K10=Swo` |
| Pledge | `P:WlfK10` |
| Wizard Fireball | `WF:J10K10` |
| Wizard Teleport | `WT:J10K10` |
| Necromancer RaiseDead | `NR:J10K10` |

- [ ] **Step 3: Test every `PieceType` with `getPieceCode`**

Expected codes:

```ts
expect(NotationService.getPieceCode(PieceType.Swordsman)).toBe("Swo");
expect(NotationService.getPieceCode(PieceType.Archer)).toBe("Arc");
expect(NotationService.getPieceCode(PieceType.Knight)).toBe("Kni");
expect(NotationService.getPieceCode(PieceType.Trebuchet)).toBe("Tre");
expect(NotationService.getPieceCode(PieceType.Eagle)).toBe("Eag");
expect(NotationService.getPieceCode(PieceType.Giant)).toBe("Gia");
expect(NotationService.getPieceCode(PieceType.Assassin)).toBe("Asn");
expect(NotationService.getPieceCode(PieceType.Dragon)).toBe("Dra");
expect(NotationService.getPieceCode(PieceType.Monarch)).toBe("Mon");
expect(NotationService.getPieceCode(PieceType.Wolf)).toBe("Wlf");
expect(NotationService.getPieceCode(PieceType.Healer)).toBe("Hea");
expect(NotationService.getPieceCode(PieceType.Ranger)).toBe("Rng");
expect(NotationService.getPieceCode(PieceType.Wizard)).toBe("Wiz");
expect(NotationService.getPieceCode(PieceType.Necromancer)).toBe("Nec");
expect(NotationService.getPieceCode(PieceType.Phoenix)).toBe("Phx");
```

- [ ] **Step 4: Decide whether pledge notation is intentionally lossy**

Current pledge notation stores only piece type and spawn hex:

```text
P:WlfK10
```

Decision required before serious replay refactors:

| Option | Result |
| --- | --- |
| Keep current format | Tests must prove sanctuary type is unique and source can always be inferred. |
| Extend format | Prefer `P:<SanctuaryCoord>:<PieceCode><SpawnCoord>` or equivalent. Add backwards-compatible parser support. |

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
npm test -- --watchAll=false Notation
```

Expected:

```text
NotationService and NotationRoundTrip tests pass.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/Classes/__tests__/NotationRoundTrip.test.ts src/Classes/Systems/NotationService.ts
git commit -m "test: lock down castles notation contracts"
```

---

## Task 5: Test PGN Custom Setup Round-Trip

**Files:**

Create:

`src/Classes/Services/__tests__/PGNSetupRoundTrip.test.ts`

Modify only if needed:

`src/Classes/Services/PGNGenerator.ts`

`src/Classes/Services/PGNImporter.ts`

`src/Classes/Services/PGNTypes.ts`

**Purpose:** Ensure board config, castles, starting pieces, sanctuaries, and sanctuary settings survive export/import exactly.

- [ ] **Step 1: Add compact setup round-trip test**

Test:

```ts
const compact = PGNGenerator.compressSetup(setup);
const restored = PGNImporter.decompressSetup(compact);
expect(restored).toEqual(setup);
```

Cover:

| Setup element | Must preserve |
| --- | --- |
| Board config | `nSquares`, `riverCrossingLength`, `riverSegmentLength`, `hasHighGround`. |
| Castles | `q`, `r`, `s`, original `color`. |
| Pieces | `type`, `q`, `r`, `s`, `color`. |
| Sanctuaries | `type`, `q`, `r`, `s`, `territorySide`, `cooldown`, `hasPledgedThisGame`. |
| Game settings | `sanctuaryUnlockTurn`, `sanctuaryRechargeTurns`. |

- [ ] **Step 2: Add full PGN tag round-trip test**

Generate PGN, parse PGN, reconstruct state, and compare canonical setup.

Expected:

```text
Parsed setup is not null.
Reconstructed board config matches.
Reconstructed pieces match starting pieces.
Reconstructed sanctuaries match starting sanctuaries.
Game settings match.
```

- [ ] **Step 3: Add legacy setup compatibility tests**

Cover both accepted formats:

| Format | Expected |
| --- | --- |
| Base64 compact JSON | Parses successfully. |
| Raw JSON in `CustomSetup` | Parses successfully. |
| Base64 with whitespace/newlines | Parses successfully. |
| Invalid `CustomSetup` | Returns `setup: null` and does not crash. |

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
npm test -- --watchAll=false PGNSetupRoundTrip
```

Expected:

```text
All setup import/export cases pass.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/Classes/Services/__tests__/PGNSetupRoundTrip.test.ts src/Classes/Services/PGNGenerator.ts src/Classes/Services/PGNImporter.ts src/Classes/Services/PGNTypes.ts
git commit -m "test: cover PGN setup round trips"
```

---

## Task 6: Define and Test PGN Variation Semantics

**Files:**

Create:

`src/Classes/Services/__tests__/PGNParserRavSemantics.test.ts`

Modify only if needed:

`src/Classes/Systems/PGNParser.ts`

`src/Classes/Services/PGNGenerator.ts`

**Purpose:** Prevent breakage in intricate replay lines. The parser and generator must agree about Recursive Annotation Variation behavior.

- [ ] **Step 1: Write explicit tree-shape tests**

Use these cases:

| PGN | Expected tree shape |
| --- | --- |
| `1. A B 2. C D` | Root -> A -> B -> C -> D |
| `1. A (1. X) B` | Root has children A and X; A has child B |
| `1. A B (1... X) 2. C` | A has children B and X; selected mainline is B; B has child C |
| `1. A (1. X Y) B` | Root has children A and X; X has child Y; A has child B |
| `1. A B (1... X (1... Y)) 2. C` | The intended nested-variation behavior is documented and tested before implementation. |

- [ ] **Step 2: Test generated PGN parses back into equivalent tree**

For a manually built `MoveTree` with:

```text
Start
  A
    B
    X
  Y
```

Generate PGN with `PGNGenerator.renderRecursiveHistory`, parse it with `PGNParser.parseToTree`, and compare:

```text
node notation
child count
selectedChildIndex
mainline order
variation sibling order
```

- [ ] **Step 3: Test comments, suffixes, results, and black move numbering**

Cases:

```text
1. A {comment} B *
1. A! B? 1-0
1. A (1... X) B
1. A B (1... X) 2. C
```

Expected:

```text
Comments/results are ignored.
Suffixes do not break hydration.
Black variations branch from the position after the white move.
```

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
npm test -- --watchAll=false PGNParserRavSemantics PGNServiceVariants PGNVariations PGNMultiVariations PGNTreeStructure
```

Expected:

```text
Variation parsing and rendering suites agree on tree shape.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/Classes/Services/__tests__/PGNParserRavSemantics.test.ts src/Classes/Systems/PGNParser.ts src/Classes/Services/PGNGenerator.ts
git commit -m "test: define PGN variation semantics"
```

---

## Task 7: Make Replay Hydration Observable and Strict

**Files:**

Create:

`src/Classes/Services/__tests__/PGNReplayHydration.test.ts`

Modify:

`src/Classes/Services/PGNImporter.ts`

`src/Classes/Services/PGNService.ts`

`src/hooks/usePGN.ts`

**Purpose:** PGN import should not silently fail. A replay error should either fail the load or return structured errors that the UI can show.

- [ ] **Step 1: Introduce replay diagnostics**

Add a type similar to:

```ts
export interface ReplayDiagnostic {
  notation: string;
  message: string;
  nodeId?: string;
}

export interface ReplayResult {
  state: GameState;
  diagnostics: ReplayDiagnostic[];
}
```

- [ ] **Step 2: Replace silent `console.error` replay failures with diagnostics**

Current behavior catches hydration errors and continues. Change it so the importer can run in strict mode:

```ts
PGNImporter.replayMoveHistory(board, pieces, moveTree, sanctuaries, settings, { strict: true });
```

Expected strict behavior:

```text
First invalid move throws an Error with the bad notation and reason.
```

Expected non-strict behavior:

```text
Returns diagnostics and the deepest successfully hydrated state.
```

- [ ] **Step 3: Test invalid move imports**

Cases:

| Bad token | Expected error |
| --- | --- |
| Move from empty coordinate | `Mover not found at <coord>` |
| Attack from empty coordinate | `Attacker not found at <coord>` |
| Unknown recruit code | `Unknown piece code <code>` |
| Unknown pledge code | `Unknown pledge piece code <code>` |
| Unknown ability code | Diagnostic or strict error. |

- [ ] **Step 4: Test live move metadata equals imported move metadata**

Scenario:

1. Start a game.
2. Make a move live.
3. Export PGN.
4. Import/replay PGN.
5. Compare the first `MoveRecord`.

Expected:

```text
notation matches
turnNumber matches
color matches
phase matches pre-action live record semantics
```

This is important because live moves use `MutatorUtils.createMoveRecord(notation, state)` before applying the turn increment, while hydration currently updates metadata from the post-action state.

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
npm test -- --watchAll=false PGNReplayHydration PGNService AbilityNotation
```

Expected:

```text
Replay failures are observable. Valid PGNs hydrate with no diagnostics.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/Classes/Services/__tests__/PGNReplayHydration.test.ts src/Classes/Services/PGNImporter.ts src/Classes/Services/PGNService.ts src/hooks/usePGN.ts
git commit -m "fix: make PGN replay hydration strict and observable"
```

---

## Task 8: Prove Export -> Import -> Export Idempotence

**Files:**

Create:

`src/Classes/Services/__tests__/PGNRoundTrip.test.ts`

Modify only if needed:

`src/Classes/Services/PGNGenerator.ts`

`src/Classes/Services/PGNImporter.ts`

**Purpose:** This is the main safety net for replays. A game exported to PGN, imported, then exported again should preserve the same game tree and final canonical state.

- [ ] **Step 1: Add linear game idempotence test**

Flow:

```text
initial state -> play legal actions -> export PGN -> import PGN -> export PGN again
```

Expected:

```text
Canonical final state is equal before and after import.
The second PGN parses successfully.
The move history line is equal.
```

- [ ] **Step 2: Add variation idempotence test**

Flow:

```text
play A -> play B -> step back -> play X -> export -> import -> compare tree
```

Expected:

```text
Parent node has two children.
Selected mainline child is preserved.
Both branches have snapshots.
Exported PGN contains one mainline and one variation.
```

- [ ] **Step 3: Add special-action round-trip test**

Cover at least one valid instance of:

| Action | Must survive replay |
| --- | --- |
| Castle capture | Castle `owner` changes, original `color` preserved. |
| Recruitment | Spawned piece appears exactly once. |
| Pledge | Spawned special piece appears, sanctuary state updates. |
| Ability | Ability flag/state effect survives. |
| Promotion | Promoted piece type survives. |
| Phoenix death/rebirth | Graveyard and `phoenixRecords` survive. |

- [ ] **Step 4: Normalize comparison**

Do not compare raw PGN strings at first, because tag ordering/date can differ. Compare:

```text
parsed setup
mainline move notations
tree shape
canonical final state
diagnostics length
```

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
npm test -- --watchAll=false PGNRoundTrip
```

Expected:

```text
Linear, variation, and special-action PGNs round-trip without state drift.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/Classes/Services/__tests__/PGNRoundTrip.test.ts src/Classes/Services/PGNGenerator.ts src/Classes/Services/PGNImporter.ts
git commit -m "test: prove PGN replay round trips"
```

---

## Task 9: Test MoveTree Snapshot and Branch Safety

**Files:**

Create:

`src/Classes/Core/__tests__/MoveTreeSnapshot.test.ts`

Modify only if needed:

`src/Classes/Core/MoveTree.ts`

`src/utils/GameStateUtils.ts`

**Purpose:** Analysis mode depends on old positions staying stable forever. Branching from history must not corrupt mainline snapshots.

- [ ] **Step 1: Test snapshots exist at root and every hydrated node**

Expected:

```text
rootNode.snapshot exists after `useCoreGame` initialization or PGN replay.
Every move node after replay has a snapshot.
```

- [ ] **Step 2: Test clone preserves IDs but does not corrupt tree links**

Expected:

```text
clone.rootNode.id === original.rootNode.id
clone.current.id === original.current.id
clone.current !== original.current
clone.current.parent !== original.current.parent
```

- [ ] **Step 3: Test snapshot aliasing policy**

Pick one policy and test it:

| Policy | Test |
| --- | --- |
| Snapshots are immutable references | Mutating a cloned tree's cursor must not mutate snapshots. |
| Snapshots are deep-cloned in `MoveTree.clone()` | `clone.current.snapshot !== original.current.snapshot`. |

Recommendation: deep-clone snapshots inside `MoveTree.clone()` if future code may mutate snapshot arrays.

- [ ] **Step 4: Test branch creation from historical node**

Flow:

```text
play A -> play B -> jump to A -> play X
```

Expected:

```text
A has children B and X.
Current node is X.
viewNodeId is null after mutation.
B snapshot still equals its pre-branch value.
```

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
npm test -- --watchAll=false MoveTreeSnapshot GameBranching GameVariations HistoryDuplication
```

Expected:

```text
MoveTree and integration branch tests pass.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/Classes/Core/__tests__/MoveTreeSnapshot.test.ts src/Classes/Core/MoveTree.ts src/utils/GameStateUtils.ts
git commit -m "test: protect move tree snapshot branching"
```

---

## Task 10: Cover React PGN Import, Autosave, and URL Share Flow

**Files:**

Create:

`src/hooks/__tests__/PersistenceRoundTrip.test.ts`

Modify only if needed:

`src/hooks/usePGN.ts`

`src/hooks/usePersistence.ts`

`src/components/Game.tsx`

**Purpose:** Service-level PGN tests are not enough. The UI flow calls `loadPGN`, passes results to `onLoadGame`, remounts `GameProvider`, and then autosaves again.

- [ ] **Step 1: Test `getPGN` uses root snapshot as initial setup**

Regression:

```text
After moves, exported `CustomSetup` should contain the starting pieces, not current pieces.
```

Expected:

```text
PGN setup reconstructed pieces equal initial root snapshot.
Replay final state equals live current state.
```

- [ ] **Step 2: Test `loadPGN` result contains all data needed by `Game.tsx`**

Expected result fields:

```text
board
pieces
castles
sanctuaries
moveTree
turnCounter
sanctuarySettings
sanctuaryPool
```

- [ ] **Step 3: Test localStorage autosave**

Mock `localStorage`, make one move, and expect:

```text
localStorage.setItem("castles_autosave", <pgn>) called once or more with parseable PGN.
```

- [ ] **Step 4: Test URL share parameter**

Mock `window.history.replaceState` and `navigator.clipboard.writeText`.

Expected:

```text
URL contains `pgn=<encoded game>`.
Copied URL contains the same query parameter.
```

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
npm test -- --watchAll=false PersistenceRoundTrip
```

Expected:

```text
PGN persistence flow passes without relying on manual prompts.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/hooks/__tests__/PersistenceRoundTrip.test.ts src/hooks/usePGN.ts src/hooks/usePersistence.ts src/components/Game.tsx
git commit -m "test: cover PGN persistence round trip"
```

---

## Task 11: Build a Rule Regression Matrix Before Refactoring Mutators

**Files:**

Modify existing tests or create focused tests in:

`src/Classes/__tests__/PieceMovement.test.ts`

`src/Classes/__tests__/SpecialMovement.test.ts`

`src/Classes/__tests__/GameplayValidation.test.ts`

`src/Classes/__tests__/Promotion.test.ts`

`src/Classes/__tests__/Pledge.test.ts`

`src/Classes/Systems/__tests__/AbilitySystem.test.ts`

**Purpose:** Refactoring mutators is risky unless every rule edge has a small test.

- [ ] **Step 1: Movement matrix**

Cover each piece:

| Piece | Movement checks |
| --- | --- |
| Swordsman | Direction differs by color, blocked by occupied hex, cannot move sideways/backward. |
| Archer | One hex any direction. |
| Knight | Diagonal sliding, blocked by pieces/terrain if intended. |
| Trebuchet | One hex any direction, heavy action cost. |
| Eagle | Flying range 3, ignores river. |
| Giant | Orthogonal sliding, heavy action cost. |
| Assassin | Any sliding. |
| Dragon | L-shaped jump, flying/river behavior. |
| Monarch | One hex any direction, heavy action cost. |
| Special units | Wolf/Healer/Ranger/Wizard/Necromancer/Phoenix movement rules. |

- [ ] **Step 2: Attack matrix**

Cover:

```text
melee capture moves onto target hex
ranged attack does not move attacker
long-ranged attack does not move attacker
swordsman attack direction differs by color
defended pieces cannot be ranged-targeted
combined damage accumulates within round
damage resets at round boundary
assassin kills monarch regardless of HP
```

- [ ] **Step 3: Turn/action economy matrix**

Cover:

```text
two normal moves allowed
one heavy move consumes movement phase
two attacks allowed
pass skips correctly
recruitment phase allows controlled castles only
turn counter maps to player/phase exactly as Constants.ts documents
```

- [ ] **Step 4: Special systems matrix**

Cover:

```text
Wolf pack strength changes with adjacent wolves
Healer removes damage and cannot attack
Wizard Fireball marks ability used and replays from PGN
Wizard Teleport marks ability used and replays from PGN
Necromancer RaiseDead consumes soul/ability and handles revived exile behavior
Phoenix creates respawn record and respawns after configured rounds
Sanctuary tier requirements, sacrifice, cooldown, unlock, and pool behavior
Promotion cannot create Monarch and does not duplicate pieces
```

- [ ] **Step 5: Run all domain tests**

Run:

```powershell
npm test -- --watchAll=false Classes
```

Expected:

```text
All core rule tests pass before mutator cleanup starts.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/Classes/__tests__ src/Classes/Systems/__tests__
git commit -m "test: expand castles rule regression matrix"
```

---

## Task 12: Refactor Only After Tests Define the Safety Net

**Files:**

Modify in small slices:

`src/Classes/Commands/*.ts`

`src/Classes/Systems/Mutators/*.ts`

`src/Classes/Systems/StateMutator.ts`

`src/hooks/useMoveExecution.ts`

`src/Classes/Services/PGNImporter.ts`

**Purpose:** Improve modularity without changing behavior.

- [ ] **Step 1: Keep command execution side effects thin**

Target shape:

```text
Command validates action intent.
GameEngine applies state transition.
Mutator creates notation and records MoveTree.
Command emits UI event after success.
```

Check:

```text
No command should duplicate state mutation logic already handled by GameEngine/mutators.
No mutator should depend on React or browser APIs.
```

- [ ] **Step 2: Extract PGN token execution**

Current hydration mixes token parsing, execution, fallback behavior, and snapshot recording. Split into:

```text
parseReplayToken(token): ReplayAction
executeReplayAction(action, state, engine): GameState
snapshotState(state): PositionSnapshot
hydrateNode(node, parentState): ReplayResult
```

Tests from Tasks 5-8 must stay green after each extraction.

- [ ] **Step 3: Remove fallback mutation from PGN replay unless explicitly legacy**

Current pledge replay can manually spawn a piece if `engine.pledge` fails. Replace with one of:

| Mode | Behavior |
| --- | --- |
| Strict modern replay | Fail with diagnostic. |
| Legacy compatibility replay | Manual fallback allowed but diagnostic is emitted. |

- [ ] **Step 4: Normalize move metadata creation**

Use the same metadata semantics for live and replayed moves:

```ts
MutatorUtils.createMoveRecord(notation, preActionState)
```

Replay hydration should not record a move as if it happened in the post-action phase.

- [ ] **Step 5: Run the replay-focused suite after each extraction**

Run:

```powershell
npm test -- --watchAll=false PGN Notation MoveTreeSnapshot GameBranching GameVariations HistoryDuplication
```

Expected:

```text
No behavior drift after each small refactor.
```

- [ ] **Step 6: Commit each slice**

Suggested commits:

```powershell
git add src/Classes/Services/PGNImporter.ts src/Classes/Services/PGNService.ts
git commit -m "refactor: split PGN replay token execution"

git add src/Classes/Systems/Mutators src/Classes/Systems/StateMutator.ts
git commit -m "refactor: clarify mutator orchestration boundaries"

git add src/hooks/useMoveExecution.ts src/Classes/Commands
git commit -m "refactor: keep command execution side effects thin"
```

---

## Final Verification Checklist

Run after all planned work:

```powershell
npx tsc --noEmit
npm test -- --watchAll=false
npm run build
```

Expected:

```text
TypeScript passes.
Jest passes.
Production build passes.
No PGN/replay diagnostics appear for valid generated games.
```

Manual smoke checks:

| Flow | Expected |
| --- | --- |
| Start new game, make moves, export PGN, import PGN | Board, turn, move history, and legal actions match. |
| Enter analysis, step back, make alternate move | New branch appears without deleting mainline. |
| Export game with variations, reload from PGN | Variations remain navigable. |
| Pledge a sanctuary, export/import | Special piece, sanctuary cooldown, pool state survive. |
| Use ability, export/import | Ability effect and `abilityUsed` state survive. |
| Capture castle and recruit, export/import | Castle owner and recruited piece survive. |
| Promotion, export/import | Promoted type survives and no duplicate piece appears. |
| Share URL, reload page | Same game loads and URL params clear appropriately. |

---

## Recommended Execution Order

1. Baseline health.
2. Shared canonical-state test helpers.
3. State invariants.
4. Notation round-trip tests.
5. PGN setup round-trip tests.
6. PGN variation semantics tests.
7. Replay hydration strictness.
8. Export/import idempotence.
9. MoveTree snapshot safety.
10. React persistence flow.
11. Rule regression matrix.
12. Refactor in small slices.

Do not start broad organization/refactoring until Tasks 1-9 are green. Those tasks cover the behavior most likely to break silently.
