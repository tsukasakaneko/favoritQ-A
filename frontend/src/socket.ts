import { io, type Socket } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, { autoConnect: true });
  }
  return socket;
}
