import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { waitForDb } from "./db.js";
import { createRoomsRouter } from "./routes/rooms.js";
import { registerSocketHandlers } from "./socket.js";

const PORT = Number(process.env.BACKEND_PORT) || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

async function main() {
  await waitForDb();

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
    console.log(`[backend] listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
