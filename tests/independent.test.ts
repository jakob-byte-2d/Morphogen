import { describe, expect, it } from "vitest";
import {
  applyTool,
  createWorld,
  FEED,
  FLOWER,
  H,
  LEAF,
  PLANT_PART,
  ROOT,
  SAND,
  SEED,
  setCell,
  SOIL,
  STEM,
  stepLifeN,
  stepWorldN,
  W,
  WASTE,
  WATER,
} from "../src/sim";
import { emptyWorld, WATER_UNITS, type World } from "../src/sim/world";
import { pit } from "./helpers";

const at = (x: number, y: number) => y * W + x;

/** A bed of soil with one grown bush in the middle. */
function bushBed(): World {
  const w = emptyWorld(14);
  for (let y = H - 30; y < H; y++)
    for (let x = 0; x < W; x++) {
      setCell(w, at(x, y), SOIL);
      w.food[at(x, y)] = 6;
    }
  // Groundwater ten rows below the surface.
  w.groundwater = 20 * W * WATER_UNITS;
  setCell(w, at(72, H - 31), SEED);
  w.kind[at(72, H - 31)] = 2;
  w.food[at(72, H - 31)] = 1;
  pit(w, at(72, H - 31));
  stepLifeN(w, 1500);
  return w;
}

/**
 * Cells of type t lying right on top of a plant's shoot (above its foot,
 * which may get buried in soil like any stump).
 */
function onPlants(w: World, types: number[]): number {
  let n = 0;
  for (let i = 0; i < W * (H - 36); i++) {
    const b = w.type[i + W];
    if (types.includes(w.type[i]) && PLANT_PART[b] && b !== ROOT) n++;
  }
  return n;
}

describe("plants are independent", () => {
  it("let soil, sand, water, feed and seeds fall through or slide off", () => {
    const w = bushBed();
    expect(w.plants.length).toBeGreaterThan(0);
    const top = Math.min(...w.plants[0].cells.filter((i) => [LEAF, STEM, FLOWER].includes(w.type[i])));
    const y = ((top / W) | 0) - 6;
    for (let x = 50; x < 95; x += 3) {
      applyTool(w, "soil", x, y);
      applyTool(w, "water", x, y - 6);
      applyTool(w, "feed", x, y - 10);
    }
    setCell(w, at(72, y - 14), SAND);
    stepWorldN(w, 120);
    // (Dead leaves may catch in the bush, as real ones do; they rot there.)
    expect(onPlants(w, [SOIL, SAND, WATER, FEED, SEED])).toBe(0);
  });

  it("are not something skrukketroll live on: they fall through to the ground", () => {
    const w = bushBed();
    const top = Math.min(...w.plants[0].cells.filter((i) => [LEAF, STEM, FLOWER].includes(w.type[i])));
    // Dropped right over the bush, it falls through it to the ground under it.
    applyTool(w, "creature", top % W, 5, 0);
    stepWorldN(w, 300);
    expect(w.creatures.length).toBe(1);
    const i = w.creatures[0].cells[0];
    expect((i / W) | 0).toBeGreaterThanOrEqual(H - 33);
    // On the ground (or the dead leaves on it), not on the leaves.
    expect([i + W, i + W - 1, i + W + 1, i - 1, i + 1].some((j) => w.type[j] === SOIL || w.type[j] === WASTE)).toBe(true);
  });
});

describe("a new glass", () => {
  it("has soil and water, and nothing living in it until the player brings it", () => {
    const w = createWorld(3);
    expect(w.plants.length).toBe(0);
    expect(w.creatures.length).toBe(0);
    for (const t of [SEED, WASTE]) expect(w.type.includes(t)).toBe(false);
    expect(w.type.includes(SOIL)).toBe(true);
    expect(w.type.includes(WATER)).toBe(true);
    stepLifeN(w, 1000);
    expect(w.plants.length).toBe(0);
    expect(w.creatures.length).toBe(0);
  });
});
