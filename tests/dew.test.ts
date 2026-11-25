import { describe, expect, it } from "vitest";
import { applyTool, EMPTY, FLOWER, H, LEAF, SEED, setCell, SOIL, STEM, stepWorld, stepWorldN, totalWater, W, WATER } from "../src/sim";
import { emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;

function soilBed(wet: number): World {
  const w = emptyWorld(5);
  for (let y = H - 20; y < H; y++)
    for (let x = 0; x < W; x++) {
      setCell(w, at(x, y), SOIL);
      w.wet[at(x, y)] = wet;
      w.food[at(x, y)] = 6;
    }
  return w;
}

/** Water cells with nothing under them: drops in the air. */
function falling(w: World): number {
  let n = 0;
  for (let i = 0; i < W * (H - 1); i++) if (w.type[i] === WATER && w.type[i + W] === EMPTY) n++;
  return n;
}

describe("dew", () => {
  it("settles into the ground without falling as drops", () => {
    const w = soilBed(40);
    w.humidity = 3000;
    const water = totalWater(w);
    for (let k = 0; k < 40; k++) {
      stepWorldN(w, 10);
      expect(falling(w)).toBe(0);
    }
    expect(w.humidity).toBeLessThan(1000);
    expect(totalWater(w) + w.lostWater).toBe(water);
  });

  it("gathers into puddles only on soaked ground", () => {
    const w = soilBed(255);
    w.humidity = 3000;
    stepWorldN(w, 400);
    expect(falling(w)).toBe(0);
    expect(w.type.filter((t) => t === WATER).length).toBeGreaterThan(0);
    // The puddles lie on the ground, not up in the air.
    for (let i = 0; i < W * H; i++) if (w.type[i] === WATER) expect((i / W) | 0).toBeGreaterThan(H - 30);
  });
});

describe("water on plants", () => {
  it("never stays on the leaves of a plant that has drunk its fill", () => {
    const w = soilBed(130);
    setCell(w, at(36, H - 21), SEED);
    w.kind[at(36, H - 21)] = 2;
    w.food[at(36, H - 21)] = 1;
    stepWorldN(w, 1500);
    expect(w.plants.length).toBe(1);
    const p = w.plants[0];
    let resting = 0;
    for (let k = 0; k < 12; k++) {
      for (let x = 20; x < 52; x += 2) applyTool(w, "water", x, H - 50);
      for (let t = 0; t < 60; t++) {
        p.water = 250;
        stepWorld(w);
      }
      for (let i = 0; i < W * (H - 1); i++) {
        const below = w.type[i + W];
        if (w.type[i] === WATER && (below === LEAF || below === FLOWER || below === STEM)) resting++;
      }
    }
    expect(resting).toBe(0);
  });
});

describe("seeds on plants", () => {
  it("slip down between the leaves to the ground", () => {
    const w = soilBed(130);
    setCell(w, at(36, H - 21), SEED);
    w.kind[at(36, H - 21)] = 2;
    w.food[at(36, H - 21)] = 1;
    stepWorldN(w, 1500);
    const p = w.plants[0];
    const top = Math.min(...p.cells.filter((i) => w.type[i] === LEAF));
    // Drop a seed straight onto the top leaf.
    setCell(w, top - W, SEED);
    w.kind[top - W] = 0;
    w.food[top - W] = 1;
    stepWorldN(w, 40);
    const seeds = [...w.type.keys()].filter((i) => w.type[i] === SEED);
    expect(seeds.length).toBeGreaterThan(0);
    for (const i of seeds) expect(w.type[i + W]).toBe(SOIL);
  });
});

