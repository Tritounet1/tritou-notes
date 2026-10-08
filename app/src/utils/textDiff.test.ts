import { describe, expect, it } from "vitest";
import { computeDiff } from "./textDiff";

describe("computeDiff", () => {
  it("marks unchanged, added and removed lines", () => {
    expect(computeDiff("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { type: "unchanged", content: "a" },
      { type: "removed", content: "b" },
      { type: "added", content: "B" },
      { type: "unchanged", content: "c" },
      { type: "added", content: "d" },
    ]);
  });

  it("realigns on the nearest common line", () => {
    expect(computeDiff("a\nc", "a\nb\nc").map((line) => line.type)).toEqual(["unchanged", "added", "unchanged"]);
    expect(computeDiff("a\nb\nc", "a\nc").map((line) => line.type)).toEqual(["unchanged", "removed", "unchanged"]);
  });
});
