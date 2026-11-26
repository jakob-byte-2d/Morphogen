import { describe, expect, it } from "vitest";
import { sownGlass } from "./helpers";
import {
  applyTool,
  EMPTY,
  FEED,
  H,
  SCALE,
  LEAF,
  setCell,
  SOIL,
  spawnCreature,
  STEM,
  stepLifeN,
  stepWorld,
  STONE,
  unitLedger,
  W,
  WASTE,
} from "../src/sim";
import { emptyWorld, type World } from "../src/sim/world";

const at = (x: number, y: number) => y * W + x;
const count = (w: World, t: number) => w.type.filter((v) => v === t).length;

/** Flat stone floor at the bottom row. */
function floor(): World {
  const w = emptyWorld(5);
  for (let x = 0; x < W; x++) setCell(w, at(x, H - 1), STONE);
  return w;
}

/** Soil along the floor, with a layer of dead leaves on it. */
function litterBed(): World {
  const w = floor();
  for (let x = 0; x < W; x++) {
    setCell(w, at(x, H - 2), SOIL);
    w.food[at(x, H - 2)] = 0;
  }
  for (let x = 10; x < 60; x++) {
    setCell(w, at(x, H - 3), WASTE);
    w.food[at(x, H - 3)] = 6;
  }
  return w;
}

const soilFood = (w: World) => w.food.reduce((n, f, i) => (w.type[i] === SOIL ? n + f : n), 0);

describe("skrukketroll", () => {
  it("eat dead leaves, leave droppings in the soil, and multiply", () => {
    const w = litterBed();
    const litter = count(w, WASTE);
    spawnCreature(w, 0, [at(30, H - 4)], 120);
    const ledger = unitLedger(w);
    stepLifeN(w, 3000);
    expect(count(w, WASTE)).toBeLessThan(litter);
    expect(w.creatures.length).toBeGreaterThan(1);
    // Half of what they eat is burnt, the rest ends up in the soil.
    expect(w.burned).toBeGreaterThan(0);
    expect(soilFood(w)).toBeGreaterThan(0);
    expect(unitLedger(w)).toBe(ledger);
  });

  it("leave living plants alone", () => {
    const w = floor();
    // A hedge of leaves along the floor (living, or as good as).
    for (let x = 10; x < 60; x++) for (let y = H - 4; y < H - 1; y++) {
      setCell(w, at(x, y), LEAF);
      w.food[at(x, y)] = 2;
    }
    const leaves = count(w, LEAF);
    spawnCreature(w, 0, [at(5, H - 2)], 400);
    stepLifeN(w, 600);
    expect(count(w, LEAF)).toBe(leaves);
  });

  it("starve to litter without food", () => {
    const w = floor();
    spawnCreature(w, 0, [at(30, H - 2)], 50);
    stepLifeN(w, 1000);
    expect(w.creatures.length).toBe(0);
    expect(count(w, WASTE)).toBe(1);
  });

  it("starve in three or four days when fed, in a day or two when hungry", () => {
    const day = 288;
    const fed = floor();
    const a = spawnCreature(fed, 0, [at(30, H - 2)], 600)!;
    stepLifeN(fed, (day * 5) >> 1);
    expect(a.dead).toBe(false);
    stepLifeN(fed, 2 * day);
    expect(a.dead).toBe(true);
    // It starved: its energy is all gone (the card says so).
    expect(a.energy).toBeLessThanOrEqual(0);
    const hungry = floor();
    const b = spawnCreature(hungry, 0, [at(30, H - 2)], 299)!;
    stepLifeN(hungry, day);
    expect(b.dead).toBe(false);
    stepLifeN(hungry, day);
    expect(b.dead).toBe(true);
  });

  it("know their mother, and mothers count their young", () => {
    const w = litterBed();
    const first = spawnCreature(w, 0, [at(30, H - 4)], 120)!;
    stepLifeN(w, 3000);
    const young = w.creatures.filter((c) => c.mother === first.id);
    expect(young.length).toBeGreaterThan(0);
    expect(first.young).toBeGreaterThanOrEqual(young.length);
  });

  it("walk about where you can see it, and rest in between", () => {
    const w = floor();
    for (let x = 0; x < W; x++) setCell(w, at(x, H - 2), SOIL);
    // Fed: it walks for a while, then rests for a while.
    const c = spawnCreature(w, 0, [at(W >> 1, H - 3)], 500)!;
    const seen = new Set<number>();
    let still = 0;
    for (let t = 0; t < 3 * 60 * 10; t++) {
      const was = c.cells[0];
      stepWorld(w);
      seen.add(c.cells[0] % W);
      if (c.cells[0] === was) still++;
    }
    // In three minutes it has gone a good way along the ground, and rested too.
    expect(seen.size).toBeGreaterThan(30);
    expect(still).toBeGreaterThan(3 * 60 * 10 * 0.3);
  });

  it("walk through plants on the ground, but do not climb them", () => {
    const w = floor();
    for (let x = 0; x < W; x++) setCell(w, at(x, H - 2), SOIL);
    // A thicket of leaves and stems, standing on the soil.
    for (let x = 60; x < 72; x++) for (let y = H - 9; y < H - 2; y++) setCell(w, at(x, y), (x + y) % 3 === 0 ? STEM : LEAF);
    const c = spawnCreature(w, 0, [at(40, H - 3)], 500)!;
    c.heading = 1;
    const xs = new Set<number>();
    for (let t = 0; t < 4 * 60 * 10; t++) {
      stepWorld(w);
      xs.add(c.cells[0] % W);
      // Always on the ground, inside the thicket too.
      expect((c.cells[0] / W) | 0).toBe(H - 3);
    }
    // Right through it.
    for (let x = 58; x < 75; x++) expect(xs.has(x)).toBe(true);
  });

  it("are as many as the food allows: there is no limit", () => {
    const w = floor();
    for (let k = 0; k < 200; k++) expect(spawnCreature(w, 0, [at(k % W, H - 2 - ((k / W) | 0))], 100)).not.toBeNull();
    expect(w.creatures.length).toBe(200);
  });

  it("die of old age", () => {
    const w = floor();
    // Plenty of energy, but not forever young: about eight minutes.
    spawnCreature(w, 0, [at(30, H - 2)], 50000);
    stepLifeN(w, 3000);
    expect(w.creatures.length).toBe(1);
    stepLifeN(w, 3000);
    expect(w.creatures.length).toBe(0);
  });
});

