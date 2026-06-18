import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as defaultSleep } from "node:timers/promises";
import { promisify } from "node:util";
import {
  fetchProductionHealth,
  normalizeProductionBaseUrl,
} from "./production-freshness.mjs";

const execFileAsync = promisify(execFile);
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const BUILD_ID = /^[A-Za-z0-9_.:-]+$/;
const DEFAULT_BASE_URL = "https://castles.ls314.xyz";
const DEFAULT_BRANCH = "master";
const DEFAULT_BACKUP_ROOT = "/home/lukasz/deploy-backups";
const DEFAULT_ENV_FILE = "/etc/castles/castles.env";
const DEFAULT_HEALTH_TIMEOUT_SECONDS = 45;
const DEFAULT_LOCAL_HEALTH_URL = "http://127.0.0.1:3000/api/health";
const DEFAULT_REPO_DIR = "/home/lukasz/Castles";
const DEFAULT_SERVICE = "castles-node.service";
const DEFAULT_SSH_TARGET = "lukasz@contabo.ls314.xyz";
const DEFAULT_UPSTREAM_REMOTE = "origin";

const VALUE_FLAGS = new Map([
  ["--backup-root", "backupRoot"],
  ["--base-url", "baseUrl"],
  ["--branch", "branch"],
  ["--build-id", "buildId"],
  ["--commit", "commit"],
  ["--env-file", "envFile"],
  ["--health-timeout-seconds", "healthTimeoutSeconds"],
  ["--local-health-url", "localHealthUrl"],
  ["--repo-dir", "repoDir"],
  ["--service", "service"],
  ["--ssh-host", "sshHealthHost"],
  ["--ssh-target", "sshTarget"],
  ["--upstream-remote", "upstreamRemote"],
]);

const BOOLEAN_FLAGS = new Map([
  ["--dry-run", "dryRun"],
  ["--skip-api-smoke", "skipApiSmoke"],
  ["--skip-browser-smoke", "skipBrowserSmoke"],
  ["--skip-freshness", "skipFreshness"],
]);

