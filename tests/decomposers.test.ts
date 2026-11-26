import { describe, expect, it } from "vitest";
import { letIn, sownGlass } from "./helpers";
import { createWorld, H, ISOPOD, setCell, SOIL, stepLifeN, totalUnits, totalWater, unitLedger, W, WASTE } from "../src/sim";
import { emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;
const count = (w: World, t: number) => w.type.filter((v) => v === t).length;

/** A layer of moist soil with no nutrients, and two layers of dead leaves on top. */
function compost(): World {
  const w = emptyWorld(3);
  for (let y = H - 20; y < H; y++)
    for (let x = 0; x < W; x++) {
      setCell(w, at(x, y), SOIL);
      w.wet[at(x, y)] = 120;
    }
  for (let x = 20; x < 52; x++)
    for (const y of [H - 21, H - 22]) {
      setCell(w, at(x, y), WASTE);
      w.food[at(x, y)] = 4;
    }
  return w;
}

function soilFood(w: World): number {
  let n = 0;
  for (let i = 0; i < W * H; i++) if (w.type[i] === SOIL) n += w.food[i];
  return n;
}

describe("dead leaves", () => {
  it("rot slowly by themselves: half is breathed out, half goes into the soil", () => {
    const w = compost();
    const ledger = unitLedger(w);
    const litter = count(w, WASTE);
    stepLifeN(w, 12000);
    expect(count(w, WASTE)).toBeLessThan(litter / 2);
    expect(soilFood(w)).toBeGreaterThan(30);
    expect(w.burned).toBeGreaterThan(30);
    expect(unitLedger(w)).toBe(ledger);
  });
});

describe("water", () => {
  it("escapes slowly, and every drop is accounted for", () => {
    const w = createWorld(21);
    const water = totalWater(w);
    stepLifeN(w, 3000);
    expect(w.lostWater).toBeGreaterThan(0);
    expect(totalWater(w)).toBeLessThan(water);
    expect(totalWater(w) + w.lostWater).toBe(water);
  });
});

describe("the whole cycle", () => {
  it("light, plants, dead leaves, skrukketroll and soil for a month", () => {
    const w = sownGlass(42);
    stepLifeN(w, 1800);
    letIn(w);
    const ledger = unitLedger(w);
    const units = totalUnits(w);
    stepLifeN(w, 7200);
    expect(unitLedger(w)).toBe(ledger);
    expect(w.plants.length).toBeGreaterThan(5);
    // Plants have made more from light than animals and rot have burnt.
    expect(w.fixed).toBeGreaterThan(w.burned);
    expect(totalUnits(w)).toBeGreaterThan(units);
    // There are animals, and the leaves that fell have not just piled up.
    expect(count(w, ISOPOD)).toBeGreaterThan(0);
    expect(count(w, WASTE)).toBeLessThan(1500);
  });
});
