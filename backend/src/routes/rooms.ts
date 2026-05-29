import { Router } from "express";
import type { Server } from "socket.io";
import { query } from "../db.js";
import { generateOptions } from "../services/ai.js";
import { matchingForRoom, matchingForTopic } from "../services/matching.js";

function generateRoomCode(): string {
  // 紛らわしい文字(0/O/1/I)を除いた6文字
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

interface RoomRow {
  id: string;
  code: string;
  name: string | null;
  status: string;
  created_at: string;
}

async function findRoomByCode(code: string): Promise<RoomRow | null> {
  const { rows } = await query<RoomRow>(
    `SELECT * FROM rooms WHERE code = $1`,
    [code.toUpperCase()]
  );
  return rows[0] ?? null;
}

/** ルームの現在状態（メンバー・進行中のお題と選択肢・投票状況）を返す。 */
async function getRoomState(room: RoomRow) {
  const { rows: members } = await query(
    `SELECT id, name, joined_at FROM members WHERE room_id = $1 ORDER BY joined_at`,
    [room.id]
  );

  const { rows: topicRows } = await query(
    `SELECT id, title, status, created_at
       FROM topics WHERE room_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
    [room.id]
  );

  let activeTopic: any = null;
  if (topicRows[0]) {
    const topic = topicRows[0];
    const { rows: options } = await query(
      `SELECT id, label, sort_order FROM options WHERE topic_id = $1 ORDER BY sort_order`,
      [topic.id]
    );
    const { rows: choices } = await query(
      `SELECT member_id, option_id FROM choices WHERE topic_id = $1`,
      [topic.id]
    );
    activeTopic = { ...topic, options, choices };
  }

  return { room, members, activeTopic };
}

export function createRoomsRouter(io: Server): Router {
  const router = Router();

  // ルーム作成
  router.post("/rooms", async (req, res) => {
    const name: string | undefined = req.body?.name;
    // ユニークな code を確保（衝突時はリトライ）
    let code = generateRoomCode();
    for (let i = 0; i < 5; i++) {
      const existing = await findRoomByCode(code);
      if (!existing) break;
      code = generateRoomCode();
    }
    const { rows } = await query<RoomRow>(
      `INSERT INTO rooms (code, name) VALUES ($1, $2) RETURNING *`,
      [code, name ?? null]
    );
    res.status(201).json({ room: rows[0] });
  });

  // ルーム参加
  router.post("/rooms/:code/join", async (req, res) => {
    const name: string | undefined = req.body?.name;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const room = await findRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "room not found" });

    const { rows } = await query(
      `INSERT INTO members (room_id, name) VALUES ($1, $2) RETURNING id, name, joined_at`,
      [room.id, name.trim()]
    );
    const member = rows[0];

    io.to(room.code).emit("member-joined", { member });
    const state = await getRoomState(room);
    res.status(201).json({ member, ...state });
  });

  // ルーム状態取得
  router.get("/rooms/:code", async (req, res) => {
    const room = await findRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "room not found" });
    res.json(await getRoomState(room));
  });

  // お題を設定（既存の active を閉じ、AIで選択肢を生成）
  router.post("/rooms/:code/topics", async (req, res) => {
    const title: string | undefined = req.body?.title;
    const count: number = Number(req.body?.count) || 6;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    const room = await findRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "room not found" });

    // 進行中のお題があれば閉じる
    await query(
      `UPDATE topics SET status = 'closed' WHERE room_id = $1 AND status = 'active'`,
      [room.id]
    );

    const { rows: topicRows } = await query(
      `INSERT INTO topics (room_id, title) VALUES ($1, $2) RETURNING id, title, status, created_at`,
      [room.id, title.trim()]
    );
    const topic = topicRows[0];

    // AI（or モック）で選択肢生成
    const labels = await generateOptions(title.trim(), count);
    const optionRows = [];
    for (let i = 0; i < labels.length; i++) {
      const { rows } = await query(
        `INSERT INTO options (topic_id, label, sort_order) VALUES ($1, $2, $3) RETURNING id, label, sort_order`,
        [topic.id, labels[i], i]
      );
      optionRows.push(rows[0]);
    }

    const payload = { topic, options: optionRows };
    io.to(room.code).emit("topic-started", payload);
    res.status(201).json(payload);
  });

  // 選択を記録
  router.post("/topics/:id/choices", async (req, res) => {
    const memberId: string | undefined = req.body?.memberId;
    const optionId: string | undefined = req.body?.optionId;
    if (!memberId || !optionId) {
      return res.status(400).json({ error: "memberId and optionId are required" });
    }

    const { rows: topicRows } = await query(
      `SELECT id, room_id FROM topics WHERE id = $1`,
      [req.params.id]
    );
    const topic = topicRows[0];
    if (!topic) return res.status(404).json({ error: "topic not found" });

    await query(
      `INSERT INTO choices (topic_id, member_id, option_id)
         VALUES ($1, $2, $3)
       ON CONFLICT (topic_id, member_id)
         DO UPDATE SET option_id = EXCLUDED.option_id, created_at = now()`,
      [topic.id, memberId, optionId]
    );

    // 投票状況を集計
    const { rows: counts } = await query<{ voted: string; total: string }>(
      `SELECT
         (SELECT COUNT(*) FROM choices WHERE topic_id = $1) AS voted,
         (SELECT COUNT(*) FROM members WHERE room_id = $2) AS total`,
      [topic.id, topic.room_id]
    );
    const voted = Number(counts[0].voted);
    const total = Number(counts[0].total);

    const { rows: roomRows } = await query<RoomRow>(
      `SELECT * FROM rooms WHERE id = $1`,
      [topic.room_id]
    );
    const code = roomRows[0].code;

    io.to(code).emit("choice-made", { topicId: topic.id, memberId, voted, total });
    if (total > 0 && voted >= total) {
      io.to(code).emit("result-ready", { topicId: topic.id });
    }

    res.json({ ok: true, voted, total });
  });

  // 単一お題のマッチング率
  router.get("/topics/:id/result", async (req, res) => {
    const result = await matchingForTopic(req.params.id);
    res.json(result);
  });

  // お題を閉じる（「次のお題へ」用）— 閉じるとルームは lobby に戻る
  router.post("/topics/:id/close", async (req, res) => {
    const { rows } = await query(
      `UPDATE topics SET status = 'closed' WHERE id = $1 RETURNING room_id`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "topic not found" });

    const { rows: roomRows } = await query<RoomRow>(
      `SELECT * FROM rooms WHERE id = $1`,
      [rows[0].room_id]
    );
    if (roomRows[0]) {
      io.to(roomRows[0].code).emit("topic-closed", { topicId: req.params.id });
    }
    res.json({ ok: true });
  });

  // ルーム累計のマッチング率
  router.get("/rooms/:code/result", async (req, res) => {
    const room = await findRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "room not found" });
    const result = await matchingForRoom(room.id);
    res.json(result);
  });

  return router;
}
