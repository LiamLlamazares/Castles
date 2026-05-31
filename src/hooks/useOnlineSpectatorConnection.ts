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
} from "../online/types";

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
  const [status, setStatus] = useState<OnlineConnectionStatus>("idle");
  const [lastError, setLastError] = useState<string | undefined>();

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
      setStatus("idle");
      setLastError(undefined);
      return;
    }

    let cancelled = false;
    let reconnectAttempt = 0;
    latestSnapshotRef.current = null;
    setLastError(undefined);

    const applySnapshot = (snapshot: OnlineGameSnapshotDTO) => {
      if (!shouldApplyOnlineSnapshot(latestSnapshotRef.current, snapshot)) {
        return;
      }
      latestSnapshotRef.current = snapshot;
      onSnapshotRef.current(snapshot);
    };

    const pullSnapshot = async () => {
      try {
        const snapshot = await fetchOnlineSpectatorSnapshot(gameId);
        if (!cancelled) {
          applySnapshot(snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : "Could not resync spectator game.");
        }
      }
    };

    const connect = () => {
      if (cancelled) return;

      setStatus("connecting");
      const socket = new WebSocket(buildOnlineWebSocketUrl(window.location.href));
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: "spectate",
            gameId,
          })
        );
        heartbeatTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping", clientTime: Date.now() }));
          }
        }, 15_000);
      };

      socket.onmessage = (event) => {
        let message: any;
        try {
          message = JSON.parse(event.data);
        } catch {
          setLastError("Online server sent an invalid message.");
          return;
        }

        if (message.type === "spectating" || message.type === "snapshot") {
          reconnectAttempt = 0;
          setStatus("connected");
          setLastError(undefined);
          applySnapshot(message.snapshot);
          return;
        }

        if (message.type === "pong") {
          return;
        }

        if (message.type === "rejected") {
          setLastError(message.error?.message ?? "Spectator action was rejected.");
          if (message.snapshot) {
            applySnapshot(message.snapshot);
          }
          return;
        }

        if (message.type === "error") {
          setStatus("error");
          setLastError(message.error?.message ?? "Online spectator connection error.");
        }
      };

      socket.onerror = () => {
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

        setStatus((current) => (current === "error" ? "error" : "disconnected"));
        const delay = getReconnectDelayMs(reconnectAttempt++);
        reconnectTimerRef.current = window.setTimeout(() => {
          void pullSnapshot().finally(connect);
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
