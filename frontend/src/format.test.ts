import { describe, it, expect } from "vitest";
import { rateLabel } from "./format.js";

describe("rateLabel", () => {
  it("数値はパーセント表記にする", () => {
    expect(rateLabel(100)).toBe("100%");
    expect(rateLabel(0)).toBe("0%");
    expect(rateLabel(57)).toBe("57%");
  });

  it("null は em dash を返す", () => {
    expect(rateLabel(null)).toBe("—");
  });
});
