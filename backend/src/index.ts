import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { Server } from "socket.io";
import { pool, waitForDb, runSchema, cleanupStaleRooms } from "./db.js";
import { createRoomsRouter } from "./routes/rooms.js";
import { registerSocketHandlers } from "./socket.js";

// Render などの PaaS は PORT を注入する。ローカルは BACKEND_PORT / 5000。
const PORT = Number(process.env.PORT) || Number(process.env.BACKEND_PORT) || 5000;
// 単一サービス配信なら同一オリジンで CORS 不要。開発(別オリジン)では localhost:5173 を許可。
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
// 古いルームの保持時間（時間）。0 以下でクリーンアップ無効。
const ROOM_TTL_HOURS = Number(process.env.ROOM_TTL_HOURS ?? "24");

/** 起動前に必須の環境変数を検証する。欠落があればエラーを出すが起動は続ける。 */
function checkEnv() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "[config] DATABASE_URL is not set — using default local connection string"
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "[config] ANTHROPIC_API_KEY is not set — AI option generation will use mock data"
    );
  }
  if (Number.isNaN(PORT) || PORT <= 0) {
    console.warn(`[config] Invalid PORT value, falling back to 5000`);
  }
}

async function main() {
  checkEnv();

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

  // ヘルスチェック（DB 疎通確認を含む）
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", db: "ok", time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "error", db: "unreachable", time: new Date().toISOString() });
    }
  });

  // AI 選択肢生成エンドポイントにレート制限を適用（DoS / API コスト保護）。
  // ウィンドウ 1 分あたり最大 10 回。IP ごと。
  const topicsRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too many requests, please slow down" },
  });
  app.post("/api/rooms/:code/topics", topicsRateLimit);

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
