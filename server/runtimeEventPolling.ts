import type {
  OnlineRuntimeCoordinator,
  OnlineRuntimeEventPollResult,
} from "../src/online/server/onlineRuntimeCoordinator";
import { stringContainsDurableSecret } from "../src/online/secretSafety";

export interface RuntimeEventPollingStatus {
  running: boolean;
  ready: boolean;
  consecutiveFailures: number;
  lastPollAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastResult?: OnlineRuntimeEventPollResult;
  lastError?: string;
}

export interface RuntimeEventPoller {
  getStatus(): RuntimeEventPollingStatus;
  stop(): Promise<void>;
}

export interface RuntimeEventPollingOptions {
  runtimeCoordinator: Pick<OnlineRuntimeCoordinator, "pollRemoteGameSnapshotChangedEvents">;
  intervalMs: number;
  maxBackoffMs: number;
  pollLimit: number;
  failureReadinessThreshold?: number;
  now?: () => Date;
  onError?: (error: unknown, status: RuntimeEventPollingStatus) => void;
}

function parsePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function sanitizeRuntimePollingError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const value = message.trim();
  const containsCredentialedUrl = /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i.test(value);
  if (!value || containsCredentialedUrl || stringContainsDurableSecret(value)) {
    return "Runtime event polling failed.";
  }
  return value.slice(0, 240);
}

export function startRuntimeEventPolling(options: RuntimeEventPollingOptions): RuntimeEventPoller {
  const intervalMs = parsePositiveInteger(options.intervalMs, "Runtime event polling interval");
  const maxBackoffMs = parsePositiveInteger(
    options.maxBackoffMs,
    "Runtime event polling max backoff"
  );
  const pollLimit = parsePositiveInteger(options.pollLimit, "Runtime event polling limit");
  const failureReadinessThreshold = parsePositiveInteger(
    options.failureReadinessThreshold ?? 3,
    "Runtime event polling failure readiness threshold"
  );
  const now = options.now ?? (() => new Date());

  let running = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let inFlightPoll: Promise<void> | undefined;
  const status: Omit<RuntimeEventPollingStatus, "running" | "ready"> = {
    consecutiveFailures: 0,
  };

  const snapshot = (): RuntimeEventPollingStatus => ({
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
      inFlightPoll = pollOnce().finally(() => {
        inFlightPoll = undefined;
      });
    }, delayMs);
  };

  const pollOnce = async () => {
    if (!running || inFlight) return;
    inFlight = true;
    status.lastPollAt = now().toISOString();
    try {
      const result = await options.runtimeCoordinator.pollRemoteGameSnapshotChangedEvents({
        limit: pollLimit,
      });
      status.consecutiveFailures = 0;
      status.lastSuccessAt = now().toISOString();
      status.lastResult = result;
      status.lastError = undefined;
    } catch (error) {
      status.consecutiveFailures += 1;
      status.lastFailureAt = now().toISOString();
      status.lastError = sanitizeRuntimePollingError(error);
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
      await inFlightPoll;
    },
  };
}
