import { io, type Socket } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // 単一サービス配信では VITE_API_BASE="" になる。空文字を渡すとホスト無しURLとして
    // 解釈され接続に失敗するため、undefined を渡して socket.io に window.location を使わせる。
    socket = io(API_BASE || undefined, { autoConnect: true });
  }
  return socket;
}
