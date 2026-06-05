import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_SSH_TIMEOUT_MS = 10_000;
const execFileAsync = promisify(execFile);

export function normalizeProductionBaseUrl(baseUrl) {
  const value = String(baseUrl ?? "").trim();
  if (!value) throw new Error("Production base URL is required.");
  return value.replace(/\/+$/, "");
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

async function gitExitCode(args, options = {}) {
  try {
    await gitOutput(args, options);
    return 0;
  } catch (error) {
    if (typeof error.code === "number") return error.code;
    throw error;
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
    return {
      status: containsExitCode === 0 ? "upstream_contains_expected" : "upstream_missing_expected",
      branch: branch || "detached",
      headCommit,
      upstream,
      upstreamCommit,
    };
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
  }
  if (result.commit.status === "mismatch" && result.git?.status === "upstream_contains_expected") {
    lines.push(
      `Diagnosis: expected commit is pushed to the tracked upstream, but production health is still serving ${
        result.commit.actual ?? "unknown"
      }.`,
    );
  } else if (result.commit.status === "mismatch" && result.git?.status === "upstream_missing_expected") {
    lines.push("Diagnosis: expected commit is not on the tracked upstream; check push target or branch selection.");
  }
  lines.push(`Freshness: ${result.ok ? "ok" : "failed"}`);
  return lines.join("\n");
}
