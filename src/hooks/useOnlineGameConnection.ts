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
} from "../online/types";
import { createClientActionId } from "../online/actionIdempotency";
import { validateOnlineServerMessage } from "../online/protocol";

interface UseOnlineGameConnectionResult {
  status: OnlineConnectionStatus;
  lastError?: string;
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

    if (!join) {
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
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
        const snapshot = await fetchOnlineSnapshot(join);
        if (!cancelled) {
          applySnapshot(snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : "Could not resync online game.");
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
            type: "join",
            gameId: join.gameId,
            token: join.token,
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
          setStatus("error");
          setLastError("Online server sent an invalid message.");
          return;
        }

        const validation = validateOnlineServerMessage(message);
        if (!validation.ok) {
          setStatus("error");
          setLastError(`Online server sent an invalid message: ${validation.error.message}`);
          return;
        }
        const serverMessage = validation.value;

        if (serverMessage.type === "joined" || serverMessage.type === "snapshot") {
          reconnectAttempt = 0;
          setStatus("connected");
          setLastError(undefined);
          applySnapshot(serverMessage.snapshot);
          return;
        }

        if (serverMessage.type === "pong") {
          return;
        }

        if (serverMessage.type === "spectating") {
          setStatus("error");
          setLastError("Online server sent a spectator message to a player connection.");
          return;
        }

        if (serverMessage.type === "rejected") {
          setLastError(serverMessage.error.message);
          if (serverMessage.snapshot) {
            applySnapshot(serverMessage.snapshot);
          }
          return;
        }

        if (serverMessage.type === "error") {
          setStatus("error");
          setLastError(serverMessage.error.message);
          if (serverMessage.snapshot) {
            applySnapshot(serverMessage.snapshot);
          }
        }
      };

      socket.onerror = () => {
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
  }, [join]);

  const submitAction = useCallback((action: OnlineActionDTO) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setLastError("Online connection is not ready.");
      return;
    }

    socket.send(
      JSON.stringify({
        type: "action",
        clientActionId: createClientActionId(),
        action,
      })
    );
  }, []);

  return { status, lastError, submitAction };
}
