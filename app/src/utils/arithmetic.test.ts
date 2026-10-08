import { describe, expect, it } from "vitest";
import { evaluateArithmetic } from "./arithmetic";

describe("evaluateArithmetic", () => {
  it.each([
    ["1+2*3", 7],
    ["(1+2)*3", 9],
    ["5--3", 8],
    ["-2*-(3+1)", 8],
    ["10/4", 2.5],
    ["7%3", 1],
    ["1.5e3+0.5", 1500.5],
    [".5*2", 1],
  ])("computes %s", (input, expected) => {
    expect(evaluateArithmetic(input)).toBe(expected);
  });

  // Formulas come from shared documents: anything but arithmetic must fail, never run.
  it.each(["2*(3", "alert(1)", "constructor", "1 2", "", '1;fetch("x")', "[]+{}", "this"])("refuses %j", (input) => {
    expect(() => evaluateArithmetic(input)).toThrow();
  });
});
