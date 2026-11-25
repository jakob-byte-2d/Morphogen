import { describe, expect, it } from "vitest";
import { cos, sin } from "../src/engine/fmath";

describe("deterministic sin/cos", () => {
  it("match Math.sin/Math.cos closely", () => {
    for (let i = 0; i <= 20000; i++) {
      const x = -100 + i * 0.01;
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-10);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-10);
    }
  });

  it("hit exact values at key angles", () => {
    expect(sin(0)).toBe(0);
    expect(Math.abs(sin(Math.PI / 2) - 1)).toBeLessThan(1e-11);
    expect(Math.abs(cos(Math.PI) + 1)).toBeLessThan(1e-11);
  });
});