function readFlagState(argv) {
  const values = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      values.help = true;
      continue;
    }
    const valueKey = VALUE_FLAGS.get(arg);
    if (valueKey) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      values[valueKey] = value;
      index += 1;
      continue;
    }
    const booleanKey = BOOLEAN_FLAGS.get(arg);
    if (booleanKey) {
      values[booleanKey] = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown deploy option: ${arg}`);
    }
    positionals.push(arg);
  }

  if (positionals.length > 2) {
    throw new Error("Expected at most two positional args: <commit> [build-id].");
  }
  return {
    values,
    positionals,
  };
}

function envFlag(env, key) {
  return String(env[key] ?? "") === "1";
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function makeBuildId(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    "-",
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
}

function assertNoControlChars(value, label) {
  if (/[\0\r\n]/.test(String(value))) {
    throw new Error(`${label} cannot contain control characters.`);
  }
}

function validateOptionalCommit(commit) {
  if (commit && !COMMIT_SHA.test(commit)) {
    throw new Error("Deploy commit must be a full 40-character commit SHA.");
  }
}

function validateBuildId(buildId) {
  if (!BUILD_ID.test(buildId)) {
    throw new Error("BUILD_ID may contain only letters, numbers, dots, underscores, colons, and dashes.");
  }
}

function validateProductionDeployOptions(options, { requireCommit = true } = {}) {
  if (requireCommit && !options.commit) throw new Error("Deploy commit is required.");
  validateOptionalCommit(options.commit);
  validateBuildId(options.buildId);
  for (const [label, value] of Object.entries({
    backupRoot: options.backupRoot,
    branch: options.branch,
    envFile: options.envFile,
    localHealthUrl: options.localHealthUrl,
    repoDir: options.repoDir,
    service: options.service,
    upstreamRemote: options.upstreamRemote,
  })) {
    if (!String(value ?? "").trim()) throw new Error(`${label} is required.`);
    assertNoControlChars(value, label);
  }
  if (!options.healthTimeoutSeconds || options.healthTimeoutSeconds <= 0) {
    throw new Error("healthTimeoutSeconds must be positive.");
  }
}

export function extractSshHostname(sshTarget) {
  const withoutUser = String(sshTarget ?? "").split("@").pop() ?? "";
  const withoutPort = withoutUser.replace(/^\[/, "").replace(/\](:\d+)?$/, "").split(":")[0];
  return withoutPort || undefined;
}

export function parseProductionDeployArgs(argv, env = {}, { now = new Date() } = {}) {
  const { values, positionals } = readFlagState(argv);
  const sshTarget = values.sshTarget ?? env.DEPLOY_SSH_TARGET ?? DEFAULT_SSH_TARGET;
  const args = {
    backupRoot: values.backupRoot ?? env.DEPLOY_BACKUP_ROOT ?? DEFAULT_BACKUP_ROOT,
    baseUrl: normalizeProductionBaseUrl(values.baseUrl ?? env.DEPLOY_BASE_URL ?? DEFAULT_BASE_URL),
    branch: values.branch ?? env.DEPLOY_BRANCH ?? DEFAULT_BRANCH,
    buildId: values.buildId ?? positionals[1] ?? env.DEPLOY_BUILD_ID ?? makeBuildId(now),
    commit: values.commit ?? positionals[0] ?? env.DEPLOY_COMMIT,
    dryRun: values.dryRun === true || envFlag(env, "DEPLOY_DRY_RUN"),
    envFile: values.envFile ?? env.CASTLES_ENV_FILE ?? DEFAULT_ENV_FILE,
    healthTimeoutSeconds: parsePositiveInteger(
      values.healthTimeoutSeconds ?? env.DEPLOY_HEALTH_TIMEOUT_SECONDS ?? DEFAULT_HEALTH_TIMEOUT_SECONDS,
      "health timeout seconds"
    ),
    help: values.help === true,
    localHealthUrl: values.localHealthUrl ?? env.DEPLOY_LOCAL_HEALTH_URL ?? DEFAULT_LOCAL_HEALTH_URL,
    repoDir: values.repoDir ?? env.DEPLOY_REPO_DIR ?? DEFAULT_REPO_DIR,
    service: values.service ?? env.DEPLOY_SERVICE ?? DEFAULT_SERVICE,
    skipApiSmoke: values.skipApiSmoke === true || envFlag(env, "DEPLOY_SKIP_API_SMOKE"),
    skipBrowserSmoke: values.skipBrowserSmoke === true || envFlag(env, "DEPLOY_SKIP_BROWSER_SMOKE"),
    skipFreshness: values.skipFreshness === true || envFlag(env, "DEPLOY_SKIP_FRESHNESS"),
    sshHealthHost: values.sshHealthHost ?? env.DEPLOY_SSH_HOST ?? extractSshHostname(sshTarget),
    sshTarget,
    upstreamRemote: values.upstreamRemote ?? env.DEPLOY_UPSTREAM_REMOTE ?? DEFAULT_UPSTREAM_REMOTE,
  };
  if (!args.help) {
    validateProductionDeployOptions(args, { requireCommit: false });
  }
  return args;
}

function bashQuote(value) {
  assertNoControlChars(value, "shell value");
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function buildRemoteProductionDeployScript(options) {
  validateProductionDeployOptions(options);
  const assignments = [
    ["backup_root", options.backupRoot],
    ["branch", options.branch],
    ["build_id", options.buildId],
    ["env_file", options.envFile],
    ["expected_commit", options.commit],
    ["health_timeout_seconds", options.healthTimeoutSeconds],
    ["local_health_url", options.localHealthUrl],
    ["repo_dir", options.repoDir],
    ["service_name", options.service],
    ["upstream_remote", options.upstreamRemote],
  ]
    .map(([key, value]) => `${key}=${bashQuote(value)}`)
    .join("\n");

  return `#!/usr/bin/env bash
set -euo pipefail

${assignments}

cd "$repo_dir"

dirty_state="$(git status --porcelain)"
if [ -n "$dirty_state" ]; then
  printf 'Remote deploy worktree is dirty in %s:\\n%s\\n' "$repo_dir" "$dirty_state" >&2
  exit 1
fi

git fetch --prune "$upstream_remote" "+refs/heads/$branch:refs/remotes/$upstream_remote/$branch"
fetched_commit="$(git rev-parse "refs/remotes/$upstream_remote/$branch")"
if [ "$fetched_commit" != "$expected_commit" ]; then
  printf 'Fetched %s/%s at %s, expected %s. Push first or deploy the fetched head.\\n' "$upstream_remote" "$branch" "$fetched_commit" "$expected_commit" >&2
  exit 1
fi

backup_dir="$backup_root/castles-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
git rev-parse HEAD > "$backup_dir/previous-head.txt"
if [ -f "$env_file" ]; then
  sudo cp -a "$env_file" "$backup_dir/castles.env"
fi
service_unit="/etc/systemd/system/$service_name"
if [ -f "$service_unit" ]; then
  sudo cp -a "$service_unit" "$backup_dir/$service_name"
fi
sudo /usr/bin/node scripts/deploy/postgres-online-backup.mjs --out "$backup_dir/online-postgres.json" --castles-env-file "$env_file"
sudo chown -R "$(id -u):$(id -g)" "$backup_dir"
/usr/bin/node scripts/deploy/postgres-online-backup.mjs --validate "$backup_dir/online-postgres.json"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_dir" && find . -maxdepth 1 -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
fi

git checkout --detach "$expected_commit"
npm ci
npm run build
npm run server:build
sudo /usr/bin/node scripts/deploy/deploy-metadata-env.mjs "$env_file" "$build_id" "$expected_commit"
sudo systemctl restart "$service_name"

health_start="$SECONDS"
last_health=""
last_health_commit=""
while [ $((SECONDS - health_start)) -lt "$health_timeout_seconds" ]; do
  last_health="$(curl -fsS "$local_health_url" 2>&1 || true)"
  last_health_commit="$(HEALTH_JSON="$last_health" /usr/bin/node -e 'try { const body = JSON.parse(process.env.HEALTH_JSON || "{}"); process.stdout.write(body?.build?.commit || ""); } catch {}' 2>/dev/null || true)"
  if [ "$last_health_commit" = "$expected_commit" ]; then
    printf 'Production health is fresh at %s after %ss.\\n' "$expected_commit" "$((SECONDS - health_start))"
    printf 'DEPLOYED_HEAD=%s\\n' "$expected_commit"
    printf 'BUILD_ID=%s\\n' "$build_id"
    printf 'BACKUP_DIR=%s\\n' "$backup_dir"
    exit 0
  fi
  sleep 1
done

printf 'Production health did not report expected commit %s after %ss. Last commit=%s Last health=%s\\n' "$expected_commit" "$health_timeout_seconds" "\${last_health_commit:-unknown}" "$last_health" >&2
sudo systemctl status "$service_name" --no-pager >&2 || true
exit 1
`;
}

export function buildProductionDeploySteps(options) {
  validateProductionDeployOptions(options);
  if (!String(options.sshTarget ?? "").trim()) throw new Error("sshTarget is required.");
  assertNoControlChars(options.sshTarget, "sshTarget");
  const steps = [
    {
      label: "remote deploy",
      command: "ssh",
      args: [options.sshTarget, "bash -s"],
      input: buildRemoteProductionDeployScript(options),
    },
  ];

  if (!options.skipFreshness) {
    const args = [
      "scripts/deploy/check-production-freshness.mjs",
      options.baseUrl,
      options.commit,
    ];
    if (options.sshHealthHost) args.push(options.sshHealthHost);
    steps.push({
      label: "production freshness",
      command: "node",
      args,
    });
  }

  if (!options.skipApiSmoke) {
    steps.push({
      label: "production API smoke",
      command: "node",
      args: ["scripts/deploy/check-online-smoke.mjs", options.baseUrl, options.commit],
    });
  }

  if (!options.skipBrowserSmoke) {
    steps.push({
      label: "production browser smoke",
      command: "node",
      args: ["scripts/deploy/check-online-browser-smoke.mjs", options.baseUrl, options.commit],
    });
  }

  return steps;
}

async function getCurrentGitCommit() {
  const result = await execFileAsync("git", ["rev-parse", "HEAD"], {
    timeout: 5_000,
    windowsHide: true,
  });
  return result.stdout.trim();
}

export async function resolveProductionDeployOptions(argv, env = process.env, dependencies = {}) {
  const options = parseProductionDeployArgs(argv, env, dependencies);
  if (!options.commit && !options.help) {
    options.commit = await (dependencies.getCurrentCommit ?? getCurrentGitCommit)();
  }
  if (!options.help) validateProductionDeployOptions(options);
  return options;
}

function runCommand(step) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      stdio: step.input ? ["pipe", "inherit", "inherit"] : "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.label} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
    if (step.input) {
      child.stdin.end(`${step.input}\n`);
    }
  });
}

export async function waitForProductionHealth(options) {
  const baseUrl = normalizeProductionBaseUrl(options.baseUrl);
  const expectedCommit = options.expectedCommit;
  if (!expectedCommit) throw new Error("expectedCommit is required.");
  const fetchHealth = options.fetchHealth ?? fetchProductionHealth;
  const sleep = options.sleep ?? defaultSleep;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + (options.timeoutMs ?? 45_000);
  const maxAttempts = options.maxAttempts ?? Number.POSITIVE_INFINITY;
  let attempts = 0;
  let lastCommit = "unknown";
  let lastError;

  while (attempts < maxAttempts && Date.now() <= deadline) {
    attempts += 1;
    try {
      const body = await fetchHealth(baseUrl);
      lastCommit = body?.build?.commit ?? "unknown";
      if (body?.ok === true && lastCommit === expectedCommit) {
        return {
          ok: true,
          attempts,
          commit: lastCommit,
        };
      }
    } catch (error) {
      lastError = error;
    }
    if (attempts < maxAttempts && Date.now() <= deadline) {
      await sleep(intervalMs);
    }
  }

  const detail = lastError ? `; last error=${lastError.message}` : "";
  throw new Error(
    `Production health did not report expected commit ${expectedCommit} after ${attempts} attempts; last commit=${lastCommit}${detail}`
  );
}

export async function runProductionDeploy(options, dependencies = {}) {
  validateProductionDeployOptions(options);
  const steps = buildProductionDeploySteps(options);
  for (const step of steps) {
    dependencies.log?.(`\n==> ${step.label}`);
    await (dependencies.runCommand ?? runCommand)(step);
  }
  return {
    ok: true,
    commit: options.commit,
    steps: steps.map((step) => step.label),
  };
}

function usage() {
  return [
    "Usage: node scripts/deploy/deploy-production.mjs [commit] [build-id] [options]",
    "",
    "Options:",
    "  --commit <sha>                  Full commit SHA to deploy (defaults to local HEAD).",
    "  --build-id <id>                 Build id written to production env (defaults to UTC timestamp).",
    "  --ssh-target <user@host>         SSH target (default: lukasz@contabo.ls314.xyz).",
    "  --ssh-host <host>                Host used by freshness TCP check (default: derived from SSH target).",
    "  --base-url <url>                 Production URL (default: https://castles.ls314.xyz).",
    "  --repo-dir <path>                Remote repo dir (default: /home/lukasz/Castles).",
    "  --env-file <path>                Remote castles env file (default: /etc/castles/castles.env).",
    "  --service <name>                 systemd service name (default: castles-node.service).",
    "  --skip-freshness                Skip production freshness check.",
    "  --skip-api-smoke                Skip production API/WebSocket smoke.",
    "  --skip-browser-smoke            Skip production browser smoke.",
    "  --dry-run                       Print the generated steps and remote script without executing.",
    "",
    "For npm run on Windows, prefer positional args or env flags, for example:",
    "  npm run online:deploy:production -- <commit> <build-id>",
    "  npm run online:deploy:production:dry-run -- <commit> <build-id>",
    "  $env:DEPLOY_DRY_RUN='1'; npm run online:deploy:production -- <commit> <build-id>",
  ].join("\n");
}

async function main() {
  const options = await resolveProductionDeployOptions(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const steps = buildProductionDeploySteps(options);
  if (options.dryRun) {
    console.log(`Deploy commit: ${options.commit}`);
    for (const step of steps) {
      console.log(`${step.label}: ${step.command} ${step.args.join(" ")}`);
    }
    console.log("\n--- remote script ---");
    console.log(steps[0].input);
    return;
  }
  await runProductionDeploy(options, {
    log: (message) => console.log(message),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
