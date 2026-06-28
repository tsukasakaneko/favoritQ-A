import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { waitForDb, runSchema, cleanupStaleRooms } from "./db.js";
import { createRoomsRouter } from "./routes/rooms.js";
import { registerSocketHandlers } from "./socket.js";

// Render などの PaaS は PORT を注入する。ローカルは BACKEND_PORT / 5000。
const PORT = Number(process.env.PORT) || Number(process.env.BACKEND_PORT) || 5000;
// 単一サービス配信なら同一オリジンで CORS 不要。開発(別オリジン)では localhost:5173 を許可。
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
// 古いルームの保持時間（時間）。0 以下でクリーンアップ無効。
const ROOM_TTL_HOURS = Number(process.env.ROOM_TTL_HOURS ?? "24");

async function main() {
  await waitForDb();
  await runSchema();

  // 古いルームの定期クリーンアップ（起動時に1回 + 1時間ごと）。
  if (ROOM_TTL_HOURS > 0) {
    const runCleanup = () =>
      cleanupStaleRooms(ROOM_TTL_HOURS).catch((err) =>
        console.error("[cleanup] failed:", err)
      );
    await runCleanup();
    const timer = setInterval(runCleanup, 60 * 60 * 1000);
    timer.unref(); // プロセス終了を妨げない
  }

  const app = express();
  app.use(cors({ origin: CLIENT_ORIGIN }));
  app.use(express.json());

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: CLIENT_ORIGIN },
  });

  registerSocketHandlers(io);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.use("/api", createRoomsRouter(io));

  // 単一サービス配信: ビルド済みフロント(static)があれば配信する。
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const staticDir =
    process.env.STATIC_DIR ?? path.join(__dirname, "../public");
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    // SPA フォールバック: /api 以外は index.html を返す
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
    console.log(`[backend] serving static frontend from ${staticDir}`);
  }

  // エラーハンドラ（asyncHandler 経由の未処理例外のみ到達する）
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      // スタックトレース付きで記録し、詳細はクライアントに返さない（情報漏えい防止）
      if (err instanceof Error) {
        console.error("[error]", err.message, err.stack);
      } else {
        console.error("[error]", err);
      }
      if (!res.headersSent) {
        res.status(500).json({ error: "internal server error" });
      }
    }
  );

  httpServer.listen(PORT, () => {
    console.log(`[backend] listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
