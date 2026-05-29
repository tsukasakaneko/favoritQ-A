import { query } from "../db.js";

export interface PairMatch {
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  /** 共通で回答したお題数（累計の場合）。単一お題では 0 か 1。 */
  sharedTopics: number;
  /** 同じ選択肢を選んだお題数。 */
  matchedTopics: number;
  /** マッチング率(%)。共通回答が無ければ null。 */
  rate: number | null;
}

export interface MatchingResult {
  pairs: PairMatch[];
  best: PairMatch | null;
}

interface ChoiceRow {
  topic_id: string;
  member_id: string;
  member_name: string;
  option_id: string;
}

/**
 * 与えられた choices 行からメンバー2人ずつのマッチング率を計算する。
 * - 各お題で同じ option を選べば「一致」。
 * - rate = matchedTopics / sharedTopics * 100
 */
function computeFromChoices(rows: ChoiceRow[]): MatchingResult {
  // member 情報
  const members = new Map<string, string>();
  for (const r of rows) members.set(r.member_id, r.member_name);

  // topic -> (member -> option)
  const byTopic = new Map<string, Map<string, string>>();
  for (const r of rows) {
    let m = byTopic.get(r.topic_id);
    if (!m) {
      m = new Map();
      byTopic.set(r.topic_id, m);
    }
    m.set(r.member_id, r.option_id);
  }

  const memberIds = [...members.keys()];
  const pairs: PairMatch[] = [];

  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i];
      const b = memberIds[j];
      let shared = 0;
      let matched = 0;

      for (const picks of byTopic.values()) {
        const oa = picks.get(a);
        const ob = picks.get(b);
        if (oa !== undefined && ob !== undefined) {
          shared += 1;
          if (oa === ob) matched += 1;
        }
      }

      pairs.push({
        memberAId: a,
        memberAName: members.get(a)!,
        memberBId: b,
        memberBName: members.get(b)!,
        sharedTopics: shared,
        matchedTopics: matched,
        rate: shared > 0 ? Math.round((matched / shared) * 100) : null,
      });
    }
  }

  const ranked = pairs
    .filter((p) => p.rate !== null)
    .sort((x, y) => (y.rate ?? 0) - (x.rate ?? 0));

  return { pairs, best: ranked[0] ?? null };
}

/** 単一お題のマッチング率（その1お題のみで比較）。 */
export async function matchingForTopic(topicId: string): Promise<MatchingResult> {
  const { rows } = await query<ChoiceRow>(
    `SELECT c.topic_id, c.member_id, m.name AS member_name, c.option_id
       FROM choices c
       JOIN members m ON m.id = c.member_id
      WHERE c.topic_id = $1`,
    [topicId]
  );
  return computeFromChoices(rows);
}

/** ルーム内の全お題を通した累計マッチング率。 */
export async function matchingForRoom(roomId: string): Promise<MatchingResult> {
  const { rows } = await query<ChoiceRow>(
    `SELECT c.topic_id, c.member_id, m.name AS member_name, c.option_id
       FROM choices c
       JOIN members m ON m.id = c.member_id
       JOIN topics t ON t.id = c.topic_id
      WHERE t.room_id = $1`,
    [roomId]
  );
  return computeFromChoices(rows);
}
