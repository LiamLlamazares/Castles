import net from "node:net";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_SSH_TIMEOUT_MS = 10_000;

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

  return {
    baseUrl,
    expectedCommit,
    health,
    commit,
    ssh,
    ok: health.ok === true && commit.status !== "mismatch" && ssh.status !== "unreachable",
  };
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
  lines.push(`Freshness: ${result.ok ? "ok" : "failed"}`);
  return lines.join("\n");
}
