import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `あなたは「お題マッチングゲーム」の選択肢ジェネレーターです。
与えられたお題に対し、参加者が「自分の好き」を選べるような、互いに重複しない魅力的な選択肢を生成します。

ルール:
- それぞれ簡潔（最大15文字程度）で具体的な日本語の選択肢にする
- 偏りなくバリエーションを持たせる
- 出力は必ず次の JSON 形式のみ。前後に説明や記号を付けない:
  {"options": ["選択肢1", "選択肢2", ...]}`;

/**
 * お題に沿った選択肢を生成する。
 * ANTHROPIC_API_KEY が無い、または生成に失敗した場合はモック選択肢を返す。
 */
export async function generateOptions(
  topic: string,
  count = 6
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    console.log("[ai] ANTHROPIC_API_KEY 未設定 — モック選択肢を返します");
    return mockOptions(topic, count);
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      // 安定したプレフィックスはキャッシュ対象にしておく（プロンプトキャッシュ）
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `お題:「${topic}」\nこのお題に沿った選択肢をちょうど${count}個、指定の JSON 形式で生成してください。`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const options = parseOptions(text);

    if (options.length === 0) throw new Error("empty options");
    return options.slice(0, count);
  } catch (err) {
    console.error("[ai] 生成に失敗しました。モックにフォールバックします:", err);
    return mockOptions(topic, count);
  }
}

/** レスポンステキストから {"options": [...]} を抽出する。 */
function parseOptions(text: string): string[] {
  // コードフェンスや余計なテキストが混ざっても拾えるよう、最初の JSON オブジェクトを抽出
  const match = text.match(/\{[\s\S]*\}/);
  const json = match ? match[0] : text;
  try {
    const parsed = JSON.parse(json) as { options?: unknown };
    if (Array.isArray(parsed.options)) {
      return parsed.options.filter((o): o is string => typeof o === "string");
    }
  } catch {
    /* fallthrough */
  }
  return [];
}

/** API キーが無い／失敗時用の固定モック選択肢。 */
function mockOptions(topic: string, count: number): string[] {
  const base = [
    `${topic} A`,
    `${topic} B`,
    `${topic} C`,
    `${topic} D`,
    `${topic} E`,
    `${topic} F`,
    `${topic} G`,
    `${topic} H`,
  ];
  return base.slice(0, Math.max(2, Math.min(count, base.length)));
}
