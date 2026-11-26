import { describe, expect, it } from "vitest";
import {
  ISOPOD,
  applyTool,
  createWorld,
  EMPTY,
  FEED,
  H,
  SCALE,
  LEAF,
  setCell,
  SOIL,
  spawnCreature,
  stepLifeN,
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
    w.food[at(x, H - 3)] = 2;
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

  it("know their mother, and mothers count their young", () => {
    const w = litterBed();
    const first = spawnCreature(w, 0, [at(30, H - 4)], 120)!;
    stepLifeN(w, 3000);
    const young = w.creatures.filter((c) => c.mother === first.id);
    expect(young.length).toBeGreaterThan(0);
    expect(first.young).toBeGreaterThanOrEqual(young.length);
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
    expect(w.creatures.every((c) => c.cells.every((i) => w.type[i] === ISOPOD))).toBe(true);
    // They land on the soil, nothing left hanging in the air.
    for (const c of w.creatures) for (const i of c.cells) expect((i / W) | 0).toBeGreaterThan(H - 4 - 2 * SCALE);
    expect(w.type[at(20, 10)]).toBe(EMPTY);
  });
});

describe("the closed glass with creatures", () => {
  it("keeps its nutrient ledger", () => {
    const w = createWorld(42);
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
