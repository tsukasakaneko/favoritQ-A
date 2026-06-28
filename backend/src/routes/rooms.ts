import { Router } from "express";
import type { RequestHandler } from "express";
import type { Server } from "socket.io";
import { randomBytes } from "node:crypto";
import { query, withTransaction } from "../db.js";
import { generateOptions } from "../services/ai.js";
import { matchingForRoom, matchingForTopic } from "../services/matching.js";
import {
  LIMITS,
  validateRequiredText,
  validateOptionalText,
  clampCount,
} from "../validation.js";

/** 参加メンバーに発行する秘密トークン（本人確認用）を生成する。 */
function generateMemberToken(): string {
  return randomBytes(24).toString("base64url");
}

/** リクエストからメンバートークンを取得する（ヘッダ優先、なければ body）。 */
function getMemberToken(req: Parameters<RequestHandler>[0]): string | undefined {
  const header = req.header("x-member-token");
  if (header && header.trim()) return header.trim();
  const fromBody: unknown = req.body?.token;
  return typeof fromBody === "string" && fromBody.trim()
    ? fromBody.trim()
    : undefined;
}

/**
 * Express 4 は async ハンドラの reject を error middleware に渡さないため、
 * このラッパーで明示的に next(err) へ転送する（未処理 rejection 防止）。
 */
