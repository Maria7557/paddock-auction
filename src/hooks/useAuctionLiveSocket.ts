"use client";

import { useEffect, useState } from "react";

import { api, buildApiUrl } from "@/src/lib/api-client";
import type { AuctionLiveSnapshot } from "@/src/types/auction";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

type AuctionLiveMessage = {
  type: "auction.snapshot" | "auction.updated";
  data: AuctionLiveSnapshot;
};

type AuthTokenResponse = {
  token?: string | null;
};

async function loadSocketToken(): Promise<string | null> {
  const response = await fetch("/api/auth/token", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to load auth token");
  }

  const payload = (await response.json()) as AuthTokenResponse;

  if (typeof payload.token !== "string" || payload.token.trim().length === 0) {
    return null;
  }

  return payload.token;
}

function buildWebSocketUrl(auctionId: string, token: string | null): string {
  const requestPath = `/api/auctions/${auctionId}/ws`;
  const httpUrl = buildApiUrl(requestPath);
  const resolvedUrl = /^https?:\/\//i.test(httpUrl)
    ? new URL(httpUrl)
    : new URL(
        `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.host}${httpUrl}`,
      );

  resolvedUrl.protocol = resolvedUrl.protocol === "https:" ? "wss:" : "ws:";

  if (token) {
    resolvedUrl.searchParams.set("token", token);
  }

  return resolvedUrl.toString();
}

function isAuctionLiveMessage(value: unknown): value is AuctionLiveMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<string, unknown>;

  if (message.type !== "auction.snapshot" && message.type !== "auction.updated") {
    return false;
  }

  return Boolean(message.data && typeof message.data === "object");
}

export function useAuctionLiveSocket(
  auctionId: string,
  enabled = true,
): {
  snapshot: AuctionLiveSnapshot | null;
  connectionState: ConnectionState;
} {
  const [snapshot, setSnapshot] = useState<AuctionLiveSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    if (!enabled) {
      setConnectionState("disconnected");
      return undefined;
    }

    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;

    const reconnectDelays = [1_000, 2_000, 4_000] as const;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (!active) {
        return;
      }

      if (reconnectAttempts >= reconnectDelays.length) {
        setConnectionState("error");
        return;
      }

      const delay = reconnectDelays[reconnectAttempts];
      reconnectAttempts += 1;
      setConnectionState("connecting");
      reconnectTimer = window.setTimeout(() => {
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (!active) {
        return;
      }

      clearReconnectTimer();
      setConnectionState("connecting");

      try {
        const token = await loadSocketToken();

        if (!active) {
          return;
        }

        if (!token) {
          setConnectionState("disconnected");
          return;
        }

        socket = new WebSocket(buildWebSocketUrl(auctionId, token));

        socket.onopen = () => {
          if (!active) {
            return;
          }

          reconnectAttempts = 0;
          setConnectionState("connected");
        };

        socket.onmessage = (event) => {
          if (!active) {
            return;
          }

          try {
            const message = JSON.parse(String(event.data)) as unknown;

            if (isAuctionLiveMessage(message)) {
              setSnapshot(message.data);
              setConnectionState("connected");
            }
          } catch {
            setConnectionState("error");
          }
        };

        socket.onerror = () => {
          if (active) {
            setConnectionState("error");
          }
        };

        socket.onclose = () => {
          if (!active) {
            return;
          }

          setConnectionState("disconnected");
          scheduleReconnect();
        };
      } catch {
        setConnectionState("error");
        scheduleReconnect();
      }
    };

    const loadInitialSnapshot = async () => {
      try {
        const nextSnapshot = await api.auctions.getLiveSnapshot(auctionId, {
          cache: "no-store",
        });

        if (!active) {
          return;
        }

        setSnapshot(nextSnapshot);
      } catch {
        if (active) {
          setConnectionState("error");
        }
      } finally {
        void connect();
      }
    };

    setSnapshot(null);
    setConnectionState("connecting");
    void loadInitialSnapshot();

    return () => {
      active = false;
      clearReconnectTimer();

      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
  }, [auctionId, enabled]);

  return {
    snapshot,
    connectionState,
  };
}
