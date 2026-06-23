import { describe, it, expect } from "vitest";
import {
  LIMITS,
  validateRequiredText,
  validateOptionalText,
  clampCount,
} from "./validation.js";

describe("validateRequiredText", () => {
  it("有効な文字列は trim して返す", () => {
    expect(validateRequiredText("  hi  ", "name", 30)).toEqual({ value: "hi" });
  });

  it("空文字・空白のみはエラー", () => {
    expect(validateRequiredText("", "name", 30)).toEqual({
      error: "name is required",
    });
    expect(validateRequiredText("   ", "name", 30)).toEqual({
      error: "name is required",
    });
  });

  it("非文字列はエラー", () => {
    expect(validateRequiredText(123, "name", 30)).toEqual({
      error: "name is required",
    });
    expect(validateRequiredText(undefined, "name", 30)).toEqual({
      error: "name is required",
    });
  });

  it("上限超過はエラー", () => {
    const result = validateRequiredText("a".repeat(31), "name", 30);
    expect(result).toEqual({
      error: "name must be at most 30 characters",
    });
  });

  it("上限ちょうどは OK", () => {
    expect(validateRequiredText("a".repeat(30), "name", 30)).toEqual({
      value: "a".repeat(30),
    });
  });
});

describe("validateOptionalText", () => {
  it("未指定は null", () => {
    expect(validateOptionalText(undefined, "name", 50)).toEqual({ value: null });
    expect(validateOptionalText(null, "name", 50)).toEqual({ value: null });
    expect(validateOptionalText("", "name", 50)).toEqual({ value: null });
  });

  it("空白のみは null に正規化", () => {
    expect(validateOptionalText("   ", "name", 50)).toEqual({ value: null });
  });

  it("有効な文字列は trim して返す", () => {
    expect(validateOptionalText("  room  ", "name", 50)).toEqual({
      value: "room",
    });
  });

  it("非文字列はエラー", () => {
    expect(validateOptionalText(42, "name", 50)).toEqual({
      error: "name must be a string",
    });
  });

  it("上限超過はエラー", () => {
    expect(validateOptionalText("a".repeat(51), "name", 50)).toEqual({
      error: "name must be at most 50 characters",
    });
  });
});

describe("clampCount", () => {
  it("範囲内はそのまま", () => {
    expect(clampCount(6)).toBe(6);
    expect(clampCount("8")).toBe(8);
  });

  it("下限・上限にクランプ", () => {
    expect(clampCount(1)).toBe(LIMITS.COUNT_MIN);
    expect(clampCount(999)).toBe(LIMITS.COUNT_MAX);
  });

  it("不正値は fallback", () => {
    expect(clampCount(NaN)).toBe(6);
    expect(clampCount("abc")).toBe(6);
    expect(clampCount(undefined)).toBe(6);
    expect(clampCount(-5)).toBe(6);
  });

  it("小数は切り捨て", () => {
    expect(clampCount(5.9)).toBe(5);
  });
});
