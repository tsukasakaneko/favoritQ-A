import type { Server, Socket } from "socket.io";

/**
 * Socket.IO のルーム参加ハンドラを登録する。
 * クライアントは join-room で room code を渡し、以後そのルーム宛のイベントを受け取る。
 */
export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    socket.on("join-room", ({ code }: { code?: string }) => {
      if (!code) return;
      socket.join(code.toUpperCase());
    });

    socket.on("leave-room", ({ code }: { code?: string }) => {
      if (!code) return;
      socket.leave(code.toUpperCase());
    });
  });
}
