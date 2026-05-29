import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { waitForDb, runSchema } from "./db.js";
import { createRoomsRouter } from "./routes/rooms.js";
import { registerSocketHandlers } from "./socket.js";

// Render などの PaaS は PORT を注入する。ローカルは BACKEND_PORT / 5000。
const PORT = Number(process.env.PORT) || Number(process.env.BACKEND_PORT) || 5000;
// 単一サービス配信なら同一オリジンで CORS 不要。開発(別オリジン)では localhost:5173 を許可。
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

async function main() {
  await waitForDb();
  await runSchema();

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

  // エラーハンドラ
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("[error]", err);
      res.status(500).json({ error: "internal server error" });
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
