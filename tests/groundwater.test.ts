import { describe, expect, it } from "vitest";
import { createWorld, EMPTY, H, MAX_WET, SAND, SATURATED, setCell, SOIL, stepWorldN, STONE, totalWater, W, WATER } from "../src/sim";
import { emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;

/**
 * A bed of soil with a dip in the middle, soaked through below `table`
 * and moist above it.
 */
function dipBed(table: number): World {
  const w = emptyWorld(21);
  const top = H - 60;
  for (let x = 0; x < W; x++) {
    const d = Math.abs(x - (W >> 1));
    const surface = d < 30 ? top + 30 - d : top;
    for (let y = surface; y < H; y++) {
      setCell(w, at(x, y), SOIL);
      w.wet[at(x, y)] = y >= table ? MAX_WET : 140;
    }
  }
  return w;
}

/** The topmost row with open water in the dip, or H if it is dry. */
function waterLine(w: World): number {
  for (let y = 0; y < H; y++) for (let x = (W >> 1) - 30; x < (W >> 1) + 30; x++) if (w.type[at(x, y)] === WATER) return y;
  return H;
}

describe("groundwater", () => {
  it("fills a dip up to the groundwater table", () => {
    const table = H - 45;
    const w = dipBed(table);
    stepWorldN(w, 1500);
    expect(Math.abs(waterLine(w) - table)).toBeLessThanOrEqual(2);
  });

  it("drains a pond that stands above it", () => {
    const table = H - 20;
    const w = dipBed(table);
    // A pond poured in above the groundwater sinks away into the ground.
    for (let y = H - 45; y < H - 30; y++) for (let x = 0; x < W; x++) if (w.type[at(x, y)] === EMPTY) setCell(w, at(x, y), WATER);
    stepWorldN(w, 3000);
    expect(waterLine(w)).toBeGreaterThan(H - 40);
  });

  it("only moves water, never makes or loses it", () => {
    const w = dipBed(H - 45);
    const water = totalWater(w);
    stepWorldN(w, 1500);
    expect(totalWater(w) + w.lostWater).toBe(water);
  });

  it("is where the pond stands in a fresh glass, with no stones in it", () => {
    const w = createWorld(5);
    expect(w.type.includes(STONE)).toBe(false);
    // Below the pond's surface the ground is soaked; well above it, it is not.
    const line = waterLine(w);
    expect(line).toBeLessThan(H);
    const x = 4;
    let y = 0;
    while (w.type[at(x, y)] === EMPTY) y++;
    expect(w.wet[at(x, line + 4)]).toBeGreaterThanOrEqual(SATURATED);
    expect(w.wet[at(x, y)]).toBeLessThan(SATURATED);
    expect([SOIL, SAND]).toContain(w.type[at(x, line + 4)]);
  });
});
