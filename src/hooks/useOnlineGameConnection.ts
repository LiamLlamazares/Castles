import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildOnlineWebSocketUrl,
  OnlineJoinParams,
} from "../online/client";
import {
  OnlineActionDTO,
  OnlineConnectionStatus,
  OnlineGameSnapshotDTO,
} from "../online/types";

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
  const [status, setStatus] = useState<OnlineConnectionStatus>("idle");
  const [lastError, setLastError] = useState<string | undefined>();

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    if (!join) {
      setStatus("idle");
      setLastError(undefined);
      return;
    }

    setStatus("connecting");
    setLastError(undefined);
    const socket = new WebSocket(buildOnlineWebSocketUrl(window.location.href));
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("connected");
      socket.send(
        JSON.stringify({
          type: "join",
          gameId: join.gameId,
          token: join.token,
        })
      );
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "joined" || message.type === "snapshot") {
        onSnapshotRef.current(message.snapshot);
        return;
      }

      if (message.type === "rejected") {
        setLastError(message.error?.message ?? "Online action was rejected.");
        if (message.snapshot) {
          onSnapshotRef.current(message.snapshot);
        }
        return;
      }

      if (message.type === "error") {
        setStatus("error");
        setLastError(message.error?.message ?? "Online connection error.");
      }
    };

    socket.onerror = () => {
      setStatus("error");
      setLastError("Online connection failed.");
    };

    socket.onclose = () => {
      setStatus((current) => (current === "error" ? "error" : "disconnected"));
    };

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
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
        action,
      })
    );
  }, []);

  return { status, lastError, submitAction };
}

