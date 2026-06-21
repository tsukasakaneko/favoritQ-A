import type { Server, Socket } from "socket.io";

interface JoinPayload {
  code?: string;
  memberId?: string;
}

/**
 * Socket.IO のルーム参加ハンドラを登録する。
 * クライアントは join-room で room code（と任意で memberId）を渡し、以後そのルーム
 * 宛のイベントを受け取る。切断時には presence を他メンバーへ通知する。
 */
export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    // この socket が参加しているルーム/メンバーを覚えておき、切断時に通知する。
    let joinedCode: string | null = null;
    let joinedMemberId: string | null = null;

    socket.on("join-room", ({ code, memberId }: JoinPayload) => {
      if (!code) return;
      joinedCode = code.toUpperCase();
      joinedMemberId = memberId ?? null;
      socket.join(joinedCode);
      if (joinedMemberId) {
        socket.to(joinedCode).emit("member-online", { memberId: joinedMemberId });
      }
    });

    socket.on("leave-room", ({ code }: JoinPayload) => {
      const target = code ? code.toUpperCase() : joinedCode;
      if (!target) return;
      if (joinedMemberId) {
        socket.to(target).emit("member-offline", { memberId: joinedMemberId });
      }
      socket.leave(target);
      joinedCode = null;
      joinedMemberId = null;
    });

    socket.on("disconnect", () => {
      // 接続が切れたら他メンバーへ presence を通知（DB 行は退出APIで削除）。
      if (joinedCode && joinedMemberId) {
        socket.to(joinedCode).emit("member-offline", { memberId: joinedMemberId });
      }
    });
  });
}
