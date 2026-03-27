"use client";

import { useEffect, useState } from "react";

import { api, buildApiUrl } from "@/src/lib/api-client";
import type { AuctionLiveSnapshot, EventRuntime } from "@/src/types/auction";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

type AuthTokenResponse = {
  token?: string | null;
};

type EventRuntimeMessage =
  | {
      type: "event.runtime";
      data: EventRuntime;
    }
  | {
      type: "event.started";
      eventId: string;
    }
  | {
      type: "event.closed";
      eventId: string;
    }
  | {
      type: "lot.advanced";
      eventId: string;
      currentLot: {
        auctionId: string;
        position: number;
        callRound: number;
      };
    }
  | {
      type: "lot.call_round";
      eventId: string;
      callRound: number;
      callEndsAt: string;
    }
  | {
      type: "bid.received";
      auctionId: string;
      callRound: number;
      callEndsAt: string;
    }
  | {
      type: "auction.updated";
      data: AuctionLiveSnapshot;
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

function buildWebSocketUrl(eventId: string, token: string | null): string {
  const requestPath = `/api/events/${eventId}/ws`;
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

function isEventRuntimeMessage(value: unknown): value is EventRuntimeMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<string, unknown>;

  return typeof message.type === "string";
}

export function useEventLiveSocket(
  eventId: string,
  enabled = true,
): {
  runtime: EventRuntime | null;
  connectionState: ConnectionState;
} {
  const [runtime, setRuntime] = useState<EventRuntime | null>(null);
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

    const refetchRuntime = async () => {
      const nextRuntime = await api.events.getRuntime(eventId, {
        cache: "no-store",
      });

      if (!active) {
        return;
      }

      setRuntime(nextRuntime);
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

        socket = new WebSocket(buildWebSocketUrl(eventId, token));

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

            if (!isEventRuntimeMessage(message)) {
              return;
            }

            switch (message.type) {
              case "event.runtime":
                setRuntime(message.data);
                setConnectionState("connected");
                return;
              case "event.started":
              case "event.closed":
              case "lot.advanced":
              case "bid.received":
                void refetchRuntime().catch(() => {
                  if (active) {
                    setConnectionState("error");
                  }
                });
                return;
              case "lot.call_round":
                setRuntime((current) => {
                  if (!current?.currentLot) {
                    return current;
                  }

                  return {
                    ...current,
                    currentLot: {
                      ...current.currentLot,
                      callRound: message.callRound,
                      callEndsAt: message.callEndsAt,
                    },
                  };
                });
                return;
              case "auction.updated":
                setRuntime((current) => {
                  if (!current?.currentLot || current.currentLot.auctionId !== message.data.auctionId) {
                    return current;
                  }

                  return {
                    ...current,
                    currentLot: {
                      ...current.currentLot,
                      snapshot: message.data,
                    },
                  };
                });
                return;
              default:
                return;
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

    const loadInitialRuntime = async () => {
      try {
        await refetchRuntime();
      } catch {
        if (active) {
          setConnectionState("error");
        }
      } finally {
        void connect();
      }
    };

    setRuntime(null);
    setConnectionState("connecting");
    void loadInitialRuntime();

    return () => {
      active = false;
      clearReconnectTimer();

      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
  }, [enabled, eventId]);

  return {
    runtime,
    connectionState,
  };
}