describe("feed", () => {
  it("goes off into litter if nobody eats it", () => {
    const w = floor();
    for (let k = 0; k < 30; k++) applyTool(w, "feed", 36, 40);
    const fed = count(w, FEED);
    expect(fed).toBeGreaterThan(3);
    stepLifeN(w, 700);
    expect(count(w, FEED)).toBe(0);
    expect(count(w, WASTE)).toBeGreaterThan(fed - 3);
  });
});

describe("creature tool", () => {
  it("lets one creature go at a time, on whatever is below the finger", () => {
    const w = floor();
    for (let x = 0; x < W; x++) setCell(w, at(x, H - 2), SOIL);
    applyTool(w, "creature", 20, 10, 0);
    expect(w.creatures.length).toBe(1);
    applyTool(w, "creature", 50, 10, 0);
    expect(w.creatures.length).toBe(2);
    expect(w.creatures.every((c) => c.mother === 0 && c.young === 0)).toBe(true);
    // On their own layer, over the cells: one cell each.
    expect(w.creatures.every((c) => c.cells.length === 1 && w.critter[c.cells[0]] === c.id && w.type[c.cells[0]] === EMPTY)).toBe(true);
    // They land on the soil, nothing left hanging in the air.
    for (const c of w.creatures) for (const i of c.cells) expect((i / W) | 0).toBeGreaterThan(H - 4 - 2 * SCALE);
    expect(w.type[at(20, 10)]).toBe(EMPTY);
  });
});

describe("the closed glass with creatures", () => {
  it("keeps its nutrient ledger", () => {
    const w = sownGlass(42);
    stepLifeN(w, 900);
    applyTool(w, "creature", 22, 40, 0);
    applyTool(w, "creature", 52, 40, 0);
    applyTool(w, "creature", 40, 60, 0);
    const ledger = unitLedger(w);
    for (let k = 0; k < 8; k++) {
      stepLifeN(w, 600);
      expect(unitLedger(w)).toBe(ledger);
    }
  });
});
