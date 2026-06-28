import { io, type Socket } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

let socket: Socket | null = null;

// Connection status exposed so components can subscribe reactively
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

type StatusListener = (s: ConnectionStatus) => void;
const listeners = new Set<StatusListener>();
let currentStatus: ConnectionStatus = "disconnected";

function setStatus(s: ConnectionStatus) {
  currentStatus = s;
  listeners.forEach((fn) => fn(s));
}

export function getConnectionStatus(): ConnectionStatus {
  return currentStatus;
}

export function subscribeConnectionStatus(fn: StatusListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSocket(): Socket {
  if (!socket) {
    // 単一サービス配信では VITE_API_BASE="" になる。空文字を渡すとホスト無しURLとして
    // 解釈され接続に失敗するため、undefined を渡して socket.io に window.location を使わせる。
    socket = io(API_BASE || undefined, { autoConnect: true });

    setStatus("connecting");

    socket.on("connect", () => setStatus("connected"));
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("connect_error", () => {
      if (socket?.active) {
        // socket.io is actively trying to reconnect
        setStatus("reconnecting");
      } else {
        setStatus("disconnected");
      }
    });
    socket.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.on("reconnect", () => setStatus("connected"));
    socket.on("reconnect_failed", () => setStatus("disconnected"));
  }
  return socket;
}