function asyncHandler(
  fn: (...args: Parameters<RequestHandler>) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

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
  // token を持つメンバーのみ対象（マイグレーション前の token=NULL の幽霊行は除外）。
  const { rows: members } = await query(
    `SELECT id, name, joined_at FROM members
       WHERE room_id = $1 AND token IS NOT NULL ORDER BY joined_at`,
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
  router.post("/rooms", asyncHandler(async (req, res) => {
    const nameResult = validateOptionalText(
      req.body?.name,
      "name",
      LIMITS.ROOM_NAME_MAX
    );
    if ("error" in nameResult) {
      return res.status(400).json({ error: nameResult.error });
    }
    const name = nameResult.value;
    // ユニークな code を確保（衝突時はリトライ）
    let code = generateRoomCode();
    for (let i = 0; i < 5; i++) {
      const existing = await findRoomByCode(code);
      if (!existing) break;
      code = generateRoomCode();
    }
    const { rows } = await query<RoomRow>(
      `INSERT INTO rooms (code, name) VALUES ($1, $2) RETURNING *`,
      [code, name]
    );
    res.status(201).json({ room: rows[0] });
  }));

  // ルーム参加
  router.post("/rooms/:code/join", asyncHandler(async (req, res) => {
    const nameResult = validateRequiredText(
      req.body?.name,
      "name",
      LIMITS.NAME_MAX
    );
    if ("error" in nameResult) {
      return res.status(400).json({ error: nameResult.error });
    }
    const name = nameResult.value;
    const room = await findRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "room not found" });

    const token = generateMemberToken();
    const { rows } = await query(
      `INSERT INTO members (room_id, name, token) VALUES ($1, $2, $3) RETURNING id, name, joined_at`,
      [room.id, name, token]
    );
    const member = rows[0];

    // 他メンバーへの通知には token を含めない（本人にのみ返す）。
    io.to(room.code).emit("member-joined", { member });
    const state = await getRoomState(room);
    res.status(201).json({ member, token, ...state });
  }));

  // ルーム状態取得
  router.get("/rooms/:code", asyncHandler(async (req, res) => {
    const room = await findRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "room not found" });
    res.json(await getRoomState(room));
  }));

  // ルームから退出（メンバー削除）。本人トークンが必要。
  // choices は ON DELETE CASCADE で一緒に消えるため集計から除外される。
  router.post("/rooms/:code/leave", asyncHandler(async (req, res) => {
    const memberId: string | undefined = req.body?.memberId;
    if (!memberId) {
      return res.status(400).json({ error: "memberId is required" });
    }
    const room = await findRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "room not found" });

    const { rows: memberRows } = await query<{ token: string | null }>(
      `SELECT token FROM members WHERE id = $1 AND room_id = $2`,
      [memberId, room.id]
    );
    if (!memberRows[0]) {
      // 既に居ない場合も冪等に成功扱い。
      return res.json({ ok: true });
    }
    const token = getMemberToken(req);
    if (!token || token !== memberRows[0].token) {
      return res.status(401).json({ error: "invalid or missing member token" });
    }

    await query(`DELETE FROM members WHERE id = $1`, [memberId]);

    io.to(room.code).emit("member-left", { memberId });

    // 退出により残りメンバー全員が投票済みになる場合は結果を出せるよう通知。
    const { rows: topicRows } = await query<{ id: string }>(
      `SELECT id FROM topics WHERE room_id = $1 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
      [room.id]
    );
    if (topicRows[0]) {
      const topicId = topicRows[0].id;
      const { rows: counts } = await query<{ voted: string; total: string }>(
        `SELECT
           (SELECT COUNT(*) FROM choices WHERE topic_id = $1) AS voted,
           (SELECT COUNT(*) FROM members
              WHERE room_id = $2 AND token IS NOT NULL) AS total`,
        [topicId, room.id]
      );
      const voted = Number(counts[0].voted);
      const total = Number(counts[0].total);
      io.to(room.code).emit("choice-made", { topicId, voted, total });
      if (total > 0 && voted >= total) {
        io.to(room.code).emit("result-ready", { topicId });
      }
    }

    res.json({ ok: true });
  }));

  // お題を設定（既存の active を閉じ、AIで選択肢を生成）
  router.post("/rooms/:code/topics", asyncHandler(async (req, res) => {
    const titleResult = validateRequiredText(
      req.body?.title,
      "title",
      LIMITS.TITLE_MAX
    );
    if ("error" in titleResult) {
      return res.status(400).json({ error: titleResult.error });
    }
    const title = titleResult.value;
    // 不正値（NaN・負数・巨大値）は許容範囲にクランプ。
    const count = clampCount(req.body?.count);
    const room = await findRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "room not found" });

    // AI（or モック）の選択肢生成はネットワーク I/O なのでトランザクション外で実行。
    const generated = await generateOptions(title, count);
    const labels = generated.options;
    // 選択肢が生成できなければお題を作らずエラー（空のお題を残さない）。
    if (labels.length === 0) {
      return res
        .status(502)
        .json({ error: "failed to generate options for this topic" });
    }

    // 旧お題のクローズ・新お題の作成・選択肢の挿入を1トランザクションで原子的に行う
    // （途中失敗で「active が無い／選択肢の無いお題が残る」不整合を防ぐ）。
    const { topic, optionRows } = await withTransaction(async (client) => {
      await client.query(
        `UPDATE topics SET status = 'closed' WHERE room_id = $1 AND status = 'active'`,
        [room.id]
      );
      const { rows: topicRows } = await client.query(
        `INSERT INTO topics (room_id, title) VALUES ($1, $2) RETURNING id, title, status, created_at`,
        [room.id, title]
      );
      const createdTopic = topicRows[0];

      const inserted = [];
      for (let i = 0; i < labels.length; i++) {
        const { rows } = await client.query(
          `INSERT INTO options (topic_id, label, sort_order) VALUES ($1, $2, $3) RETURNING id, label, sort_order`,
          [createdTopic.id, labels[i], i]
        );
        inserted.push(rows[0]);
      }
      return { topic: createdTopic, optionRows: inserted };
    });

    const payload = { topic, options: optionRows, usingMock: generated.usingMock };
    io.to(room.code).emit("topic-started", payload);
    res.status(201).json(payload);
  }));

  // 選択を記録
  router.post("/topics/:id/choices", asyncHandler(async (req, res) => {
    const memberId: string | undefined = req.body?.memberId;
    const optionId: string | undefined = req.body?.optionId;
    if (!memberId || !optionId) {
      return res.status(400).json({ error: "memberId and optionId are required" });
    }

    const { rows: topicRows } = await query<{ id: string; room_id: string; status: string }>(
      `SELECT id, room_id, status FROM topics WHERE id = $1`,
      [req.params.id]
    );
    const topic = topicRows[0];
    if (!topic) return res.status(404).json({ error: "topic not found" });
    if (topic.status !== "active") {
      return res.status(409).json({ error: "topic is not active" });
    }

    // 所有権の検証: member が同じルームに属することを確認
    const { rows: memberRows } = await query<{ token: string | null }>(
      `SELECT token FROM members WHERE id = $1 AND room_id = $2`,
      [memberId, topic.room_id]
    );
    if (!memberRows[0]) {
      return res.status(400).json({ error: "member does not belong to this room" });
    }
    // 本人確認: 参加時に発行したトークンと一致するか（なりすまし防止）。
    const token = getMemberToken(req);
    if (!token || token !== memberRows[0].token) {
      return res.status(401).json({ error: "invalid or missing member token" });
    }
    const { rows: optionRows } = await query(
      `SELECT 1 FROM options WHERE id = $1 AND topic_id = $2`,
      [optionId, topic.id]
    );
    if (!optionRows[0]) {
      return res.status(400).json({ error: "option does not belong to this topic" });
    }

    await query(
      `INSERT INTO choices (topic_id, member_id, option_id)
         VALUES ($1, $2, $3)
       ON CONFLICT (topic_id, member_id)
         DO UPDATE SET option_id = EXCLUDED.option_id, created_at = now()`,
      [topic.id, memberId, optionId]
    );

    // 投票状況を集計（total は token を持つ有効メンバーのみ。token=NULL の
    // 幽霊行を含めると voted>=total に到達せずお題を完了できなくなるため除外）。
    const { rows: counts } = await query<{ voted: string; total: string }>(
      `SELECT
         (SELECT COUNT(*) FROM choices WHERE topic_id = $1) AS voted,
         (SELECT COUNT(*) FROM members
            WHERE room_id = $2 AND token IS NOT NULL) AS total`,
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
  }));

  // 単一お題のマッチング率
  router.get("/topics/:id/result", asyncHandler(async (req, res) => {
    const result = await matchingForTopic(req.params.id);
    res.json(result);
  }));

  // お題を閉じる（「次のお題へ」用）— 閉じるとルームは lobby に戻る
  router.post("/topics/:id/close", asyncHandler(async (req, res) => {
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
  }));

  // ルーム累計のマッチング率
  router.get("/rooms/:code/result", asyncHandler(async (req, res) => {
    const room = await findRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "room not found" });
    const result = await matchingForRoom(room.id);
    res.json(result);
  }));

  return router;
}
