import { describe, expect, it } from "vitest";

// Fichier test pour tester la ci
function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

describe("Example - Operations mathematiques", () => {
  it("devrait additionner deux nombres", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("devrait additionner des nombres negatifs", () => {
    expect(add(-1, -2)).toBe(-3);
  });

  it("devrait additionner zero", () => {
    expect(add(0, 0)).toBe(0);
  });

  it("devrait multiplier deux nombres", () => {
    expect(multiply(3, 4)).toBe(12);
  });

  it("devrait multiplier par zero", () => {
    expect(multiply(5, 0)).toBe(0);
  });
});
