# Deep-Dive Code Review Audit

> **Last Updated**: December 2025  
> **Scope**: 6-Dimension Analysis

---

## 1. Correctness & Logic

### Game Rules Implementation

| Rule | Implementation | File | Status |
|------|----------------|------|--------|
| Turn phases (Move → Attack → Castle) | `TurnManager.getTurnPhase()` using `turnCounter % 5` | `TurnManager.ts` | ✅ Correct |
| Piece strength combat | `CombatSystem.resolveCombat()` cumulative damage | `CombatSystem.ts` | ✅ Correct |
| Ranged defense protection | `RuleEngine.isHexDefended()` + config flag | `RuleEngine.ts` | ✅ Correct |
| Castle ownership transfer | `StateMutator.applyCastleAttack()` | `StateMutator.ts` | ✅ Correct |
| Win conditions | `WinCondition.getWinner()` | `WinCondition.ts` | ✅ Correct |
| Sanctuary pledge requirements | `SanctuaryConfig` in `Constants.ts` | `Constants.ts` | ✅ Correct |

### State Validity

| Check | Implementation | Status |
|-------|----------------|--------|
| Two pieces on same hex | Prevented by immutable move logic | ✅ Safe |
| Invalid hex coordinates | `Board.hexSet` validation | ✅ Safe |
| Orphan pieces (off-board) | Trust-based, not validated | ⚠️ Edge case |
| Negative turn counter | Not validated | ⚠️ Edge case |

### Bug Detection

1. **Legacy Reference (Low Severity)**
   - **File**: `useGameLogic.ts`, Line ~321
   - **Issue**: `viewMoveIndex` used instead of `viewNodeId` in resign handler
   - **Fix**: Replace with `viewNodeId: null`

2. **PGN Import Recovery**
   - **File**: `PGNImporter.ts`
   - **Status**: Recent fix resolved "Mover not found" errors
   - **Note**: Hydration now correctly uses `CustomSetup` snapshot

---

## 2. Architecture & Modularity

### Coupling Analysis

| Component | Dependencies | Coupling Level |
|-----------|--------------|----------------|
| `useGameLogic.ts` | 8 hooks + 6 classes | ⚠️ High |
| `GameEngine.ts` | 2 classes (RuleEngine, StateMutator) | ✅ Low |
| `Piece.ts` | 2 registries + 1 config | ✅ Low |
| `Game.tsx` | 2 hooks (direct wiring) | ⚠️ Medium |

### Separation of Concerns

| Layer | UI Logic | Game Logic | Data Model | Rating |
|-------|----------|------------|------------|--------|
| `Game.tsx` | ✅ | ⚠️ Some leakage | ✅ | B |
| `useGameLogic.ts` | ⚠️ Mixed | ✅ | ✅ | C |
| `GameEngine.ts` | ✅ | ✅ | ✅ | A |
| `Piece.ts` | ✅ | ✅ | ✅ | A |
| `RuleEngine.ts` | ✅ | ✅ | ✅ | A |

### Design Patterns

| Pattern | Implementation | Quality |
|---------|----------------|---------|
| **Facade** | `GameEngine` wraps `RuleEngine` + `StateMutator` | ✅ Excellent |
| **Strategy** | `MoveStrategyRegistry`, `AttackStrategyRegistry` | ✅ Excellent |
| **Factory** | `PieceFactory.ts` | ✅ Good |
| **Command** | `MoveCommand`, `AttackCommand`, `PassCommand`, `RecruitCommand` | ⚠️ Incomplete |
| **Observer** | `gameEvents` EventEmitter | ⚠️ Underutilized |

### Missing Commands
- `PledgeCommand` - Not implemented
- `AbilityCommand` - Not implemented
- Actions go directly through `SanctuaryService` and `StateMutator.activateAbility()`

---

## 3. Efficiency & Data Structures

### Structure Analysis

| Use Case | Structure | Complexity | Optimal? |
|----------|-----------|------------|----------|
| Piece lookup by hex | `PieceMap` (Map) | O(1) | ✅ |
| Legal move validation | `legalMoveSet` (Set) | O(1) | ✅ |
| Blocked hex check | `blockedHexSet` (Set) | O(1) | ✅ |
| Move history | `MoveTree` (Tree) | O(depth) | ✅ |
| Find piece by notation | Linear search | O(n) | ⚠️ Could use index |

