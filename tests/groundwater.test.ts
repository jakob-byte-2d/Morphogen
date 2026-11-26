import { describe, expect, it } from "vitest";
import { applyTool, createWorld, EMPTY, H, SEED, setCell, SOIL, stepLifeN, stepWorldN, STONE, totalWater, W, WATER, waterTable } from "../src/sim";
import { emptyWorld, REACH, WATER_UNITS, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;
const tableAt = (y: number) => (H - y) * W * WATER_UNITS;

/** A bed of soil with a dip in the middle, and groundwater up to row `table`. */
function dipBed(table: number): World {
  const w = emptyWorld(21);
  const top = H - 60;
  for (let x = 0; x < W; x++) {
    const d = Math.abs(x - (W >> 1));
    const surface = d < 30 ? top + 30 - d : top;
    for (let y = surface; y < H; y++) setCell(w, at(x, y), SOIL);
  }
  w.groundwater = tableAt(table);
  return w;
}

/** The topmost row with open water in the dip, or H if it is dry. */
function waterLine(w: World): number {
  for (let y = 0; y < H; y++) for (let x = (W >> 1) - 30; x < (W >> 1) + 30; x++) if (w.type[at(x, y)] === WATER) return y;
  return H;
}

describe("groundwater", () => {
  it("is one level water table, set by how much water there is", () => {
    const w = emptyWorld(1);
    expect(waterTable(w)).toBe(H);
    w.groundwater = tableAt(H - 40);
    expect(waterTable(w)).toBe(H - 40);
  });

  it("fills a dip up to the water table: the pond", () => {
    const w = dipBed(H - 45);
    stepWorldN(w, 1500);
    expect(waterLine(w)).toBeLessThan(H);
    expect(Math.abs(waterLine(w) - waterTable(w))).toBeLessThanOrEqual(1);
  });

  it("takes in water poured above it, and rises", () => {
    const w = dipBed(H - 20);
    for (let y = H - 45; y < H - 30; y++) for (let x = 0; x < W; x++) if (w.type[at(x, y)] === EMPTY) setCell(w, at(x, y), WATER);
    stepWorldN(w, 3000);
    // Whatever stood above the table sank in, and the table rose.
    expect(waterTable(w)).toBeLessThan(H - 20);
    expect(waterLine(w)).toBeGreaterThanOrEqual(waterTable(w) - 1);
  });

  it("takes in the water can's water on dry ground", () => {
    const w = dipBed(H - 5);
    const before = w.groundwater;
    for (let k = 0; k < 10; k++) applyTool(w, "water", 20, 40);
    stepWorldN(w, 600);
    expect(w.groundwater).toBeGreaterThan(before);
  });

  it("only moves water, never makes or loses it", () => {
    const w = dipBed(H - 45);
    const water = totalWater(w);
    stepWorldN(w, 1500);
    expect(totalWater(w) + w.lostWater).toBe(water);
  });

  it("lets seeds sprout only near it", () => {
    const sprouts = (table: number) => {
      const w = emptyWorld(22);
      for (let y = H - 60; y < H; y++) for (let x = 0; x < W; x++) setCell(w, at(x, y), SOIL);
      w.groundwater = tableAt(table);
      setCell(w, at(70, H - 61), SEED);
      w.kind[at(70, H - 61)] = 0;
      w.food[at(70, H - 61)] = 1;
      stepLifeN(w, 400);
      return w.plants.length;
    };
    expect(sprouts(H - 60 + REACH - 2)).toBe(1);
    expect(sprouts(H - 60 + REACH + 10)).toBe(0);
  });

  it("is where the pond stands in a fresh glass, with no stones in it", () => {
    const w = createWorld(5);
    expect(w.type.includes(STONE)).toBe(false);
    expect(waterLine(w)).toBe(waterTable(w));
  });
});
