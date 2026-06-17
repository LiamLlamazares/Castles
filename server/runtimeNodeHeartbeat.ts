import { stringContainsDurableSecret } from "../src/online/secretSafety";

export interface RuntimeNodeHeartbeatStatus {
  running: boolean;
  ready: boolean;
  consecutiveFailures: number;
  lastHeartbeatAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
}

export interface RuntimeNodeHeartbeat {
  getStatus(): RuntimeNodeHeartbeatStatus;
  stop(): Promise<void>;
}

export interface RuntimeNodeHeartbeatOptions {
  runtimeNodeStore: { recordNodeHeartbeat(): Promise<unknown> };
  intervalMs: number;
  maxBackoffMs: number;
  failureReadinessThreshold?: number;
  now?: () => Date;
  onError?: (error: unknown, status: RuntimeNodeHeartbeatStatus) => void;
}

function parsePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function sanitizeRuntimeNodeHeartbeatError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const value = message.trim();
  const containsCredentialedUrl = /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i.test(value);
  if (!value || containsCredentialedUrl || stringContainsDurableSecret(value)) {
    return "Runtime node heartbeat failed.";
  }
  return value.slice(0, 240);
}

export function startRuntimeNodeHeartbeat(
  options: RuntimeNodeHeartbeatOptions
): RuntimeNodeHeartbeat {
  const intervalMs = parsePositiveInteger(options.intervalMs, "Runtime node heartbeat interval");
  const maxBackoffMs = parsePositiveInteger(
    options.maxBackoffMs,
    "Runtime node heartbeat max backoff"
  );
  const failureReadinessThreshold = parsePositiveInteger(
    options.failureReadinessThreshold ?? 3,
    "Runtime node heartbeat failure readiness threshold"
  );
  const now = options.now ?? (() => new Date());

  let running = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let inFlightHeartbeat: Promise<void> | undefined;
  const status: Omit<RuntimeNodeHeartbeatStatus, "running" | "ready"> = {
    consecutiveFailures: 0,
  };

  const snapshot = (): RuntimeNodeHeartbeatStatus => ({
    running,
    ready: !running || status.consecutiveFailures < failureReadinessThreshold,
    ...status,
  });

  const nextDelay = (): number => {
    if (status.consecutiveFailures === 0) return intervalMs;
    const multiplier = 2 ** status.consecutiveFailures;
    return Math.min(maxBackoffMs, intervalMs * multiplier);
  };

  const schedule = (delayMs: number) => {
    if (!running || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      inFlightHeartbeat = beatOnce().finally(() => {
        inFlightHeartbeat = undefined;
      });
    }, delayMs);
  };

  const beatOnce = async () => {
    if (!running || inFlight) return;
    inFlight = true;
    status.lastHeartbeatAt = now().toISOString();
    try {
      await options.runtimeNodeStore.recordNodeHeartbeat();
      status.consecutiveFailures = 0;
      status.lastSuccessAt = now().toISOString();
      status.lastError = undefined;
    } catch (error) {
      status.consecutiveFailures += 1;
      status.lastFailureAt = now().toISOString();
      status.lastError = sanitizeRuntimeNodeHeartbeatError(error);
      options.onError?.(error, snapshot());
    } finally {
      inFlight = false;
      if (running) {
        schedule(nextDelay());
      }
    }
  };

  schedule(0);

  return {
    getStatus() {
      return snapshot();
    },
    async stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      await inFlightHeartbeat;
    },
  };
}

