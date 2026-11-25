import { describe, expect, it } from "vitest";
import { Rng } from "../src/engine/rng";

describe("Rng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it("gives different sequences for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 100 }, () => a.nextU32() === b.nextU32()).filter(Boolean);
    expect(same.length).toBeLessThan(3);
  });

  it("returns floats in [0, 1)", () => {
    const r = new Rng(99);
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("can save and restore its state", () => {
    const r = new Rng(5);
    r.nextU32();
    const saved = r.getState();
    const expected = [r.nextU32(), r.nextU32(), r.nextU32()];
    r.setState(saved);
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toEqual(expected);
  });

  it("matches the golden sequence (changing it breaks old replays)", () => {
    const r = new Rng(42);
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toEqual(GOLDEN_42);
  });
});

const GOLDEN_42 = [1028872839, 2516511472, 400437680];
