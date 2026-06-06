import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_SSH_TIMEOUT_MS = 10_000;
const DEFAULT_BASE_URL = "https://castles.ls314.xyz";
const DEFAULT_SSH_TARGET = "lukasz@contabo.ls314.xyz";
const execFileAsync = promisify(execFile);

export function normalizeProductionBaseUrl(baseUrl) {
  const value = String(baseUrl ?? "").trim();
  if (!value) throw new Error("Production base URL is required.");
  return value.replace(/\/+$/, "");
}

export function extractSshHostname(sshTarget) {
  const withoutUser = String(sshTarget ?? "").split("@").pop() ?? "";
  const withoutPort = withoutUser.replace(/^\[/, "").replace(/\](:\d+)?$/, "").split(":")[0];
  return withoutPort || undefined;
}

export async function fetchProductionHealth(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizeProductionBaseUrl(baseUrl)}/api/health`, {
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`Health returned HTTP ${response.status}.`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export function checkTcpPort(host, port = 22, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SSH_TIMEOUT_MS;
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, error: `connect timed out after ${timeoutMs}ms` }));
    socket.once("error", (error) => finish({ ok: false, error: error.message }));
  });
}

async function gitOutput(args, options = {}) {
  const result = await execFileAsync("git", args, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? 5_000,
    windowsHide: true,
  });
  return result.stdout.trim();
}

export async function getCurrentGitCommit(options = {}) {
  return gitOutput(["rev-parse", "HEAD"], options);
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value ?? "").trim() !== "");
}

export async function resolveProductionFreshnessCliOptions(argv = [], env = process.env, dependencies = {}) {
  const baseUrl = firstNonEmpty(argv[0], env.BASE_URL, DEFAULT_BASE_URL);
  const expectedCommit =
    firstNonEmpty(argv[1], env.EXPECTED_COMMIT) ??
    (await (dependencies.getCurrentGitCommit ?? getCurrentGitCommit)({
      cwd: dependencies.gitCwd,
      timeoutMs: dependencies.gitTimeoutMs,
    }));
  const sshHost =
    firstNonEmpty(argv[2], env.DEPLOY_SSH_HOST) ??
    extractSshHostname(firstNonEmpty(env.DEPLOY_SSH_TARGET, DEFAULT_SSH_TARGET));
  return {
    baseUrl,
    expectedCommit,
    sshHost,
    sshPort: Number(firstNonEmpty(env.DEPLOY_SSH_PORT, 22)),
    sshTimeoutMs: Number(firstNonEmpty(env.DEPLOY_SSH_TIMEOUT_MS, DEFAULT_SSH_TIMEOUT_MS)),
    includeGitStatus: true,
  };
}

async function gitExitCode(args, options = {}) {
  try {
    await gitOutput(args, options);
    return 0;
  } catch (error) {
    if (typeof error.code === "number") return error.code;
    throw error;
  }
}

async function getProductionCommitStatus(productionCommit, upstreamRef, options = {}) {
  const commit = String(productionCommit ?? "").trim();
  if (!commit) return undefined;
  try {
    const ancestorExitCode = await gitExitCode(["merge-base", "--is-ancestor", commit, upstreamRef], options);
    if (ancestorExitCode === 0) {
      const commitsBehindText = await gitOutput(["rev-list", "--count", `${commit}..${upstreamRef}`], options);
      const commitsBehindUpstream = Number.parseInt(commitsBehindText, 10);
      return {
        status: "upstream_ancestor",
        commit,
        commitsBehindUpstream: Number.isFinite(commitsBehindUpstream) ? commitsBehindUpstream : undefined,
      };
    }
    if (ancestorExitCode === 1) {
      return {
        status: "not_upstream_ancestor",
        commit,
      };
    }
    return {
      status: "unavailable",
      commit,
      error: `git merge-base returned exit code ${ancestorExitCode}`,
    };
  } catch (error) {
    return {
      status: "unavailable",
      commit,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getGitDeployStatus(expectedCommit, options = {}) {
  if (!expectedCommit) return { status: "not_checked" };
  try {
    const branch = await gitOutput(["branch", "--show-current"], options);
    const headCommit = await gitOutput(["rev-parse", "HEAD"], options);
    let upstream;
    let upstreamCommit;
    try {
      upstream = await gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], options);
      upstreamCommit = await gitOutput(["rev-parse", "@{u}"], options);
    } catch {
      return {
        status: "no_upstream",
        branch: branch || "detached",
        headCommit,
      };
    }

    const containsExitCode = await gitExitCode(["merge-base", "--is-ancestor", expectedCommit, "@{u}"], options);
    if (containsExitCode !== 0 && containsExitCode !== 1) {
      return {
        status: "unavailable",
        error: `git merge-base returned exit code ${containsExitCode}`,
      };
    }
    const status = {
      status: containsExitCode === 0 ? "upstream_contains_expected" : "upstream_missing_expected",
      branch: branch || "detached",
      headCommit,
      upstream,
      upstreamCommit,
    };
    const productionCommit = await getProductionCommitStatus(options.deployedCommit, "@{u}", options);
    if (productionCommit) status.productionCommit = productionCommit;
    return status;
  } catch (error) {
    return {
      status: "unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function checkProductionFreshness(options) {
  const baseUrl = normalizeProductionBaseUrl(options.baseUrl);
  const expectedCommit = options.expectedCommit;
  const healthBody = await (options.fetchHealth ?? fetchProductionHealth)(baseUrl);
  const health = {
    ok: healthBody?.ok === true,
    buildId: healthBody?.build?.buildId,
    commit: healthBody?.build?.commit,
    eventSchemaVersion: healthBody?.online?.eventSchemaVersion,
    storeBackend: healthBody?.online?.store?.backend,
  };
  const commit = expectedCommit
    ? health.commit === expectedCommit
      ? { status: "match" }
      : { status: "mismatch", expected: expectedCommit, actual: health.commit }
    : { status: "not_checked" };

  let ssh = { status: "not_checked" };
  if (options.sshHost) {
    const port = options.sshPort ?? 22;
    const result = await (options.checkTcpPort ?? checkTcpPort)(options.sshHost, port, {
      timeoutMs: options.sshTimeoutMs,
    });
    ssh = result.ok
      ? { status: "reachable", host: options.sshHost, port }
      : { status: "unreachable", host: options.sshHost, port, error: result.error ?? "connection failed" };
  }

  const git =
    expectedCommit && (options.getGitDeployStatus || options.includeGitStatus)
      ? await (options.getGitDeployStatus ?? getGitDeployStatus)(expectedCommit, {
          cwd: options.gitCwd,
          timeoutMs: options.gitTimeoutMs,
          deployedCommit: health.commit,
        })
      : undefined;

  const result = {
    baseUrl,
    expectedCommit,
    health,
    commit,
    ssh,
    ok: health.ok === true && commit.status !== "mismatch" && ssh.status !== "unreachable",
  };
  if (git) result.git = git;
  return result;
}

export function formatProductionFreshnessResult(result) {
  const lines = [
    `Production: ${result.baseUrl}`,
    `Health: ok=${result.health.ok} buildId=${result.health.buildId ?? "unknown"} commit=${
      result.health.commit ?? "unknown"
    } store=${result.health.storeBackend ?? "unknown"} schema=${result.health.eventSchemaVersion ?? "unknown"}`,
  ];
  if (result.commit.status === "match") {
    lines.push(`Commit: match ${result.expectedCommit}`);
  } else if (result.commit.status === "mismatch") {
    lines.push(`Commit: mismatch expected=${result.commit.expected} actual=${result.commit.actual ?? "unknown"}`);
  } else {
    lines.push("Commit: not checked");
  }
  if (result.ssh.status === "reachable") {
    lines.push(`SSH: reachable ${result.ssh.host}:${result.ssh.port}`);
  } else if (result.ssh.status === "unreachable") {
    lines.push(`SSH: unreachable ${result.ssh.host}:${result.ssh.port} (${result.ssh.error})`);
  } else {
    lines.push("SSH: not checked");
  }
  if (result.git) {
    if (result.git.status === "upstream_contains_expected") {
      lines.push(
        `Git: expected commit is present on upstream ${result.git.upstream} (branch=${result.git.branch} head=${result.git.headCommit} upstreamCommit=${result.git.upstreamCommit})`,
      );
    } else if (result.git.status === "upstream_missing_expected") {
      lines.push(
        `Git: expected commit is not present on upstream ${result.git.upstream} (branch=${result.git.branch} head=${result.git.headCommit} upstreamCommit=${result.git.upstreamCommit})`,
      );
    } else if (result.git.status === "no_upstream") {
      lines.push(`Git: no tracked upstream for branch ${result.git.branch} (head=${result.git.headCommit})`);
    } else if (result.git.status === "unavailable") {
      lines.push(`Git: unavailable (${result.git.error})`);
    } else {
      lines.push("Git: not checked");
    }
    if (result.git.productionCommit?.status === "upstream_ancestor") {
      const count = result.git.productionCommit.commitsBehindUpstream;
      const behindText =
        typeof count === "number" ? `${count} ${count === 1 ? "commit" : "commits"}` : "an unknown number of commits";
      lines.push(
        `Git: production health commit ${result.git.productionCommit.commit} is ${behindText} behind upstream ${result.git.upstream}.`,
      );
    } else if (result.git.productionCommit?.status === "not_upstream_ancestor") {
      lines.push(
        `Git: production health commit ${result.git.productionCommit.commit} is not an ancestor of upstream ${result.git.upstream}.`,
      );
    } else if (result.git.productionCommit?.status === "unavailable") {
      lines.push(
        `Git: production health commit ${result.git.productionCommit.commit} could not be compared with upstream (${result.git.productionCommit.error}).`,
      );
    }
  }
  if (result.commit.status === "mismatch" && result.git?.status === "upstream_contains_expected") {
    const productionCommit = result.git.productionCommit;
    const behindText =
      productionCommit?.status === "upstream_ancestor" && typeof productionCommit.commitsBehindUpstream === "number"
        ? ` (${productionCommit.commitsBehindUpstream} ${
            productionCommit.commitsBehindUpstream === 1 ? "commit" : "commits"
          } behind upstream)`
        : "";
    lines.push(
      `Diagnosis: expected commit is pushed to the tracked upstream, but production health is still serving ${
        result.commit.actual ?? "unknown"
      }${behindText}.`,
    );
  } else if (result.commit.status === "mismatch" && result.git?.status === "upstream_missing_expected") {
    lines.push("Diagnosis: expected commit is not on the tracked upstream; check push target or branch selection.");
  }
  lines.push(`Freshness: ${result.ok ? "ok" : "failed"}`);
  return lines.join("\n");
}
