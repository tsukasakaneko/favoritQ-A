import { describe, it, expect } from "vitest";
import { computeFromChoices, type ChoiceRow } from "./matching.js";

/** テスト用に choices 行を組み立てるヘルパー。 */
function row(
  topicId: string,
  memberId: string,
  memberName: string,
  optionId: string
): ChoiceRow {
  return {
    topic_id: topicId,
    member_id: memberId,
    member_name: memberName,
    option_id: optionId,
  };
}

describe("computeFromChoices", () => {
  it("メンバーが1人なら比較ペアは0件", () => {
    const result = computeFromChoices([row("t1", "a", "Alice", "o1")]);
    expect(result.pairs).toHaveLength(0);
    expect(result.best).toBeNull();
  });

  it("同じ選択肢を選んだ2人は100%", () => {
    const result = computeFromChoices([
      row("t1", "a", "Alice", "o1"),
      row("t1", "b", "Bob", "o1"),
    ]);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].rate).toBe(100);
    expect(result.pairs[0].sharedTopics).toBe(1);
    expect(result.pairs[0].matchedTopics).toBe(1);
    expect(result.best?.rate).toBe(100);
  });

  it("違う選択肢を選んだ2人は0%", () => {
    const result = computeFromChoices([
      row("t1", "a", "Alice", "o1"),
      row("t1", "b", "Bob", "o2"),
    ]);
    expect(result.pairs[0].rate).toBe(0);
    // 0% も比較可能なので best にはなり得る
    expect(result.best?.rate).toBe(0);
  });

  it("複数お題の累計: 2お題中1お題一致なら50%", () => {
    const result = computeFromChoices([
      row("t1", "a", "Alice", "o1"),
      row("t1", "b", "Bob", "o1"), // 一致
      row("t2", "a", "Alice", "o3"),
      row("t2", "b", "Bob", "o4"), // 不一致
    ]);
    expect(result.pairs[0].sharedTopics).toBe(2);
    expect(result.pairs[0].matchedTopics).toBe(1);
    expect(result.pairs[0].rate).toBe(50);
  });

  it("片方しか回答していないお題は共通お題に数えない", () => {
    const result = computeFromChoices([
      row("t1", "a", "Alice", "o1"),
      row("t1", "b", "Bob", "o1"), // 共通
      row("t2", "a", "Alice", "o2"), // Bob は t2 未回答
    ]);
    expect(result.pairs[0].sharedTopics).toBe(1);
    expect(result.pairs[0].rate).toBe(100);
  });

  it("共通お題が無いペアは rate=null で best から除外される", () => {
    const result = computeFromChoices([
      row("t1", "a", "Alice", "o1"),
      row("t2", "b", "Bob", "o1"), // 別お題のみ → 共通なし
    ]);
    expect(result.pairs[0].rate).toBeNull();
    expect(result.best).toBeNull();
  });

  it("3人いれば全組み合わせ(3ペア)を返す", () => {
    const result = computeFromChoices([
      row("t1", "a", "Alice", "o1"),
      row("t1", "b", "Bob", "o1"),
      row("t1", "c", "Carol", "o2"),
    ]);
    expect(result.pairs).toHaveLength(3);
    // best は Alice×Bob (100%)
    expect(result.best?.rate).toBe(100);
  });

  it("空入力なら pairs は空、best は null", () => {
    const result = computeFromChoices([]);
    expect(result.pairs).toHaveLength(0);
    expect(result.best).toBeNull();
  });
});
