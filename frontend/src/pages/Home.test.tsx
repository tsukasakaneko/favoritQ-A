import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home, { saveMember, loadMember } from "./Home.js";

describe("member storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a member through localStorage (case-insensitive code)", () => {
    saveMember("abc123", "m1", "たろう");
    expect(loadMember("ABC123")).toEqual({
      memberId: "m1",
      memberName: "たろう",
    });
  });

  it("returns null when nothing is stored for the code", () => {
    expect(loadMember("NOPE12")).toBeNull();
  });
});

describe("Home", () => {
  it("renders the title and primary actions", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { name: "favoritQ-A" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ルームを作る" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "コードで参加" })
    ).toBeInTheDocument();
  });
});
