import { describe, it, expect } from "vitest";
import { parseOptions } from "./ai.js";

describe("parseOptions", () => {
  it("素の JSON をパースする", () => {
    expect(parseOptions('{"options": ["寿司", "ラーメン"]}')).toEqual([
      "寿司",
      "ラーメン",
    ]);
  });

  it("前後に説明文が混ざっていても JSON 部分を抽出する", () => {
    const text = 'はい、生成しました:\n{"options": ["A", "B", "C"]}\nどうぞ。';
    expect(parseOptions(text)).toEqual(["A", "B", "C"]);
  });

  it("コードフェンスで囲まれていてもパースする", () => {
    const text = '```json\n{"options": ["x", "y"]}\n```';
    expect(parseOptions(text)).toEqual(["x", "y"]);
  });

  it("文字列以外の要素は除外する", () => {
    expect(parseOptions('{"options": ["ok", 1, null, "fine"]}')).toEqual([
      "ok",
      "fine",
    ]);
  });

  it("options が無ければ空配列", () => {
    expect(parseOptions('{"foo": "bar"}')).toEqual([]);
  });

  it("不正な JSON なら空配列", () => {
    expect(parseOptions("これは JSON ではありません")).toEqual([]);
  });

  it("空文字なら空配列", () => {
    expect(parseOptions("")).toEqual([]);
  });
});
