# Account Challenge Pair Shared Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advance item 11 by routing targeted account challenge pair duplication and cooldown checks through a runtime coordinator gate that can be backed by PostgreSQL.

**Architecture:** The existing challenge route uses a process-local pair queue for targeted registered-account challenges. This slice adds an `account_challenge_pair` operation-gate scope, exposes `withAccountChallengePairGate(pairKey, operation)` on the runtime coordinator, and routes targeted challenge creation through that coordinator gate. The pair gate key remains ordered by challenger then challenged, but is hashed before storage so the operational lock table does not persist raw account ids or display names.

**Tech Stack:** TypeScript, Vitest, Express HTTP server tests, PostgreSQL row locks through `PostgresOnlineOperationGateStore`.

---

### Task 1: Coordinator Account Challenge Pair Gate

**Files:**
- Modify: `src/online/server/onlineRuntimeCoordinator.ts`
- Modify: `src/online/server/__tests__/onlineRuntimeCoordinator.test.ts`

- [x] **Step 1: Write failing coordinator tests**

Add tests proving:

- `createSingleNodeOnlineRuntimeCoordinator().withAccountChallengePairGate()` serializes concurrent work for the same pair key.
- `createPostgresOperationGateRuntimeCoordinator()` delegates account challenge pair gates to `operationGateStore.withOperationGate({ scope: "account_challenge_pair", key })`.
- The PostgreSQL-backed operation-gate coordinator reports a partial selected-gates capability, not full multi-instance readiness.

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "account challenge pair gate|operation gate"
```

Expected before implementation: fail because the coordinator contract has no account challenge pair gate and the operation-gate scope does not exist.

Evidence: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "account challenge pair gate|operation gate"` failed with `TypeError: coordinator.withAccountChallengePairGate is not a function`.

- [x] **Step 2: Implement minimal coordinator seam**

Extend:

```ts
export type OnlineRuntimeOperationGateScope =
  | "quick_match_session"
  | "account_challenge_pair";
```

Extend `OnlineRuntimeCoordinator` with:

```ts
withAccountChallengePairGate<T>(pairKey: string, operation: () => Promise<T>): Promise<T>;
```

Single-node implementation uses the same promise-chain helper as the existing game and Quick Match gates. `createPostgresOperationGateRuntimeCoordinator()` delegates account challenge pair gates with `{ scope: "account_challenge_pair", key: pairKey }` and reports `operationGates: "postgres-selected-shared-gates"`.

- [x] **Step 3: Verify coordinator tests pass**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "account challenge pair gate|operation gate"
```

Expected after implementation: matching tests pass.

Evidence: `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "account challenge pair gate|operation gate"` passed with 3 matching tests.

### Task 2: PostgreSQL Operation Gate Scope

**Files:**
- Modify: `src/online/server/PostgresOnlineOperationGateStore.ts`
- Modify: `src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts`

- [x] **Step 1: Write failing operation-gate store test**

Add a test proving `withOperationGate({ scope: "account_challenge_pair", key }, operation)` persists and locks that scope exactly, while the existing invalid-scope and secret-key guards still reject before persistence.

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "account_challenge_pair|invalid scopes"
```

Expected before implementation: fail because `account_challenge_pair` is not an allowed operation-gate scope.

Evidence: `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "account_challenge_pair|invalid scopes"` failed with `Error: Invalid PostgreSQL operation gate scope.`

- [x] **Step 2: Add the scope**

Add `"account_challenge_pair"` to the allowed `OPERATION_GATE_SCOPES` set. Do not create a separate table and do not relax key/secret validation.

- [x] **Step 3: Verify store tests pass**

Run:

```bash
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "account_challenge_pair|invalid scopes"
```

Expected after implementation: matching tests pass.

Evidence before review fix: `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "account_challenge_pair|invalid scopes"` passed with 2 matching tests.

Review follow-up evidence: `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "account_challenge_pair|raw account challenge pair|invalid scopes"` first failed because raw account-challenge-pair keys were accepted, then passed with 3 matching tests after scope-specific hashed-key validation.

### Task 3: Targeted Challenge Route Wiring

**Files:**
- Modify: `src/online/server/createOnlineHttpServer.ts`
- Modify: `src/online/server/__tests__/createOnlineHttpServer.test.ts`

- [x] **Step 1: Write failing HTTP server test**

