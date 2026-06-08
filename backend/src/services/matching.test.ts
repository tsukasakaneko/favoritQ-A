import { describe, it, expect } from "vitest";
import { computeFromChoices, type ChoiceRow } from "./matching.js";

function row(
  topic: string,
  member: string,
  name: string,
  option: string
): ChoiceRow {
  return {
    topic_id: topic,
    member_id: member,
    member_name: name,
    option_id: option,
  };
}

describe("computeFromChoices", () => {
  it("returns no pairs and no best when there are no choices", () => {
    const result = computeFromChoices([]);
    expect(result.pairs).toEqual([]);
    expect(result.best).toBeNull();
  });

  it("produces no pair for a single member", () => {
    const result = computeFromChoices([row("t1", "a", "あ", "o1")]);
    expect(result.pairs).toEqual([]);
    expect(result.best).toBeNull();
  });

  it("rates a fully matching pair at 100%", () => {
    const result = computeFromChoices([
      row("t1", "a", "あ", "o1"),
      row("t1", "b", "い", "o1"),
      row("t2", "a", "あ", "o2"),
      row("t2", "b", "い", "o2"),
    ]);
    expect(result.pairs).toHaveLength(1);
    const pair = result.pairs[0];
    expect(pair.sharedTopics).toBe(2);
    expect(pair.matchedTopics).toBe(2);
    expect(pair.rate).toBe(100);
    expect(result.best).toBe(pair);
  });

  it("rates a half-matching pair at 50%", () => {
    const result = computeFromChoices([
      row("t1", "a", "あ", "o1"),
      row("t1", "b", "い", "o1"),
      row("t2", "a", "あ", "o2"),
      row("t2", "b", "い", "o9"),
    ]);
    expect(result.pairs[0].rate).toBe(50);
  });

  it("only counts topics both members answered as shared", () => {
    const result = computeFromChoices([
      row("t1", "a", "あ", "o1"),
      row("t1", "b", "い", "o1"),
      // only member a answered t2 -> not shared
      row("t2", "a", "あ", "o2"),
    ]);
    const pair = result.pairs[0];
    expect(pair.sharedTopics).toBe(1);
    expect(pair.matchedTopics).toBe(1);
    expect(pair.rate).toBe(100);
  });

  it("reports null rate (and no best) when a pair shares no topic", () => {
    const result = computeFromChoices([
      row("t1", "a", "あ", "o1"),
      row("t2", "b", "い", "o2"),
    ]);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].rate).toBeNull();
    expect(result.best).toBeNull();
  });

  it("picks the highest-rated pair as best", () => {
    const result = computeFromChoices([
      // a & b match, a & c do not, b & c do not
      row("t1", "a", "あ", "o1"),
      row("t1", "b", "い", "o1"),
      row("t1", "c", "う", "o2"),
    ]);
    expect(result.best).not.toBeNull();
    expect(result.best!.rate).toBe(100);
    const ids = [result.best!.memberAId, result.best!.memberBId].sort();
    expect(ids).toEqual(["a", "b"]);
  });
});
