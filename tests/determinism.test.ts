import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, createWorld, hashWorld, stepWorldN } from "../src/engine";

/**
 * The most important test in the project: the same seed must always give
 * exactly the same world. Online matches and replays depend on it.
 *
 * If you change the simulation rules ON PURPOSE:
 *   1. bump ENGINE_VERSION in src/engine/world.ts
 *   2. update GOLDEN below to the new hash the test prints
 */
const GOLDEN = { engineVersion: 1, seed: 42, ticks: 10000, hash: "6c3acc1e" };

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
  it("a colony grows and survives without NaN values", () => {
    const w = createWorld(42);
    stepWorldN(w, 6000);
    expect(w.cells.length).toBeGreaterThan(50);
    for (const c of w.cells) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.mass)).toBe(true);
      expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(w.env.dishRadius);
    }
  });
});
