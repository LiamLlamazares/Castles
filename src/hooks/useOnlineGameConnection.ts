import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildOnlineWebSocketUrl,
  fetchOnlineSnapshot,
  getReconnectDelayMs,
  OnlineJoinParams,
  shouldApplyOnlineSnapshot,
} from "../online/client";
import {
  OnlineActionDTO,
  OnlineConnectionStatus,
  OnlineGameSnapshotDTO,
  OnlineReject,
} from "../online/types";
import { createClientActionId } from "../online/actionIdempotency";
import { ONLINE_PROTOCOL_VERSION, validateOnlineServerMessage } from "../online/protocol";

interface UseOnlineGameConnectionResult {
  status: OnlineConnectionStatus;
  lastError?: string;
  isActionPending: boolean;
  submitAction: (action: OnlineActionDTO) => void;
}

export function useOnlineGameConnection(
  join: OnlineJoinParams | null,
  onSnapshot: (snapshot: OnlineGameSnapshotDTO) => void
): UseOnlineGameConnectionResult {
  const socketRef = useRef<WebSocket | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const latestSnapshotRef = useRef<OnlineGameSnapshotDTO | null>(null);
  const pendingActionRef = useRef<{ clientActionId: string; baseVersion: number } | null>(null);
  const recentlySettledActionIdsRef = useRef<Set<string>>(new Set());
  const statusRef = useRef<OnlineConnectionStatus>("idle");
  const [status, setStatus] = useState<OnlineConnectionStatus>("idle");
  const [lastError, setLastError] = useState<string | undefined>();
  const [isActionPending, setIsActionPending] = useState(false);

  const setConnectionStatus = (nextStatus: OnlineConnectionStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  };

  const statusForSnapshot = (snapshot: OnlineGameSnapshotDTO): OnlineConnectionStatus =>
    snapshot.result ? "terminal" : "connected";

  const isAccessDeniedError = (error: OnlineReject): boolean =>
    error.code === "unauthorized" || error.code === "not_found";

  const isProtectedConnectionStatus = (nextStatus: OnlineConnectionStatus): boolean =>
    nextStatus === "access-denied" ||
    nextStatus === "protocol-error" ||
    nextStatus === "server-error" ||
    nextStatus === "terminal";

  const clearPendingAction = () => {
    pendingActionRef.current = null;
    setIsActionPending(false);
  };

  const markPendingActionSettledBySnapshot = () => {
    const pendingAction = pendingActionRef.current;
    if (!pendingAction) return;
    recentlySettledActionIdsRef.current.add(pendingAction.clientActionId);
    if (recentlySettledActionIdsRef.current.size > 16) {
      const [oldestActionId] = recentlySettledActionIdsRef.current;
      recentlySettledActionIdsRef.current.delete(oldestActionId);
    }
    clearPendingAction();
  };

  const clearPendingActionForSnapshot = (snapshot: OnlineGameSnapshotDTO) => {
    const pendingAction = pendingActionRef.current;
    if (!pendingAction) return;
    if (snapshot.result || snapshot.version > pendingAction.baseVersion) {
      markPendingActionSettledBySnapshot();
    }
  };

  const messageForRejectedAction = (error: OnlineReject): string =>
    error.code === "stale_action"
      ? "Position updated from server. Try again."
      : error.message;

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    const clearTimers = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current !== null) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };

    if (!join) {
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
      clearPendingAction();
      recentlySettledActionIdsRef.current.clear();
      setConnectionStatus("idle");
      setLastError(undefined);
      return;
    }

    let cancelled = false;
    let reconnectAttempt = 0;
    latestSnapshotRef.current = null;
    clearPendingAction();
    recentlySettledActionIdsRef.current.clear();
    setLastError(undefined);

    const applySnapshot = (snapshot: OnlineGameSnapshotDTO): "applied" | "duplicate" | "ignored" => {
      if (isProtectedConnectionStatus(statusRef.current)) {
        return "ignored";
      }
      if (latestSnapshotRef.current?.result && !snapshot.result) {
        return "ignored";
      }
      if (latestSnapshotRef.current && snapshot.version < latestSnapshotRef.current.version) {
        return "ignored";
      }
      if (!shouldApplyOnlineSnapshot(latestSnapshotRef.current, snapshot)) {
        return "duplicate";
      }
      latestSnapshotRef.current = snapshot;
      clearPendingActionForSnapshot(snapshot);
      onSnapshotRef.current(snapshot);
      return "applied";
    };

    const pullSnapshot = async (): Promise<"terminal" | "non-terminal" | "failed"> => {
      try {
        const snapshot = await fetchOnlineSnapshot(join);
        if (!cancelled) {
          const snapshotStatus = applySnapshot(snapshot);
          if (snapshotStatus !== "ignored" && snapshot.result) {
            setConnectionStatus("terminal");
            return "terminal";
          }
        }
        return snapshot.result ? "terminal" : "non-terminal";
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : "Could not resync online game.");
        }
        return "failed";
      }
    };

    const connect = () => {
      if (cancelled) return;

      setConnectionStatus("connecting");
      const socket = new WebSocket(buildOnlineWebSocketUrl(window.location.href));
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            protocolVersion: ONLINE_PROTOCOL_VERSION,
            type: "join",
            gameId: join.gameId,
            token: join.token,
          })
        );
        heartbeatTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                protocolVersion: ONLINE_PROTOCOL_VERSION,
                type: "ping",
                clientTime: Date.now(),
              })
            );
          }
        }, 15_000);
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        let message: any;
        try {
          message = JSON.parse(event.data);
        } catch {
          setConnectionStatus("protocol-error");
          setLastError("Online server sent an invalid message.");
          return;
        }

        const validation = validateOnlineServerMessage(message);
        if (!validation.ok) {
          setConnectionStatus("protocol-error");
          setLastError(`Online server sent an invalid message: ${validation.error.message}`);
          return;
        }
        const serverMessage = validation.value;

        if (serverMessage.type === "joined" || serverMessage.type === "snapshot") {
          reconnectAttempt = 0;
          const snapshotStatus = applySnapshot(serverMessage.snapshot);
          if (snapshotStatus !== "ignored") {
            setConnectionStatus(statusForSnapshot(serverMessage.snapshot));
            setLastError(undefined);
          }
          return;
        }

        if (serverMessage.type === "pong") {
          return;
        }

        if (serverMessage.type === "spectating") {
          setConnectionStatus("protocol-error");
          setLastError("Online server sent a spectator message to a player connection.");
          return;
        }

        if (serverMessage.type === "rejected") {
          const pendingAction = pendingActionRef.current;
          const isRecentlySettled = recentlySettledActionIdsRef.current.delete(serverMessage.clientActionId);
          if (pendingAction?.clientActionId === serverMessage.clientActionId) {
            clearPendingAction();
          } else if (!isRecentlySettled) {
            setConnectionStatus("protocol-error");
            setLastError("Online server rejected an action that is not pending.");
            return;
          }
          setLastError(messageForRejectedAction(serverMessage.error));
          if (serverMessage.snapshot) {
            if (applySnapshot(serverMessage.snapshot) !== "ignored") {
              setConnectionStatus(statusForSnapshot(serverMessage.snapshot));
            }
          } else if (isAccessDeniedError(serverMessage.error)) {
            setConnectionStatus("access-denied");
          }
          return;
        }

        if (serverMessage.type === "error") {
          clearPendingAction();
          setLastError(serverMessage.error.message);
          if (serverMessage.snapshot) {
            if (applySnapshot(serverMessage.snapshot) !== "ignored") {
              setConnectionStatus(serverMessage.snapshot.result ? "terminal" : "server-error");
            }
            return;
          }
          setConnectionStatus(isAccessDeniedError(serverMessage.error) ? "access-denied" : "server-error");
        }
      };

      socket.onerror = () => {
        if (cancelled) return;
        setLastError("Online connection failed.");
      };

      socket.onclose = () => {
        if (heartbeatTimerRef.current !== null) {
          window.clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (cancelled) return;

        if (isProtectedConnectionStatus(statusRef.current)) {
          return;
        }
        if (pendingActionRef.current) {
          clearPendingAction();
          setLastError("Connection dropped before the action was confirmed. Try again after resync.");
        }
        setConnectionStatus("disconnected");
        const delay = getReconnectDelayMs(reconnectAttempt++);
        reconnectTimerRef.current = window.setTimeout(() => {
          if (isProtectedConnectionStatus(statusRef.current)) {
            return;
          }
          setConnectionStatus("resyncing");
          void pullSnapshot().then((result) => {
            if (cancelled || result === "terminal" || isProtectedConnectionStatus(statusRef.current)) {
              return;
            }
            connect();
          });
        }, delay);
      };
    };

    void pullSnapshot();
    connect();

    return () => {
      cancelled = true;
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
      clearPendingAction();
      recentlySettledActionIdsRef.current.clear();
    };
  }, [join]);

  const submitAction = useCallback((action: OnlineActionDTO) => {
    const socket = socketRef.current;
    if (pendingActionRef.current) {
      setLastError("Waiting for the server to confirm the previous action.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setLastError("Online connection is not ready.");
      return;
    }
    if (statusRef.current !== "connected") {
      setLastError("Online connection is not ready.");
      return;
    }

    const clientActionId = createClientActionId();
    pendingActionRef.current = { clientActionId, baseVersion: action.baseVersion };
    setIsActionPending(true);
    setLastError(undefined);

    socket.send(
      JSON.stringify({
        protocolVersion: ONLINE_PROTOCOL_VERSION,
        type: "action",
        clientActionId,
        action,
      })
    );
  }, []);

  return { status, lastError, isActionPending, submitAction };
}
