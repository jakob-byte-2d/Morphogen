import { describe, expect, it } from "vitest";
import {
  applyTool,
  createWorld,
  FUNGUS,
  H,
  setCell,
  SOIL,
  spawnCreature,
  stepWorldN,
  totalUnits,
  totalWater,
  W,
  WASTE,
  WORM,
} from "../src/sim";
import { emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;
const count = (w: World, t: number) => w.type.filter((v) => v === t).length;

/** A layer of moist soil with no nutrients, and a strip of waste on top. */
function compost(): World {
  const w = emptyWorld(3);
  for (let y = H - 20; y < H; y++)
    for (let x = 0; x < W; x++) {
      setCell(w, at(x, y), SOIL);
      w.wet[at(x, y)] = 120;
    }
  for (let x = 20; x < 52; x++) {
    setCell(w, at(x, H - 21), WASTE);
    w.food[at(x, H - 21)] = 3;
    w.wet[at(x, H - 21)] = 80;
  }
  return w;
}

function soilFood(w: World): number {
  let n = 0;
  for (let i = 0; i < W * H; i++) if (w.type[i] === SOIL) n += w.food[i];
  return n;
}

describe("worms", () => {
  it("eat waste and give it back to the soil as food", () => {
    const w = compost();
    spawnCreature(w, 2, [at(30, H - 18), at(30, H - 17), at(30, H - 16)], 300);
    const units = totalUnits(w);
    const waste = count(w, WASTE);
    stepWorldN(w, 1800);
    expect(count(w, WASTE)).toBeLessThan(waste);
    expect(soilFood(w)).toBeGreaterThan(0);
    expect(totalUnits(w)).toBe(units);
  });

  it("stay in the soil", () => {
    const w = compost();
    spawnCreature(w, 2, [at(10, H - 15), at(10, H - 14), at(10, H - 13)], 300);
    for (let k = 0; k < 6; k++) {
      stepWorldN(w, 300);
      for (let i = 0; i < W * H; i++) if (w.type[i] === WORM) expect((i / W) | 0).toBeGreaterThan(H - 22);
    }
  });
});

describe("fungus", () => {
  it("grows on moist waste and turns it into soil food", () => {
    const w = compost();
    setCell(w, at(36, H - 21), FUNGUS);
    w.food[at(36, H - 21)] = 3;
    const units = totalUnits(w);
    stepWorldN(w, 1200);
    expect(count(w, WASTE)).toBeLessThan(20);
    expect(soilFood(w)).toBeGreaterThan(30);
    expect(totalUnits(w)).toBe(units);
  });
});

describe("water", () => {
  it("escapes slowly, and every drop is accounted for", () => {
    const w = createWorld(21);
    const water = totalWater(w);
    stepWorldN(w, 3000);
    expect(w.lostWater).toBeGreaterThan(0);
    expect(totalWater(w) + w.lostWater).toBe(water);
  });
});

describe("the whole cycle", () => {
  it("keeps plants and decomposers going for a quarter of an hour", () => {
    const w = createWorld(42);
    stepWorldN(w, 1200);
    applyTool(w, "creature", 22, 40, 0);
    applyTool(w, "creature", 52, 40, 0);
    const units = totalUnits(w);
    stepWorldN(w, 9000);
    expect(totalUnits(w)).toBe(units);
    expect(w.plants.length).toBeGreaterThan(2);
    expect(w.creatures.some((c) => w.creatureSpecies[c.species].diet === "waste")).toBe(true);
  });
});