### Memory Considerations

1. **Snapshot Cloning**
   - Every move creates full copies of pieces/castles/sanctuaries
   - Impact: Linear memory growth with move count
   - Consider: Structural sharing or delta snapshots for optimization

2. **Dual State Computation**
   - `getEffectiveState()` clones pieces
   - `viewState` doesn't clone
   - Inconsistent approach creates confusion

---

## 4. Readability & Cognitive Load

### Naming Quality

| Category | Examples | Rating |
|----------|----------|--------|
| Functions | `isLegalMove()`, `handleHexClick()`, `applyAttack()` | ✅ A |
| Variables | `currentPlayer`, `turnPhase`, `movingPiece` | ✅ A |
| Constants | `PHASE_CYCLE_LENGTH`, `N_SQUARES` | ✅ A |
| Types | `GameState`, `CommandResult`, `MoveNode` | ✅ A |

### Complexity Metrics

| File | Lines | Est. Cyclomatic Complexity | Concern |
|------|-------|---------------------------|---------|
| `useGameLogic.ts` | 378 | ~15 | ⚠️ Many branches |
| `useMoveExecution.ts` | 350 | ~10 | ⚠️ Multiple action types |
| `StateMutator.activateAbility()` | 117 | ~12 | ⚠️ Ability branches |
| `PGNImporter.hydrateRecursive()` | 170 | ~10 | ⚠️ Error handling |

### Recommended Refactoring
- Extract ability handlers from `StateMutator.activateAbility()`
- Split `useGameLogic.ts` into focused hooks

---

## 5. System Documentation

### Documentation Quality

| File | TSDoc | Inline Comments | Conceptual | Score |
|------|-------|-----------------|------------|-------|
| `GameEngine.ts` | ✅ Full | ✅ Good | ✅ Facade pattern | 10/10 |
| `Piece.ts` | ✅ Full | ✅ Good | ✅ Immutability | 10/10 |
| `PieceTypeConfig.ts` | ✅ Full | ✅ Sections | ✅ How-to guide | 10/10 |
| `useGameLogic.ts` | ⚠️ Header | ⚠️ Sparse | ❌ None | 5/10 |
| `PGNImporter.ts` | ✅ Methods | ⚠️ Some | ⚠️ Missing diagram | 7/10 |

### Theory-to-Code Mapping

| Game Rule | Code Location | Documented? |
|-----------|---------------|-------------|
| Turn phase cycle | `Constants.ts` L96-122 | ✅ Detailed |
| Combat resolution | `CombatSystem.ts` | ⚠️ Sparse |
| Castle spawn order | `Castle.ts` | ⚠️ Implicit |
| Sanctuary requirements | `Constants.ts` SanctuaryConfig | ✅ Data-as-docs |

### Reference Gap
- `Castles_rules.md` exists but isn't referenced from code
- Add `@see Castles_rules.md` to relevant files

---

## 6. Refactoring & Maintainability

### Dead Code / Unused

| File | Issue | Line |
|------|-------|------|
| `useGameLogic.ts` | `viewMoveIndex` in resign | ~321 |
| `GameEngine.ts` | `PhoenixRecord` underused | 38-41 |

### Magic Numbers / Hardcoding

| Location | Value | Recommendation |
|----------|-------|----------------|
| `StateMutator.activateAbility` | `"Fireball"`, `"Teleport"`, `"RaiseDead"` | Create `AbilityType` enum |
| `Board.ts` | `?? 2` fallback for river | Move to BoardConfig defaults |

### Recommended Refactoring Path

1. **Create AbilityType enum** - Replace magic strings
2. **Add missing Commands** - `PledgeCommand`, `AbilityCommand`
3. **Split useGameLogic** - Extract `useComputedGame`
4. **Unify state computation** - Single source for view state
5. **Event bus integration** - Decouple side effects

---

## Summary

| Dimension | Score | Key Issue |
|-----------|-------|-----------|
| Correctness | A- | Minor legacy reference bug |
| Architecture | B | `useGameLogic` God Hook |
| Efficiency | A | Good data structures |
| Readability | B+ | Some high-complexity functions |
| Documentation | B | Inconsistent across files |
| Maintainability | B | Missing commands, magic strings |

**Overall Grade: B+**

The codebase has solid foundations (Facade, Strategy, Immutability) but needs focused refactoring on the hook layer and complete implementation of the Command pattern.
