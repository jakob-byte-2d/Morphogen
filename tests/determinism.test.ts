import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, countOrganisms, createWorld, hashWorld, stepWorldN } from "../src/engine";
import { GOLDEN } from "../src/engine/golden";

/**
 * The most important tests in the project: the same seed must always give
 * exactly the same world. Online matches and replays depend on it.
 * The golden hash lives in src/engine/golden.ts.
 */

describe("determinism", () => {
  it("same seed gives an identical world after 10 000 ticks", () => {
    const a = createWorld(7);
    const b = createWorld(7);
    stepWorldN(a, 10000);
    stepWorldN(b, 10000);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it("different seeds give different worlds", () => {
    const a = createWorld(1);
    const b = createWorld(2);
    stepWorldN(a, 500);
    stepWorldN(b, 500);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it("stepping in chunks gives the same result as stepping all at once", () => {
    const a = createWorld(3);
    const b = createWorld(3);
    stepWorldN(a, 3000);
    for (let i = 0; i < 30; i++) stepWorldN(b, 100);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it("matches the golden hash for this engine version", () => {
    expect(ENGINE_VERSION).toBe(GOLDEN.engineVersion);
    const w = createWorld(GOLDEN.seed);
    stepWorldN(w, GOLDEN.ticks);
    expect(hashWorld(w)).toBe(GOLDEN.hash);
  });
});

describe("simulation sanity", () => {
  it("organisms grow, reproduce and stay valid", () => {
    const w = createWorld(42);
    stepWorldN(w, 27000);
    expect(w.cells.length).toBeGreaterThan(100);
    expect(countOrganisms(w)).toBeGreaterThan(10);
    for (const c of w.cells) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.mass)).toBe(true);
      expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(w.env.dishRadius);
    }
    // Every bond joins two different, living cells, and no pair is bonded twice.
    const ids = new Set(w.cells.map((c) => c.id));
    const pairs = new Set<string>();
    for (const b of w.bonds) {
      expect(ids.has(b.a) && ids.has(b.b)).toBe(true);
      expect(b.a).not.toBe(b.b);
      const key = b.a < b.b ? `${b.a}-${b.b}` : `${b.b}-${b.a}`;
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });
});
