import { useEffect, useRef, useState } from "react";
import {
  buildOnlineWebSocketUrl,
  fetchOnlineSpectatorSnapshot,
  getReconnectDelayMs,
  shouldApplyOnlineSnapshot,
} from "../online/client";
import {
  OnlineConnectionStatus,
  OnlineGameSnapshotDTO,
  OnlineReject,
} from "../online/types";
import { ONLINE_PROTOCOL_VERSION, validateOnlineServerMessage } from "../online/protocol";

interface UseOnlineSpectatorConnectionResult {
  status: OnlineConnectionStatus;
  lastError?: string;
}

export function useOnlineSpectatorConnection(
  gameId: string | null,
  onSnapshot: (snapshot: OnlineGameSnapshotDTO) => void
): UseOnlineSpectatorConnectionResult {
  const socketRef = useRef<WebSocket | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const latestSnapshotRef = useRef<OnlineGameSnapshotDTO | null>(null);
  const statusRef = useRef<OnlineConnectionStatus>("idle");
  const [status, setStatus] = useState<OnlineConnectionStatus>("idle");
  const [lastError, setLastError] = useState<string | undefined>();

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

    if (!gameId) {
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
      latestSnapshotRef.current = null;
      setConnectionStatus("idle");
      setLastError(undefined);
      return;
    }

    let cancelled = false;
    let reconnectAttempt = 0;
    latestSnapshotRef.current = null;
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
      onSnapshotRef.current(snapshot);
      return "applied";
    };

    const pullSnapshot = async (): Promise<"terminal" | "non-terminal" | "failed"> => {
      try {
        const snapshot = await fetchOnlineSpectatorSnapshot(gameId);
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
          setLastError(error instanceof Error ? error.message : "Could not resync spectator game.");
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
            type: "spectate",
            gameId,
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

        if (serverMessage.type === "spectating" || serverMessage.type === "snapshot") {
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

        if (serverMessage.type === "joined") {
          setConnectionStatus("protocol-error");
          setLastError("Online server sent a player message to a spectator connection.");
          return;
        }

        if (serverMessage.type === "rejected") {
          setConnectionStatus("protocol-error");
          setLastError("Online server sent an action rejection to a spectator connection.");
          return;
        }

        if (serverMessage.type === "error") {
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
        setLastError("Online spectator connection failed.");
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
    };
  }, [gameId]);

  return { status, lastError };
}