Add a test proving `POST /api/online/challenges` for a targeted registered-account challenge calls `runtimeCoordinator.withAccountChallengePairGate(pairKey, operation)`, and that the pending/cooldown restriction check and `appendChallengeCreated` call happen inside that gate. The pair key should start with `account_challenge_pair:` and must not contain the challenger or challenged raw account id/display name.

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "account challenge pair shared gate"
```

Expected before route wiring: fail because targeted challenge creation still uses the route-local `accountChallengePairQueues` helper and never calls the runtime coordinator gate.

Evidence: after correcting the expected response shape, `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "account challenge pair shared gate"` failed with `expected "withAccountChallengePairGate" to be called once, but got 0 times`.

- [x] **Step 2: Wire targeted challenges to the coordinator**

Remove the route-local `accountChallengePairQueues` map and `runAccountChallengePairTask()`. Replace the old queue key helper with `accountChallengePairGateKey()` returning a safe deterministic key:

```ts
const pairKeyPayload = JSON.stringify([
  publicPlayerIdentityQueueKey(challengerIdentity),
  publicPlayerIdentityQueueKey(challengedIdentity),
]);
return `account_challenge_pair:${createHash("sha256").update(pairKeyPayload, "utf8").digest("base64url")}`;
```

Use:

```ts
runtimeCoordinator.withAccountChallengePairGate(
  accountChallengePairGateKey(challengerIdentity, challengedIdentity),
  createChallenge
)
```

Preserve existing validation, privacy checks, source-game rematch authorization, pending/cooldown response shape, challenge creation behavior, and non-targeted challenge behavior.

- [x] **Step 3: Verify HTTP route test passes**

Run:

```bash
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "account challenge pair shared gate"
```

Expected after implementation: matching test passes.

Evidence: `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "account challenge pair shared gate"` passed with 1 matching test.

### Task 4: Review, Verification, Roadmap, Commit

**Files:**
- Modify: `docs/online-multiplayer-plan.md`
- Modify: `docs/superpowers/plans/2026-06-16-account-challenge-pair-shared-gate.md`

- [x] **Step 1: Review**

Run code review focused on:

- whether the targeted challenge pending/cooldown checks and append happen under one coordinator gate;
- whether the gate key is ordered, deterministic, bounded, and does not persist raw account ids/display names;
- whether coordinator/store capabilities avoid overclaiming full shared gate coverage or multi-instance readiness;
- whether single-node non-targeted challenge behavior remains unchanged;
- whether this deletes, rather than preserves, the route-local legacy queue path.

Classify findings as accept, reject, investigate, or defer before applying changes.

Review disposition:

| Finding | Severity | Decision | Action |
|---|---|---|---|
| Account-challenge-pair key privacy was enforced only by the HTTP route helper; the Postgres operation-gate store would accept raw display-name-shaped account pair keys for the new scope. | major | accept | Added a failing raw-key store regression, switched lower-layer tests to hash-shaped keys, and enforced `account_challenge_pair:[A-Za-z0-9_-]{43}` before persistence. |

- [x] **Step 2: Final verification**

Run:

```bash
npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "account challenge pair gate|operation gate"
npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "account_challenge_pair|raw account challenge pair|invalid scopes"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "account challenge pair shared gate|serializes concurrent targeted account challenge pair checks|rate limits repeat targeted account challenges while one is pending"
npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts
npm run build
npm run server:build
npm run audit
git diff --check
```

No browser screenshots are required because this slice changes backend/runtime synchronization only.

Evidence:

- `npx vitest run src/online/server/__tests__/onlineRuntimeCoordinator.test.ts -t "account challenge pair gate|operation gate"` passed with 3 matching tests.
- `npx vitest run src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts -t "account_challenge_pair|raw account challenge pair|invalid scopes"` passed with 3 matching tests.
- `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts -t "account challenge pair shared gate|serializes concurrent targeted account challenge pair checks|rate limits repeat targeted account challenges while one is pending"` passed with 3 matching tests.
- `npx vitest run src/online/server/__tests__/createOnlineHttpServer.test.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/__tests__/PostgresOnlineGameStore.test.ts` passed with 288 tests.
- `npm run build` passed with the existing Vite large-chunk warning.
- `npm run server:build` passed.
- `npm run audit` passed with 0 vulnerabilities.
- `git diff --check` passed with CRLF conversion warnings only.

- [x] **Step 3: Roadmap update**

Record the completed item 11 sub-slice in `docs/online-multiplayer-plan.md`, including exact commands, non-goals, and the next shared-runtime prerequisite.

- [ ] **Step 4: Commit and push**

Run:

```bash
git status --short
git add docs/online-multiplayer-plan.md docs/superpowers/plans/2026-06-16-account-challenge-pair-shared-gate.md src/online/server/onlineRuntimeCoordinator.ts src/online/server/__tests__/onlineRuntimeCoordinator.test.ts src/online/server/PostgresOnlineOperationGateStore.ts src/online/server/__tests__/PostgresOnlineOperationGateStore.test.ts src/online/server/createOnlineHttpServer.ts src/online/server/__tests__/createOnlineHttpServer.test.ts
git commit -m "Add account challenge pair shared gate"
git push origin HEAD:online-action-log
```
