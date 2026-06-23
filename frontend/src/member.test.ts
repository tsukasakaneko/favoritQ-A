import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveMember, loadMember, clearMember } from "./member.js";

// localStorage の最小モック（jsdom 非依存）。
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("member storage", () => {
  it("保存したメンバーを読み出せる", () => {
    saveMember("abc123", "m1", "Alice", "tok");
    expect(loadMember("abc123")).toEqual({
      memberId: "m1",
      memberName: "Alice",
      token: "tok",
    });
  });

  it("ルームコードは大文字に正規化される", () => {
    saveMember("abc123", "m1", "Alice", "tok");
    expect(loadMember("ABC123")).not.toBeNull();
    expect(loadMember("AbC123")?.memberId).toBe("m1");
  });

  it("未保存なら null", () => {
    expect(loadMember("nope")).toBeNull();
  });

  it("clearMember で削除できる", () => {
    saveMember("abc123", "m1", "Alice", "tok");
    clearMember("abc123");
    expect(loadMember("abc123")).toBeNull();
  });
});
