import { describe, expect, it } from "vitest";
import {
  applyTool,
  createWorld,
  FUNGUS,
  H,
  setCell,
  SOIL,
  stepWorldN,
  totalUnits,
  totalWater,
  W,
  WASTE,
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

describe("waste", () => {
  it("rots into the soil by itself, even in a heap", () => {
    const w = compost();
    // A second layer on top: it can only rot into the waste below.
    for (let x = 20; x < 52; x++) {
      setCell(w, at(x, H - 22), WASTE);
      w.food[at(x, H - 22)] = 3;
    }
    const units = totalUnits(w);
    const waste = count(w, WASTE) + count(w, FUNGUS);
    stepWorldN(w, 6000);
    expect(count(w, WASTE) + count(w, FUNGUS)).toBeLessThan(waste);
    expect(soilFood(w)).toBeGreaterThan(30);
    expect(totalUnits(w)).toBe(units);
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
  it("keeps plants going and nutrients moving for a quarter of an hour", () => {
    const w = createWorld(42);
    stepWorldN(w, 1200);
    applyTool(w, "creature", 22, 40, 0);
    applyTool(w, "creature", 52, 40, 0);
    const units = totalUnits(w);
    stepWorldN(w, 9000);
    expect(totalUnits(w)).toBe(units);
    expect(w.plants.length).toBeGreaterThan(2);
    // What died has not just piled up: much of it is back in the soil.
    expect(count(w, WASTE) + count(w, FUNGUS)).toBeLessThan(400);
  });
});
